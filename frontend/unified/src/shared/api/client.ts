export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  code?: string;
  requestId?: string;
  errors?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly detail?: string;
  readonly requestId?: string;
  readonly problem?: ProblemDetails;

  constructor(status: number, message: string, problem?: ProblemDetails) {
    super(problem?.detail ?? message);
    this.name = 'ApiError';
    this.status = status;
    this.code = problem?.code;
    this.detail = problem?.detail;
    this.requestId = problem?.requestId;
    this.problem = problem;
  }
}

type JsonBody = Record<string, unknown> | readonly unknown[];
type ApiBody = BodyInit | JsonBody | null;

export interface ApiFetchOptions extends Omit<RequestInit, 'body' | 'method'> {
  body?: ApiBody;
  method?: string;
  /** Use only for endpoints that explicitly do not require CSRF. */
  skipCsrf?: boolean;
}

const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/+$/, '');
const mutationMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

let csrfToken: string | null = null;
let normalCsrfRequest: Promise<string> | null = null;
let suppressedCsrfRequest: Promise<string> | null = null;
type AuthEventMode = 'normal' | 'suppressed';

/**
 * Narrow, payload-free bridge for authentication infrastructure.  The HTTP
 * client does not import session code; consumers decide how a CSRF event is
 * synchronized for their own browser/Electron profile.
 */
type ApiAuthEvent = { type: 'csrf-invalid' } | { type: 'pin-change-required' } | { type: 'session-expired' };
const apiAuthListeners = new Set<(event: ApiAuthEvent) => void>();

export type SessionRecoveryResult = 'recovered' | 'retry-later' | 'expired';
let sessionRecoveryHandler: (() => Promise<SessionRecoveryResult>) | null = null;

/**
 * Registers the single session owner that may renew an expired access cookie.
 * The HTTP client stays payload-free and never imports session code.
 */
export function registerSessionRecoveryHandler(
  handler: () => Promise<SessionRecoveryResult>,
): () => void {
  sessionRecoveryHandler = handler;
  return () => {
    if (sessionRecoveryHandler === handler) sessionRecoveryHandler = null;
  };
}

function isAuthEndpoint(endpoint: string): boolean {
  return endpoint.replace(/^\/+/, '').startsWith('auth/');
}

export function subscribeToApiAuthEvents(listener: (event: ApiAuthEvent) => void): () => void {
  apiAuthListeners.add(listener);
  return () => apiAuthListeners.delete(listener);
}

function publishApiAuthEvent(event: ApiAuthEvent): void {
  apiAuthListeners.forEach((listener) => listener(event));
}

function endpointUrl(endpoint: string): string {
  if (/^https?:\/\//i.test(endpoint)) {
    return endpoint;
  }

  return `${apiBase}/${endpoint.replace(/^\/+/, '')}`;
}

function isFormData(body: ApiBody | undefined): body is FormData {
  return typeof FormData !== 'undefined' && body instanceof FormData;
}

function isJsonBody(body: ApiBody | undefined): body is JsonBody {
  return body !== null && typeof body === 'object' && !isFormData(body) && !(body instanceof Blob) && !(body instanceof URLSearchParams) && !(body instanceof ArrayBuffer);
}

function toApiError(status: number, fallback: string, problem?: ProblemDetails): ApiError {
  return new ApiError(status, problem?.title || fallback, problem);
}

async function readProblem(response: Response): Promise<ProblemDetails | undefined> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('json')) {
    return undefined;
  }

  try {
    const value: unknown = await response.json();
    return value !== null && typeof value === 'object' ? (value as ProblemDetails) : undefined;
  } catch {
    return undefined;
  }
}

async function fetchResponse(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new ApiError(0, 'Network request failed');
  }
}

export function invalidateCsrfToken(): void {
  csrfToken = null;
}

/**
 * Replaces the CSRF value held only by this JavaScript context. Auth responses
 * are the sole callers; this deliberately never writes to browser storage.
 */
export function setCsrfToken(token: string): void {
  if (token.length === 0) {
    throw new TypeError('CSRF token must not be empty');
  }
  csrfToken = token;
}

function invalidateCsrfTokenIfCurrent(token: string | null): void {
  if (token !== null && csrfToken === token) {
    invalidateCsrfToken();
  }
}

async function getCsrfTokenInternal(mode: AuthEventMode): Promise<string> {
  if (csrfToken !== null) {
    return csrfToken;
  }

  const currentRequest = mode === 'normal' ? normalCsrfRequest : suppressedCsrfRequest;
  if (currentRequest === null) {
    const request = (async () => {
      const response = await fetchResponse(endpointUrl('/auth/csrf'), {
        method: 'GET',
        headers: { Accept: 'application/json, application/problem+json' },
        credentials: 'include',
      });
      const payload = await readProblem(response);

      if (!response.ok) {
        if (mode === 'normal' && response.status === 401) {
          publishApiAuthEvent({ type: 'session-expired' });
        }
        throw toApiError(response.status, response.statusText, payload);
      }

      const token = (payload as { data?: { csrfToken?: unknown }; csrfToken?: unknown } | undefined)?.data?.csrfToken
        ?? (payload as { csrfToken?: unknown } | undefined)?.csrfToken;
      if (typeof token !== 'string' || token.length === 0) {
        throw new ApiError(response.status, 'Invalid CSRF response');
      }

      csrfToken = token;
      return token;
    })().finally(() => {
      if (mode === 'normal') normalCsrfRequest = null;
      else suppressedCsrfRequest = null;
    });
    if (mode === 'normal') normalCsrfRequest = request;
    else suppressedCsrfRequest = request;
    return request;
  }

  return currentRequest;
}

export function getCsrfToken(): Promise<string> {
  return getCsrfTokenInternal('normal');
}

async function apiFetchInternal<T = void>(endpoint: string, options: ApiFetchOptions, authEventMode: AuthEventMode, retryCsrfInvalid = true): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const isMutation = mutationMethods.has(method);
  const headers = new Headers(options.headers);
  const body = options.body;

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json, application/problem+json');
  }

  const requestBody = isJsonBody(body) ? JSON.stringify(body) : body;
  if (isJsonBody(body) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let requestCsrfToken: string | null = null;
  if (isMutation && !options.skipCsrf) {
    requestCsrfToken = await getCsrfTokenInternal(authEventMode);
    headers.set('X-CSRF-Token', requestCsrfToken);
  }

  const init: RequestInit = {
    ...options,
    body: requestBody,
    method,
    headers,
    credentials: 'include',
  };
  const url = endpointUrl(endpoint);
  let response = await fetchResponse(url, init);

  // Access cookies live 15 minutes. Renew once and retry the same request
  // (including its idempotency key) before treating a 401 as definitive.
  if (response.status === 401 && authEventMode === 'normal' && !isAuthEndpoint(endpoint)) {
    const recovery = sessionRecoveryHandler;
    if (recovery !== null) {
      let outcome: SessionRecoveryResult = 'retry-later';
      try {
        outcome = await recovery();
      } catch {
        outcome = 'retry-later';
      }
      if (outcome === 'recovered') {
        if (isMutation && !options.skipCsrf) {
          headers.set('X-CSRF-Token', await getCsrfTokenInternal('normal'));
        }
        response = await fetchResponse(url, { ...init, headers });
      } else if (outcome === 'retry-later') {
        throw new ApiError(503, 'Session recovery unavailable', {
          status: 503,
          code: 'SESSION_RECOVERY_UNAVAILABLE',
          detail: 'No se pudo renovar la sesión. Reintenta la misma operación.',
        });
      }
    }
  }

  if (isMutation && !options.skipCsrf && response.status === 403) {
    const problem = await readProblem(response.clone());
    if (problem?.code === 'CSRF_INVALID') {
      invalidateCsrfTokenIfCurrent(requestCsrfToken);
      if (authEventMode === 'normal') publishApiAuthEvent({ type: 'csrf-invalid' });
      if (retryCsrfInvalid) {
        headers.set('X-CSRF-Token', await getCsrfTokenInternal(authEventMode));
        response = await fetchResponse(url, { ...init, headers });
      }
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!response.ok) {
    if (authEventMode === 'normal' && response.status === 401) {
      publishApiAuthEvent({ type: 'session-expired' });
    }
    const problem = await readProblem(response);
    if (problem !== undefined) {
      if (authEventMode === 'normal' && response.status === 403 && problem.code === 'PIN_CHANGE_REQUIRED') {
        publishApiAuthEvent({ type: 'pin-change-required' });
      }
      throw toApiError(response.status, response.statusText, problem);
    }

    const text = await response.text();
    throw new ApiError(response.status, text || response.statusText);
  }

  if (contentType.includes('json')) {
    return (await response.json()) as T;
  }

  return (await response.text()) as T;
}

export function apiFetch<T = void>(endpoint: string, options: ApiFetchOptions = {}): Promise<T> {
  return apiFetchInternal<T>(endpoint, options, 'normal');
}

export interface ApiFileResponse {
  blob: Blob;
  /** Raw header value; filename parsing/sanitizing belongs to the feature. */
  contentDisposition: string | null;
}

export type ApiFileOptions = Omit<ApiFetchOptions, 'body' | 'method'>;

/**
 * Bounded GET extension for file downloads. It reuses the same credentials,
 * Problem Details parsing and auth events as apiFetch, but returns the body as
 * a Blob plus the Content-Disposition header instead of parsing JSON/text.
 */
export async function apiFetchFile(endpoint: string, options: ApiFileOptions = {}): Promise<ApiFileResponse> {
  const headers = new Headers(options.headers);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'text/csv, application/problem+json');
  }

  const init: RequestInit = {
    ...options,
    method: 'GET',
    headers,
    credentials: 'include',
  };
  const url = endpointUrl(endpoint);

  let response: Response;
  try {
    response = await fetchResponse(url, init);
  } catch (error) {
    if (options.signal?.aborted) {
      throw new DOMException('La descarga fue cancelada', 'AbortError');
    }
    throw error;
  }

  if (!response.ok) {
    if (response.status === 401) {
      publishApiAuthEvent({ type: 'session-expired' });
    }
    const problem = await readProblem(response);
    if (problem !== undefined) {
      if (response.status === 403 && problem.code === 'PIN_CHANGE_REQUIRED') {
        publishApiAuthEvent({ type: 'pin-change-required' });
      }
      throw toApiError(response.status, response.statusText, problem);
    }
    const text = await response.text().catch(() => '');
    throw new ApiError(response.status, text || response.statusText);
  }

  const contentType = (response.headers.get('content-type') ?? '').trim();
  if (!/^text\/csv(?:;|$)/i.test(contentType)) {
    const problem = await readProblem(response);
    const fallbackProblem: ProblemDetails = problem ?? {};
    throw new ApiError(response.status, 'Unexpected non-CSV response', {
      ...fallbackProblem,
      code: problem?.code ?? 'UNEXPECTED_CONTENT_TYPE',
    });
  }

  let blob: Blob;
  try {
    blob = await response.blob();
  } catch (error) {
    if (options.signal?.aborted) {
      throw new DOMException('La descarga fue cancelada', 'AbortError');
    }
    throw error;
  }

  return {
    blob,
    contentDisposition: response.headers.get('content-disposition'),
  };
}

/**
 * Dedicated path for a previously-created idempotent operation. It still uses
 * CSRF, credentials, Problem Details and auth events, but never replays a
 * mutation automatically after CSRF_INVALID: the operation owner decides
 * whether to retry its exact snapshot.
 */
export function apiFetchIdempotent<T = void>(endpoint: string, options: ApiFetchOptions): Promise<T> {
  return apiFetchInternal<T>(endpoint, options, 'normal', false);
}

/** Normal mutation semantics without automatic replay after CSRF_INVALID. */
export function apiFetchNoCsrfReplay<T = void>(endpoint: string, options: ApiFetchOptions): Promise<T> {
  return apiFetchInternal<T>(endpoint, options, 'normal', false);
}

/** Session-only calls are intentionally fixed to the auth endpoints below. */
export function fetchSessionActor<T>(): Promise<T> {
  return apiFetchInternal<T>('/auth/me', {}, 'suppressed');
}

export function refreshSession<T>(): Promise<T> {
  return apiFetchInternal<T>('/auth/refresh', { method: 'POST', body: {} }, 'suppressed');
}

export function logoutSession(): Promise<void> {
  return apiFetchInternal('/auth/logout', { method: 'POST', body: {} }, 'suppressed');
}

export function loginCustomerSession<T>(credentials: { identifier: string; pin: string }): Promise<T> {
  return apiFetchInternal<T>('/auth/login/customer', { method: 'POST', body: credentials }, 'suppressed');
}

export function loginStaffSession<T>(credentials: { username: string; password: string }): Promise<T> {
  return apiFetchInternal<T>('/auth/login/staff', { method: 'POST', body: credentials }, 'suppressed');
}

export const apiRequest = apiFetch;

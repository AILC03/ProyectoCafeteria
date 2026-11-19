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
let csrfRequest: Promise<string> | null = null;

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

export async function getCsrfToken(): Promise<string> {
  if (csrfToken !== null) {
    return csrfToken;
  }

  if (csrfRequest === null) {
    csrfRequest = (async () => {
      const response = await fetchResponse(endpointUrl('/auth/csrf'), {
        method: 'GET',
        headers: { Accept: 'application/json, application/problem+json' },
        credentials: 'include',
      });
      const payload = await readProblem(response);

      if (!response.ok) {
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
      csrfRequest = null;
    });
  }

  return csrfRequest;
}

export async function apiFetch<T = void>(endpoint: string, options: ApiFetchOptions = {}): Promise<T> {
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
    requestCsrfToken = await getCsrfToken();
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

  if (isMutation && !options.skipCsrf && response.status === 403) {
    const problem = await readProblem(response.clone());
    if (problem?.code === 'CSRF_INVALID') {
      invalidateCsrfTokenIfCurrent(requestCsrfToken);
      headers.set('X-CSRF-Token', await getCsrfToken());
      response = await fetchResponse(url, { ...init, headers });
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!response.ok) {
    const problem = await readProblem(response);
    if (problem !== undefined) {
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

export const apiRequest = apiFetch;

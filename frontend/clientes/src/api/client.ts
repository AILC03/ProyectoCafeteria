/**
 * Cliente HTTP base para la comunicación con la API del Backend.
 * Maneja credenciales (cookies HttpOnly), bootstrap de tokens CSRF y errores RFC 7807 Problem Details.
 */

export class ApiError extends Error {
  status: number;
  code?: string;
  detail?: string;
  requestId?: string;

  constructor(status: number, message: string, code?: string, detail?: string, requestId?: string) {
    super(detail || message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.requestId = requestId;
  }
}

const API_BASE = '/api/v1';

let cachedCsrfToken: string | null = null;
let csrfPromise: Promise<string> | null = null;

export async function getCsrfToken(): Promise<string> {
  if (cachedCsrfToken) {
    return cachedCsrfToken;
  }
  if (!csrfPromise) {
    csrfPromise = fetch(`${API_BASE}/auth/csrf`, {
      method: 'GET',
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Error al obtener CSRF token: ${res.status}`);
        }
        const json = await res.json();
        cachedCsrfToken = json.data?.csrfToken || json.csrfToken;
        return cachedCsrfToken!;
      })
      .finally(() => {
        csrfPromise = null;
      });
  }
  return csrfPromise;
}

export function invalidateCsrfToken() {
  cachedCsrfToken = null;
}

export interface ApiFetchOptions extends RequestInit {
  skipCsrf?: boolean;
}

export async function apiFetch<T>(endpoint: string, options: ApiFetchOptions = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

  const headers = new Headers(options.headers || {});
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json, application/problem+json');
  }

  if (isMutation && options.body && !(options.body instanceof FormData)) {
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
  }

  if (isMutation && !options.skipCsrf) {
    try {
      const csrf = await getCsrfToken();
      headers.set('X-CSRF-Token', csrf);
    } catch (err) {
      console.warn('No se pudo adjuntar token CSRF:', err);
    }
  }

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const fetchOptions: RequestInit = {
    ...options,
    method,
    headers,
    credentials: 'include',
  };

  let response = await fetch(url, fetchOptions);

  // Si falla por CSRF inválido (403), invalidar token y reintentar una sola vez
  if (response.status === 403 && isMutation && !options.skipCsrf) {
    const cloned = response.clone();
    try {
      const errJson = await cloned.json();
      if (errJson.code === 'CSRF_INVALID' || errJson.title?.includes('CSRF')) {
        invalidateCsrfToken();
        const freshCsrf = await getCsrfToken();
        headers.set('X-CSRF-Token', freshCsrf);
        response = await fetch(url, { ...fetchOptions, headers });
      }
    } catch {
      // Ignorar error de parseo y continuar con la respuesta original
    }
  }

  if (response.status === 204) {
    return {} as T;
  }

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json') || contentType.includes('application/problem+json');

  if (!response.ok) {
    if (isJson) {
      const problem = await response.json();
      throw new ApiError(
        response.status,
        problem.title || response.statusText,
        problem.code,
        problem.detail,
        problem.requestId,
      );
    }
    const text = await response.text();
    throw new ApiError(response.status, text || response.statusText);
  }

  if (isJson) {
    return (await response.json()) as T;
  }

  return (await response.text()) as unknown as T;
}

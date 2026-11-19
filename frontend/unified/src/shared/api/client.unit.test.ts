import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, invalidateCsrfToken } from './client';
import { server } from '../../test/server';

const api = '/api/v1';

afterEach(() => {
  invalidateCsrfToken();
  vi.restoreAllMocks();
});

describe('apiFetch', () => {
  it('uses the relative API base, credentials and Accept for GET requests', async () => {
    server.use(http.get(`${api}/products`, ({ request }) => {
      expect(request.headers.get('accept')).toContain('application/json');
      return HttpResponse.json({ data: ['coffee'] });
    }));

    await expect(apiFetch<{ data: string[] }>('/products')).resolves.toEqual({ data: ['coffee'] });
  });

  it('gets one in-memory CSRF token for concurrent mutations and serializes JSON', async () => {
    let csrfRequests = 0;
    const receivedTokens: string[] = [];
    server.use(
      http.get(`${api}/auth/csrf`, () => {
        csrfRequests += 1;
        return HttpResponse.json({ data: { csrfToken: 'csrf-1' } });
      }),
      http.post(`${api}/orders`, async ({ request }) => {
        receivedTokens.push(request.headers.get('x-csrf-token') ?? '');
        expect(request.headers.get('content-type')).toContain('application/json');
        await expect(request.json()).resolves.toEqual({ productId: 'p1' });
        return HttpResponse.json({ data: { ok: true } });
      }),
    );

    await Promise.all([
      apiFetch('/orders', { method: 'POST', body: { productId: 'p1' } }),
      apiFetch('/orders', { method: 'POST', body: { productId: 'p1' } }),
    ]);

    expect(csrfRequests).toBe(1);
    expect(receivedTokens).toEqual(['csrf-1', 'csrf-1']);
  });

  it('preserves FormData without imposing a JSON content type', async () => {
    server.use(
      http.get(`${api}/auth/csrf`, () => HttpResponse.json({ csrfToken: 'csrf-form' })),
      http.post(`${api}/upload`, ({ request }) => {
        expect(request.headers.get('content-type')).toContain('multipart/form-data');
        expect(request.headers.get('x-csrf-token')).toBe('csrf-form');
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const form = new FormData();
    form.append('file', new Blob(['coffee']), 'coffee.txt');

    await expect(apiFetch('/upload', { method: 'POST', body: form })).resolves.toBeUndefined();
  });

  it('refreshes CSRF and retries exactly once only for CSRF_INVALID', async () => {
    let csrfRequests = 0;
    let orderRequests = 0;
    server.use(
      http.get(`${api}/auth/csrf`, () => HttpResponse.json({ data: { csrfToken: `csrf-${++csrfRequests}` } })),
      http.post(`${api}/orders`, ({ request }) => {
        orderRequests += 1;
        if (request.headers.get('x-csrf-token') === 'csrf-1') {
          return HttpResponse.json({ title: 'Forbidden', code: 'CSRF_INVALID' }, { status: 403 });
        }
        return HttpResponse.json({ data: { created: true } });
      }),
    );

    await expect(apiFetch('/orders', { method: 'POST', body: {} })).resolves.toEqual({ data: { created: true } });
    expect(csrfRequests).toBe(2);
    expect(orderRequests).toBe(2);
  });

  it('shares one CSRF renewal when concurrent mutations reject the same token', async () => {
    let csrfRequests = 0;
    let successfulRequests = 0;
    server.use(
      http.get(`${api}/auth/csrf`, () => HttpResponse.json({ data: { csrfToken: `csrf-${++csrfRequests}` } })),
      http.post(`${api}/orders`, ({ request }) => {
        if (request.headers.get('x-csrf-token') === 'csrf-1') {
          return HttpResponse.json({ code: 'CSRF_INVALID' }, { status: 403 });
        }
        successfulRequests += 1;
        return HttpResponse.json({ data: { created: true } });
      }),
    );

    await Promise.all([
      apiFetch('/orders', { method: 'POST', body: {} }),
      apiFetch('/orders', { method: 'POST', body: {} }),
    ]);

    expect(csrfRequests).toBe(2);
    expect(successfulRequests).toBe(2);
  });

  it('does not retry a 403 with a code other than CSRF_INVALID', async () => {
    let orderRequests = 0;
    server.use(
      http.get(`${api}/auth/csrf`, () => HttpResponse.json({ csrfToken: 'csrf-1' })),
      http.post(`${api}/orders`, () => {
        orderRequests += 1;
        return HttpResponse.json({ title: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
      }),
    );

    await expect(apiFetch('/orders', { method: 'POST', body: {} })).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    expect(orderRequests).toBe(1);
  });

  it('returns void for 204 and maps RFC7807 fields to ApiError', async () => {
    server.use(
      http.get(`${api}/empty`, () => new HttpResponse(null, { status: 204 })),
      http.get(`${api}/problem`, () => HttpResponse.json({ title: 'Invalid order', detail: 'Missing product', code: 'VALIDATION_ERROR', requestId: 'req-1' }, { status: 400 })),
    );

    await expect(apiFetch('/empty')).resolves.toBeUndefined();
    await expect(apiFetch('/problem')).rejects.toMatchObject<ApiError>({
      name: 'ApiError', status: 400, code: 'VALIDATION_ERROR', detail: 'Missing product', requestId: 'req-1', message: 'Missing product',
    });
  });

  it('does not attempt authentication after a 401', async () => {
    let requests = 0;
    server.use(http.get(`${api}/private`, () => {
      requests += 1;
      return HttpResponse.json({ title: 'Unauthenticated', code: 'UNAUTHENTICATED' }, { status: 401 });
    }));

    await expect(apiFetch('/private')).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    expect(requests).toBe(1);
  });

  it('normalizes network failures as ApiError status zero', async () => {
    server.use(http.get(`${api}/offline`, () => HttpResponse.error()));

    await expect(apiFetch('/offline')).rejects.toMatchObject({ name: 'ApiError', status: 0 });
  });
});

import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, invalidateCsrfToken } from './client';
import { IdempotencyManager, MAX_ACTIVE_IDEMPOTENCY_OPERATIONS, MAX_IDEMPOTENCY_JSON_BYTES, clearIdempotencyOperations, idempotencyOperations, isUncertainIdempotencyFailure } from './idempotency';
import { server } from '../../test/server';

const api = '/api/v1';
const csrf = () => http.get(`${api}/auth/csrf`, () => HttpResponse.json({ data: { csrfToken: 'test-csrf' } }));

afterEach(() => {
  clearIdempotencyOperations();
  invalidateCsrfToken();
  vi.restoreAllMocks();
});

describe('IdempotencyManager', () => {
  it('creates an explicit UUID v4 operation and retries its immutable snapshot with the same header', async () => {
    const manager = new IdempotencyManager();
    const input = { lines: [{ productId: 'coffee', quantity: 1 }] };
    const operation = manager.create(input);
    input.lines[0]!.quantity = 2;
    const keys: string[] = [];
    const bodies: unknown[] = [];
    let attempts = 0;
    server.use(csrf(), http.post(`${api}/intent`, async ({ request }) => {
      keys.push(request.headers.get('idempotency-key') ?? '');
      bodies.push(await request.json());
      attempts += 1;
      return attempts === 1 ? HttpResponse.error() : HttpResponse.json({ data: 'ok' });
    }));

    await expect(manager.send(operation, '/intent', { method: 'POST' })).rejects.toMatchObject({ status: 0 });
    await expect(manager.send<{ data: string }>(operation, '/intent', { method: 'POST' })).resolves.toEqual({ data: 'ok' });
    expect(operation.key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(keys[0]).toBe(keys[1]);
    expect(bodies).toEqual([{ lines: [{ productId: 'coffee', quantity: 1 }] }, { lines: [{ productId: 'coffee', quantity: 1 }] }]);
    expect(manager.activeCount).toBe(0);
  });

  it.each([0, 503])('retains an operation after uncertain status %s without automatic retry', async (status) => {
    const manager = new IdempotencyManager();
    const operation = manager.create({ productId: 'coffee' });
    let requests = 0;
    server.use(csrf(), http.post(`${api}/uncertain`, () => {
      requests += 1;
      return status === 0 ? HttpResponse.error() : new HttpResponse(null, { status });
    }));
    await expect(manager.send(operation, '/uncertain', { method: 'POST' })).rejects.toMatchObject({ status });
    expect(requests).toBe(1);
    expect(manager.activeCount).toBe(1);
  });

  it('does not automatically replay CSRF_INVALID and retains the same operation for an explicit retry', async () => {
    const manager = new IdempotencyManager();
    const operation = manager.create({ productId: 'coffee' });
    const keys: string[] = [];
    let csrfRequests = 0;
    let requests = 0;
    server.use(
      http.get(`${api}/auth/csrf`, () => HttpResponse.json({ data: { csrfToken: `csrf-${++csrfRequests}` } })),
      http.post(`${api}/csrf-invalid`, ({ request }) => {
        requests += 1;
        keys.push(request.headers.get('idempotency-key') ?? '');
        return requests === 1
          ? HttpResponse.json({ code: 'CSRF_INVALID' }, { status: 403 })
          : HttpResponse.json({ data: 'ok' });
      }),
    );

    await expect(manager.send(operation, '/csrf-invalid', { method: 'POST' })).rejects.toMatchObject({ status: 403, code: 'CSRF_INVALID' });
    expect(requests).toBe(1);
    expect(manager.activeCount).toBe(1);
    await expect(manager.send<{ data: string }>(operation, '/csrf-invalid', { method: 'POST' })).resolves.toEqual({ data: 'ok' });
    expect(requests).toBe(2);
    expect(csrfRequests).toBe(2);
    expect(keys).toEqual([operation.key, operation.key]);
    expect(manager.activeCount).toBe(0);
  });

  it('retains a timeout and completes on 2xx or 409, while a new action receives a new key', async () => {
    const manager = new IdempotencyManager();
    const timeout = manager.create({ productId: 'coffee' });
    server.use(csrf(), http.post(`${api}/timeout`, () => HttpResponse.error()));
    await expect(manager.send(timeout, '/timeout', { method: 'POST' })).rejects.toMatchObject({ status: 0 });
    expect(manager.activeCount).toBe(1);
    expect(isUncertainIdempotencyFailure(new DOMException('timed out', 'TimeoutError'))).toBe(true);

    const success = manager.create({ productId: 'tea' });
    server.use(csrf(), http.post(`${api}/success`, () => new HttpResponse(null, { status: 204 })));
    await expect(manager.send(success, '/success', { method: 'POST' })).resolves.toBeUndefined();
    const conflict = manager.create({ productId: 'cake' });
    server.use(csrf(), http.post(`${api}/conflict`, () => HttpResponse.json({ code: 'IDEMPOTENCY_CONFLICT' }, { status: 409 })));
    await expect(manager.send(conflict, '/conflict', { method: 'POST' })).rejects.toBeInstanceOf(ApiError);
    expect(manager.activeCount).toBe(1);
    expect(manager.create({ productId: 'coffee' }).key).not.toBe(timeout.key);
  });

  it('enforces limits and rejects invalid or sensitive JSON without persistence or silent eviction', () => {
    const manager = new IdempotencyManager();
    expect(() => manager.create({ csrfToken: 'never' })).toThrow(TypeError);
    expect(() => manager.create({ nested: { checkoutToken: 'never' } })).toThrow(TypeError);
    expect(() => manager.create({ value: undefined })).toThrow(TypeError);
    expect(() => manager.create({ value: 'x'.repeat(MAX_IDEMPOTENCY_JSON_BYTES) })).toThrow(RangeError);
    for (let index = 0; index < MAX_ACTIVE_IDEMPOTENCY_OPERATIONS; index += 1) manager.create({ index });
    expect(() => manager.create({ index: 33 })).toThrow(RangeError);
    expect(manager.activeCount).toBe(MAX_ACTIVE_IDEMPOTENCY_OPERATIONS);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('clears all shared in-memory operations', () => {
    idempotencyOperations.create({ productId: 'coffee' });
    idempotencyOperations.create({ productId: 'tea' });
    clearIdempotencyOperations();
    expect(idempotencyOperations.activeCount).toBe(0);
  });
});

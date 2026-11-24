import { ApiError, apiFetchIdempotent, type ApiFetchOptions } from './client';

export const MAX_ACTIVE_IDEMPOTENCY_OPERATIONS = 32;
export const MAX_IDEMPOTENCY_JSON_BYTES = 64 * 1024;

export type IdempotentOperation = Readonly<{
  key: string;
  /** Exact, immutable JSON snapshot used for every authorized retry. */
  snapshot: string;
}>;

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type IdempotentRequestOptions = Omit<ApiFetchOptions, 'body' | 'headers'> & { headers?: HeadersInit };

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isForbiddenField(name: string): boolean {
  return /token|credential|csrf|password|pin/i.test(name);
}

function assertJsonValue(value: unknown, ancestors: Set<object> = new Set()): asserts value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return;
    throw new TypeError('Idempotency body must contain valid JSON values');
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new TypeError('Idempotency body must not be circular');
    ancestors.add(value);
    value.forEach((item) => assertJsonValue(item, ancestors));
    ancestors.delete(value);
    return;
  }
  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError('Idempotency body must contain plain JSON objects');
    if (ancestors.has(value)) throw new TypeError('Idempotency body must not be circular');
    ancestors.add(value);
    for (const [key, child] of Object.entries(value)) {
      if (isForbiddenField(key)) throw new TypeError('Idempotency body must not contain credentials or tokens');
      assertJsonValue(child, ancestors);
    }
    ancestors.delete(value);
    return;
  }
  throw new TypeError('Idempotency body must contain valid JSON values');
}

function secureUuidV4(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID !== 'function') throw new Error('Secure UUID v4 generation is unavailable');
  const key = randomUUID.call(globalThis.crypto);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
    throw new Error('Secure UUID generator did not return a UUID v4');
  }
  return key;
}

/** Network outcomes where the server may have accepted the operation. */
export function isUncertainIdempotencyFailure(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 0 || error.status === 503)
    || typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'TimeoutError';
}

function isCsrfInvalid(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403 && error.code === 'CSRF_INVALID';
}

/**
 * Holds only the minimum retry material in this JS context. Operations are
 * intentionally created by an explicit user intent; payload equality never
 * selects or recreates an operation.
 */
export class IdempotencyManager {
  private readonly operations = new Set<IdempotentOperation>();

  create(body: unknown): IdempotentOperation {
    assertJsonValue(body);
    if (body === null || typeof body !== 'object') throw new TypeError('Idempotency body must be a JSON object or array');
    const snapshot = JSON.stringify(body);
    if (snapshot === undefined) throw new TypeError('Idempotency body must contain valid JSON values');
    if (byteLength(snapshot) > MAX_IDEMPOTENCY_JSON_BYTES) throw new RangeError('Idempotency body exceeds 64 KiB');
    if (this.operations.size >= MAX_ACTIVE_IDEMPOTENCY_OPERATIONS) throw new RangeError('Idempotency operation capacity reached');

    const operation = Object.freeze({ key: secureUuidV4(), snapshot });
    this.operations.add(operation);
    return operation;
  }

  complete(operation: IdempotentOperation): void {
    this.operations.delete(operation);
  }

  clear(): void {
    this.operations.clear();
  }

  get activeCount(): number {
    return this.operations.size;
  }

  async send<T>(operation: IdempotentOperation, endpoint: string, options: IdempotentRequestOptions = {}): Promise<T> {
    if (!this.operations.has(operation)) throw new Error('Idempotency operation is not active');
    const headers = new Headers(options.headers);
    headers.set('Idempotency-Key', operation.key);
    // Re-parse the immutable snapshot so caller mutation cannot alter retries.
    const body = JSON.parse(operation.snapshot) as JsonValue;
    try {
      const response = await apiFetchIdempotent<T>(endpoint, { ...options, headers, body: body as Record<string, unknown> | readonly unknown[] });
      this.complete(operation);
      return response;
    } catch (error) {
      if (!isUncertainIdempotencyFailure(error) && !isCsrfInvalid(error)) this.complete(operation);
      throw error;
    }
  }
}

/** Shared in-memory registry; it is never persisted or cross-context synchronized. */
export const idempotencyOperations = new IdempotencyManager();

export function clearIdempotencyOperations(): void {
  idempotencyOperations.clear();
}

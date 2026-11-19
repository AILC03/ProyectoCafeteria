import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCsrfToken, invalidateCsrfToken } from '../api/client';
import { RefreshCoordinator, SessionManager } from './session';
import { server } from '../../test/server';

const api = '/api/v1';
const user = { id: '42', name: 'Ada', role: 'CLIENTE', accountType: 'CUSTOMER', mustChangePin: false };
const originalLocks = (navigator as Navigator & { locks?: unknown }).locks;

function setLocks(locks: unknown): void {
  Object.defineProperty(navigator, 'locks', { configurable: true, value: locks });
}

beforeEach(() => {
  setLocks({ request: <T,>(_name: string, _options: unknown, callback: () => Promise<T>) => callback() });
});

afterEach(() => {
  invalidateCsrfToken();
  localStorage.clear();
  setLocks(originalLocks);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('SessionManager', () => {
  it('bootstraps an actor exclusively from GET /auth/me', async () => {
    server.use(http.get(`${api}/auth/me`, () => HttpResponse.json({ data: user })));
    const manager = new SessionManager();
    await expect(manager.bootstrap()).resolves.toEqual({ status: 'authenticated', actor: user });
    manager.dispose();
  });

  it('refreshes once after bootstrap 401 and adopts its actor and in-memory CSRF', async () => {
    let refreshes = 0;
    server.use(
      http.get(`${api}/auth/me`, () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
      http.get(`${api}/auth/csrf`, () => HttpResponse.json({ data: { csrfToken: 'initial' } })),
      http.post(`${api}/auth/refresh`, () => {
        refreshes += 1;
        return HttpResponse.json({ data: { user, csrfToken: 'refreshed-after-bootstrap' } });
      }),
    );
    const manager = new SessionManager();
    await expect(manager.bootstrap()).resolves.toEqual({ status: 'authenticated', actor: user });
    expect(refreshes).toBe(1);
    await expect(getCsrfToken()).resolves.toBe('refreshed-after-bootstrap');
    manager.dispose();
  });

  it('becomes anonymous when the one bootstrap refresh fails definitively', async () => {
    let refreshes = 0;
    server.use(
      http.get(`${api}/auth/me`, () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
      http.get(`${api}/auth/csrf`, () => HttpResponse.json({ data: { csrfToken: 'initial' } })),
      http.post(`${api}/auth/refresh`, () => {
        refreshes += 1;
        return HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 });
      }),
    );
    const manager = new SessionManager();
    await expect(manager.bootstrap()).resolves.toEqual({ status: 'anonymous', actor: null });
    expect(refreshes).toBe(1);
    manager.dispose();
  });

  it('serializes refresh between contexts with Web Locks', async () => {
    let tail = Promise.resolve();
    let active = 0;
    let maximum = 0;
    let refreshes = 0;
    let refreshed = false;
    setLocks({ request: async (_name: string, _options: unknown, callback: () => Promise<unknown>) => {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      try { return await callback(); } finally { release(); }
    } });
    server.use(
      http.get(`${api}/auth/me`, () => refreshed
        ? HttpResponse.json({ data: user })
        : HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
      http.get(`${api}/auth/csrf`, () => HttpResponse.json({ data: { csrfToken: 'initial' } })),
      http.post(`${api}/auth/refresh`, async () => {
        refreshes += 1;
        active += 1;
        maximum = Math.max(maximum, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        refreshed = true;
        return HttpResponse.json({ data: { user, csrfToken: 'refreshed' } });
      }),
    );
    const first = new SessionManager(new RefreshCoordinator('locks-test'));
    const second = new SessionManager(new RefreshCoordinator('locks-test'));
    await Promise.all([first.refresh(), second.refresh()]);
    expect(maximum).toBe(1);
    expect(refreshes).toBe(1);
    first.dispose();
    second.dispose();
  });

  it('does not refresh bootstrap 401 when Web Locks are unavailable', async () => {
    setLocks(undefined);
    let refreshes = 0;
    server.use(
      http.get(`${api}/auth/me`, () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
      http.post(`${api}/auth/refresh`, () => {
        refreshes += 1;
        return HttpResponse.json({ data: { user, csrfToken: 'unused' } });
      }),
    );
    const manager = new SessionManager(new RefreshCoordinator('no-locks-test'));
    await expect(manager.bootstrap()).resolves.toMatchObject({ status: 'recoverable-error', error: { status: 0 } });
    expect(refreshes).toBe(0);
    expect(localStorage.length).toBe(0);
    manager.dispose();
  });

  it('retries REFRESH_ALREADY_ROTATED once and replaces CSRF only in memory', async () => {
    let refreshes = 0;
    server.use(
      http.get(`${api}/auth/me`, () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
      http.get(`${api}/auth/csrf`, () => HttpResponse.json({ data: { csrfToken: 'initial' } })),
      http.post(`${api}/auth/refresh`, () => {
        refreshes += 1;
        return refreshes === 1
          ? HttpResponse.json({ code: 'REFRESH_ALREADY_ROTATED' }, { status: 409 })
          : HttpResponse.json({ data: { user, csrfToken: 'new-csrf' } });
      }),
    );
    const manager = new SessionManager();
    await expect(manager.refresh()).resolves.toEqual({ status: 'authenticated', actor: user });
    expect(refreshes).toBe(2);
    expect([...Array(localStorage.length).keys()].map((index) => localStorage.getItem(localStorage.key(index) ?? '')).join('')).not.toContain('new-csrf');
    manager.dispose();
  });

  it('restricts PIN_CHANGE_REQUIRED and retains recoverable failures for retry', async () => {
    server.use(
      http.get(`${api}/auth/me`, () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
      http.get(`${api}/auth/csrf`, () => HttpResponse.json({ data: { csrfToken: 'initial' } })),
      http.post(`${api}/auth/refresh`, () => HttpResponse.json({ code: 'PIN_CHANGE_REQUIRED' }, { status: 403 })),
    );
    const manager = new SessionManager();
    await expect(manager.refresh()).resolves.toEqual({ status: 'pin-change-required', actor: null });
    manager.dispose();

    server.use(http.get(`${api}/auth/me`, () => HttpResponse.json({ code: 'TEMPORARY' }, { status: 503 })));
    const retryable = new SessionManager();
    await expect(retryable.bootstrap()).resolves.toMatchObject({ status: 'recoverable-error', actor: null, error: { status: 503 } });
    retryable.dispose();
  });

  it('broadcasts only a fixed refresh event, never actor or credential data', () => {
    const messages: unknown[] = [];
    class TestBroadcastChannel {
      constructor(_name: string) {}
      addEventListener(): void {}
      removeEventListener(): void {}
      postMessage(message: unknown): void { messages.push(message); }
      close(): void {}
    }
    vi.stubGlobal('BroadcastChannel', TestBroadcastChannel);
    const coordinator = new RefreshCoordinator('message-test');
    coordinator.complete();
    expect(messages).toEqual([{ type: 'refresh-complete' }]);
    expect(JSON.stringify(messages)).not.toContain(user.id);
    coordinator.close();
  });
});

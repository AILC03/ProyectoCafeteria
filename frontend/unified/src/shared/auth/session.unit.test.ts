import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, getCsrfToken, invalidateCsrfToken, setCsrfToken } from '../api/client';
import { RefreshCoordinator, SessionManager } from './session';
import { server } from '../../test/server';
import { CART_DRAFT_KEY, clearPrivateState, getCartDraft, migrateAndCleanupStorage, saveCartDraft, savePreferences } from '../storage';

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
  window.history.replaceState(null, '', '/');
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

  it('does not restore a legacy cart when bootstrapping an existing personal session', async () => {
    localStorage.setItem('taffy_cart', JSON.stringify([{ productId: 'coffee-1', quantity: 2, optionValueIds: [], guestName: 'Ada' }]));
    await migrateAndCleanupStorage();
    server.use(http.get(`${api}/auth/me`, () => HttpResponse.json({ data: user })));
    const manager = new SessionManager();
    await expect(manager.bootstrap()).resolves.toEqual({ status: 'authenticated', actor: user });
    expect(getCartDraft()).toEqual({ version: 1, items: [] });
    expect(localStorage.getItem('taffy_cart')).toBeNull();
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

  it('becomes anonymous when the one bootstrap refresh fails definitively without redirecting public routes or clearing guest state', async () => {
    const messages: unknown[] = [];
    class TestBroadcastChannel {
      constructor(_name: string) {}
      addEventListener(): void {}
      removeEventListener(): void {}
      postMessage(message: unknown): void { messages.push(message); }
      close(): void {}
    }
    vi.stubGlobal('BroadcastChannel', TestBroadcastChannel);
    let refreshes = 0;
    server.use(
      http.get(`${api}/auth/me`, () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
      http.get(`${api}/auth/csrf`, () => HttpResponse.json({ data: { csrfToken: 'initial' } })),
      http.post(`${api}/auth/refresh`, () => {
        refreshes += 1;
        return HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 });
      }),
    );

    for (const publicPath of ['/', '/cliente/menu']) {
      window.history.replaceState(null, '', publicPath);
      const manager = new SessionManager(new RefreshCoordinator('bootstrap-anon-test'));
      const cleaner = vi.fn();
      manager.registerPrivateStateCleaner(cleaner);
      await expect(manager.bootstrap()).resolves.toEqual({ status: 'anonymous', actor: null });
      expect(window.location.pathname).toBe(publicPath);
      expect(cleaner).not.toHaveBeenCalled();
      expect(messages).toEqual([]);
      manager.dispose();
    }
    expect(refreshes).toBe(2);
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

  it('blocks actor replacement when CSRF logout fails and keeps the actor', async () => {
    server.use(
      http.get(`${api}/auth/me`, () => HttpResponse.json({ data: user })),
      http.get(`${api}/auth/csrf`, () => HttpResponse.json({ data: { csrfToken: 'old' } })),
      http.post(`${api}/auth/logout`, () => HttpResponse.json({ code: 'CSRF_INVALID' }, { status: 403 })),
    );
    const manager = new SessionManager();
    await manager.bootstrap();
    await expect(manager.replaceActor('terminal')).resolves.toBe(false);
    expect(manager.getSnapshot()).toEqual({ status: 'authenticated', actor: user });
    manager.dispose();
  });

  it('cleans registered private state and broadcasts a successful logout without secrets', async () => {
    const messages: unknown[] = [];
    class TestBroadcastChannel {
      constructor(_name: string) {}
      addEventListener(): void {}
      removeEventListener(): void {}
      postMessage(message: unknown): void { messages.push(message); }
      close(): void {}
    }
    vi.stubGlobal('BroadcastChannel', TestBroadcastChannel);
    server.use(
      http.get(`${api}/auth/me`, () => HttpResponse.json({ data: user })),
      http.get(`${api}/auth/csrf`, () => HttpResponse.json({ data: { csrfToken: 'logout-token' } })),
      http.post(`${api}/auth/logout`, () => new HttpResponse(null, { status: 204 })),
    );
    const manager = new SessionManager(new RefreshCoordinator('logout-test'));
    const cleaner = vi.fn();
    manager.registerPrivateStateCleaner(cleaner);
    await manager.bootstrap();
    await expect(manager.logout()).resolves.toBe(true);
    expect(cleaner).toHaveBeenCalledOnce();
    expect(messages).toEqual([{ type: 'session-cleared' }]);
    expect(JSON.stringify(messages)).not.toContain('logout-token');
    manager.dispose();
  });

  it('clears the actor cart draft after successful logout while retaining preferences', async () => {
    server.use(
      http.get(`${api}/auth/me`, () => HttpResponse.json({ data: user })),
      http.get(`${api}/auth/csrf`, () => HttpResponse.json({ data: { csrfToken: 'logout-token' } })),
      http.post(`${api}/auth/logout`, () => new HttpResponse(null, { status: 204 })),
    );
    savePreferences({ theme: 'theme-dark' });
    saveCartDraft({ version: 1, items: [{ productId: 'coffee-1', quantity: 1, optionValueIds: [] }] });
    const manager = new SessionManager();
    manager.registerPrivateStateCleaner(clearPrivateState);
    await manager.bootstrap();
    await expect(manager.logout()).resolves.toBe(true);
    expect(localStorage.getItem(CART_DRAFT_KEY)).toBeNull();
    expect(localStorage.getItem('cafeteria:preferences:v1')).toContain('theme-dark');
    manager.dispose();
  });

  it('invalidates CSRF in every local context after CSRF_INVALID without logging out', async () => {
    const first = new SessionManager(new RefreshCoordinator('csrf-test'));
    const second = new SessionManager(new RefreshCoordinator('csrf-test'));
    setCsrfToken('stale');
    let attempts = 0;
    server.use(
      http.post(`${api}/example`, () => {
        attempts += 1;
        return attempts === 1
          ? HttpResponse.json({ code: 'CSRF_INVALID' }, { status: 403 })
          : new HttpResponse(null, { status: 204 });
      }),
      http.get(`${api}/auth/csrf`, () => HttpResponse.json({ data: { csrfToken: 'replacement' } })),
    );
    await expect(apiFetch('/example', { method: 'POST', body: {} })).resolves.toBeUndefined();
    await expect(getCsrfToken()).resolves.toBe('replacement');
    expect(first.getSnapshot().status).toBe('loading');
    expect(second.getSnapshot().status).toBe('loading');
    first.dispose();
    second.dispose();
  });

  it('restricts each local context when an API request reports PIN_CHANGE_REQUIRED', async () => {
    const first = new SessionManager(new RefreshCoordinator('pin-test'));
    const second = new SessionManager(new RefreshCoordinator('pin-test'));
    server.use(http.get(`${api}/restricted`, () => HttpResponse.json({ code: 'PIN_CHANGE_REQUIRED' }, { status: 403 })));
    await expect(apiFetch('/restricted')).rejects.toMatchObject({ code: 'PIN_CHANGE_REQUIRED' });
    expect(first.getSnapshot()).toEqual({ status: 'pin-change-required', actor: null });
    expect(second.getSnapshot()).toEqual({ status: 'pin-change-required', actor: null });
    first.dispose();
    second.dispose();
  });

  it('preserves private state and actor when a voluntary logout receives PIN_CHANGE_REQUIRED', async () => {
    server.use(
      http.get(`${api}/auth/me`, () => HttpResponse.json({ data: user })),
      http.get(`${api}/auth/csrf`, () => HttpResponse.json({ data: { csrfToken: 'logout-token' } })),
      http.post(`${api}/auth/logout`, () => HttpResponse.json({ code: 'PIN_CHANGE_REQUIRED' }, { status: 403 })),
    );
    const manager = new SessionManager();
    const cleaner = vi.fn();
    manager.registerPrivateStateCleaner(cleaner);
    await manager.bootstrap();
    await expect(manager.logout()).resolves.toBe(false);
    expect(manager.getSnapshot()).toEqual({ status: 'authenticated', actor: user });
    expect(cleaner).not.toHaveBeenCalled();
    manager.dispose();
  });

  it('clears and broadcasts only a fixed event for a definitive 401 from a normal API request', async () => {
    const messages: unknown[] = [];
    class TestBroadcastChannel {
      constructor(_name: string) {}
      addEventListener(): void {}
      removeEventListener(): void {}
      postMessage(message: unknown): void { messages.push(message); }
      close(): void {}
    }
    vi.stubGlobal('BroadcastChannel', TestBroadcastChannel);
    server.use(
      http.get(`${api}/auth/me`, () => HttpResponse.json({ data: user })),
      http.get(`${api}/private-data`, () => new HttpResponse(null, { status: 401 })),
    );
    const manager = new SessionManager(new RefreshCoordinator('revoked-test'));
    const cleaner = vi.fn();
    manager.registerPrivateStateCleaner(cleaner);
    await manager.bootstrap();
    await expect(apiFetch('/private-data')).rejects.toMatchObject({ status: 401 });
    expect(manager.getSnapshot()).toEqual({ status: 'anonymous', actor: null });
    expect(cleaner).toHaveBeenCalledOnce();
    expect(messages).toEqual([{ type: 'session-cleared' }]);
    expect(JSON.stringify(messages)).not.toContain(user.id);
    expect(window.location.pathname).toBe('/cliente/iniciar-sesion');
    manager.dispose();
  });

  it('renews an expired access session and retries the same mutation before reporting 401', async () => {
    const staff = { id: 'staff-1', name: 'Caja', role: 'CAJERO', accountType: 'STAFF', mustChangePin: false };
    let meCalls = 0;
    let refreshes = 0;
    let attempts = 0;
    window.history.replaceState(null, '', '/terminal/pos');
    server.use(
      http.get(`${api}/auth/me`, () => {
        meCalls += 1;
        return meCalls === 1
          ? HttpResponse.json({ data: staff })
          : HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 });
      }),
      http.get(`${api}/auth/csrf`, () => HttpResponse.json({ data: { csrfToken: 'initial-csrf' } })),
      http.post(`${api}/auth/refresh`, () => {
        refreshes += 1;
        return HttpResponse.json({ data: { user: staff, csrfToken: 'renewed-csrf' } });
      }),
      http.post(`${api}/cashier/orders`, async ({ request }) => {
        attempts += 1;
        if (attempts === 1) return new HttpResponse(null, { status: 401 });
        expect(request.headers.get('x-csrf-token')).toBe('renewed-csrf');
        expect(request.headers.get('idempotency-key')).toBe('same-key');
        expect(await request.json()).toEqual({ paymentMethod: 'CASH', items: [] });
        return HttpResponse.json({ data: { id: '1' } }, { status: 201 });
      }),
    );
    const manager = new SessionManager(new RefreshCoordinator('expired-access-retry'));
    await manager.bootstrap();

    await expect(apiFetch('/cashier/orders', {
      method: 'POST',
      body: { paymentMethod: 'CASH', items: [] },
      headers: { 'Idempotency-Key': 'same-key' },
    })).resolves.toEqual({ data: { id: '1' } });

    expect(attempts).toBe(2);
    expect(refreshes).toBe(1);
    expect(manager.getSnapshot()).toEqual({ status: 'authenticated', actor: staff });
    expect(window.location.pathname).toBe('/terminal/pos');
    manager.dispose();
  });

  it('keeps the authenticated session and private state when renewal is temporarily unavailable', async () => {
    const staff = { id: 'staff-1', name: 'Caja', role: 'CAJERO', accountType: 'STAFF', mustChangePin: false };
    let meCalls = 0;
    window.history.replaceState(null, '', '/terminal/pos');
    server.use(
      http.get(`${api}/auth/me`, () => {
        meCalls += 1;
        return meCalls === 1
          ? HttpResponse.json({ data: staff })
          : HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 });
      }),
      http.get(`${api}/auth/csrf`, () => HttpResponse.json({ data: { csrfToken: 'initial-csrf' } })),
      http.post(`${api}/auth/refresh`, () => HttpResponse.json({ code: 'UNAVAILABLE' }, { status: 503 })),
      http.post(`${api}/cashier/orders`, () => new HttpResponse(null, { status: 401 })),
    );
    const manager = new SessionManager(new RefreshCoordinator('expired-access-recoverable'));
    const cleaner = vi.fn();
    manager.registerPrivateStateCleaner(cleaner);
    await manager.bootstrap();

    await expect(apiFetch('/cashier/orders', { method: 'POST', body: {} })).rejects.toMatchObject({ status: 503 });
    expect(manager.getSnapshot()).toEqual({ status: 'authenticated', actor: staff });
    expect(cleaner).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/terminal/pos');
    manager.dispose();
  });

  it('treats an empty 401 from GET /auth/csrf as definitive for a normal mutation', async () => {
    const messages: unknown[] = [];
    class TestBroadcastChannel {
      constructor(_name: string) {}
      addEventListener(): void {}
      removeEventListener(): void {}
      postMessage(message: unknown): void { messages.push(message); }
      close(): void {}
    }
    vi.stubGlobal('BroadcastChannel', TestBroadcastChannel);
    const staff = { id: 'staff-1', name: 'Caja', role: 'CAJERO', accountType: 'STAFF', mustChangePin: false };
    window.history.replaceState(null, '', '/terminal/pos');
    server.use(
      http.get(`${api}/auth/me`, () => HttpResponse.json({ data: staff })),
      http.get(`${api}/auth/csrf`, () => new HttpResponse(null, { status: 401 })),
    );
    const manager = new SessionManager(new RefreshCoordinator('csrf-401-test'));
    const cleaner = vi.fn();
    manager.registerPrivateStateCleaner(cleaner);
    await manager.bootstrap();
    await expect(apiFetch('/private-data', { method: 'POST', body: {} })).rejects.toMatchObject({ status: 401 });
    expect(manager.getSnapshot()).toEqual({ status: 'anonymous', actor: null });
    expect(cleaner).toHaveBeenCalledOnce();
    expect(messages).toEqual([{ type: 'session-cleared' }]);
    expect(window.location.pathname).toBe('/terminal');
    manager.dispose();
  });

  it('authenticates a customer, stores CSRF only in memory, clears private state, and broadcasts refresh-complete', async () => {
    const messages: unknown[] = [];
    class TestBroadcastChannel {
      constructor(_name: string) {}
      addEventListener(): void {}
      removeEventListener(): void {}
      postMessage(message: unknown): void { messages.push(message); }
      close(): void {}
    }
    vi.stubGlobal('BroadcastChannel', TestBroadcastChannel);
    server.use(
      http.get(`${api}/auth/me`, () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
      http.get(`${api}/auth/csrf`, () => HttpResponse.json({ data: { csrfToken: 'prelogin-csrf' } })),
      http.post(`${api}/auth/refresh`, () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
      http.post(`${api}/auth/login/customer`, async ({ request }) => {
        expect(request.headers.get('X-CSRF-Token')).toBe('prelogin-csrf');
        return HttpResponse.json({ data: { user, csrfToken: 'customer-session-csrf' } });
      }),
    );
    const manager = new SessionManager(new RefreshCoordinator('customer-login-test'));
    const cleaner = vi.fn();
    manager.registerPrivateStateCleaner(cleaner);
    await manager.bootstrap();
    await expect(manager.loginCustomer({ identifier: '5512345678', pin: '1234' })).resolves.toEqual({
      status: 'authenticated',
      actor: user,
    });
    expect(cleaner).toHaveBeenCalledOnce();
    await expect(getCsrfToken()).resolves.toBe('customer-session-csrf');
    expect(messages).toEqual([{ type: 'refresh-complete' }]);
    expect(localStorage.length).toBe(0);
    manager.dispose();
  });

  it('does not broadcast session-cleared or wipe private state when customer login fails with 401', async () => {
    const messages: unknown[] = [];
    class TestBroadcastChannel {
      constructor(_name: string) {}
      addEventListener(): void {}
      removeEventListener(): void {}
      postMessage(message: unknown): void { messages.push(message); }
      close(): void {}
    }
    vi.stubGlobal('BroadcastChannel', TestBroadcastChannel);
    server.use(
      http.get(`${api}/auth/me`, () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
      http.get(`${api}/auth/csrf`, () => HttpResponse.json({ data: { csrfToken: 'prelogin-csrf' } })),
      http.post(`${api}/auth/refresh`, () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
      http.post(`${api}/auth/login/customer`, () => HttpResponse.json({ code: 'INVALID_CREDENTIALS', detail: 'Bad credentials' }, { status: 401 })),
    );
    const manager = new SessionManager(new RefreshCoordinator('customer-login-401-test'));
    const cleaner = vi.fn();
    manager.registerPrivateStateCleaner(cleaner);
    await manager.bootstrap();
    await expect(manager.loginCustomer({ identifier: '5512345678', pin: '9999' })).rejects.toMatchObject({ status: 401 });
    expect(manager.getSnapshot()).toEqual({ status: 'anonymous', actor: null });
    expect(cleaner).not.toHaveBeenCalled();
    expect(messages).toEqual([]);
    manager.dispose();
  });

  it('restricts navigation to pin-change-required when loginCustomer returns mustChangePin or 403 PIN_CHANGE_REQUIRED', async () => {
    server.use(
      http.get(`${api}/auth/me`, () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
      http.get(`${api}/auth/csrf`, () => HttpResponse.json({ data: { csrfToken: 'prelogin-csrf' } })),
      http.post(`${api}/auth/refresh`, () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
      http.post(`${api}/auth/login/customer`, () => HttpResponse.json({
        data: { user: { ...user, mustChangePin: true }, csrfToken: 'pin-csrf' },
      })),
    );
    const first = new SessionManager(new RefreshCoordinator('customer-pin-flag'));
    await first.bootstrap();
    await expect(first.loginCustomer({ identifier: 'C000105', pin: '1234' })).resolves.toEqual({
      status: 'pin-change-required',
      actor: null,
    });
    expect(window.location.pathname).toBe('/cambiar-nip');
    first.dispose();

    window.history.replaceState(null, '', '/cliente/iniciar-sesion');
    server.use(
      http.post(`${api}/auth/login/customer`, () => HttpResponse.json({ code: 'PIN_CHANGE_REQUIRED' }, { status: 403 })),
    );
    const second = new SessionManager(new RefreshCoordinator('customer-pin-403'));
    await second.bootstrap();
    await expect(second.loginCustomer({ identifier: 'C000105', pin: '1234' })).resolves.toEqual({
      status: 'pin-change-required',
      actor: null,
    });
    expect(window.location.pathname).toBe('/cambiar-nip');
    second.dispose();
  });

  it('blocks loginCustomer with 409 when an actor session is already active', async () => {
    const staff = { id: 'staff-1', name: 'Caja', role: 'CAJERO', accountType: 'STAFF', mustChangePin: false };
    server.use(http.get(`${api}/auth/me`, () => HttpResponse.json({ data: staff })));
    const manager = new SessionManager();
    await manager.bootstrap();
    await expect(manager.loginCustomer({ identifier: '5512345678', pin: '1234' })).rejects.toMatchObject({ status: 409 });
    expect(manager.getSnapshot()).toEqual({ status: 'authenticated', actor: staff });
    manager.dispose();
  });

  it('rejects non-customer actors returned unexpectedly from loginCustomer', async () => {
    const staff = { id: 'staff-1', name: 'Caja', role: 'CAJERO', accountType: 'STAFF', mustChangePin: false };
    server.use(
      http.get(`${api}/auth/me`, () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
      http.get(`${api}/auth/csrf`, () => HttpResponse.json({ data: { csrfToken: 'prelogin-csrf' } })),
      http.post(`${api}/auth/refresh`, () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
      http.post(`${api}/auth/login/customer`, () => HttpResponse.json({ data: { user: staff, csrfToken: 'bad' } })),
    );
    const manager = new SessionManager();
    await manager.bootstrap();
    await expect(manager.loginCustomer({ identifier: '5512345678', pin: '1234' })).rejects.toMatchObject({ status: 403 });
    expect(manager.getSnapshot()).toEqual({ status: 'anonymous', actor: null });
    manager.dispose();
  });

  it('authenticates staff with prelogin CSRF, clears private state and adopts in-memory CSRF', async () => {
    const staff = { id: 'staff-1', name: 'Caja', role: 'CAJERO', accountType: 'STAFF', mustChangePin: false };
    const messages: unknown[] = [];
    class TestBroadcastChannel {
      constructor(_name: string) {}
      addEventListener(): void {}
      removeEventListener(): void {}
      postMessage(message: unknown): void { messages.push(message); }
      close(): void {}
    }
    vi.stubGlobal('BroadcastChannel', TestBroadcastChannel);
    server.use(
      http.get(`${api}/auth/me`, () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
      http.get(`${api}/auth/csrf`, () => HttpResponse.json({ data: { csrfToken: 'prelogin-csrf' } })),
      http.post(`${api}/auth/refresh`, () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
      http.post(`${api}/auth/login/staff`, async ({ request }) => {
        expect(request.headers.get('X-CSRF-Token')).toBe('prelogin-csrf');
        expect(await request.json()).toEqual({ username: 'cajero1', password: 'password123' });
        return HttpResponse.json({ data: { user: staff, csrfToken: 'staff-session-csrf' } });
      }),
    );
    const manager = new SessionManager(new RefreshCoordinator('staff-login-test'));
    const cleaner = vi.fn();
    manager.registerPrivateStateCleaner(cleaner);
    await manager.bootstrap();
    await expect(manager.loginStaff({ username: 'cajero1', password: 'password123' })).resolves.toEqual({
      status: 'authenticated', actor: staff,
    });
    expect(cleaner).toHaveBeenCalledOnce();
    await expect(getCsrfToken()).resolves.toBe('staff-session-csrf');
    expect(messages).toEqual([{ type: 'refresh-complete' }]);
    expect(JSON.stringify(messages)).not.toContain('password123');
    expect(localStorage.length).toBe(0);
    manager.dispose();
  });

  it('keeps anonymous state and private data when staff login fails with 401', async () => {
    const messages: unknown[] = [];
    class TestBroadcastChannel {
      constructor(_name: string) {}
      addEventListener(): void {}
      removeEventListener(): void {}
      postMessage(message: unknown): void { messages.push(message); }
      close(): void {}
    }
    vi.stubGlobal('BroadcastChannel', TestBroadcastChannel);
    server.use(
      http.get(`${api}/auth/me`, () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
      http.get(`${api}/auth/csrf`, () => HttpResponse.json({ data: { csrfToken: 'prelogin-csrf' } })),
      http.post(`${api}/auth/refresh`, () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
      http.post(`${api}/auth/login/staff`, () => HttpResponse.json({ code: 'INVALID_CREDENTIALS' }, { status: 401 })),
    );
    const manager = new SessionManager(new RefreshCoordinator('staff-login-401-test'));
    const cleaner = vi.fn();
    manager.registerPrivateStateCleaner(cleaner);
    await manager.bootstrap();
    await expect(manager.loginStaff({ username: 'cajero1', password: 'wrong-password' })).rejects.toMatchObject({ status: 401 });
    expect(manager.getSnapshot()).toEqual({ status: 'anonymous', actor: null });
    expect(cleaner).not.toHaveBeenCalled();
    expect(messages).toEqual([]);
    manager.dispose();
  });

  it('rejects GERENTE and CUSTOMER actors returned unexpectedly from staff login', async () => {
    const rejected = [
      { id: 'legacy-1', name: 'Gerente', role: 'GERENTE', accountType: 'STAFF', mustChangePin: false },
      { id: 'customer-1', name: 'Cliente', role: 'CLIENTE', accountType: 'CUSTOMER', mustChangePin: false },
    ];
    let index = 0;
    server.use(
      http.get(`${api}/auth/me`, () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
      http.get(`${api}/auth/csrf`, () => HttpResponse.json({ data: { csrfToken: 'prelogin-csrf' } })),
      http.post(`${api}/auth/refresh`, () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
      http.post(`${api}/auth/login/staff`, () => HttpResponse.json({
        data: { user: rejected[index++], csrfToken: 'bad-staff-csrf' },
      })),
    );
    const manager = new SessionManager();
    await manager.bootstrap();
    await expect(manager.loginStaff({ username: 'legacy', password: 'password123' })).rejects.toMatchObject({ status: 403 });
    expect(manager.getSnapshot()).toEqual({ status: 'anonymous', actor: null });
    await expect(manager.loginStaff({ username: 'customer', password: 'password123' })).rejects.toMatchObject({ status: 403 });
    expect(manager.getSnapshot()).toEqual({ status: 'anonymous', actor: null });
    manager.dispose();
  });

  it('restricts navigation to pin-change-required when staff login reports mustChangePin or 403 PIN_CHANGE_REQUIRED', async () => {
    const staff = { id: 'staff-1', name: 'Caja', role: 'CAJERO', accountType: 'STAFF', mustChangePin: false };
    server.use(
      http.get(`${api}/auth/me`, () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
      http.get(`${api}/auth/csrf`, () => HttpResponse.json({ data: { csrfToken: 'prelogin-csrf' } })),
      http.post(`${api}/auth/refresh`, () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
      http.post(`${api}/auth/login/staff`, () => HttpResponse.json({
        data: { user: { ...staff, mustChangePin: true }, csrfToken: 'staff-pin-csrf' },
      })),
    );
    const first = new SessionManager(new RefreshCoordinator('staff-pin-flag'));
    await first.bootstrap();
    await expect(first.loginStaff({ username: 'cajero1', password: 'password123' })).resolves.toEqual({
      status: 'pin-change-required', actor: null,
    });
    expect(window.location.pathname).toBe('/cambiar-nip');
    first.dispose();

    window.history.replaceState(null, '', '/terminal/acceso');
    server.use(http.post(`${api}/auth/login/staff`, () => HttpResponse.json(
      { code: 'PIN_CHANGE_REQUIRED' }, { status: 403 },
    )));
    const second = new SessionManager(new RefreshCoordinator('staff-pin-403'));
    await second.bootstrap();
    await expect(second.loginStaff({ username: 'cajero1', password: 'password123' })).resolves.toEqual({
      status: 'pin-change-required', actor: null,
    });
    expect(window.location.pathname).toBe('/cambiar-nip');
    second.dispose();
  });

  it('blocks loginStaff with 409 when an actor session is already active', async () => {
    const staff = { id: 'staff-1', name: 'Caja', role: 'CAJERO', accountType: 'STAFF', mustChangePin: false };
    server.use(http.get(`${api}/auth/me`, () => HttpResponse.json({ data: staff })));
    const manager = new SessionManager();
    await manager.bootstrap();
    await expect(manager.loginStaff({ username: 'cajero1', password: 'password123' })).rejects.toMatchObject({ status: 409 });
    expect(manager.getSnapshot()).toEqual({ status: 'authenticated', actor: staff });
    manager.dispose();
  });
});

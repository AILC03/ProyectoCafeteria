import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createTestRouter } from '../../../app/router';
import { SessionProvider } from '../../../shared/auth/SessionProvider';
import { RefreshCoordinator, SessionManager } from '../../../shared/auth/session';
import { idempotencyOperations, isUncertainIdempotencyFailure } from '../../../shared/api/idempotency';
import { ApiError, invalidateCsrfToken } from '../../../shared/api/client';
import { clearGuestSession, enterGuestSession } from '../auth/guestSession';
import { mobileOrderStoreFor } from '../orders/mobileOrders';
import { CART_DRAFT_KEY } from '../../../shared/storage';
import { server } from '../../../test/server';

const latte = { id: '10', categoryId: '1', name: 'Latte', description: null, imageUrl: null, basePriceCents: '6500', isAvailable: true };
const options = [{ id: 'size', name: 'Tamaño', pricingScope: 'PER_PRODUCT', minSelections: 1, maxSelections: 1,
  values: [{ id: 'large', name: 'Grande', surchargeCents: '1000', isAvailable: true }] }];

function stubAuthChannels() {
  class TestAuthChannel {
    static channels = new Set<TestAuthChannel>();
    private listeners = new Set<(event: MessageEvent<unknown>) => void>();
    constructor(readonly name: string) { TestAuthChannel.channels.add(this); }
    addEventListener(type: string, listener: (event: MessageEvent<unknown>) => void): void {
      if (type === 'message') this.listeners.add(listener);
    }
    removeEventListener(type: string, listener: (event: MessageEvent<unknown>) => void): void {
      if (type === 'message') this.listeners.delete(listener);
    }
    postMessage(data: unknown): void {
      for (const channel of TestAuthChannel.channels) {
        if (channel !== this && channel.name === this.name) {
          channel.listeners.forEach((listener) => listener({ data } as MessageEvent<unknown>));
        }
      }
    }
    close(): void { TestAuthChannel.channels.delete(this); }
  }
  vi.stubGlobal('BroadcastChannel', TestAuthChannel);
  return new TestAuthChannel('cafeteria:auth-refresh:browser');
}

function mockCatalog() {
  server.use(
    http.get('/api/v1/auth/me', () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
    http.get('/api/v1/categories', () => HttpResponse.json({ data: [], page: { nextCursor: null } })),
    http.get('/api/v1/products', () => HttpResponse.json({ data: [latte], page: { nextCursor: null } })),
    http.get('/api/v1/products/10', () => HttpResponse.json({ data: latte })),
    http.get('/api/v1/products/10/options', () => HttpResponse.json({ data: options })),
    http.get('/api/v1/auth/csrf', () => HttpResponse.json({ data: { csrfToken: 'csrf-test' } })),
  );
}

function menu() {
  return render(<SessionProvider><RouterProvider router={createTestRouter(['/cliente/menu'])} /></SessionProvider>);
}

async function addLatte() {
  fireEvent.click(await screen.findByRole('button', { name: 'Personalizar Latte' }));
  const dialog = await screen.findByRole('dialog', { name: 'Latte' });
  await within(dialog).findByRole('button', { name: /Grande/i });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar personalización' }));
  fireEvent.click(screen.getByRole('button', { name: 'Añadir al carrito' }));
  await screen.findByText(/Subtotal estimado/);
}

afterEach(() => { localStorage.clear(); idempotencyOperations.clear(); clearGuestSession(); vi.unstubAllGlobals(); });

describe('Mobile cart and order (TASK-11)', () => {
  test('a local login broadcast cannot leave the new customer cart permanently paused', async () => {
    const broadcaster = stubAuthChannels();
    mockCatalog();
    const customer = { id: '42', name: 'Ada', role: 'CLIENTE', accountType: 'CUSTOMER', mustChangePin: false };
    let signedIn = false;
    let lookups = 0;
    server.use(
      http.get('/api/v1/auth/me', () => {
        lookups += 1;
        return signedIn ? HttpResponse.json({ data: customer }) : HttpResponse.json({ code: 'NOT_FOUND' }, { status: 404 });
      }),
      http.post('/api/v1/auth/login/customer', () => {
        signedIn = true;
        return HttpResponse.json({ data: { user: customer, csrfToken: 'after-login' } });
      }),
    );
    const manager = new SessionManager(new RefreshCoordinator('browser'));
    render(<SessionProvider manager={manager}><RouterProvider router={createTestRouter(['/cliente/menu'])} /></SessionProvider>);
    await waitFor(() => expect(manager.getSnapshot().status).toBe('anonymous'));
    await manager.loginCustomer({ identifier: '5512345678', pin: '1234' });
    await waitFor(() => expect(lookups).toBeGreaterThan(1));
    await waitFor(() => expect(mobileOrderStoreFor(manager).getSnapshot().paused).toBe(false));
    await addLatte();
    expect(screen.getByRole('button', { name: 'Crear orden pendiente' })).toBeEnabled();
    manager.dispose();
    broadcaster.close();
  });

  test('refresh-complete pauses a visitor retry before delayed /auth/me and discards it when another tab logs in', async () => {
    const broadcaster = stubAuthChannels();
    mockCatalog();
    const customer = { id: '42', name: 'Ada', role: 'CLIENTE', accountType: 'CUSTOMER', mustChangePin: false };
    let adopted = false;
    let release!: () => void;
    const resolution = new Promise<void>((resolve) => { release = resolve; });
    let posts = 0;
    server.use(
      http.get('/api/v1/auth/me', async () => {
        if (!adopted) return HttpResponse.json({ code: 'NOT_FOUND' }, { status: 404 });
        await resolution;
        return HttpResponse.json({ data: customer });
      }),
      http.post('/api/v1/orders', () => {
        posts += 1;
        return HttpResponse.json({ code: 'DEPENDENCY_UNAVAILABLE' }, { status: 503 });
      }),
    );
    const manager = new SessionManager(new RefreshCoordinator('browser'));
    render(<SessionProvider manager={manager}><RouterProvider router={createTestRouter(['/cliente/menu'])} /></SessionProvider>);
    await waitFor(() => expect(manager.getSnapshot().status).toBe('anonymous'));
    await addLatte();
    fireEvent.click(screen.getByRole('button', { name: 'Crear orden pendiente' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No sabemos si se creó');
    const pending = mobileOrderStoreFor(manager).getSnapshot().pending;
    expect(pending).not.toBeNull();
    adopted = true;
    act(() => broadcaster.postMessage({ type: 'refresh-complete' }));
    expect(mobileOrderStoreFor(manager).getSnapshot().paused).toBe(true);
    expect(screen.getByRole('button', { name: 'Reintentar la misma orden' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Crear orden pendiente' })).toBeDisabled();
    await mobileOrderStoreFor(manager).send();
    expect(posts).toBe(1);
    expect(mobileOrderStoreFor(manager).getSnapshot().pending).toBe(pending);
    release();
    await waitFor(() => expect(manager.getSnapshot().status).toBe('authenticated'));
    await waitFor(() => expect(screen.getByText(/Tu carrito está vacío/)).toBeInTheDocument());
    expect(localStorage.getItem(CART_DRAFT_KEY)).toBeNull();
    expect(mobileOrderStoreFor(manager).getSnapshot().pending).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reintentar la misma orden' })).not.toBeInTheDocument();
    expect(idempotencyOperations.activeCount).toBe(0);
    manager.dispose();
    broadcaster.close();
  });

  test('refresh-complete for the same customer resumes only after /auth/me and preserves the same retry key', async () => {
    const broadcaster = stubAuthChannels();
    mockCatalog();
    const customer = { id: '42', name: 'Ada', role: 'CLIENTE', accountType: 'CUSTOMER', mustChangePin: false };
    let resolving = false;
    let release!: () => void;
    const resolution = new Promise<void>((resolve) => { release = resolve; });
    const requests: Array<{ key: string | null; body: unknown }> = [];
    server.use(
      http.get('/api/v1/auth/me', async () => {
        if (resolving) await resolution;
        return HttpResponse.json({ data: customer });
      }),
      http.post('/api/v1/orders', async ({ request }) => {
        requests.push({ key: request.headers.get('Idempotency-Key'), body: await request.json() });
        if (requests.length === 1) return HttpResponse.json({ code: 'DEPENDENCY_UNAVAILABLE' }, { status: 503 });
        return HttpResponse.json({ data: { id: '91', folio: 'A000091', status: 'PENDIENTE_PAGO', source: 'MOBILE', paidAt: null,
          totalCents: '7500', paymentMethod: 'CASH', paymentExpiresAt: '2026-11-20T12:30:00Z' } }, { status: 201 });
      }),
    );
    const manager = new SessionManager(new RefreshCoordinator('browser'));
    render(<SessionProvider manager={manager}><RouterProvider router={createTestRouter(['/cliente/menu'])} /></SessionProvider>);
    await waitFor(() => expect(manager.getSnapshot().status).toBe('authenticated'));
    await addLatte();
    fireEvent.click(screen.getByRole('button', { name: 'Crear orden pendiente' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No sabemos si se creó');
    const pending = mobileOrderStoreFor(manager).getSnapshot().pending;
    resolving = true;
    act(() => broadcaster.postMessage({ type: 'refresh-complete' }));
    expect(screen.getByRole('button', { name: 'Reintentar la misma orden' })).toBeDisabled();
    await mobileOrderStoreFor(manager).send();
    expect(requests).toHaveLength(1);
    release();
    await waitFor(() => expect(mobileOrderStoreFor(manager).getSnapshot().paused).toBe(false));
    expect(mobileOrderStoreFor(manager).getSnapshot().pending).toBe(pending);
    expect(screen.getByRole('button', { name: 'Reintentar la misma orden' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar la misma orden' }));
    expect(await screen.findByText(/Orden A000091 creada/)).toBeInTheDocument();
    expect(requests).toHaveLength(2);
    expect(requests[0]).toEqual(requests[1]);
    manager.dispose();
    broadcaster.close();
  });

  test('refresh-complete during preflight cannot POST while /auth/me is unresolved', async () => {
    const broadcaster = stubAuthChannels();
    mockCatalog();
    const customer = { id: '42', name: 'Ada', role: 'CLIENTE', accountType: 'CUSTOMER', mustChangePin: false };
    let resolving = false;
    let detailCalls = 0;
    let releaseActor!: () => void;
    let releaseDetail!: () => void;
    const actorGate = new Promise<void>((resolve) => { releaseActor = resolve; });
    const detailGate = new Promise<void>((resolve) => { releaseDetail = resolve; });
    let posts = 0;
    server.use(
      http.get('/api/v1/auth/me', async () => {
        if (resolving) await actorGate;
        return HttpResponse.json({ data: customer });
      }),
      http.get('/api/v1/products/10', async () => {
        detailCalls += 1;
        if (detailCalls === 3) await detailGate;
        return HttpResponse.json({ data: latte });
      }),
      http.post('/api/v1/orders', () => { posts += 1; return HttpResponse.json({ data: {} }, { status: 201 }); }),
    );
    const manager = new SessionManager(new RefreshCoordinator('browser'));
    render(<SessionProvider manager={manager}><RouterProvider router={createTestRouter(['/cliente/menu'])} /></SessionProvider>);
    await waitFor(() => expect(manager.getSnapshot().status).toBe('authenticated'));
    await addLatte();
    fireEvent.click(screen.getByRole('button', { name: 'Crear orden pendiente' }));
    await waitFor(() => expect(detailCalls).toBe(3));
    resolving = true;
    act(() => broadcaster.postMessage({ type: 'refresh-complete' }));
    releaseDetail();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Crear orden pendiente' })).toBeDisabled());
    expect(posts).toBe(0);
    releaseActor();
    await waitFor(() => expect(mobileOrderStoreFor(manager).getSnapshot().paused).toBe(false));
    expect(posts).toBe(0);
    manager.dispose();
    broadcaster.close();
  });

  test('a failed /auth/me after refresh-complete keeps orders paused until identity resolves', async () => {
    const broadcaster = stubAuthChannels();
    mockCatalog();
    const customer = { id: '42', name: 'Ada', role: 'CLIENTE', accountType: 'CUSTOMER', mustChangePin: false };
    let unavailable = false;
    let posts = 0;
    server.use(
      http.get('/api/v1/auth/me', () => unavailable
        ? HttpResponse.json({ code: 'DEPENDENCY_UNAVAILABLE' }, { status: 503 })
        : HttpResponse.json({ data: customer })),
      http.post('/api/v1/orders', () => {
        posts += 1;
        return HttpResponse.json({ code: 'DEPENDENCY_UNAVAILABLE' }, { status: 503 });
      }),
    );
    const manager = new SessionManager(new RefreshCoordinator('browser'));
    render(<SessionProvider manager={manager}><RouterProvider router={createTestRouter(['/cliente/menu'])} /></SessionProvider>);
    await waitFor(() => expect(manager.getSnapshot().status).toBe('authenticated'));
    await addLatte();
    fireEvent.click(screen.getByRole('button', { name: 'Crear orden pendiente' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No sabemos si se creó');
    unavailable = true;
    act(() => broadcaster.postMessage({ type: 'refresh-complete' }));
    await waitFor(() => expect(manager.getSnapshot().status).toBe('recoverable-error'));
    expect(mobileOrderStoreFor(manager).getSnapshot().paused).toBe(true);
    expect(screen.getByRole('button', { name: 'Reintentar la misma orden' })).toBeDisabled();
    await mobileOrderStoreFor(manager).send();
    expect(posts).toBe(1);
    unavailable = false;
    await manager.bootstrap();
    await waitFor(() => expect(mobileOrderStoreFor(manager).getSnapshot().paused).toBe(false));
    expect(screen.getByRole('button', { name: 'Reintentar la misma orden' })).toBeEnabled();
    manager.dispose();
    broadcaster.close();
  });

  test('refresh-complete aborts an order waiting for CSRF before POST uses a changed cookie', async () => {
    const broadcaster = stubAuthChannels();
    mockCatalog();
    const customer = { id: '42', name: 'Ada', role: 'CLIENTE', accountType: 'CUSTOMER', mustChangePin: false };
    let resolving = false;
    let csrfRequested = false;
    let releaseCsrf!: () => void;
    let releaseActor!: () => void;
    const csrfGate = new Promise<void>((resolve) => { releaseCsrf = resolve; });
    const actorGate = new Promise<void>((resolve) => { releaseActor = resolve; });
    let posts = 0;
    server.use(
      http.get('/api/v1/auth/me', async () => {
        if (resolving) await actorGate;
        return HttpResponse.json({ data: customer });
      }),
      http.get('/api/v1/auth/csrf', async () => {
        csrfRequested = true;
        await csrfGate;
        return HttpResponse.json({ data: { csrfToken: 'after-refresh' } });
      }),
      http.post('/api/v1/orders', () => { posts += 1; return HttpResponse.json({ code: 'DEPENDENCY_UNAVAILABLE' }, { status: 503 }); }),
    );
    const manager = new SessionManager(new RefreshCoordinator('browser'));
    render(<SessionProvider manager={manager}><RouterProvider router={createTestRouter(['/cliente/menu'])} /></SessionProvider>);
    await waitFor(() => expect(manager.getSnapshot().status).toBe('authenticated'));
    await addLatte();
    invalidateCsrfToken();
    fireEvent.click(screen.getByRole('button', { name: 'Crear orden pendiente' }));
    await waitFor(() => expect(csrfRequested).toBe(true));
    resolving = true;
    act(() => broadcaster.postMessage({ type: 'refresh-complete' }));
    releaseCsrf();
    await waitFor(() => expect(mobileOrderStoreFor(manager).getSnapshot().sending).toBe(false));
    expect(posts).toBe(0);
    expect(mobileOrderStoreFor(manager).getSnapshot().paused).toBe(true);
    releaseActor();
    await waitFor(() => expect(mobileOrderStoreFor(manager).getSnapshot().paused).toBe(false));
    expect(mobileOrderStoreFor(manager).getSnapshot().pending).not.toBeNull();
    expect(posts).toBe(0);
    manager.dispose();
    broadcaster.close();
  });
  test('cross-tab refresh-complete replaces visitor with customer: clears uncertain retry and draft without discarding initial bootstrap draft', async () => {
    const oldLocks = (navigator as Navigator & { locks?: unknown }).locks;
    Object.defineProperty(navigator, 'locks', { configurable: true, value: {
      request: <T,>(_name: string, _options: unknown, callback: () => Promise<T>): Promise<T> => callback(),
    } });
    try {
      class CrossTabCoordinator extends RefreshCoordinator {
        private receiver: Parameters<RefreshCoordinator['onMessage']>[0] | null = null;
        override onMessage(listener: Parameters<RefreshCoordinator['onMessage']>[0]): () => void {
          this.receiver = listener;
          return () => { this.receiver = null; };
        }
        signalLogin(): void { this.receiver?.('refresh-complete'); }
      }
      const coordinator = new CrossTabCoordinator('mobile-order-cross-tab');
      const manager = new SessionManager(coordinator);
      let signedIn = false;
      const customer = { id: '42', name: 'Ada', role: 'CLIENTE', accountType: 'CUSTOMER', mustChangePin: false };
      const requests: Array<string | null> = [];
      localStorage.setItem(CART_DRAFT_KEY, JSON.stringify({ version: 1, items: [{ productId: '10', quantity: 1, optionValueIds: ['large'] }] }));
      mockCatalog();
      server.use(
        http.get('/api/v1/auth/me', () => signedIn
          ? HttpResponse.json({ data: customer })
          : HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
        http.post('/api/v1/auth/refresh', () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
        http.post('/api/v1/orders', ({ request }) => {
          requests.push(request.headers.get('Idempotency-Key'));
          return HttpResponse.json({ code: 'DEPENDENCY_UNAVAILABLE' }, { status: 503 });
        }),
      );
      render(<SessionProvider manager={manager}><RouterProvider router={createTestRouter(['/cliente/menu'])} /></SessionProvider>);
      await waitFor(() => expect(manager.getSnapshot().status).toBe('anonymous'));
      expect(await screen.findByText(/Subtotal estimado: \$75\.00/)).toBeInTheDocument();
      expect(localStorage.getItem(CART_DRAFT_KEY)).toContain('large');
      fireEvent.click(screen.getByRole('button', { name: 'Crear orden pendiente' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('No sabemos si se creó');
      expect(idempotencyOperations.activeCount).toBe(1);
      signedIn = true;
      coordinator.signalLogin();
      await waitFor(() => expect(manager.getSnapshot()).toMatchObject({ status: 'authenticated', actor: customer }));
      await waitFor(() => expect(screen.getByText(/Tu carrito está vacío/)).toBeInTheDocument());
      expect(localStorage.getItem(CART_DRAFT_KEY)).toBeNull();
      expect(idempotencyOperations.activeCount).toBe(0);
      expect(screen.queryByRole('button', { name: 'Reintentar la misma orden' })).not.toBeInTheDocument();
      await mobileOrderStoreFor(manager).send();
      expect(requests).toHaveLength(1);
      manager.dispose();
    } finally {
      Object.defineProperty(navigator, 'locks', { configurable: true, value: oldLocks });
    }
  });

  test('late order response after a cross-tab actor adoption does not confirm the previous visitor order', async () => {
    class CrossTabCoordinator extends RefreshCoordinator {
      private receiver: Parameters<RefreshCoordinator['onMessage']>[0] | null = null;
      override onMessage(listener: Parameters<RefreshCoordinator['onMessage']>[0]): () => void {
        this.receiver = listener;
        return () => { this.receiver = null; };
      }
      signalLogin(): void { this.receiver?.('refresh-complete'); }
    }
    const coordinator = new CrossTabCoordinator('mobile-order-late-response');
    const manager = new SessionManager(coordinator);
    let signedIn = false;
    const customer = { id: '42', name: 'Ada', role: 'CLIENTE', accountType: 'CUSTOMER', mustChangePin: false };
    let release!: () => void;
    const responseGate = new Promise<void>((resolve) => { release = resolve; });
    mockCatalog();
    server.use(
      http.get('/api/v1/auth/me', () => signedIn
        ? HttpResponse.json({ data: customer }) : HttpResponse.json({ code: 'NOT_FOUND' }, { status: 404 })),
      http.post('/api/v1/orders', async () => {
        await responseGate;
        return HttpResponse.json({ data: { id: '82', folio: 'A000082', status: 'PENDIENTE_PAGO', source: 'MOBILE', paidAt: null,
          totalCents: '7500', paymentMethod: 'CASH', paymentExpiresAt: '2026-11-20T12:30:00Z' } }, { status: 201 });
      }),
    );
    render(<SessionProvider manager={manager}><RouterProvider router={createTestRouter(['/cliente/menu'])} /></SessionProvider>);
    await waitFor(() => expect(manager.getSnapshot().status).toBe('anonymous'));
    await addLatte();
    fireEvent.click(screen.getByRole('button', { name: 'Crear orden pendiente' }));
    await screen.findByText('Enviando orden…');
    signedIn = true;
    coordinator.signalLogin();
    await waitFor(() => expect(manager.getSnapshot().status).toBe('authenticated'));
    release();
    await waitFor(() => expect(idempotencyOperations.activeCount).toBe(0));
    expect(localStorage.getItem(CART_DRAFT_KEY)).toBeNull();
    expect(screen.queryByText(/Orden A000082 creada/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar la misma orden' })).not.toBeInTheDocument();
    manager.dispose();
  });
  test('network and timeout are uncertain; a final conflict is not', () => {
    expect(isUncertainIdempotencyFailure(new ApiError(0, 'Network failure'))).toBe(true);
    expect(isUncertainIdempotencyFailure(new ApiError(503, 'Unavailable'))).toBe(true);
    expect(isUncertainIdempotencyFailure(new DOMException('Timed out', 'TimeoutError'))).toBe(true);
    expect(isUncertainIdempotencyFailure(new ApiError(409, 'Conflict'))).toBe(false);
  });
  test('persists allowlisted draft, sends CASH without prices or optional tokens, displays server total as unpaid', async () => {
    mockCatalog();
    let body: Record<string, unknown> | null = null;
    let idempotencyKey: string | null = null;
    server.use(http.post('/api/v1/orders', async ({ request }) => {
      body = await request.json() as Record<string, unknown>;
      idempotencyKey = request.headers.get('Idempotency-Key');
      return HttpResponse.json({ data: { id: '1', folio: 'A000001', status: 'PENDIENTE_PAGO', source: 'MOBILE', paidAt: null, totalCents: '8100', paymentMethod: 'CASH', paymentExpiresAt: '2026-11-20T12:30:00Z' } }, { status: 201 });
    }));
    menu();
    await addLatte();
    expect(JSON.parse(localStorage.getItem(CART_DRAFT_KEY) ?? '')).toEqual({ version: 1, items: [{ productId: '10', quantity: 1, optionValueIds: ['large'] }] });
    fireEvent.click(screen.getByRole('button', { name: 'Crear orden pendiente' }));
    expect(await screen.findByText(/Orden A000001 creada/)).toBeInTheDocument();
    expect(screen.getByText(/Total confirmado por el servidor: \$81\.00/)).toBeInTheDocument();
    expect(screen.getByText('Crear la orden no confirma el pago.')).toBeInTheDocument();
    expect(body).toEqual({ paymentMethod: 'CASH', items: [{ productId: '10', quantity: 1, optionValueIds: ['large'] }] });
    expect(idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(JSON.parse(localStorage.getItem(CART_DRAFT_KEY) ?? '')).toEqual({ version: 1, items: [] });
  });

  test('on uncertain network outcome retries identical snapshot/key without false success', async () => {
    mockCatalog();
    const requests: Array<{ key: string | null; body: unknown }> = [];
    server.use(http.post('/api/v1/orders', async ({ request }) => {
      requests.push({ key: request.headers.get('Idempotency-Key'), body: await request.json() });
      if (requests.length === 1) return HttpResponse.error();
      return HttpResponse.json({ data: { id: '2', folio: 'A000002', status: 'PENDIENTE_PAGO', source: 'MOBILE', paidAt: null, totalCents: '7500', paymentMethod: 'STRIPE', paymentExpiresAt: '2026-11-20T12:30:00Z' } }, { status: 201 });
    }));
    menu();
    await addLatte();
    fireEvent.click(screen.getByRole('radio', { name: /STRIPE/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear orden pendiente' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No sabemos si se creó');
    expect(screen.queryByText(/Orden A000002 creada/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear orden pendiente' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar la misma orden' }));
    expect(await screen.findByText(/Orden A000002 creada/)).toBeInTheDocument();
    expect(requests).toHaveLength(2);
    expect(requests[0]).toEqual(requests[1]);
    expect(requests[0].body).toEqual({ paymentMethod: 'STRIPE', items: [{ productId: '10', quantity: 1, optionValueIds: ['large'] }] });
  });

  test('restored draft is checked against changed API and cannot order until reselected', async () => {
    localStorage.setItem(CART_DRAFT_KEY, JSON.stringify({ version: 1, items: [{ productId: '10', quantity: 1, optionValueIds: ['large'], totalCents: '0', guestName: 'forged' }] }));
    mockCatalog();
    let posted = false;
    server.use(
      http.get('/api/v1/products/10/options', () => HttpResponse.json({ data: [{ ...options[0], values: [{ ...options[0].values[0], isAvailable: false }] }] })),
      http.post('/api/v1/orders', () => { posted = true; return HttpResponse.json({ data: {} }, { status: 201 }); }),
    );
    menu();
    expect(await screen.findByRole('alert')).toHaveTextContent('Opciones no disponibles');
    expect(screen.getByRole('button', { name: 'Crear orden pendiente' })).toBeDisabled();
    expect(posted).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Latte' }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem(CART_DRAFT_KEY) ?? '')).toEqual({ version: 1, items: [] }));
  });

  test('409 conflict ends the attempt; a new explicit action gets a new key', async () => {
    mockCatalog();
    const keys: Array<string | null> = [];
    server.use(http.post('/api/v1/orders', ({ request }) => {
      keys.push(request.headers.get('Idempotency-Key'));
      if (keys.length === 1) return HttpResponse.json({ code: 'ORDER_CONFLICT' }, { status: 409 });
      return HttpResponse.json({ data: { id: '3', folio: 'A000003', status: 'PENDIENTE_PAGO', source: 'MOBILE', paidAt: null, totalCents: '7500', paymentMethod: 'CASH', paymentExpiresAt: '2026-11-20T12:30:00Z' } }, { status: 201 });
    }));
    menu();
    await addLatte();
    fireEvent.click(screen.getByRole('button', { name: 'Crear orden pendiente' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('entraron en conflicto');
    expect(screen.queryByRole('button', { name: 'Reintentar la misma orden' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Crear orden pendiente' }));
    expect(await screen.findByText(/Orden A000003 creada/)).toBeInTheDocument();
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  test('CSRF_INVALID preserves the snapshot and requires explicit retry with the same key', async () => {
    mockCatalog();
    const requests: Array<{ key: string | null; body: unknown }> = [];
    server.use(http.post('/api/v1/orders', async ({ request }) => {
      requests.push({ key: request.headers.get('Idempotency-Key'), body: await request.json() });
      if (requests.length === 1) return HttpResponse.json({ code: 'CSRF_INVALID' }, { status: 403 });
      return HttpResponse.json({ data: { id: '4', folio: 'A000004', status: 'PENDIENTE_PAGO', source: 'MOBILE', paidAt: null, totalCents: '7500', paymentMethod: 'CASH', paymentExpiresAt: '2026-11-20T12:30:00Z' } }, { status: 201 });
    }));
    menu();
    await addLatte();
    fireEvent.click(screen.getByRole('button', { name: 'Crear orden pendiente' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Reintenta la misma operación');
    expect(requests).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Crear orden pendiente' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar la misma orden' }));
    expect(await screen.findByText(/Orden A000004 creada/)).toBeInTheDocument();
    expect(requests).toHaveLength(2);
    expect(requests[0]).toEqual(requests[1]);
  });

  test('503 pending attempt survives SPA navigation, blocks a new order and retries identical request', async () => {
    mockCatalog();
    const requests: Array<{ key: string | null; body: unknown }> = [];
    server.use(http.post('/api/v1/orders', async ({ request }) => {
      requests.push({ key: request.headers.get('Idempotency-Key'), body: await request.json() });
      if (requests.length === 1) return HttpResponse.json({ code: 'DEPENDENCY_UNAVAILABLE' }, { status: 503 });
      return HttpResponse.json({ data: { id: '5', folio: 'A000005', status: 'PENDIENTE_PAGO', source: 'MOBILE', paidAt: null, totalCents: '7500', paymentMethod: 'CASH', paymentExpiresAt: '2026-11-20T12:30:00Z' } }, { status: 201 });
    }));
    menu();
    await addLatte();
    fireEvent.click(screen.getByRole('button', { name: 'Crear orden pendiente' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No sabemos si se creó');
    fireEvent.click(screen.getByRole('link', { name: 'Iniciar sesión' }));
    await screen.findByRole('heading', { name: /Iniciar sesión/i });
    fireEvent.click(screen.getByRole('link', { name: 'Menú' }));
    await screen.findByRole('button', { name: 'Reintentar la misma orden' });
    expect(screen.getByRole('button', { name: 'Crear orden pendiente' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Personalizar Latte' }));
    const dialog = await screen.findByRole('dialog', { name: 'Latte' });
    await within(dialog).findByRole('button', { name: /Grande/i });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar personalización' }));
    expect(screen.getByRole('button', { name: 'Añadir al carrito' })).toBeDisabled();
    expect(localStorage.getItem(CART_DRAFT_KEY)).not.toContain('Idempotency');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar la misma orden' }));
    expect(await screen.findByText(/Orden A000005 creada/)).toBeInTheDocument();
    expect(requests).toHaveLength(2);
    expect(requests[0]).toEqual(requests[1]);
  });

  test('price and options changing between visual check and preflight demand a new confirmation', async () => {
    mockCatalog();
    let currentPrice = '6500';
    let currentOptions = options;
    let posted = 0;
    server.use(
      http.get('/api/v1/products/10', () => HttpResponse.json({ data: { ...latte, basePriceCents: currentPrice } })),
      http.get('/api/v1/products/10/options', () => HttpResponse.json({ data: currentOptions })),
      http.post('/api/v1/orders', () => {
        posted += 1;
        return HttpResponse.json({ data: { id: '6', folio: 'A000006', status: 'PENDIENTE_PAGO', source: 'MOBILE', paidAt: null, totalCents: '8500', paymentMethod: 'CASH', paymentExpiresAt: '2026-11-20T12:30:00Z' } }, { status: 201 });
      }),
    );
    menu();
    await addLatte();
    currentPrice = '7500';
    currentOptions = [{ ...options[0], values: [{ ...options[0].values[0], name: 'Grande nuevo' }] }];
    fireEvent.click(screen.getByRole('button', { name: 'Crear orden pendiente' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('confirma nuevamente');
    expect(posted).toBe(0);
    expect(screen.getByText(/Subtotal estimado: \$85\.00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cambios y crear orden pendiente' }));
    expect(await screen.findByText(/Orden A000006 creada/)).toBeInTheDocument();
    expect(posted).toBe(1);
  });

  test('transient verification error can be revalidated without dropping the draft', async () => {
    localStorage.setItem(CART_DRAFT_KEY, JSON.stringify({ version: 1, items: [{ productId: '10', quantity: 1, optionValueIds: ['large'] }] }));
    mockCatalog();
    let unavailable = true;
    server.use(http.get('/api/v1/products/10', () => unavailable
      ? HttpResponse.json({ code: 'DEPENDENCY_UNAVAILABLE' }, { status: 503 }) : HttpResponse.json({ data: latte })));
    menu();
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo verificar');
    unavailable = false;
    fireEvent.click(screen.getByRole('button', { name: 'Revalidar carrito' }));
    expect(await screen.findByText(/Subtotal estimado: \$75\.00/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(CART_DRAFT_KEY) ?? '')).toEqual({ version: 1, items: [{ productId: '10', quantity: 1, optionValueIds: ['large'] }] });
  });

  test('actor logout while request is in flight discards retry material and ignores late success', async () => {
    mockCatalog();
    const customer = { id: '42', name: 'Ada', role: 'CLIENTE', accountType: 'CUSTOMER', mustChangePin: false };
    server.use(
      http.get('/api/v1/auth/me', () => HttpResponse.json({ data: customer })),
      http.post('/api/v1/auth/logout', () => new HttpResponse(null, { status: 204 })),
    );
    let release!: () => void;
    const responseGate = new Promise<void>((resolve) => { release = resolve; });
    server.use(http.post('/api/v1/orders', async () => {
      await responseGate;
      return HttpResponse.json({ data: { id: '7', folio: 'A000007', status: 'PENDIENTE_PAGO', source: 'MOBILE', paidAt: null, totalCents: '7500', paymentMethod: 'CASH', paymentExpiresAt: '2026-11-20T12:30:00Z' } }, { status: 201 });
    }));
    const manager = new SessionManager(new RefreshCoordinator('mobile-order-actor-test'));
    render(<SessionProvider manager={manager}><RouterProvider router={createTestRouter(['/cliente/menu'])} /></SessionProvider>);
    await addLatte();
    fireEvent.click(screen.getByRole('button', { name: 'Crear orden pendiente' }));
    await screen.findByText('Enviando orden…');
    expect(await manager.logout()).toBe(true);
    release();
    await waitFor(() => expect(idempotencyOperations.activeCount).toBe(0));
    expect(screen.queryByText(/Orden A000007 creada/)).not.toBeInTheDocument();
    expect(localStorage.getItem(CART_DRAFT_KEY)).toBeNull();
    manager.dispose();
  });

  test('unverifiable 201 blocks further orders and retries across SPA navigation without false success', async () => {
    mockCatalog();
    let posted = 0;
    server.use(http.post('/api/v1/orders', () => {
      posted += 1;
      return HttpResponse.json({ data: { id: '8', status: 'PENDIENTE_PAGO', paymentMethod: 'CASH' } }, { status: 201 });
    }));
    menu();
    await addLatte();
    fireEvent.click(screen.getByRole('button', { name: 'Crear orden pendiente' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('confirma con la cafetería');
    expect(screen.getByRole('alert')).toHaveTextContent('No hay pago confirmado');
    expect(screen.queryByText(/Orden A000008 creada/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear orden pendiente' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Reintentar la misma orden' })).not.toBeInTheDocument();
    expect(idempotencyOperations.activeCount).toBe(0);
    fireEvent.click(screen.getByRole('link', { name: 'Iniciar sesión' }));
    await screen.findByRole('heading', { name: /Iniciar sesión/i });
    fireEvent.click(screen.getByRole('link', { name: 'Menú' }));
    await screen.findByRole('heading', { name: 'Carrito borrador' });
    expect(screen.getByRole('button', { name: 'Crear orden pendiente' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('confirma con la cafetería');
    fireEvent.click(screen.getByRole('button', { name: 'Personalizar Latte' }));
    const dialog = await screen.findByRole('dialog', { name: 'Latte' });
    await within(dialog).findByRole('button', { name: /Grande/i });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar personalización' }));
    expect(screen.getByRole('button', { name: 'Añadir al carrito' })).toBeDisabled();
    expect(posted).toBe(1);
    expect(localStorage.getItem(CART_DRAFT_KEY)).toContain('large');
  });

  test.each([
    ['201 with incompatible actor/source', () => HttpResponse.json({ data: {
      id: '8', folio: 'A000008', status: 'PENDIENTE_PAGO', source: 'CASHIER', paidAt: '2026-11-20T12:10:00Z',
      totalCents: '7500', paymentMethod: 'CASH', paymentExpiresAt: '2026-11-20T12:30:00Z',
    } }, { status: 201 })],
    ['201 with malformed JSON', () => new HttpResponse('{invalid', { status: 201, headers: { 'Content-Type': 'application/json' } })],
    ['201 without a JSON response type', () => new HttpResponse('{"data":{}}', { status: 201, headers: { 'Content-Type': 'text/plain' } })],
    ['unexpected 204 without an order', () => new HttpResponse(null, { status: 204 })],
  ] as const)('%s does not allow a second order in the current context', async (_case, reply) => {
    mockCatalog();
    let posted = 0;
    server.use(http.post('/api/v1/orders', () => { posted += 1; return reply(); }));
    menu();
    await addLatte();
    fireEvent.click(screen.getByRole('button', { name: 'Crear orden pendiente' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('confirma con la cafetería');
    expect(screen.getByRole('button', { name: 'Crear orden pendiente' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Reintentar la misma orden' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Orden A000008 creada/)).not.toBeInTheDocument();
    expect(posted).toBe(1);
    expect(idempotencyOperations.activeCount).toBe(0);
  });

  test('leaving guest mode clears an unverifiable-response block without disclosing previous order', async () => {
    enterGuestSession('Invitada');
    mockCatalog();
    server.use(http.post('/api/v1/orders', () => HttpResponse.json({ data: {} }, { status: 201 })));
    menu();
    await addLatte();
    fireEvent.click(screen.getByRole('button', { name: 'Crear orden pendiente' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('confirma con la cafetería');
    fireEvent.click(screen.getByRole('button', { name: 'Salir de invitado' }));
    fireEvent.click(screen.getByRole('link', { name: 'Menú' }));
    await screen.findByRole('heading', { name: 'Carrito borrador' });
    expect(screen.queryByText(/confirma con la cafetería/)).not.toBeInTheDocument();
    expect(screen.getByText(/Tu carrito está vacío/)).toBeInTheDocument();
    expect(localStorage.getItem(CART_DRAFT_KEY)).toBeNull();
    expect(idempotencyOperations.activeCount).toBe(0);
  });

  test('authenticated logout removes a blocked 201 attempt and private draft', async () => {
    mockCatalog();
    const customer = { id: '42', name: 'Ada', role: 'CLIENTE', accountType: 'CUSTOMER', mustChangePin: false };
    server.use(
      http.get('/api/v1/auth/me', () => HttpResponse.json({ data: customer })),
      http.post('/api/v1/auth/logout', () => new HttpResponse(null, { status: 204 })),
      http.post('/api/v1/orders', () => HttpResponse.json({ data: {} }, { status: 201 })),
    );
    const manager = new SessionManager(new RefreshCoordinator('unverifiable-logout-test'));
    render(<SessionProvider manager={manager}><RouterProvider router={createTestRouter(['/cliente/menu'])} /></SessionProvider>);
    await addLatte();
    fireEvent.click(screen.getByRole('button', { name: 'Crear orden pendiente' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('confirma con la cafetería');
    expect(mobileOrderStoreFor(manager).getSnapshot().blocked).toBe(true);
    expect(await manager.logout()).toBe(true);
    expect(mobileOrderStoreFor(manager).getSnapshot()).toEqual({ blocked: false, paused: false, pending: null, sending: false, confirmed: null, message: null });
    expect(localStorage.getItem(CART_DRAFT_KEY)).toBeNull();
    expect(idempotencyOperations.activeCount).toBe(0);
    manager.dispose();
  });

  test('guest exit clears an uncertain attempt even after SPA navigation; no retry or late confirmation', async () => {
    enterGuestSession('Invitada');
    mockCatalog();
    let requests = 0;
    server.use(http.post('/api/v1/orders', () => {
      requests += 1;
      return HttpResponse.json({ code: 'DEPENDENCY_UNAVAILABLE' }, { status: 503 });
    }));
    menu();
    await addLatte();
    fireEvent.click(screen.getByRole('button', { name: 'Crear orden pendiente' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No sabemos si se creó');
    fireEvent.click(screen.getByRole('link', { name: 'Iniciar sesión' }));
    await screen.findByRole('heading', { name: /Iniciar sesión/i });
    fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Salir de invitado' }));
    expect(localStorage.getItem(CART_DRAFT_KEY)).toBeNull();
    expect(idempotencyOperations.activeCount).toBe(0);
    fireEvent.click(screen.getByRole('link', { name: 'Menú' }));
    await screen.findByRole('heading', { name: 'Carrito borrador' });
    expect(screen.queryByRole('button', { name: 'Reintentar la misma orden' })).not.toBeInTheDocument();
    expect(screen.getByText(/Tu carrito está vacío/)).toBeInTheDocument();
    expect(requests).toBe(1);
  });

  test('guest exit while order request is in flight ignores late success for the next actor', async () => {
    enterGuestSession('Invitada');
    mockCatalog();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    server.use(http.post('/api/v1/orders', async () => {
      await gate;
      return HttpResponse.json({ data: { id: '9', folio: 'A000009', status: 'PENDIENTE_PAGO', source: 'MOBILE', paidAt: null, totalCents: '7500', paymentMethod: 'CASH', paymentExpiresAt: '2026-11-20T12:30:00Z' } }, { status: 201 });
    }));
    menu();
    await addLatte();
    fireEvent.click(screen.getByRole('button', { name: 'Crear orden pendiente' }));
    await screen.findByText('Enviando orden…');
    fireEvent.click(screen.getByRole('button', { name: 'Salir de invitado' }));
    release();
    fireEvent.click(screen.getByRole('link', { name: 'Menú' }));
    await screen.findByRole('heading', { name: 'Carrito borrador' });
    await waitFor(() => expect(idempotencyOperations.activeCount).toBe(0));
    expect(screen.queryByText(/Orden A000009 creada/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar la misma orden' })).not.toBeInTheDocument();
    expect(localStorage.getItem(CART_DRAFT_KEY)).toBeNull();
  });

  test('guest exit during preflight cannot create an order from the previous guest snapshot', async () => {
    enterGuestSession('Invitada');
    mockCatalog();
    let detailCalls = 0;
    let posted = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    server.use(
      http.get('/api/v1/products/10', async () => {
        detailCalls += 1;
        if (detailCalls === 3) await gate;
        return HttpResponse.json({ data: latte });
      }),
      http.post('/api/v1/orders', () => {
        posted += 1;
        return HttpResponse.json({ data: {} }, { status: 201 });
      }),
    );
    menu();
    await addLatte();
    fireEvent.click(screen.getByRole('button', { name: 'Crear orden pendiente' }));
    await waitFor(() => expect(detailCalls).toBe(3));
    fireEvent.click(screen.getByRole('button', { name: 'Salir de invitado' }));
    release();
    await waitFor(() => expect(idempotencyOperations.activeCount).toBe(0));
    expect(posted).toBe(0);
    expect(localStorage.getItem(CART_DRAFT_KEY)).toBeNull();
  });

  test('guest exit discards a previously confirmed order from in-memory display', async () => {
    enterGuestSession('Invitada');
    mockCatalog();
    server.use(http.post('/api/v1/orders', () => HttpResponse.json({ data: {
      id: '10', folio: 'A000010', status: 'PENDIENTE_PAGO', source: 'MOBILE', paidAt: null,
      totalCents: '7500', paymentMethod: 'CASH', paymentExpiresAt: '2026-11-20T12:30:00Z',
    } }, { status: 201 })));
    menu();
    await addLatte();
    fireEvent.click(screen.getByRole('button', { name: 'Crear orden pendiente' }));
    expect(await screen.findByText(/Orden A000010 creada/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Salir de invitado' }));
    fireEvent.click(screen.getByRole('link', { name: 'Menú' }));
    await screen.findByRole('heading', { name: 'Carrito borrador' });
    expect(screen.queryByText(/Orden A000010 creada/)).not.toBeInTheDocument();
    expect(localStorage.getItem(CART_DRAFT_KEY)).toBeNull();
  });

  test('a second consecutive order keeps the newly added item in visual and stored draft', async () => {
    mockCatalog();
    const croissant = { ...latte, id: '11', name: 'Croissant', basePriceCents: '4500' };
    server.use(
      http.get('/api/v1/products', () => HttpResponse.json({ data: [latte, croissant], page: { nextCursor: null } })),
      http.get('/api/v1/products/11', () => HttpResponse.json({ data: croissant })),
      http.get('/api/v1/products/11/options', () => HttpResponse.json({ data: [] })),
    );
    const requests: Array<{ key: string | null; body: unknown }> = [];
    server.use(http.post('/api/v1/orders', async ({ request }) => {
      requests.push({ key: request.headers.get('Idempotency-Key'), body: await request.json() });
      const folio = requests.length === 1 ? 'A000011' : 'A000012';
      return HttpResponse.json({ data: { id: String(requests.length + 10), folio, status: 'PENDIENTE_PAGO',
        source: 'MOBILE', paidAt: null, totalCents: requests.length === 1 ? '7500' : '4500', paymentMethod: 'CASH', paymentExpiresAt: '2026-11-20T12:30:00Z' } }, { status: 201 });
    }));
    menu();
    await addLatte();
    fireEvent.click(screen.getByRole('button', { name: 'Crear orden pendiente' }));
    expect(await screen.findByText(/Orden A000011 creada/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Personalizar Croissant' }));
    const dialog = await screen.findByRole('dialog', { name: 'Croissant' });
    await within(dialog).findByText('Este producto no tiene opciones adicionales de personalización.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar personalización' }));
    fireEvent.click(screen.getByRole('button', { name: 'Añadir al carrito' }));
    await screen.findByText(/Subtotal estimado: \$45\.00/);
    expect(screen.queryByText(/Orden A000011 creada/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quitar Croissant' })).toBeEnabled();
    expect(JSON.parse(localStorage.getItem(CART_DRAFT_KEY) ?? '')).toEqual({ version: 1, items: [{ productId: '11', quantity: 1, optionValueIds: [] }] });
    fireEvent.click(screen.getByRole('button', { name: 'Crear orden pendiente' }));
    expect(await screen.findByText(/Orden A000012 creada/)).toBeInTheDocument();
    expect(requests).toHaveLength(2);
    expect(requests[0].key).not.toBe(requests[1].key);
    expect(requests[0].body).toEqual({ paymentMethod: 'CASH', items: [{ productId: '10', quantity: 1, optionValueIds: ['large'] }] });
    expect(requests[1].body).toEqual({ paymentMethod: 'CASH', items: [{ productId: '11', quantity: 1, optionValueIds: [] }] });
  });
});

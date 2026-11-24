import { ApiError } from '../../../shared/api/client';
import { idempotencyOperations, isUncertainIdempotencyFailure, type IdempotentOperation } from '../../../shared/api/idempotency';
import { clearPrivateState, saveCartDraft, type CartDraftItem } from '../../../shared/storage';
import type { SessionManager, SessionState } from '../../../shared/auth/session';
import { getGuestSessionSnapshot, subscribeGuestSession } from '../auth/guestSession';

export type PaymentMethod = 'CASH' | 'STRIPE';
export type MobileOrder = {
  id: string;
  folio: string;
  status: string;
  source: 'MOBILE';
  paidAt: null;
  paymentMethod: PaymentMethod;
  totalCents: string;
  paymentExpiresAt: string;
};

/** A successful HTTP response consumed the idempotency key but cannot establish an order. */
export class UnverifiableMobileOrderResponseError extends Error {
  constructor() {
    super('Mobile order response cannot be verified');
    this.name = 'UnverifiableMobileOrderResponseError';
  }
}

/** No prices, totals, QR or checkout flags enter the request snapshot. */
export function prepareMobileOrder(items: readonly CartDraftItem[], paymentMethod: PaymentMethod, guestName?: string): IdempotentOperation {
  if (items.length < 1 || items.length > 50) throw new Error('El carrito debe tener entre 1 y 50 líneas.');
  const body = {
    paymentMethod,
    items: items.map(({ productId, quantity, optionValueIds }) => ({ productId, quantity, optionValueIds: [...optionValueIds] })),
    ...(guestName ? { guestName } : {}),
  };
  return idempotencyOperations.create(body);
}

export async function sendMobileOrder(operation: IdempotentOperation, signal?: AbortSignal): Promise<MobileOrder> {
  const requestedMethod = (JSON.parse(operation.snapshot) as { paymentMethod: PaymentMethod }).paymentMethod;
  let response: { data?: MobileOrder };
  try {
    response = await idempotencyOperations.send<{ data?: MobileOrder }>(operation, '/orders', { method: 'POST', signal });
  } catch (error) {
    // apiFetch parses successful JSON after the HTTP response. A malformed 2xx
    // payload raises SyntaxError after the shared manager has finalized the key.
    if (error instanceof SyntaxError) throw new UnverifiableMobileOrderResponseError();
    throw error;
  }
  const order = response?.data;
  if (typeof order?.id !== 'string' || order.id.length === 0
    || typeof order.folio !== 'string' || !/^A[0-9]{6,}$/.test(order.folio)
    || typeof order.totalCents !== 'string' || !/^(0|[1-9][0-9]{0,6})$/.test(order.totalCents)
    || typeof order.paymentExpiresAt !== 'string'
    || !Number.isFinite(Date.parse(order.paymentExpiresAt)) || order.status !== 'PENDIENTE_PAGO'
    || order.source !== 'MOBILE' || order.paidAt !== null || order.paymentMethod !== requestedMethod) {
    throw new UnverifiableMobileOrderResponseError();
  }
  return order;
}

type AttemptSnapshot = Readonly<{
  pending: IdempotentOperation | null;
  sending: boolean;
  message: string | null;
  confirmed: MobileOrder | null;
  blocked: boolean;
  paused: boolean;
}>;

/** Lives for the lifetime of the session context, including client route unmounts. */
export class MobileOrderAttemptStore {
  private state: AttemptSnapshot = { pending: null, sending: false, message: null, confirmed: null, blocked: false, paused: false };
  private readonly listeners = new Set<() => void>();
  private generation = 0;
  private clearRevision = 0;
  private activeRequest: AbortController | null = null;
  private deferred: { operation: IdempotentOperation; outcome: { order: MobileOrder } | { error: unknown } } | null = null;

  getSnapshot = (): AttemptSnapshot => this.state;
  getGeneration = (): number => this.generation;
  getClearRevision = (): number => this.clearRevision;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(next: AttemptSnapshot): void {
    this.state = next;
    this.listeners.forEach((listener) => listener());
  }

  clear = (): void => {
    this.generation += 1;
    this.clearRevision += 1;
    this.activeRequest?.abort();
    this.activeRequest = null;
    this.deferred = null;
    this.set({ pending: null, sending: false, message: null, confirmed: null, blocked: false, paused: false });
  };

  /** A cross-tab login may already have switched the cookie before /auth/me resolves. */
  pauseForActorResolution(): void {
    this.generation += 1;
    this.activeRequest?.abort();
    this.set({ ...this.state, paused: true });
  }

  resumeAfterSameActor(): void {
    if (!this.state.paused) return;
    this.set({ ...this.state, paused: false });
    const deferred = this.deferred;
    this.deferred = null;
    if (deferred === null || this.state.pending !== deferred.operation) return;
    if ('order' in deferred.outcome) this.confirm(deferred.outcome.order);
    else this.fail(deferred.operation, deferred.outcome.error);
  }

  private confirm(order: MobileOrder): void {
    saveCartDraft({ version: 1, items: [] });
    this.set({ pending: null, sending: false, message: null, confirmed: order, blocked: false, paused: false });
  }

  private fail(operation: IdempotentOperation, error: unknown): void {
    const uncertain = isUncertainIdempotencyFailure(error);
    const csrfInvalid = error instanceof ApiError && error.status === 403 && error.code === 'CSRF_INVALID';
    const blocked = error instanceof UnverifiableMobileOrderResponseError;
    this.set({
      pending: !blocked && (uncertain || csrfInvalid) ? operation : null,
      sending: false,
      confirmed: null,
      blocked,
      paused: false,
      message: blocked
        ? 'No pudimos verificar la respuesta de tu orden. No crees otra ni reintentes aquí; confirma con la cafetería si se registró. No hay pago confirmado.'
        : uncertain
        ? 'No sabemos si se creó la orden. No repitas como pedido nuevo: reintenta la misma operación aquí. No hay pago confirmado.'
        : csrfInvalid ? 'Sesión de seguridad desactualizada. Reintenta la misma operación.'
          : error instanceof ApiError && error.status === 409
            ? 'El catálogo o la orden entraron en conflicto. Revisa el carrito y vuelve a intentarlo como nueva operación.'
            : 'No fue posible crear la orden. Revisa el carrito e inténtalo de nuevo.',
    });
  }

  /** A completed order belongs to the previous draft, not to a new cart. */
  dismissConfirmation(): void {
    if (this.state.confirmed !== null && this.state.pending === null && !this.state.sending) {
      this.set({ ...this.state, confirmed: null });
    }
  }

  async send(operation?: IdempotentOperation): Promise<void> {
    if (this.state.paused || this.state.blocked || this.state.sending || (operation && this.state.pending !== null)) return;
    const current = operation ?? this.state.pending;
    if (current === null) return;
    const controller = new AbortController();
    this.activeRequest = controller;
    this.set({ pending: current, sending: true, message: null, confirmed: null, blocked: false, paused: false });
    try {
      const confirmed = await sendMobileOrder(current, controller.signal);
      if (this.state.pending !== current) return;
      if (this.state.paused) {
        this.deferred = { operation: current, outcome: { order: confirmed } };
        this.set({ ...this.state, sending: false });
      } else this.confirm(confirmed);
    } catch (error) {
      if (this.state.pending !== current) return;
      if (this.state.paused) {
        this.deferred = { operation: current, outcome: { error } };
        this.set({ ...this.state, sending: false });
      } else this.fail(current, error);
    } finally {
      if (this.activeRequest === controller) this.activeRequest = null;
    }
  }
}

const stores = new WeakMap<SessionManager, MobileOrderAttemptStore>();
const storeResolvers = new WeakMap<MobileOrderAttemptStore, () => void>();

/** An unresolved bootstrap state is not evidence of an actor replacement. */
function stableActorIdentity(state: SessionState): string | null {
  if (state.status === 'authenticated') {
    return `${state.actor.accountType}:${state.actor.role}:${state.actor.id}`;
  }
  if (state.status === 'anonymous') return 'visitor';
  return null;
}

function runtimeAuthProfile(): string {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron') ? 'electron' : 'browser';
}
// One guest-session observer per JS context. Weak references do not keep old
// session managers or their order attempts alive after a provider is discarded.
const observedStores = new Set<WeakRef<MobileOrderAttemptStore>>();
let authChannel: BroadcastChannel | null = null;
let authChannelConstructor: typeof BroadcastChannel | null = null;

function observeAuthRefresh(): void {
  if (typeof BroadcastChannel === 'undefined' || authChannelConstructor === BroadcastChannel) return;
  authChannel?.close();
  authChannelConstructor = BroadcastChannel;
  authChannel = new BroadcastChannel(`cafeteria:auth-refresh:${runtimeAuthProfile()}`);
  authChannel.addEventListener('message', (event: MessageEvent<unknown>) => {
    const message = event.data;
    if (message === null || typeof message !== 'object'
      || (message as { type?: unknown }).type !== 'refresh-complete') return;
    for (const reference of observedStores) {
      const store = reference.deref();
      if (store === undefined) observedStores.delete(reference);
      else {
        store.pauseForActorResolution();
        storeResolvers.get(store)?.();
      }
    }
  });
}

let wasGuest = getGuestSessionSnapshot().isGuest;
subscribeGuestSession(() => {
  const isGuest = getGuestSessionSnapshot().isGuest;
  if (wasGuest && !isGuest) {
    for (const reference of observedStores) {
      const store = reference.deref();
      if (store === undefined) observedStores.delete(reference);
      else store.clear();
    }
  }
  wasGuest = isGuest;
});

/** The cleaner remains registered even if /cliente/menu unmounts during a SPA navigation. */
export function mobileOrderStoreFor(manager: SessionManager): MobileOrderAttemptStore {
  let store = stores.get(manager);
  if (store === undefined) {
    const ownedStore = new MobileOrderAttemptStore();
    store = ownedStore;
    stores.set(manager, ownedStore);
    observedStores.add(new WeakRef(ownedStore));
    manager.registerPrivateStateCleaner(ownedStore.clear);
    storeResolvers.set(ownedStore, () => {
      const generation = ownedStore.getGeneration();
      // The same context also receives its own coordinator's broadcast, but
      // SessionManager published that actor *before* the message. If no new
      // state publication follows, request one through its existing bootstrap
      // path. Only an API-resolved manager state can release the pause.
      setTimeout(() => {
        if (ownedStore.getSnapshot().paused && generation === ownedStore.getGeneration()
          && manager.getSnapshot().status !== 'recoverable-error') void manager.bootstrap();
      }, 0);
    });
    let previousIdentity = stableActorIdentity(manager.getSnapshot());
    // Same profile/channel convention used by SessionProvider and RefreshCoordinator.
    observeAuthRefresh();
    manager.subscribe((state) => {
      if (state.status === 'recoverable-error') {
        // A failed lookup is not proof that the old cookie still belongs to
        // this actor, even if another concurrent lookup succeeded earlier.
        ownedStore.pauseForActorResolution();
        return;
      }
      const identity = stableActorIdentity(state);
      if (identity === null) return;
      if (previousIdentity !== null && identity !== previousIdentity) {
        // refresh-complete in another tab can adopt a different actor without
        // running SessionManager's private-state cleaners. Remove only this
        // order's retry material; do not disturb unrelated operations.
        const pending = ownedStore.getSnapshot().pending;
        if (pending !== null) idempotencyOperations.complete(pending);
        clearPrivateState();
        ownedStore.clear();
      } else if (ownedStore.getSnapshot().paused) {
        ownedStore.resumeAfterSameActor();
      }
      previousIdentity = identity;
    });
  }
  return store;
}

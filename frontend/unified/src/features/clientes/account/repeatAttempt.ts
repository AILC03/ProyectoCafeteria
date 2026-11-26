import { ApiError } from '../../../shared/api/client';
import { idempotencyOperations, isUncertainIdempotencyFailure, type IdempotentOperation } from '../../../shared/api/idempotency';
import type { SessionManager, SessionState } from '../../../shared/auth/session';
import { prepareMobileOrder, sendMobileOrder, UnverifiableMobileOrderResponseError, type MobileOrder, type PaymentMethod } from '../orders/mobileOrders';
import { checkedPreview, type Preview } from './accountApi';

type State = Readonly<{ pending: IdempotentOperation | null; sending: boolean; paused: boolean; blocked: boolean; message: string | null; confirmed: MobileOrder | null }>;
const empty: State = { pending: null, sending: false, paused: false, blocked: false, message: null, confirmed: null };
function identity(state: SessionState): string | null {
  return state.status === 'authenticated' ? `${state.actor.accountType}:${state.actor.role}:${state.actor.id}` : state.status === 'anonymous' ? 'anonymous' : null;
}

/** Separate from the cart attempt: a repeated order must never clear the cart draft. */
export class RepeatAttempt {
  private state: State = empty;
  private listeners = new Set<() => void>();
  private generation = 0;
  private controller: AbortController | null = null;
  private deferred: { operation: IdempotentOperation; order?: MobileOrder; error?: unknown } | null = null;
  getSnapshot = (): State => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  private set(next: State) { this.state = next; this.listeners.forEach((listener) => listener()); }
  getGeneration() { return this.generation; }
  clear = () => {
    this.generation++;
    if (this.state.pending) idempotencyOperations.complete(this.state.pending);
    this.controller?.abort();
    this.deferred = null;
    this.set(empty);
  };
  pause = () => { this.generation++; this.set({ ...this.state, paused: true }); };
  resume = () => {
    if (!this.state.paused) return;
    this.set({ ...this.state, paused: false });
    const result = this.deferred;
    this.deferred = null;
    if (result && result.operation === this.state.pending) {
      if (result.order) this.set({ ...empty, confirmed: result.order });
      else this.fail(result.operation, result.error);
    }
  };
  private fail(operation: IdempotentOperation, error: unknown) {
    const uncertain = isUncertainIdempotencyFailure(error);
    const csrf = error instanceof ApiError && error.status === 403 && error.code === 'CSRF_INVALID';
    const blocked = error instanceof UnverifiableMobileOrderResponseError;
    this.set({ ...empty, pending: !blocked && (uncertain || csrf) ? operation : null, blocked,
      message: blocked ? 'No pudimos verificar la respuesta. No crees otra orden ni reintentes aquí; consulta con la cafetería. No hay pago confirmado.'
        : uncertain ? 'No sabemos si se creó la orden. Reintenta sólo esta misma operación; no crees otra. No hay pago confirmado.'
        : csrf ? 'Seguridad de sesión desactualizada. Reintenta esta misma operación.'
        : error instanceof ApiError && error.status === 409 ? 'El catálogo cambió. Solicita otra vista previa antes de crear una nueva operación.'
        : 'No fue posible crear la orden. Solicita otra vista previa antes de intentarlo de nuevo.' });
  }
  async send(operation?: IdempotentOperation) {
    if (this.state.sending || this.state.paused || this.state.blocked || (operation && this.state.pending)) return;
    const current = operation ?? this.state.pending;
    if (!current) return;
    const controller = new AbortController();
    this.controller = controller;
    this.set({ ...empty, pending: current, sending: true });
    try {
      const order = await sendMobileOrder(current, controller.signal);
      if (this.state.pending !== current) return;
      if (this.state.paused) this.deferred = { operation: current, order };
      else this.set({ ...empty, confirmed: order });
    } catch (error) {
      if (this.state.pending !== current) return;
      if (this.state.paused) this.deferred = { operation: current, error };
      else this.fail(current, error);
    } finally {
      if (this.controller === controller) this.controller = null;
      if (this.state.paused && this.state.pending === current) this.set({ ...this.state, sending: false });
    }
  }
  confirm(preview: Preview, sourceId: string, payment: PaymentMethod) {
    if (this.state.pending || this.state.sending || this.state.blocked || this.state.paused) return false;
    const items = checkedPreview(preview, sourceId);
    const operation = prepareMobileOrder(items, payment);
    void this.send(operation);
    return true;
  }
}

const stores = new WeakMap<SessionManager, RepeatAttempt>();
const observers = new Set<{ manager: WeakRef<SessionManager>; store: WeakRef<RepeatAttempt> }>();
let channel: BroadcastChannel | null = null;
let channelConstructor: typeof BroadcastChannel | null = null;
function observeRefresh() {
  if (typeof BroadcastChannel === 'undefined' || channelConstructor === BroadcastChannel) return;
  channel?.close();
  channelConstructor = BroadcastChannel;
  const profile = navigator.userAgent.includes('Electron') ? 'electron' : 'browser';
  channel = new BroadcastChannel(`cafeteria:auth-refresh:${profile}`);
  channel.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (event.data === null || typeof event.data !== 'object' || (event.data as { type?: unknown }).type !== 'refresh-complete') return;
    for (const observer of observers) {
      const owner = observer.manager.deref();
      const attempt = observer.store.deref();
      if (!owner || !attempt) observers.delete(observer);
      else { attempt.pause(); void owner.bootstrap(); }
    }
  });
}
export function repeatAttemptFor(manager: SessionManager): RepeatAttempt {
  let store = stores.get(manager);
  if (store) return store;
  store = new RepeatAttempt();
  stores.set(manager, store);
  manager.registerPrivateStateCleaner(store.clear);
  let previous = identity(manager.getSnapshot());
  manager.subscribe((state) => {
    if (state.status === 'recoverable-error') { store?.pause(); return; }
    const next = identity(state);
    if (next === null) return;
    if (previous !== null && previous !== next) store?.clear();
    else store?.resume();
    previous = next;
  });
  // Refresh-complete can arrive while an old actor still appears locally. Hold
  // the in-flight response until the session manager has resolved the cookie.
  observers.add({ manager: new WeakRef(manager), store: new WeakRef(store) });
  observeRefresh();
  return store;
}

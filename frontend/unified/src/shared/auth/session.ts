import { ApiError, fetchSessionActor, invalidateCsrfToken, loginCustomerSession, loginStaffSession, logoutSession, refreshSession, setCsrfToken, subscribeToApiAuthEvents } from '../api/client';

export type Actor = {
  id: string;
  name: string;
  role: string;
  accountType: string;
  username?: string | null;
  mustChangePin: boolean;
};

export type SessionState =
  | { status: 'loading'; actor: null }
  | { status: 'anonymous'; actor: null }
  | { status: 'authenticated'; actor: Actor }
  | { status: 'pin-change-required'; actor: null }
  | { status: 'recoverable-error'; actor: null; error: ApiError };

export type ActorDestination = 'client' | 'terminal';
export type PrivateStateCleaner = () => void;

/** Legacy GERENTE and CUSTOMER actors must never enter the unified terminal. */
const TERMINAL_STAFF_ROLES = new Set(['CAJERO', 'PREPARACION', 'ADMINISTRADOR']);

type ApiEnvelope<T> = { data: T };
type RefreshPayload = { user: Actor; csrfToken: string };
type LockManagerLike = {
  request<T>(name: string, options: { mode: 'exclusive' }, callback: () => Promise<T>): Promise<T>;
};

const LOCK_KEY_PREFIX = 'cafeteria:auth-refresh:';
const CHANNEL_PREFIX = 'cafeteria:auth-refresh:';
type AuthMessageType = 'refresh-complete' | 'session-cleared' | 'csrf-invalid' | 'pin-change-required';

function isRecoverable(error: ApiError): boolean {
  return error.status === 0 || error.status === 429 || error.status >= 500;
}

function isPinChange(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 403 && error.code === 'PIN_CHANGE_REQUIRED';
}

function isRotated(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 409 && error.code === 'REFRESH_ALREADY_ROTATED';
}

/** Coordinates refresh attempts using the browser's mandatory Web Locks API. */
export class RefreshCoordinator {
  private readonly lockKey: string;
  private readonly channel: BroadcastChannel | null;

  constructor(profile = 'default') {
    this.lockKey = `${LOCK_KEY_PREFIX}${profile}`;
    this.channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(`${CHANNEL_PREFIX}${profile}`);
  }

  onMessage(listener: (type: AuthMessageType) => void): () => void {
    if (this.channel === null) return () => undefined;
    const handler = (event: MessageEvent<unknown>) => {
      const message = event.data;
      const type = message !== null && typeof message === 'object' ? (message as { type?: unknown }).type : undefined;
      if (type === 'refresh-complete' || type === 'session-cleared' || type === 'csrf-invalid' || type === 'pin-change-required') {
        listener(type);
      }
    };
    this.channel.addEventListener('message', handler);
    return () => this.channel?.removeEventListener('message', handler);
  }

  get available(): boolean {
    return (globalThis.navigator as Navigator & { locks?: LockManagerLike }).locks !== undefined;
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    const locks = (globalThis.navigator as Navigator & { locks?: LockManagerLike }).locks;
    if (locks === undefined) throw new ApiError(0, 'Automatic refresh requires Web Locks');
    return locks.request(this.lockKey, { mode: 'exclusive' }, operation);
  }

  publish(type: AuthMessageType): void {
    // Event payload is intentionally fixed: never actor, role, CSRF or credentials.
    this.channel?.postMessage({ type });
  }

  complete(): void {
    this.publish('refresh-complete');
  }

  close(): void {
    this.channel?.close();
  }

}

export class SessionManager {
  private state: SessionState = { status: 'loading', actor: null };
  private readonly listeners = new Set<(state: SessionState) => void>();
  private bootstrapRequest: Promise<SessionState> | null = null;
  private readonly unsubscribeRefresh: () => void;
  private readonly unsubscribeApiAuth: () => void;
  private readonly privateStateCleaners = new Set<PrivateStateCleaner>();

  constructor(private readonly coordinator = new RefreshCoordinator()) {
    this.unsubscribeRefresh = coordinator.onMessage((type) => this.receiveMessage(type));
    this.unsubscribeApiAuth = subscribeToApiAuthEvents((event) => {
      if (event.type === 'csrf-invalid') {
        invalidateCsrfToken();
        coordinator.publish('csrf-invalid');
      } else if (event.type === 'pin-change-required') {
        this.restrictToPinChange(true);
      } else {
        this.clearSession(this.entryFor(this.state.actor), true);
      }
    });
  }

  getSnapshot = (): SessionState => this.state;

  subscribe = (listener: (state: SessionState) => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  registerPrivateStateCleaner(cleaner: PrivateStateCleaner): () => void {
    this.privateStateCleaners.add(cleaner);
    return () => this.privateStateCleaners.delete(cleaner);
  }

  /** Closes the current server session before a login flow for another actor starts. */
  async replaceActor(destination: ActorDestination): Promise<boolean> {
    const actor = this.state.actor;
    if (actor === null) return true;
    try {
      await logoutSession();
    } catch {
      // A failed logout must never allow the next actor flow to begin.
      return false;
    }
    this.clearSession(this.entryFor(actor), true);
    // The caller owns the next login implementation (TASK-09/TASK-13).
    this.navigateTo(destination === 'client' ? '/cliente/iniciar-sesion' : '/terminal');
    return true;
  }

  async logout(options: { preserveLocation?: boolean } = {}): Promise<boolean> {
    const actor = this.state.actor;
    try {
      await logoutSession();
    } catch {
      return false;
    }
    this.clearSession(this.entryFor(actor), true, options.preserveLocation === true);
    return true;
  }

  /** Authenticates a customer without allowing an active actor session to be mixed. */
  async loginCustomer(credentials: { identifier: string; pin: string }): Promise<SessionState> {
    if (this.state.status === 'loading' || this.state.status === 'authenticated' || this.state.status === 'pin-change-required') {
      throw new ApiError(409, 'Debe cerrarse la sesión activa antes de iniciar otra.');
    }
    try {
      const response = await loginCustomerSession<ApiEnvelope<RefreshPayload>>(credentials);
      if (response.data.user.accountType !== 'CUSTOMER' || response.data.user.role !== 'CLIENTE') {
        this.clearSession('/cliente/iniciar-sesion', true);
        throw new ApiError(403, 'El actor autenticado no pertenece al área de cliente.');
      }
      this.clearPrivateState();
      setCsrfToken(response.data.csrfToken);
      if (response.data.user.mustChangePin) {
        return this.restrictToPinChange(true);
      }
      const next = this.set({ status: 'authenticated', actor: response.data.user });
      this.coordinator.complete();
      return next;
    } catch (error) {
      if (isPinChange(error)) return this.restrictToPinChange(true);
      throw error;
    }
  }

  /** Authenticates terminal staff without allowing an active actor session to be mixed. */
  async loginStaff(credentials: { username: string; password: string }): Promise<SessionState> {
    if (this.state.status === 'loading' || this.state.status === 'authenticated' || this.state.status === 'pin-change-required') {
      throw new ApiError(409, 'Debe cerrarse la sesión activa antes de iniciar otra.');
    }
    try {
      const response = await loginStaffSession<ApiEnvelope<RefreshPayload>>(credentials);
      const actor = response.data.user;
      if (!actor || actor.accountType !== 'STAFF' || !TERMINAL_STAFF_ROLES.has(actor.role)) {
        this.clearSession('/terminal/acceso', true);
        throw new ApiError(403, 'El actor autenticado no pertenece al área de terminal.');
      }
      this.clearPrivateState();
      setCsrfToken(response.data.csrfToken);
      if (actor.mustChangePin) {
        return this.restrictToPinChange(true);
      }
      const next = this.set({ status: 'authenticated', actor });
      this.coordinator.complete();
      return next;
    } catch (error) {
      if (isPinChange(error)) return this.restrictToPinChange(true);
      throw error;
    }
  }

  async bootstrap(): Promise<SessionState> {
    this.bootstrapRequest ??= this.bootstrapActor().finally(() => { this.bootstrapRequest = null; });
    return this.bootstrapRequest;
  }

  async refresh(): Promise<SessionState> {
    if (!this.coordinator.available) {
      return this.set({ status: 'recoverable-error', actor: null, error: new ApiError(0, 'Automatic refresh requires Web Locks') });
    }
    try {
      return await this.coordinator.run(async () => {
        // A waiting context observes the winner's fresh HttpOnly cookie through
        // the server, rather than receiving actor or credential data over BC.
        const coordinatedActor = await this.resolveActorAfterCoordination();
        if (coordinatedActor !== null) return coordinatedActor;
        try {
          return await this.performRefresh();
        } catch (error) {
          if (!isRotated(error)) throw error;
          return this.performRefresh();
        }
      });
    } catch (error) {
      return this.applyFailure(error);
    }
  }

  dispose(): void {
    this.unsubscribeRefresh();
    this.unsubscribeApiAuth();
    this.coordinator.close();
  }

  private async resolveActor(): Promise<SessionState> {
    try {
      const response = await fetchSessionActor<ApiEnvelope<Actor>>();
      return response.data.mustChangePin
        ? this.restrictToPinChange(true)
        : this.set({ status: 'authenticated', actor: response.data });
    } catch (error) {
      return this.applyFailure(error);
    }
  }

  private async bootstrapActor(): Promise<SessionState> {
    try {
      const response = await fetchSessionActor<ApiEnvelope<Actor>>();
      return response.data.mustChangePin
        ? this.restrictToPinChange(true)
        : this.set({ status: 'authenticated', actor: response.data });
    } catch (error) {
      // Bootstrap has exactly one coordinated recovery attempt for an expired
      // access cookie. refresh() owns the Web Locks availability check and
      // definitive failure mapping, so this cannot recurse or autologin.
      if (error instanceof ApiError && error.status === 401) return this.refresh();
      return this.applyFailure(error);
    }
  }

  private async performRefresh(): Promise<SessionState> {
    const response = await refreshSession<ApiEnvelope<RefreshPayload>>();
    setCsrfToken(response.data.csrfToken);
    const next = response.data.user.mustChangePin
      ? this.restrictToPinChange(true)
      : this.set({ status: 'authenticated', actor: response.data.user });
    this.coordinator.complete();
    return next;
  }

  private async resolveActorAfterCoordination(): Promise<SessionState | null> {
    try {
      const response = await fetchSessionActor<ApiEnvelope<Actor>>();
      return response.data.mustChangePin
        ? this.restrictToPinChange(true)
        : this.set({ status: 'authenticated', actor: response.data });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      return this.applyFailure(error);
    }
  }

  private applyFailure(error: unknown): SessionState {
    if (!(error instanceof ApiError)) throw error;
    if (isPinChange(error)) return this.restrictToPinChange(true);
    if (isRecoverable(error)) return this.set({ status: 'recoverable-error', actor: null, error });
    if (this.state.status === 'loading' && this.state.actor === null) {
      invalidateCsrfToken();
      return this.set({ status: 'anonymous', actor: null });
    }
    return this.clearSession(this.entryFor(this.state.actor), true);
  }

  private receiveMessage(type: AuthMessageType): void {
    if (type === 'refresh-complete') { void this.resolveActor(); return; }
    if (type === 'csrf-invalid') { invalidateCsrfToken(); return; }
    if (type === 'pin-change-required') { this.restrictToPinChange(false); return; }
    this.clearSession(this.entryFor(this.state.actor), false);
  }

  private restrictToPinChange(broadcast: boolean): SessionState {
    if (this.state.status === 'pin-change-required') return this.state;
    this.clearPrivateState();
    invalidateCsrfToken();
    const next = this.set({ status: 'pin-change-required', actor: null });
    this.navigateTo('/cambiar-nip');
    if (broadcast) this.coordinator.publish('pin-change-required');
    return next;
  }

  private clearSession(entry: string, broadcast: boolean, preserveLocation = false): SessionState {
    this.clearPrivateState();
    invalidateCsrfToken();
    const next = this.set({ status: 'anonymous', actor: null });
    if (!preserveLocation) this.navigateTo(entry);
    if (broadcast) this.coordinator.publish('session-cleared');
    return next;
  }

  private clearPrivateState(): void {
    this.privateStateCleaners.forEach((cleaner) => cleaner());
  }

  private entryFor(actor: Actor | null): string {
    return actor?.accountType === 'STAFF' || (actor === null && typeof window !== 'undefined' && window.location.pathname.startsWith('/terminal'))
      ? '/terminal'
      : '/cliente/iniciar-sesion';
  }

  private navigateTo(entry: string): void {
    if (typeof window === 'undefined' || window.location.pathname === entry) return;
    window.history.replaceState(null, '', entry);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  private set(state: SessionState): SessionState {
    this.state = state;
    this.listeners.forEach((listener) => listener(state));
    return state;
  }
}

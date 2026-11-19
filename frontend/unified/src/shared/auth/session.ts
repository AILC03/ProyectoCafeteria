import { ApiError, apiFetch, setCsrfToken } from '../api/client';

export type Actor = {
  id: string;
  name: string;
  role: string;
  accountType: string;
  mustChangePin: boolean;
};

export type SessionState =
  | { status: 'loading'; actor: null }
  | { status: 'anonymous'; actor: null }
  | { status: 'authenticated'; actor: Actor }
  | { status: 'pin-change-required'; actor: null }
  | { status: 'recoverable-error'; actor: null; error: ApiError };

type ApiEnvelope<T> = { data: T };
type RefreshPayload = { user: Actor; csrfToken: string };
type LockManagerLike = {
  request<T>(name: string, options: { mode: 'exclusive' }, callback: () => Promise<T>): Promise<T>;
};

const LOCK_KEY_PREFIX = 'cafeteria:auth-refresh:';
const CHANNEL_PREFIX = 'cafeteria:auth-refresh:';

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

  onRefreshComplete(listener: () => void): () => void {
    if (this.channel === null) return () => undefined;
    const handler = (event: MessageEvent<unknown>) => {
      const message = event.data;
      if (message !== null && typeof message === 'object' && (message as { type?: unknown }).type === 'refresh-complete') {
        listener();
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

  complete(): void {
    // Event payload is intentionally fixed: never actor, role, CSRF or credentials.
    this.channel?.postMessage({ type: 'refresh-complete' });
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

  constructor(private readonly coordinator = new RefreshCoordinator()) {
    this.unsubscribeRefresh = coordinator.onRefreshComplete(() => { void this.resolveActor(); });
  }

  getSnapshot = (): SessionState => this.state;

  subscribe = (listener: (state: SessionState) => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

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
    this.coordinator.close();
  }

  private async resolveActor(): Promise<SessionState> {
    try {
      const response = await apiFetch<ApiEnvelope<Actor>>('/auth/me');
      return this.set(response.data.mustChangePin
        ? { status: 'pin-change-required', actor: null }
        : { status: 'authenticated', actor: response.data });
    } catch (error) {
      return this.applyFailure(error);
    }
  }

  private async bootstrapActor(): Promise<SessionState> {
    try {
      const response = await apiFetch<ApiEnvelope<Actor>>('/auth/me');
      return this.set(response.data.mustChangePin
        ? { status: 'pin-change-required', actor: null }
        : { status: 'authenticated', actor: response.data });
    } catch (error) {
      // Bootstrap has exactly one coordinated recovery attempt for an expired
      // access cookie. refresh() owns the Web Locks availability check and
      // definitive failure mapping, so this cannot recurse or autologin.
      if (error instanceof ApiError && error.status === 401) return this.refresh();
      return this.applyFailure(error);
    }
  }

  private async performRefresh(): Promise<SessionState> {
    const response = await apiFetch<ApiEnvelope<RefreshPayload>>('/auth/refresh', { method: 'POST', body: {} });
    setCsrfToken(response.data.csrfToken);
    const next = this.set(response.data.user.mustChangePin
      ? { status: 'pin-change-required', actor: null }
      : { status: 'authenticated', actor: response.data.user });
    this.coordinator.complete();
    return next;
  }

  private async resolveActorAfterCoordination(): Promise<SessionState | null> {
    try {
      const response = await apiFetch<ApiEnvelope<Actor>>('/auth/me');
      return this.set(response.data.mustChangePin
        ? { status: 'pin-change-required', actor: null }
        : { status: 'authenticated', actor: response.data });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      return this.applyFailure(error);
    }
  }

  private applyFailure(error: unknown): SessionState {
    if (!(error instanceof ApiError)) throw error;
    if (isPinChange(error)) return this.set({ status: 'pin-change-required', actor: null });
    if (isRecoverable(error)) return this.set({ status: 'recoverable-error', actor: null, error });
    return this.set({ status: 'anonymous', actor: null });
  }

  private set(state: SessionState): SessionState {
    this.state = state;
    this.listeners.forEach((listener) => listener(state));
    return state;
  }
}

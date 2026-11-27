import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ActorChangeDialog } from './ActorChangeDialog';
import { RefreshCoordinator, SessionManager, type ActorDestination, type SessionState } from './session';
import { clearPrivateState } from '../storage';
import { clearIdempotencyOperations } from '../api/idempotency';
import { clearGuestSession } from '../../features/clientes/auth/guestSession';

export type { Actor } from './session';

const SessionContext = createContext<SessionManager | null>(null);
const ActorChangeContext = createContext<((destination: ActorDestination) => void) | null>(null);

function runtimeProfile(): string {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron') ? 'electron' : 'browser';
}

export function SessionProvider({ children, profile = runtimeProfile(), manager: suppliedManager }: { children: ReactNode; profile?: string; manager?: SessionManager }) {
  const managerRef = useRef<SessionManager | null>(null);
  const disposeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (managerRef.current === null) managerRef.current = suppliedManager ?? new SessionManager(new RefreshCoordinator(profile));
  const manager = managerRef.current;
  const session = useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getSnapshot);
  const [destination, setDestination] = useState<ActorDestination | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // StrictMode runs an effect cleanup/setup pair without destroying refs. A
    // deferred dispose distinguishes that probe from an actual unmount, so the
    // shared BroadcastChannel remains usable by the re-mounted effect.
    if (disposeTimerRef.current !== null) {
      clearTimeout(disposeTimerRef.current);
      disposeTimerRef.current = null;
    }
    void manager.bootstrap();
    return () => {
      disposeTimerRef.current = setTimeout(() => {
        manager.dispose();
        disposeTimerRef.current = null;
      }, 0);
    };
  }, [manager]);

  useEffect(() => manager.registerPrivateStateCleaner(clearPrivateState), [manager]);
  // Retry material belongs to the current actor/context and must not survive
  // logout, actor replacement, definitive 401, or mandatory PIN change.
  useEffect(() => manager.registerPrivateStateCleaner(clearIdempotencyOperations), [manager]);
  useEffect(() => manager.registerPrivateStateCleaner(clearGuestSession), [manager]);

  useEffect(() => {
    if (session.status === 'authenticated' || session.status === 'pin-change-required') {
      clearGuestSession();
    }
  }, [session.status]);

  useEffect(() => {
    const content = contentRef.current;
    if (content === null || destination === null) return;
    content.setAttribute('inert', '');
    content.setAttribute('aria-hidden', 'true');
    return () => {
      content.removeAttribute('inert');
      content.removeAttribute('aria-hidden');
    };
  }, [destination]);

  const requestActorChange = (nextDestination: ActorDestination) => {
    if (session.status === 'authenticated') {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setDestination(nextDestination);
    }
  };

  return <SessionContext.Provider value={manager}><ActorChangeContext.Provider value={requestActorChange}>
    <div ref={contentRef} className="session-content">{children}</div>
    {destination !== null && session.status === 'authenticated' && <ActorChangeDialog
      actor={session.actor}
      destination={destination}
      returnFocus={returnFocusRef.current}
      onCancel={() => setDestination(null)}
      onConfirm={async () => {
        const replaced = await manager.replaceActor(destination);
        if (replaced) setDestination(null);
        return replaced;
      }}
    />}
  </ActorChangeContext.Provider></SessionContext.Provider>;
}

export function useSession(): SessionState {
  const manager = useContext(SessionContext);
  if (manager === null) throw new Error('useSession must be used inside SessionProvider');
  return useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getSnapshot);
}

export function useSessionManager(): SessionManager {
  const manager = useContext(SessionContext);
  if (manager === null) throw new Error('useSessionManager must be used inside SessionProvider');
  return manager;
}

/** Opens confirmation only when an authenticated actor would be replaced. */
export function useActorChange(): (destination: ActorDestination) => void {
  const request = useContext(ActorChangeContext);
  if (request === null) throw new Error('useActorChange must be used inside SessionProvider');
  return request;
}

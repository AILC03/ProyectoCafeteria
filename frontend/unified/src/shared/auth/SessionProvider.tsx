import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ActorChangeDialog } from './ActorChangeDialog';
import { RefreshCoordinator, SessionManager, type ActorDestination, type SessionState } from './session';

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
    if (session.status === 'authenticated') setDestination(nextDestination);
  };

  return <SessionContext.Provider value={manager}><ActorChangeContext.Provider value={requestActorChange}>
    <div ref={contentRef} className="session-content">{children}</div>
    {destination !== null && session.status === 'authenticated' && <ActorChangeDialog
      actor={session.actor}
      destination={destination}
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

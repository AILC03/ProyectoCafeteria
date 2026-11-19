import { createContext, useContext, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { RefreshCoordinator, SessionManager, type SessionState } from './session';

export type { Actor } from './session';

const SessionContext = createContext<SessionManager | null>(null);

export function SessionProvider({ children, profile = 'default', manager: suppliedManager }: { children: ReactNode; profile?: string; manager?: SessionManager }) {
  const managerRef = useRef<SessionManager | null>(null);
  const disposeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (managerRef.current === null) managerRef.current = suppliedManager ?? new SessionManager(new RefreshCoordinator(profile));
  const manager = managerRef.current;

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

  return <SessionContext.Provider value={manager}>{children}</SessionContext.Provider>;
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

import { useEffect, type ReactNode } from 'react';
import { useSessionManager } from '../../../shared/auth/SessionProvider';
import type { SessionState } from '../../../shared/auth/session';
import { getGuestSessionSnapshot, subscribeGuestSession } from '../auth/guestSession';
import { cashReceipts } from '../orders/cashReceipts';
import { clientCartStore } from './clientCartStore';
import { ClientCartDrawer } from './ClientCartDrawer';

function identity(state: SessionState): string | null {
  if (state.status === 'authenticated') return `${state.actor.accountType}:${state.actor.role}:${state.actor.id}`;
  if (state.status === 'anonymous') return 'anonymous';
  return null;
}

/** Keeps the client cart scoped to the active actor while the client area is mounted. */
export function ClientCartProvider({ children }: { children: ReactNode }) {
  const manager = useSessionManager();

  useEffect(() => { clientCartStore.hydrate(); }, []);
  useEffect(() => manager.registerPrivateStateCleaner(() => {
    clientCartStore.clear();
    cashReceipts.clear();
  }), [manager]);

  useEffect(() => {
    let wasGuest = getGuestSessionSnapshot().isGuest;
    return subscribeGuestSession(() => {
      const isGuest = getGuestSessionSnapshot().isGuest;
      if (wasGuest && !isGuest) clientCartStore.clear();
      wasGuest = isGuest;
    });
  }, []);

  useEffect(() => {
    let previous = identity(manager.getSnapshot());
    return manager.subscribe((state) => {
      const next = identity(state);
      if (next === null) return;
      if (previous !== null && previous !== next) {
        clientCartStore.clear();
        cashReceipts.clear();
      }
      previous = next;
    });
  }, [manager]);

  return (
    <>
      {children}
      <ClientCartDrawer />
    </>
  );
}

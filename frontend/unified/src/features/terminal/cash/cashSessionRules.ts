import type { CashSession } from './cashApi';

export type CashActor = {
  id: string;
  role: string;
};

/** Frontend hint; the API always re-checks ownership and role under lock. */
export function isCashSessionOwner(session: CashSession, actor: CashActor): boolean {
  return session.employeeId === actor.id;
}

export function mayCloseCashSession(session: CashSession, actor: CashActor): boolean {
  return isCashSessionOwner(session, actor) || actor.role === 'ADMINISTRADOR';
}

/** The contract rejects a reason on the owner's own close, so hide it there. */
export function requiresExceptionalCloseReason(session: CashSession, actor: CashActor): boolean {
  return !isCashSessionOwner(session, actor) && actor.role === 'ADMINISTRADOR';
}

import { Outlet } from 'react-router-dom';
import { useSession, type Actor } from '../shared/auth/SessionProvider';

function SessionPending() {
  return <main id="main-content" tabIndex={-1} aria-live="polite"><p>Comprobando sesión…</p></main>;
}

function SessionBlocked() {
  return <main id="main-content" tabIndex={-1}><h1>Acceso no disponible</h1><p>Esta área requiere una sesión autorizada.</p></main>;
}

function allowsClient(actor: Actor): boolean {
  return actor.accountType === 'CUSTOMER' && actor.role === 'CLIENTE';
}

function allowsTerminal(actor: Actor, roles: readonly string[]): boolean {
  return actor.accountType === 'STAFF' && roles.includes(actor.role);
}

/**
 * Access is derived only from the API-resolved actor.
 */
export function ClientAccessGuard() {
  const session = useSession();
  if (session.status === 'loading') return <SessionPending />;
  if (session.status !== 'authenticated' || !allowsClient(session.actor)) return <SessionBlocked />;
  return <Outlet />;
}

/**
 * Access is derived only from the API-resolved actor.
 */
export function TerminalAccessGuard({ allowedRoles }: { allowedRoles: readonly string[] }) {
  const session = useSession();
  if (session.status === 'loading') return <SessionPending />;
  if (session.status !== 'authenticated' || !allowsTerminal(session.actor, allowedRoles)) return <SessionBlocked />;
  return <Outlet />;
}

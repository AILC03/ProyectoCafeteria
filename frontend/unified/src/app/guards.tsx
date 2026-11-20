import { Link, Outlet } from 'react-router-dom';
import { useActorChange, useSession, type Actor } from '../shared/auth/SessionProvider';

function SessionPending() {
  return (
    <section aria-live="polite">
      <p>Comprobando sesión…</p>
    </section>
  );
}

function SessionBlocked() {
  return (
    <section aria-labelledby="blocked-title">
      <h1 id="blocked-title">Acceso no disponible</h1>
      <p>Esta área requiere una sesión autorizada.</p>
    </section>
  );
}

function AnonymousClientBlocked() {
  return (
    <section aria-labelledby="blocked-title">
      <h1 id="blocked-title">Acceso no disponible</h1>
      <p>Esta área requiere una sesión de cliente autorizada.</p>
      <Link to="/cliente/iniciar-sesion">Iniciar sesión</Link>
    </section>
  );
}

function StaffClientAreaBlocked({ actorName }: { actorName: string }) {
  const requestActorChange = useActorChange();
  return (
    <section aria-labelledby="blocked-title">
      <h1 id="blocked-title">Acceso no disponible</h1>
      <p>
        Hay una sesión de personal activa ({actorName}). Para acceder al área de cliente debes cerrar primero la sesión actual.
      </p>
      <button type="button" onClick={() => requestActorChange('client')}>
        Cambiar a área de cliente
      </button>
    </section>
  );
}

function allowsClient(actor: Actor): boolean {
  return actor.accountType === 'CUSTOMER' && actor.role === 'CLIENTE';
}

function allowsTerminal(actor: Actor, roles: readonly string[]): boolean {
  return actor.accountType === 'STAFF' && roles.includes(actor.role);
}

/**
 * Allows visitors, guests, and CUSTOMER actors on public client routes, while
 * preventing active STAFF sessions from mixing into client UI.
 */
export function ClientPublicGuard() {
  const session = useSession();
  if (session.status === 'loading') return <SessionPending />;
  if (session.status === 'authenticated' && !allowsClient(session.actor)) {
    return <StaffClientAreaBlocked actorName={session.actor.name} />;
  }
  return <Outlet />;
}

/**
 * Access is derived only from the API-resolved actor.
 */
export function ClientAccessGuard() {
  const session = useSession();
  if (session.status === 'loading') return <SessionPending />;
  if (session.status !== 'authenticated') return <AnonymousClientBlocked />;
  if (!allowsClient(session.actor)) return <StaffClientAreaBlocked actorName={session.actor.name} />;
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

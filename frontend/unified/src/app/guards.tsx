import { Link, Outlet } from 'react-router-dom';
import { useActorChange, useSession, type Actor } from '../shared/auth/SessionProvider';
import { staffDestination } from '../features/terminal/auth/staffAccess';

function SessionPending() {
  return (
    <section aria-live="polite">
      <p>Comprobando sesión…</p>
    </section>
  );
}

function SessionBlocked() {
  const session = useSession();
  const authenticated = session.status === 'authenticated';
  return (
    <section className="status-page status-page-inline" aria-labelledby="blocked-title">
      <div className="status-card">
        <p className="status-eyebrow">Terminal</p>
        <h1 id="blocked-title">Acceso no disponible</h1>
        {authenticated ? (
          <>
            <p>Tu perfil ({session.actor.role}) no tiene acceso a esta sección.</p>
            <Link className="status-action" to={staffDestination(session.actor.role)}>Ir a mi inicio</Link>
          </>
        ) : (
          <>
            <p>Inicia sesión en la terminal para usar esta sección.</p>
            <Link className="status-action" to="/terminal/acceso">Iniciar sesión en la terminal</Link>
          </>
        )}
      </div>
    </section>
  );
}

function AnonymousClientBlocked() {
  return (
    <section className="status-page status-page-inline" aria-labelledby="blocked-title">
      <div className="status-card">
        <p className="status-eyebrow">Área de cliente</p>
        <h1 id="blocked-title">Acceso no disponible</h1>
        <p>Esta área requiere una sesión de cliente autorizada.</p>
        <Link className="status-action" to="/cliente/iniciar-sesion">Iniciar sesión</Link>
      </div>
    </section>
  );
}

function StaffClientAreaBlocked({ actorName }: { actorName: string }) {
  const requestActorChange = useActorChange();
  return (
    <section className="status-page status-page-inline" aria-labelledby="blocked-title">
      <div className="status-card">
        <p className="status-eyebrow">Área de cliente</p>
        <h1 id="blocked-title">Acceso no disponible</h1>
        <p>
          Hay una sesión de personal activa ({actorName}). Para acceder al área de cliente debes cerrar primero la sesión actual.
        </p>
        <button type="button" className="status-action" onClick={() => requestActorChange('client')}>
          Cambiar a área de cliente
        </button>
      </div>
    </section>
  );
}

function allowsClient(actor: Actor): boolean {
  return actor.accountType === 'CUSTOMER' && actor.role === 'CLIENTE';
}

function allowsTerminal(actor: Actor, roles: readonly string[]): boolean {
  // GERENTE is a legacy frontend-only role and CUSTOMER belongs to the client area.
  if (actor.role === 'GERENTE' || actor.role === 'CLIENTE' || actor.accountType !== 'STAFF') return false;
  return roles.includes(actor.role);
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

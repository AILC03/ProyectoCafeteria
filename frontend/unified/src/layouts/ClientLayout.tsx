import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ActorAreaLink } from '../shared/auth/ActorAreaLink';
import { useSession, useSessionManager } from '../shared/auth/SessionProvider';
import { exitGuestMode, useGuestSession } from '../features/clientes/auth/guestSession';

export function ClientLayout() {
  const session = useSession();
  const manager = useSessionManager();
  const guest = useGuestSession();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const isCustomer = session.status === 'authenticated'
    && session.actor.accountType === 'CUSTOMER'
    && session.actor.role === 'CLIENTE';

  async function handleLogout(): Promise<void> {
    setLoggingOut(true);
    setLogoutError(null);
    const closed = await manager.logout();
    setLoggingOut(false);
    if (closed) {
      navigate('/cliente/iniciar-sesion', { replace: true });
    } else {
      setLogoutError('No fue posible cerrar la sesión. Inténtalo de nuevo.');
    }
  }

  function handleExitGuest(): void {
    exitGuestMode();
    navigate('/cliente/iniciar-sesion', { replace: true });
  }

  return (
    <div className="client-layout">
      <a className="skip-link" href="#main-content">Saltar al contenido principal</a>
      <header>
        <p>Cliente</p>
        <nav aria-label="Navegación de cliente">
          <NavLink to="/cliente/menu">Menú</NavLink>
          <ActorAreaLink destination="client" to="/cliente/iniciar-sesion">Iniciar sesión</ActorAreaLink>
          <NavLink to="/cliente/cuenta">Cuenta</NavLink>
          <ActorAreaLink
            destination="terminal"
            to="/terminal"
            onClick={() => {
              if (guest.isGuest) exitGuestMode();
            }}
          >
            Terminal
          </ActorAreaLink>
        </nav>

        {isCustomer && (
          <div className="session-status">
            <span>Sesión: {session.actor.name}</span>
            <button type="button" className="secondary-button" disabled={loggingOut} onClick={() => { void handleLogout(); }}>
              {loggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
            </button>
          </div>
        )}

        {session.status !== 'authenticated' && guest.isGuest && (
          <div className="session-status">
            <span>Invitado: {guest.guestName}</span>
            <button type="button" className="secondary-button" onClick={handleExitGuest}>
              Salir de invitado
            </button>
          </div>
        )}

        {logoutError !== null && <p role="alert" className="form-alert">{logoutError}</p>}
      </header>
      <main id="main-content" tabIndex={-1}><Outlet /></main>
    </div>
  );
}

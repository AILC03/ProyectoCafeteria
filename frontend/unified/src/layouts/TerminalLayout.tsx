import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { isDesktopTerminalOnly } from '../app/desktop';
import { ActorAreaLink } from '../shared/auth/ActorAreaLink';
import { useSession, useSessionManager } from '../shared/auth/SessionProvider';
import '../styles/terminal/tokens.css';
import '../styles/terminal/shell-welcome.css';
import '../styles/terminal/staff-login.css';
import '../styles/terminal/pos-catalog.css';
import '../styles/terminal/pos-order.css';
import '../styles/terminal/cash-session.css';
import '../styles/terminal/cash-payment.css';
import '../styles/terminal/protected-ticket.css';
import '../styles/terminal/kitchen-availability.css';
import '../styles/terminal/history.css';
import '../styles/terminal/admin-shell.css';
import '../styles/terminal/admin-catalog.css';
import '../styles/terminal/admin-options.css';
import '../styles/terminal/admin-staff.css';

function navTabClass({ isActive }: { isActive: boolean }): string {
  return isActive ? 'pos-view-tab active' : 'pos-view-tab';
}

export function TerminalLayout() {
  const session = useSession();
  const manager = useSessionManager();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSeeHistory = session.status === 'authenticated'
    && (session.actor.role === 'CAJERO' || session.actor.role === 'ADMINISTRADOR');
  const canSeeKitchen = session.status === 'authenticated'
    && (session.actor.role === 'PREPARACION' || session.actor.role === 'CAJERO' || session.actor.role === 'ADMINISTRADOR');
  const canSeeAvailability = session.status === 'authenticated'
    && (session.actor.role === 'CAJERO' || session.actor.role === 'ADMINISTRADOR');
  const canSeeAdmin = session.status === 'authenticated' && session.actor.role === 'ADMINISTRADOR';

  async function handleLogout(): Promise<void> {
    setBusy(true);
    setError(null);
    const closed = await manager.logout();
    setBusy(false);
    if (!closed) setError('No fue posible cerrar la sesión. Inténtalo de nuevo.');
  }

  return (
    <div className="terminal-layout">
      <a className="skip-link" href="#main-content">Saltar al contenido principal</a>
      <header className="pos-top-nav">
        <div className="pos-nav-left">
          <p className="pos-logo-text">Terminal</p>
          <nav className="pos-view-tabs" aria-label="Navegación de terminal">
            <NavLink className={navTabClass} end to="/terminal">Inicio</NavLink>
            <NavLink className={navTabClass} to="/terminal/pos">POS</NavLink>
            {canSeeKitchen && <NavLink className={navTabClass} to="/terminal/cocina">Cocina</NavLink>}
            <NavLink className={navTabClass} to="/terminal/caja">Caja</NavLink>
            {canSeeAvailability && <NavLink className={navTabClass} to="/terminal/disponibilidad">Disponibilidad</NavLink>}
            {canSeeHistory && <NavLink className={navTabClass} to="/terminal/historial">Historial</NavLink>}
            {canSeeAdmin && <NavLink className={navTabClass} to="/terminal/administracion">Administración</NavLink>}
            {!isDesktopTerminalOnly() && (
              <ActorAreaLink className="pos-view-tab" destination="client" to="/cliente/iniciar-sesion">
                Cliente
              </ActorAreaLink>
            )}
          </nav>
        </div>

        <div className="pos-nav-right">
          {session.status === 'authenticated' && (
            <div className="terminal-session">
              <span className="pos-cashier-badge">Sesión: {session.actor.name}</span>
              <button
                type="button"
                className="btn-pos-logout"
                onClick={() => { void handleLogout(); }}
                disabled={busy}
              >
                {busy ? 'Cerrando sesión…' : 'Cerrar sesión'}
              </button>
              {error !== null && <p role="alert" className="terminal-session-error">{error}</p>}
            </div>
          )}
        </div>
      </header>
      <main id="main-content" tabIndex={-1}><Outlet /></main>
    </div>
  );
}

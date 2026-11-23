import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { ActorAreaLink } from '../shared/auth/ActorAreaLink';
import { useSession, useSessionManager } from '../shared/auth/SessionProvider';

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
      <header>
        <p>Terminal</p>
        <nav aria-label="Navegación de terminal"><NavLink end to="/terminal">Inicio</NavLink><NavLink to="/terminal/pos">POS</NavLink>{canSeeKitchen && <NavLink to="/terminal/cocina">Cocina</NavLink>}<NavLink to="/terminal/caja">Caja</NavLink>{canSeeAvailability && <NavLink to="/terminal/disponibilidad">Disponibilidad</NavLink>}{canSeeHistory && <NavLink to="/terminal/historial">Historial</NavLink>}{canSeeAdmin && <NavLink to="/terminal/administracion">Administración</NavLink>}<ActorAreaLink destination="client" to="/cliente/iniciar-sesion">Cliente</ActorAreaLink></nav>
        {session.status === 'authenticated' && (
          <div className="terminal-session">
            <span>Sesión: {session.actor.name}</span>
            <button type="button" onClick={() => { void handleLogout(); }} disabled={busy}>
              {busy ? 'Cerrando sesión…' : 'Cerrar sesión'}
            </button>
            {error !== null && <p role="alert">{error}</p>}
          </div>
        )}
      </header>
      <main id="main-content" tabIndex={-1}><Outlet /></main>
    </div>
  );
}

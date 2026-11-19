import { NavLink, Outlet } from 'react-router-dom';

export function TerminalLayout() {
  return (
    <div className="terminal-layout">
      <a className="skip-link" href="#main-content">Saltar al contenido principal</a>
      <header><p>Terminal</p><nav aria-label="Navegación de terminal"><NavLink end to="/terminal">Inicio</NavLink><NavLink to="/terminal/pos">POS</NavLink><NavLink to="/terminal/cocina">Cocina</NavLink><NavLink to="/terminal/caja">Caja</NavLink><NavLink to="/terminal/administracion">Administración</NavLink></nav></header>
      <main id="main-content" tabIndex={-1}><Outlet /></main>
    </div>
  );
}

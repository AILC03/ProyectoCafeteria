import { NavLink, Outlet } from 'react-router-dom';
import { ActorAreaLink } from '../shared/auth/ActorAreaLink';

export function ClientLayout() {
  return (
    <div className="client-layout">
      <a className="skip-link" href="#main-content">Saltar al contenido principal</a>
      <header><p>Cliente</p><nav aria-label="Navegación de cliente"><NavLink to="/cliente/menu">Menú</NavLink><ActorAreaLink destination="client" to="/cliente/iniciar-sesion">Iniciar sesión</ActorAreaLink><NavLink to="/cliente/cuenta">Cuenta</NavLink><ActorAreaLink destination="terminal" to="/terminal">Terminal</ActorAreaLink></nav></header>
      <main id="main-content" tabIndex={-1}><Outlet /></main>
    </div>
  );
}

import { NavLink, Outlet } from 'react-router-dom';

export function ClientLayout() {
  return (
    <div className="client-layout">
      <a className="skip-link" href="#main-content">Saltar al contenido principal</a>
      <header><p>Cliente</p><nav aria-label="Navegación de cliente"><NavLink to="/cliente/menu">Menú</NavLink><NavLink to="/cliente/iniciar-sesion">Iniciar sesión</NavLink><NavLink to="/cliente/cuenta">Cuenta</NavLink></nav></header>
      <main id="main-content" tabIndex={-1}><Outlet /></main>
    </div>
  );
}

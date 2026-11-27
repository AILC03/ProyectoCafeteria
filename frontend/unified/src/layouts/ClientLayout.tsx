import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ActorAreaLink } from '../shared/auth/ActorAreaLink';
import { useSession, useSessionManager } from '../shared/auth/SessionProvider';
import { exitGuestMode, useGuestSession } from '../features/clientes/auth/guestSession';
import { cashReceipts } from '../features/clientes/orders/cashReceipts';
import { ClientCartProvider } from '../features/clientes/cart/ClientCartProvider';
import { clientCartStore, useClientCart } from '../features/clientes/cart/clientCartStore';
import '../styles/client/shell-auth.css';
import '../styles/client/catalog.css';
import '../styles/client/cart-customization.css';
import '../styles/client/cart-drawer.css';
import '../styles/client/account.css';
import '../styles/client/registration.css';

export function ClientLayout() {
  const session = useSession();
  const manager = useSessionManager();
  const guest = useGuestSession();
  const navigate = useNavigate();
  const cart = useClientCart();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const itemCount = cart.items.reduce((total, item) => total + item.quantity, 0);

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
    cashReceipts.clear();
    exitGuestMode();
    navigate('/cliente/iniciar-sesion', { replace: true });
  }

  return (
    <ClientCartProvider>
    <div className="client-layout">
      <a className="skip-link" href="#main-content">Saltar al contenido principal</a>
      <header className="client-site-header">
        <NavLink to="/cliente/menu" className="client-brand" aria-label="Marca Coffee's POS"><img src="/client/logo.png" alt="" width="144" height="44" /></NavLink>
        <nav aria-label="Navegación de cliente">
          <NavLink to="/cliente/menu">Menú</NavLink>
          <ActorAreaLink destination="client" to="/cliente/iniciar-sesion">Iniciar sesión</ActorAreaLink>
          <NavLink to="/cliente/cuenta">Cuenta</NavLink>
        </nav>
        <button
          type="button"
          className="client-cart-button"
          aria-label={`Abrir carrito, ${itemCount} ${itemCount === 1 ? 'producto' : 'productos'}`}
          aria-haspopup="dialog"
          aria-expanded={cart.open}
          aria-controls="client-cart-drawer-title"
          onClick={() => clientCartStore.open()}
        >
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
            <path d="M3 3h2l2.4 12.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 8H6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="9.5" cy="20" r="1.4" fill="currentColor" />
            <circle cx="17.5" cy="20" r="1.4" fill="currentColor" />
          </svg>
          <span className="client-cart-count" aria-hidden="true">{itemCount}</span>
        </button>

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
    </ClientCartProvider>
  );
}

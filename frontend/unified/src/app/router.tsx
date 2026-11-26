import {
  createBrowserRouter,
  createMemoryRouter,
  Link,
  Navigate,
  Outlet,
  useLocation,
  type RouteObject,
} from 'react-router-dom';
import { ClientAccessGuard, ClientPublicGuard, TerminalAccessGuard } from './guards';
import { isDesktopTerminalOnly } from './desktop';
import { ClientAuthPage } from '../features/clientes/auth/ClientAuthPage';
import { TicketRegistrationPage } from '../features/clientes/registration/TicketRegistrationPage';
import { exitGuestMode, useGuestSession } from '../features/clientes/auth/guestSession';
import { ClientCatalogPage } from '../features/clientes/catalog/ClientCatalogPage';
import { ClientAccountPage } from '../features/clientes/account/ClientAccountPage';
import { ClientLayout } from '../layouts/ClientLayout';
import { TerminalLayout } from '../layouts/TerminalLayout';
import { TerminalAuthPage } from '../features/terminal/auth/TerminalAuthPage';
import { TerminalWelcomePage } from '../features/terminal/auth/TerminalWelcomePage';
import { PosPage } from '../features/terminal/pos/PosPage';
import { CashSessionsPage } from '../features/terminal/cash/CashSessionsPage';
import { CashPaymentPage } from '../features/terminal/payment/CashPaymentPage';
import { HistoryPage } from '../features/terminal/history/HistoryPage';
import { KitchenPage } from '../features/terminal/kitchen/KitchenPage';
import { AvailabilityPage } from '../features/terminal/kitchen/AvailabilityPage';
import { AdminPage } from '../features/terminal/admin/AdminPage';
import { ActorAreaLink } from '../shared/auth/ActorAreaLink';
import { useSession, useSessionManager } from '../shared/auth/SessionProvider';
import { useState } from 'react';

function LandingPage() {
  const guest = useGuestSession();
  return (
    <main id="main-content" tabIndex={-1} className="landing-page">
      <section className="landing-shell" aria-labelledby="landing-title">
        <p className="landing-eyebrow">Coffee´s POS</p>
        <h1 id="landing-title">Aplicación unificada de cafetería</h1>
        <p className="landing-subtitle">Pedidos de clientes y operación de terminal en un solo lugar.</p>
        <div className="landing-areas">
          <article className="landing-area landing-area-client" aria-labelledby="landing-client-title">
            <h2 id="landing-client-title">Área de cliente</h2>
            <p>Consulta el menú, personaliza tu pedido y revisa tu cuenta.</p>
            <ActorAreaLink className="landing-action" destination="client" to="/cliente/menu">
              Entrar como cliente
            </ActorAreaLink>
          </article>
          <article className="landing-area landing-area-terminal" aria-labelledby="landing-terminal-title">
            <h2 id="landing-terminal-title">Terminal</h2>
            <p>Toma de órdenes, caja, cocina y administración para personal autorizado.</p>
            <ActorAreaLink
              className="landing-action"
              destination="terminal"
              to="/terminal"
              onClick={() => {
                if (guest.isGuest) exitGuestMode();
              }}
            >
              Entrar a la terminal
            </ActorAreaLink>
          </article>
        </div>
      </section>
    </main>
  );
}

function PinChangeRequiredPage() {
  const session = useSession();
  const manager = useSessionManager();
  const [error, setError] = useState<string | null>(null);
  async function logout(): Promise<void> {
    if (!await manager.logout()) setError('No fue posible cerrar la sesión. Inténtalo de nuevo.');
  }
  if (session.status !== 'pin-change-required') return <main id="main-content" tabIndex={-1} className="status-page"><h1>Ruta no disponible</h1></main>;
  return <main id="main-content" tabIndex={-1} className="status-page">
    <section className="status-card" aria-labelledby="pin-change-title">
      <p className="status-eyebrow">Sesión restringida</p>
      <h1 id="pin-change-title">Cambio de NIP obligatorio</h1>
      <p role="status">Tu sesión está restringida hasta cambiar el NIP o cerrar sesión.</p>
      {error !== null && <p role="alert">{error}</p>}
      <button type="button" className="status-action" onClick={() => { void logout(); }}>Cerrar sesión</button>
    </section>
  </main>;
}

function PinChangeGate() {
  const session = useSession();
  const location = useLocation();
  if (session.status === 'pin-change-required' && location.pathname !== '/cambiar-nip') {
    return <Navigate to="/cambiar-nip" replace />;
  }
  return <Outlet />;
}

function NotFoundContent({ area }: { area?: 'client' | 'terminal' } = {}) {
  const home = area === 'client' ? '/cliente/menu' : area === 'terminal' ? '/terminal' : '/';
  const label = area === 'client' ? 'Volver al menú' : area === 'terminal' ? 'Volver a la terminal' : 'Volver al inicio';
  return (
    <>
      <p className="status-eyebrow">{area === 'client' ? 'Área de cliente' : area === 'terminal' ? 'Terminal' : 'Coffee´s POS'}</p>
      <h1 id="page-title">Página no encontrada</h1>
      <p>La ruta solicitada no está disponible.</p>
      <Link className="status-action" to={home}>{label}</Link>
    </>
  );
}

function NotFoundPage() {
  return <main id="main-content" tabIndex={-1} className="status-page"><section className="status-card"><NotFoundContent /></section></main>;
}

function ClientAreaRoute() {
  if (isDesktopTerminalOnly()) return <Navigate to="/terminal" replace />;
  return <ClientLayout />;
}

export const appRoutes: RouteObject[] = [
  { element: <PinChangeGate />, children: [
    { path: '/', element: <LandingPage /> },
    { path: '/cambiar-nip', element: <PinChangeRequiredPage /> },
    {
      path: '/cliente',
      element: <ClientAreaRoute />, children: [
      { index: true, element: <Navigate to="menu" replace /> },
       { path: 'iniciar-sesion', element: <ClientAuthPage /> },
       { path: 'registro-ticket', element: <TicketRegistrationPage /> },
      { element: <ClientPublicGuard />, children: [{ path: 'menu', element: <ClientCatalogPage /> }] },
       { element: <ClientAccessGuard />, children: [{ path: 'cuenta', element: <ClientAccountPage /> }] },
      { path: '*', element: <section className="status-page status-page-inline" aria-labelledby="page-title"><div className="status-card"><NotFoundContent area="client" /></div></section> },
      ],
    },
    {
      path: '/terminal',
      element: <TerminalLayout />, children: [
      { index: true, element: <TerminalWelcomePage /> },
      { path: 'acceso', element: <TerminalAuthPage /> },
      { element: <TerminalAccessGuard allowedRoles={['CAJERO', 'ADMINISTRADOR']} />, children: [
        { path: 'pos', element: <PosPage /> },
         { path: 'caja', element: <CashSessionsPage /> },
         { path: 'cobro', element: <CashPaymentPage /> },
         { path: 'historial', element: <HistoryPage /> },
      ] },
      { element: <TerminalAccessGuard allowedRoles={['PREPARACION', 'CAJERO', 'ADMINISTRADOR']} />, children: [
        { path: 'cocina', element: <KitchenPage /> },
      ] },
      { element: <TerminalAccessGuard allowedRoles={['CAJERO', 'ADMINISTRADOR']} />, children: [
        { path: 'disponibilidad', element: <AvailabilityPage /> },
      ] },
      { element: <TerminalAccessGuard allowedRoles={['ADMINISTRADOR']} />, children: [
        { path: 'administracion/*', element: <AdminPage /> },
      ] },
      { path: '*', element: <section className="status-page status-page-inline" aria-labelledby="page-title"><div className="status-card"><NotFoundContent area="terminal" /></div></section> },
      ],
    },
    { path: '*', element: <NotFoundPage /> },
  ] },
];

export const router = createBrowserRouter(appRoutes);

export function createTestRouter(initialEntries: string[] = ['/']) {
  return createMemoryRouter(appRoutes, { initialEntries });
}

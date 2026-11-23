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
    <main id="main-content" tabIndex={-1}>
      <h1>Aplicación unificada de cafetería</h1>
      <nav aria-label="Elegir área">
        <ul>
          <li><ActorAreaLink destination="client" to="/cliente/menu">Área de cliente</ActorAreaLink></li>
          <li>
            <ActorAreaLink
              destination="terminal"
              to="/terminal"
              onClick={() => {
                if (guest.isGuest) exitGuestMode();
              }}
            >
              Terminal
            </ActorAreaLink>
          </li>
        </ul>
      </nav>
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
  if (session.status !== 'pin-change-required') return <main id="main-content" tabIndex={-1}><h1>Ruta no disponible</h1></main>;
  return <main id="main-content" tabIndex={-1}><section aria-labelledby="pin-change-title">
    <h1 id="pin-change-title">Cambio de NIP obligatorio</h1>
    <p role="status">Tu sesión está restringida hasta cambiar el NIP o cerrar sesión.</p>
    {error !== null && <p role="alert">{error}</p>}
    <button type="button" onClick={() => { void logout(); }}>Cerrar sesión</button>
  </section></main>;
}

function PinChangeGate() {
  const session = useSession();
  const location = useLocation();
  if (session.status === 'pin-change-required' && location.pathname !== '/cambiar-nip') {
    return <Navigate to="/cambiar-nip" replace />;
  }
  return <Outlet />;
}

function NotFoundContent() {
  return <><h1 id="page-title">Página no encontrada</h1><p>La ruta solicitada no está disponible.</p><Link to="/">Volver al inicio</Link></>;
}

function NotFoundPage() {
  return <main id="main-content" tabIndex={-1}><NotFoundContent /></main>;
}

export const appRoutes: RouteObject[] = [
  { element: <PinChangeGate />, children: [
    { path: '/', element: <LandingPage /> },
    { path: '/cambiar-nip', element: <PinChangeRequiredPage /> },
    {
      path: '/cliente',
      element: <ClientLayout />, children: [
      { index: true, element: <Navigate to="menu" replace /> },
       { path: 'iniciar-sesion', element: <ClientAuthPage /> },
       { path: 'registro-ticket', element: <TicketRegistrationPage /> },
      { element: <ClientPublicGuard />, children: [{ path: 'menu', element: <ClientCatalogPage /> }] },
       { element: <ClientAccessGuard />, children: [{ path: 'cuenta', element: <ClientAccountPage /> }] },
      { path: '*', element: <section aria-labelledby="page-title"><NotFoundContent /></section> },
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
      { path: '*', element: <section aria-labelledby="page-title"><NotFoundContent /></section> },
      ],
    },
    { path: '*', element: <NotFoundPage /> },
  ] },
];

export const router = createBrowserRouter(appRoutes);

export function createTestRouter(initialEntries: string[] = ['/']) {
  return createMemoryRouter(appRoutes, { initialEntries });
}

import {
  createBrowserRouter,
  createMemoryRouter,
  Link,
  Navigate,
  type RouteObject,
} from 'react-router-dom';
import { ClientAccessGuard, TerminalAccessGuard } from './guards';
import { ClientLayout } from '../layouts/ClientLayout';
import { TerminalLayout } from '../layouts/TerminalLayout';

function PlaceholderPage({ title }: { title: string }) {
  return <section aria-labelledby="page-title"><h1 id="page-title">{title}</h1><p>Esta pantalla estará disponible próximamente.</p></section>;
}

function LandingPage() {
  return (
    <main id="main-content" tabIndex={-1}>
      <h1>Aplicación unificada de cafetería</h1>
      <nav aria-label="Elegir área"><ul><li><Link to="/cliente/menu">Área de cliente</Link></li><li><Link to="/terminal">Terminal</Link></li></ul></nav>
    </main>
  );
}

function NotFoundContent() {
  return <><h1 id="page-title">Página no encontrada</h1><p>La ruta solicitada no está disponible.</p><Link to="/">Volver al inicio</Link></>;
}

function NotFoundPage() {
  return <main id="main-content" tabIndex={-1}><NotFoundContent /></main>;
}

export const appRoutes: RouteObject[] = [
  { path: '/', element: <LandingPage /> },
  {
    path: '/cliente',
    element: <ClientAccessGuard />,
    children: [{ element: <ClientLayout />, children: [
      { index: true, element: <Navigate to="menu" replace /> },
      { path: 'iniciar-sesion', element: <PlaceholderPage title="Iniciar sesión" /> },
      { path: 'menu', element: <PlaceholderPage title="Menú" /> },
      { path: 'cuenta', element: <PlaceholderPage title="Cuenta" /> },
      { path: '*', element: <section aria-labelledby="page-title"><NotFoundContent /></section> },
    ] }],
  },
  {
    path: '/terminal',
    element: <TerminalAccessGuard />,
    children: [{ element: <TerminalLayout />, children: [
      { index: true, element: <PlaceholderPage title="Terminal" /> },
      { path: 'pos', element: <PlaceholderPage title="Punto de venta" /> },
      { path: 'cocina', element: <PlaceholderPage title="Cocina" /> },
      { path: 'caja', element: <PlaceholderPage title="Caja" /> },
      { path: 'administracion/*', element: <PlaceholderPage title="Administración" /> },
      { path: '*', element: <section aria-labelledby="page-title"><NotFoundContent /></section> },
    ] }],
  },
  { path: '*', element: <NotFoundPage /> },
];

export const router = createBrowserRouter(appRoutes);

export function createTestRouter(initialEntries: string[] = ['/']) {
  return createMemoryRouter(appRoutes, { initialEntries });
}

import { fireEvent, render, screen, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, test } from 'vitest';
import { createTestRouter } from './app/router';
import { SessionProvider } from './shared/auth/SessionProvider';
import { server } from './test/server';

beforeEach(() => {
  server.use(
    http.get('/api/v1/categories', () => HttpResponse.json({ data: [], page: { limit: 100, nextCursor: null } })),
    http.get('/api/v1/products', () => HttpResponse.json({ data: [], page: { limit: 100, nextCursor: null } })),
    http.get('/api/v1/cash-sessions/current', () => HttpResponse.json({ data: null })),
    http.get('/api/v1/sales', () => HttpResponse.json({ data: [], page: { limit: 20, nextCursor: null } })),
    http.get('/api/v1/sales/summary', () => HttpResponse.json({ data: { count: '0', totalCents: '0', cashCents: '0', stripeCents: '0' } })),
    http.get('/api/v1/preparation/orders', () => HttpResponse.json({ data: [], page: { limit: 20, nextCursor: null } })),
    http.get('/api/v1/admin/products', () => HttpResponse.json({ data: [], page: { limit: 20, nextCursor: null } })),
  );
});

function renderRoute(path: string) {
  const actor = path.startsWith('/terminal/administracion')
    ? { id: 'admin-1', name: 'Admin', role: 'ADMINISTRADOR', accountType: 'STAFF', mustChangePin: false }
    : path.startsWith('/terminal')
    ? { id: 'staff-1', name: 'Caja', role: 'CAJERO', accountType: 'STAFF', mustChangePin: false }
    : { id: 'customer-1', name: 'Cliente', role: 'CLIENTE', accountType: 'CUSTOMER', mustChangePin: false };
  server.use(http.get('/api/v1/auth/me', () => HttpResponse.json({ data: actor })));
  return render(<SessionProvider><RouterProvider router={createTestRouter([path])} /></SessionProvider>);
}

describe('application routes', () => {
  test.each([
    ['/', 'Aplicación unificada de cafetería'],
    ['/cliente/iniciar-sesion', 'Iniciar sesión'],
    ['/cliente', 'Menú'],
    ['/cliente/menu', 'Menú'],
    ['/cliente/cuenta', 'Cuenta'],
    ['/terminal', 'Terminal'],
    ['/terminal/pos', 'Punto de venta'],
    ['/terminal/cocina', 'Cola de cocina'],
    ['/terminal/disponibilidad', 'Disponibilidad de productos'],
    ['/terminal/caja', 'Corte y Sesión de Caja'],
    ['/terminal/historial', 'Historial y ventas'],
    ['/terminal/administracion/catalogo', 'Administración'],
  ])('renders %s', async (path, heading) => {
    renderRoute(path);
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
  });

  test('keeps client and terminal layouts separate', async () => {
    const { unmount } = renderRoute('/cliente/menu');
    expect(await screen.findByRole('navigation', { name: 'Navegación de cliente' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Navegación de terminal' })).not.toBeInTheDocument();
    unmount();
    renderRoute('/terminal/pos');
    expect(await screen.findByRole('navigation', { name: 'Navegación de terminal' })).toBeInTheDocument();
  });

  test('links operational history in the terminal without linking customer history', async () => {
    renderRoute('/terminal/historial');
    const nav = await screen.findByRole('navigation', { name: 'Navegación de terminal' });
    expect(within(nav).getByRole('link', { name: 'Historial' })).toHaveAttribute('href', '/terminal/historial');
    expect(within(nav).queryByRole('link', { name: /cuenta|historial personal/i })).not.toBeInTheDocument();
    expect(nav.querySelector('a[href^="/cliente/cuenta"]')).toBeNull();
    expect(nav.querySelector('a[href*="/customers/me/"]')).toBeNull();
  });

  test('requires actor replacement confirmation before crossing from client to terminal', async () => {
    renderRoute('/cliente/menu');
    const terminalLink = await screen.findByRole('link', { name: 'Terminal' });
    fireEvent.click(terminalLink);
    expect(await screen.findByRole('dialog', { name: 'Cambiar de sesión' })).toBeInTheDocument();
    expect(screen.getByText('Se cerrará la sesión de Cliente para abrir la terminal.')).toBeInTheDocument();
    expect(document.querySelector('.session-content')).toHaveAttribute('inert');
    expect(document.querySelector('.session-content')).toHaveAttribute('aria-hidden', 'true');
  });

  test('renders the restricted PIN route with a visible logout action and no NIP form', async () => {
    const pinActor = { id: 'customer-1', name: 'Cliente', role: 'CLIENTE', accountType: 'CUSTOMER', mustChangePin: true };
    server.use(http.get('/api/v1/auth/me', () => HttpResponse.json({ data: pinActor })));
    render(<SessionProvider><RouterProvider router={createTestRouter(['/cambiar-nip'])} /></SessionProvider>);
    expect(await screen.findByRole('heading', { name: 'Cambio de NIP obligatorio' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  test('globally redirects PIN-change-required sessions away from all other routes', async () => {
    const pinActor = { id: 'customer-1', name: 'Cliente', role: 'CLIENTE', accountType: 'CUSTOMER', mustChangePin: true };
    server.use(http.get('/api/v1/auth/me', () => HttpResponse.json({ data: pinActor })));
    render(<SessionProvider><RouterProvider router={createTestRouter(['/cliente/menu'])} /></SessionProvider>);
    expect(await screen.findByRole('heading', { name: 'Cambio de NIP obligatorio' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Menú' })).not.toBeInTheDocument();
  });

  test('renders a safe fallback for unknown routes', async () => {
    renderRoute('/desconocida');
    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument();
  });

  test.each(['/cliente/desconocida', '/terminal/desconocida'])('renders a scoped safe fallback for %s', async (path) => {
    renderRoute(path);
    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument();
  });

  test('provides a keyboard-accessible skip link and visible focus styles', async () => {
    renderRoute('/cliente/menu');
    const skipLink = await screen.findByRole('link', { name: 'Saltar al contenido principal' });
    expect(skipLink).toHaveAttribute('href', '#main-content');
    expect(document.querySelector('main')).toHaveAttribute('tabindex', '-1');
  });

  test('links kitchen and availability only for authorised terminal roles', async () => {
    const preparacion = { id: '3', name: 'Cocina', role: 'PREPARACION', accountType: 'STAFF', mustChangePin: false };
    server.use(http.get('/api/v1/auth/me', () => HttpResponse.json({ data: preparacion })));
    const first = render(<SessionProvider><RouterProvider router={createTestRouter(['/terminal/cocina'])} /></SessionProvider>);
    const prepNav = await screen.findByRole('navigation', { name: 'Navegación de terminal' });
    expect(within(prepNav).getByRole('link', { name: 'Cocina' })).toHaveAttribute('href', '/terminal/cocina');
    expect(within(prepNav).queryByRole('link', { name: 'Disponibilidad' })).not.toBeInTheDocument();
    first.unmount();

    renderRoute('/terminal/disponibilidad');
    const cashierNav = await screen.findByRole('navigation', { name: 'Navegación de terminal' });
    expect(within(cashierNav).getByRole('link', { name: 'Cocina' })).toHaveAttribute('href', '/terminal/cocina');
    expect(within(cashierNav).getByRole('link', { name: 'Disponibilidad' })).toHaveAttribute('href', '/terminal/disponibilidad');
  });

  test.each([
    ['/cliente/cuenta', { id: 'staff-1', name: 'Caja', role: 'CAJERO', accountType: 'STAFF', mustChangePin: false }],
    ['/terminal/pos', { id: 'customer-1', name: 'Cliente', role: 'CLIENTE', accountType: 'CUSTOMER', mustChangePin: false }],
    ['/terminal/administracion/catalogo', { id: 'staff-1', name: 'Caja', role: 'CAJERO', accountType: 'STAFF', mustChangePin: false }],
    ['/terminal/historial', { id: 'staff-2', name: 'Cocina', role: 'PREPARACION', accountType: 'STAFF', mustChangePin: false }],
    ['/terminal/historial', { id: 'customer-1', name: 'Cliente', role: 'CLIENTE', accountType: 'CUSTOMER', mustChangePin: false }],
    ['/terminal/historial', { id: 'legacy-1', name: 'Gerente', role: 'GERENTE', accountType: 'STAFF', mustChangePin: false }],
    ['/terminal/pos', { id: 'legacy-1', name: 'Gerente', role: 'GERENTE', accountType: 'STAFF', mustChangePin: false }],
    ['/terminal/cocina', { id: 'legacy-1', name: 'Gerente', role: 'GERENTE', accountType: 'STAFF', mustChangePin: false }],
    ['/terminal/cocina', { id: 'customer-1', name: 'Cliente', role: 'CLIENTE', accountType: 'CUSTOMER', mustChangePin: false }],
    ['/terminal/disponibilidad', { id: 'staff-2', name: 'Cocina', role: 'PREPARACION', accountType: 'STAFF', mustChangePin: false }],
    ['/terminal/disponibilidad', { id: 'customer-1', name: 'Cliente', role: 'CLIENTE', accountType: 'CUSTOMER', mustChangePin: false }],
    ['/terminal/administracion/catalogo', { id: 'staff-2', name: 'Cocina', role: 'PREPARACION', accountType: 'STAFF', mustChangePin: false }],
  ])('blocks an actor with an unsuitable role from %s', async (path, actor) => {
    const privateRequests: string[] = [];
    server.use(
      http.get('/api/v1/auth/me', () => HttpResponse.json({ data: actor })),
      http.get('/api/v1/sales', () => { privateRequests.push('sales'); return HttpResponse.json({ data: [], page: { limit: 20, nextCursor: null } }); }),
      http.get('/api/v1/sales/summary', () => { privateRequests.push('summary'); return HttpResponse.json({ data: { count: '0', totalCents: '0', cashCents: '0', stripeCents: '0' } }); }),
      http.get('/api/v1/preparation/orders', () => { privateRequests.push('kitchen'); return HttpResponse.json({ data: [], page: { limit: 20, nextCursor: null } }); }),
      http.get('/api/v1/products', () => { privateRequests.push('products'); return HttpResponse.json({ data: [], page: { limit: 100, nextCursor: null } }); }),
    );
    render(<SessionProvider><RouterProvider router={createTestRouter([path])} /></SessionProvider>);
    expect(await screen.findByRole('heading', { name: 'Acceso no disponible' })).toBeInTheDocument();
    expect(privateRequests).toEqual([]);
  });

  test('blocks an anonymous session without rendering protected content', async () => {
    const status = 401;
    const code = 'UNAUTHENTICATED';
    server.use(http.get('/api/v1/auth/me', () => HttpResponse.json({ code }, { status })));
    render(<SessionProvider><RouterProvider router={createTestRouter(['/cliente/cuenta'])} /></SessionProvider>);
    expect(await screen.findByRole('heading', { name: 'Acceso no disponible' })).toBeInTheDocument();
  });

  test.each([
    ['/cliente/iniciar-sesion', 'Iniciar sesión'],
    ['/cliente/menu', 'Menú'],
    ['/terminal', 'Terminal'],
    ['/terminal/acceso', 'Acceso a terminal'],
  ])('keeps %s public while session bootstrap is anonymous', async (path, heading) => {
    server.use(http.get('/api/v1/auth/me', () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })));
    render(<SessionProvider><RouterProvider router={createTestRouter([path])} /></SessionProvider>);
    if (path === '/terminal/acceso') await screen.findByLabelText('Usuario');
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
  });
});

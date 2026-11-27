import { fireEvent, render, screen, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createTestRouter } from '../../../app/router';
import { invalidateCsrfToken } from '../../../shared/api/client';
import { SessionProvider } from '../../../shared/auth/SessionProvider';
import { server } from '../../../test/server';

const cajero = { id: 'staff-1', name: 'Cajero Uno', role: 'CAJERO', accountType: 'STAFF', mustChangePin: false };
const preparacion = { id: 'staff-2', name: 'Cocina Dos', role: 'PREPARACION', accountType: 'STAFF', mustChangePin: false };
const administrador = { id: 'staff-3', name: 'Admin Tres', role: 'ADMINISTRADOR', accountType: 'STAFF', mustChangePin: false };

function renderAt(path: string) {
  return render(
    <SessionProvider>
      <RouterProvider router={createTestRouter([path])} />
    </SessionProvider>,
  );
}

function mockAnonymousSession(): void {
  server.use(
    http.get('/api/v1/auth/me', () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
    http.get('/api/v1/auth/csrf', () => HttpResponse.json({ data: { csrfToken: 'prelogin-csrf' } })),
    http.post('/api/v1/auth/refresh', () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
  );
}

function mockAuthenticatedSession(actor: typeof cajero): void {
  server.use(
    http.get('/api/v1/auth/me', () => HttpResponse.json({ data: actor })),
    http.get('/api/v1/auth/csrf', () => HttpResponse.json({ data: { csrfToken: 'staff-session-csrf' } })),
    http.post('/api/v1/auth/refresh', () => HttpResponse.json({ data: { user: actor, csrfToken: 'staff-session-csrf' } })),
  );
}

beforeEach(() => {
  server.use(
    http.get('/api/v1/categories', () => HttpResponse.json({ data: [], page: { limit: 100, nextCursor: null } })),
    http.get('/api/v1/products', () => HttpResponse.json({ data: [], page: { limit: 100, nextCursor: null } })),
  );
});

afterEach(() => {
  invalidateCsrfToken();
  delete window.cafeteriaDesktop;
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('Terminal welcome and shell (HYB-05)', () => {
  test('renders loading state while session bootstrap is pending', async () => {
    const deferred: { resolve?: () => void } = {};
    server.use(
      http.get('/api/v1/auth/me', () => new Promise((resolve) => {
        deferred.resolve = () => resolve(HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 }));
      })),
      http.get('/api/v1/auth/csrf', () => HttpResponse.json({ data: { csrfToken: 'prelogin-csrf' } })),
      http.post('/api/v1/auth/refresh', () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
    );

    renderAt('/terminal');

    expect(await screen.findByRole('heading', { level: 1, name: 'Terminal' })).toBeInTheDocument();
    expect(screen.getByText('Comprobando sesión…')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Empezar/i })).not.toBeInTheDocument();

    deferred.resolve?.();
    expect(await screen.findByRole('link', { name: /Empezar/i })).toHaveAttribute('href', '/terminal/acceso');
  });

  test('renders recoverable-error state with retry link to /terminal/acceso', async () => {
    server.use(
      http.get('/api/v1/auth/me', () => HttpResponse.error()),
      http.get('/api/v1/auth/csrf', () => HttpResponse.json({ data: { csrfToken: 'prelogin-csrf' } })),
    );

    renderAt('/terminal');

    expect(await screen.findByRole('heading', { level: 1, name: 'Terminal' })).toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent(
      'No fue posible comprobar tu sesión anterior. Puedes intentar acceder de nuevo.',
    );
    expect(screen.getByRole('link', { name: /Empezar/i })).toHaveAttribute('href', '/terminal/acceso');
  });

  test('renders anonymous welcome with Empezar CTA and live tabular date/time clock without errors', async () => {
    mockAnonymousSession();
    const { container } = renderAt('/terminal');

    expect(await screen.findByRole('heading', { level: 1, name: 'Terminal' })).toBeInTheDocument();
    const startLink = await screen.findByRole('link', { name: /Empezar/i });
    expect(startLink).toHaveAttribute('href', '/terminal/acceso');

    const dateEl = container.querySelector('#live-date');
    const timeEl = container.querySelector('#live-time');
    expect(dateEl).not.toBeNull();
    expect(timeEl).not.toBeNull();
    expect(dateEl?.textContent).toMatch(/de .+ \d{4}$/);
    expect(timeEl?.textContent).toMatch(/^\d{2}:\d{2} (AM|PM)$/);
  });

  test('filters welcome "Accesos de terminal" and shell nav links by CAJERO role', async () => {
    mockAuthenticatedSession(cajero);
    renderAt('/terminal');

    expect(await screen.findByRole('status')).toHaveTextContent('Sesión activa: Cajero Uno (CAJERO).');

    const shortcutsNav = screen.getByRole('navigation', { name: 'Accesos de terminal' });
    expect(within(shortcutsNav).getByRole('link', { name: 'Punto de venta' })).toHaveAttribute('href', '/terminal/pos');
    expect(within(shortcutsNav).getByRole('link', { name: 'Cocina' })).toHaveAttribute('href', '/terminal/cocina');
    expect(within(shortcutsNav).getByRole('link', { name: 'Caja' })).toHaveAttribute('href', '/terminal/caja');
    expect(within(shortcutsNav).queryByRole('link', { name: 'Administración' })).not.toBeInTheDocument();

    const shellNav = screen.getByRole('navigation', { name: 'Navegación de terminal' });
    expect(within(shellNav).getByRole('link', { name: 'Inicio' })).toHaveAttribute('href', '/terminal');
    expect(within(shellNav).getByRole('link', { name: 'POS' })).toHaveAttribute('href', '/terminal/pos');
    expect(within(shellNav).getByRole('link', { name: 'Cocina' })).toHaveAttribute('href', '/terminal/cocina');
    expect(within(shellNav).getByRole('link', { name: 'Caja' })).toHaveAttribute('href', '/terminal/caja');
    expect(within(shellNav).getByRole('link', { name: 'Disponibilidad' })).toHaveAttribute('href', '/terminal/disponibilidad');
    expect(within(shellNav).getByRole('link', { name: 'Historial' })).toHaveAttribute('href', '/terminal/historial');
    expect(within(shellNav).queryByRole('link', { name: 'Administración' })).not.toBeInTheDocument();
    expect(within(shellNav).getByRole('link', { name: 'Cliente' })).toHaveAttribute('href', '/cliente/iniciar-sesion');
  });

  test('filters welcome "Accesos de terminal" and shell nav links by PREPARACION role', async () => {
    mockAuthenticatedSession(preparacion);
    renderAt('/terminal');

    expect(await screen.findByRole('status')).toHaveTextContent('Sesión activa: Cocina Dos (PREPARACION).');

    const shortcutsNav = screen.getByRole('navigation', { name: 'Accesos de terminal' });
    expect(within(shortcutsNav).getByRole('link', { name: 'Cocina' })).toHaveAttribute('href', '/terminal/cocina');
    expect(within(shortcutsNav).queryByRole('link', { name: 'Punto de venta' })).not.toBeInTheDocument();
    expect(within(shortcutsNav).queryByRole('link', { name: 'Caja' })).not.toBeInTheDocument();
    expect(within(shortcutsNav).queryByRole('link', { name: 'Administración' })).not.toBeInTheDocument();

    const shellNav = screen.getByRole('navigation', { name: 'Navegación de terminal' });
    expect(within(shellNav).getByRole('link', { name: 'Inicio' })).toBeInTheDocument();
    expect(within(shellNav).getByRole('link', { name: 'POS' })).toBeInTheDocument();
    expect(within(shellNav).getByRole('link', { name: 'Cocina' })).toBeInTheDocument();
    expect(within(shellNav).getByRole('link', { name: 'Caja' })).toBeInTheDocument();
    expect(within(shellNav).queryByRole('link', { name: 'Disponibilidad' })).not.toBeInTheDocument();
    expect(within(shellNav).queryByRole('link', { name: 'Historial' })).not.toBeInTheDocument();
    expect(within(shellNav).queryByRole('link', { name: 'Administración' })).not.toBeInTheDocument();
  });

  test('filters welcome "Accesos de terminal" and shell nav links by ADMINISTRADOR role', async () => {
    mockAuthenticatedSession(administrador);
    renderAt('/terminal');

    expect(await screen.findByRole('status')).toHaveTextContent('Sesión activa: Admin Tres (ADMINISTRADOR).');

    const shortcutsNav = screen.getByRole('navigation', { name: 'Accesos de terminal' });
    expect(within(shortcutsNav).getByRole('link', { name: 'Punto de venta' })).toHaveAttribute('href', '/terminal/pos');
    expect(within(shortcutsNav).getByRole('link', { name: 'Cocina' })).toHaveAttribute('href', '/terminal/cocina');
    expect(within(shortcutsNav).getByRole('link', { name: 'Caja' })).toHaveAttribute('href', '/terminal/caja');
    expect(within(shortcutsNav).getByRole('link', { name: 'Administración' })).toHaveAttribute('href', '/terminal/administracion');

    const shellNav = screen.getByRole('navigation', { name: 'Navegación de terminal' });
    expect(within(shellNav).getByRole('link', { name: 'Disponibilidad' })).toBeInTheDocument();
    expect(within(shellNav).getByRole('link', { name: 'Historial' })).toBeInTheDocument();
    expect(within(shellNav).getByRole('link', { name: 'Administración' })).toBeInTheDocument();
  });

  test('shows session badge, handles logout failure alert, and succeeds on retry', async () => {
    let allowLogout = false;
    mockAuthenticatedSession(cajero);
    server.use(
      http.post('/api/v1/auth/logout', () => {
        if (!allowLogout) {
          return HttpResponse.json({ code: 'SERVER_ERROR' }, { status: 500 });
        }
        return HttpResponse.json({ data: { loggedOut: true } });
      }),
    );

    renderAt('/terminal');

    expect(await screen.findByText('Sesión: Cajero Uno')).toBeInTheDocument();
    const logoutBtn = screen.getByRole('button', { name: 'Cerrar sesión' });
    fireEvent.click(logoutBtn);

    expect(await screen.findByRole('alert')).toHaveTextContent('No fue posible cerrar la sesión. Inténtalo de nuevo.');

    allowLogout = true;
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByRole('link', { name: /Empezar/i })).toBeInTheDocument();
    expect(screen.queryByText('Sesión: Cajero Uno')).not.toBeInTheDocument();
  });

  test('hides Cliente link when window.cafeteriaDesktop.terminalOnly is true', async () => {
    window.cafeteriaDesktop = { terminalOnly: true };
    mockAnonymousSession();
    renderAt('/terminal');

    expect(await screen.findByRole('heading', { level: 1, name: 'Terminal' })).toBeInTheDocument();
    const shellNav = screen.getByRole('navigation', { name: 'Navegación de terminal' });
    expect(within(shellNav).queryByRole('link', { name: 'Cliente' })).not.toBeInTheDocument();
  });
});

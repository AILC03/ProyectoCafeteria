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
const gerente = { id: 'staff-4', name: 'Gerente Legacy', role: 'GERENTE', accountType: 'STAFF', mustChangePin: false };

function renderAt(path: string) {
  return render(
    <SessionProvider>
      <RouterProvider router={createTestRouter([path])} />
    </SessionProvider>,
  );
}

function anonymousSession(): void {
  server.use(
    http.get('/api/v1/auth/me', () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
    http.get('/api/v1/auth/csrf', () => HttpResponse.json({ data: { csrfToken: 'prelogin-csrf' } })),
    http.post('/api/v1/auth/refresh', () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
  );
}

function staffLogin(actor: typeof cajero): void {
  server.use(http.post('/api/v1/auth/login/staff', async ({ request }) => {
    const body = (await request.json()) as { username: string; password: string };
    expect(body).toEqual({ username: 'cajero1', password: 'password123' });
    expect(request.headers.get('X-CSRF-Token')).toBe('prelogin-csrf');
    return HttpResponse.json({ data: { user: actor, csrfToken: 'staff-session-csrf' } });
  }));
}

beforeEach(() => {
  server.use(
    http.get('/api/v1/categories', () => HttpResponse.json({ data: [], page: { limit: 100, nextCursor: null } })),
    http.get('/api/v1/products', () => HttpResponse.json({ data: [], page: { limit: 100, nextCursor: null } })),
  );
});

afterEach(() => {
  invalidateCsrfToken();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('Terminal staff authentication (TASK-13)', () => {
  test('validates inputs locally and reports invalid credentials without storing secrets', async () => {
    anonymousSession();
    server.use(http.post('/api/v1/auth/login/staff', () => HttpResponse.json({ code: 'INVALID_CREDENTIALS' }, { status: 401 })));
    renderAt('/terminal/acceso');

    const username = await screen.findByLabelText('Usuario');
    fireEvent.change(username, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión como personal' }));
    expect(await screen.findByText('Introduce un usuario válido de hasta 24 caracteres.')).toHaveAttribute('role', 'alert');

    fireEvent.change(username, { target: { value: ' cajero1 ' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión como personal' }));
    expect(await screen.findByText('La contraseña debe tener entre 8 y 24 caracteres.')).toHaveAttribute('role', 'alert');

    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión como personal' }));
    expect(await screen.findByText('Usuario o contraseña incorrectos.')).toHaveAttribute('role', 'alert');
    expect(localStorage.length).toBe(0);
    expect(localStorage.getItem('cafeteria:staff:password')).toBeNull();
  });

  test('keeps the recovery warning accessible without hiding the staff form or stealing focus', async () => {
    server.use(
      http.get('/api/v1/auth/me', () => HttpResponse.json({ code: 'TEMPORARY' }, { status: 503 })),
      http.post('/api/v1/auth/refresh', () => HttpResponse.json({ code: 'TEMPORARY' }, { status: 503 })),
    );
    renderAt('/terminal/acceso');
    const username = await screen.findByLabelText('Usuario');
    username.focus();
    expect(await screen.findByRole('alert')).toHaveTextContent('No fue posible comprobar tu sesión anterior.');
    expect(username).toHaveFocus();
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('type', 'password');
  });

  test('routes CAJERO to POS and exposes logout with failure handling', async () => {
    let allowLogout = false;
    anonymousSession();
    staffLogin(cajero);
    server.use(http.post('/api/v1/auth/logout', () => {
      if (!allowLogout) return HttpResponse.json({ code: 'TEMPORARY' }, { status: 503 });
      return new HttpResponse(null, { status: 204 });
    }));
    renderAt('/terminal/acceso');

    fireEvent.change(await screen.findByLabelText('Usuario'), { target: { value: '  cajero1  ' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión como personal' }));

    expect(await screen.findByRole('heading', { name: 'Punto de venta' })).toBeInTheDocument();
    expect(screen.getByText('Sesión: Cajero Uno')).toBeInTheDocument();
    expect(localStorage.length).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No fue posible cerrar la sesión.');
    expect(screen.getByRole('heading', { name: 'Punto de venta' })).toBeInTheDocument();

    allowLogout = true;
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByRole('heading', { name: 'Acceso no disponible' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Inicio' }));
    expect(await screen.findByRole('link', { name: 'Empezar' })).toBeInTheDocument();
  });

  test('routes PREPARACION to cocina and blocks POS', async () => {
    anonymousSession();
    staffLogin(preparacion);
    renderAt('/terminal/acceso');

    fireEvent.change(await screen.findByLabelText('Usuario'), { target: { value: 'cajero1' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión como personal' }));

    expect(await screen.findByRole('heading', { name: 'Cola de cocina' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'POS' }));
    expect(await screen.findByRole('heading', { name: 'Acceso no disponible' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Punto de venta' })).not.toBeInTheDocument();
  });

  test('grants ADMINISTRADOR access to every terminal area', async () => {
    anonymousSession();
    staffLogin(administrador);
    renderAt('/terminal/acceso');

    fireEvent.change(await screen.findByLabelText('Usuario'), { target: { value: 'cajero1' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión como personal' }));

    expect(await screen.findByRole('heading', { name: 'Punto de venta' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Administración' }));
    expect(await screen.findByRole('heading', { name: 'Administración' })).toBeInTheDocument();
  });

  test('rejects a legacy GERENTE actor returned by the API', async () => {
    anonymousSession();
    staffLogin(gerente);
    renderAt('/terminal/acceso');

    fireEvent.change(await screen.findByLabelText('Usuario'), { target: { value: 'cajero1' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión como personal' }));

    expect(await screen.findByText('Esta cuenta no tiene acceso permitido en la terminal.')).toHaveAttribute('role', 'alert');
    expect(screen.queryByText('Sesión: Gerente Legacy')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Usuario')).toBeInTheDocument();
  });

  test('restricts a staff login that reports mustChangePin', async () => {
    anonymousSession();
    server.use(http.post('/api/v1/auth/login/staff', () => HttpResponse.json({
      data: { user: { ...cajero, mustChangePin: true }, csrfToken: 'pin-csrf' },
    })));
    renderAt('/terminal/acceso');

    fireEvent.change(await screen.findByLabelText('Usuario'), { target: { value: 'cajero1' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión como personal' }));

    expect(await screen.findByRole('heading', { name: 'Cambio de NIP obligatorio' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Punto de venta' })).not.toBeInTheDocument();
  });

  test('shows a public welcome with entry when anonymous and role-specific links when authenticated', async () => {
    anonymousSession();
    const { unmount } = renderAt('/terminal');
    expect(await screen.findByRole('heading', { name: 'Terminal' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Empezar' })).toHaveAttribute('href', '/terminal/acceso');
    unmount();

    server.use(http.get('/api/v1/auth/me', () => HttpResponse.json({ data: preparacion })));
    renderAt('/terminal');
    expect(await screen.findByText(/Sesión activa: Cocina Dos/)).toBeInTheDocument();
    const shortcuts = within(screen.getByRole('navigation', { name: 'Accesos de terminal' }));
    expect(shortcuts.getByRole('link', { name: 'Cocina' })).toBeInTheDocument();
    expect(shortcuts.queryByRole('link', { name: 'Punto de venta' })).not.toBeInTheDocument();
  });

  test('requires a successful logout before switching an active staff user', async () => {
    let allowLogout = false;
    server.use(
      http.get('/api/v1/auth/me', () => HttpResponse.json({ data: cajero })),
      http.get('/api/v1/auth/csrf', () => HttpResponse.json({ data: { csrfToken: 'staff-csrf' } })),
      http.post('/api/v1/auth/logout', () => {
        if (!allowLogout) return HttpResponse.json({ code: 'TEMPORARY' }, { status: 503 });
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderAt('/terminal/acceso');

    expect(await screen.findByText(/Sesión de personal activa/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Usuario')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar de usuario' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No fue posible cerrar la sesión actual.');
    expect(screen.getByText(/Sesión de personal activa/)).toBeInTheDocument();

    allowLogout = true;
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar de usuario' }));
    expect(await screen.findByLabelText('Usuario')).toBeInTheDocument();
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, test } from 'vitest';
import { createTestRouter } from '../../../app/router';
import { invalidateCsrfToken } from '../../../shared/api/client';
import { SessionProvider } from '../../../shared/auth/SessionProvider';
import { CART_DRAFT_KEY, saveCartDraft } from '../../../shared/storage';
import { server } from '../../../test/server';
import { clearGuestSession } from './guestSession';

const customerActor = {
  id: 'customer-1',
  name: 'Mariana López',
  role: 'CLIENTE',
  accountType: 'CUSTOMER',
  mustChangePin: false,
};

const staffActor = {
  id: 'staff-1',
  name: 'Cajero Uno',
  role: 'CAJERO',
  accountType: 'STAFF',
  mustChangePin: false,
};

function renderAt(path: string) {
  return render(
    <SessionProvider>
      <RouterProvider router={createTestRouter([path])} />
    </SessionProvider>,
  );
}

afterEach(() => {
  invalidateCsrfToken();
  clearGuestSession();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('Client authentication and entry (TASK-09)', () => {
  test('supports accessible PIN entry, keyboard navigation, visibility toggle, and excludes ticket registration', async () => {
    server.use(http.get('/api/v1/auth/me', () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })));
    renderAt('/cliente/iniciar-sesion');

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(screen.getByLabelText('Teléfono o número de cliente')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Código de Registro del Ticket/i)).not.toBeInTheDocument();

    const digit1 = screen.getByLabelText('Dígito 1 del NIP');
    const digit2 = screen.getByLabelText('Dígito 2 del NIP');
    const digit3 = screen.getByLabelText('Dígito 3 del NIP');
    const digit4 = screen.getByLabelText('Dígito 4 del NIP');

    expect(digit1).toHaveAttribute('type', 'password');
    const toggle = screen.getByRole('button', { name: 'Mostrar NIP' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(digit1).toHaveAttribute('type', 'text');

    fireEvent.change(digit1, { target: { value: '1' } });
    expect(digit2).toHaveFocus();
    fireEvent.change(digit2, { target: { value: '2' } });
    expect(digit3).toHaveFocus();
    fireEvent.keyDown(digit3, { key: 'ArrowLeft' });
    expect(digit2).toHaveFocus();
    fireEvent.keyDown(digit2, { key: 'ArrowRight' });
    expect(digit3).toHaveFocus();
    fireEvent.change(digit3, { target: { value: '3' } });
    fireEvent.change(digit4, { target: { value: '4' } });
    expect(digit4).toHaveValue('4');

    fireEvent.keyDown(digit4, { key: 'Backspace' });
    expect(digit4).toHaveValue('');
    fireEvent.keyDown(digit4, { key: 'Backspace' });
    expect(digit3).toHaveFocus();
    expect(digit3).toHaveValue('');
  });

  test('validates inputs locally and reports invalid API credentials without emitting storage secrets', async () => {
    server.use(
      http.get('/api/v1/auth/me', () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
      http.get('/api/v1/auth/csrf', () => HttpResponse.json({ data: { csrfToken: 'prelogin-csrf' } })),
      http.post('/api/v1/auth/login/customer', () =>
        HttpResponse.json({ code: 'INVALID_CREDENTIALS', detail: 'Wrong PIN' }, { status: 401 }),
      ),
    );
    renderAt('/cliente/iniciar-sesion');

    const identifierInput = await screen.findByLabelText('Teléfono o número de cliente');
    fireEvent.change(identifierInput, { target: { value: 'invalid-email@test.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión como cliente' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('celular válido');

    fireEvent.change(identifierInput, { target: { value: '5512345678' } });
    fireEvent.change(screen.getByLabelText('Dígito 1 del NIP'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión como cliente' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Teléfono, número de cliente o NIP incorrectos.');
    expect(localStorage.length).toBe(0);
  });

  test('authenticates a customer, grants access to /cliente/cuenta, and supports logout with failure handling', async () => {
    let authenticated = false;
    let allowLogout = false;
    server.use(
      http.get('/api/v1/auth/me', () =>
        authenticated
          ? HttpResponse.json({ data: customerActor })
          : HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 }),
      ),
      http.get('/api/v1/auth/csrf', () => HttpResponse.json({ data: { csrfToken: 'prelogin-csrf' } })),
      http.post('/api/v1/auth/login/customer', async ({ request }) => {
        const body = (await request.json()) as { identifier: string; pin: string };
        expect(body).toEqual({ identifier: 'C000105', pin: '4321' });
        authenticated = true;
        return HttpResponse.json({ data: { user: customerActor, csrfToken: 'session-csrf' } });
      }),
      http.post('/api/v1/auth/logout', ({ request }) => {
        expect(request.headers.get('X-CSRF-Token')).toBe('session-csrf');
        if (!allowLogout) {
          return HttpResponse.json({ code: 'TEMPORARY' }, { status: 503 });
        }
        authenticated = false;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderAt('/cliente/iniciar-sesion');
    const identifierInput = await screen.findByLabelText('Teléfono o número de cliente');
    fireEvent.change(identifierInput, { target: { value: ' @C000105 ' } });
    fireEvent.change(screen.getByLabelText('Dígito 1 del NIP'), { target: { value: '4321' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión como cliente' }));

    expect(await screen.findByRole('heading', { name: 'Menú' })).toBeInTheDocument();
    expect(screen.getByText('Sesión: Mariana López')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Cuenta' }));
    expect(await screen.findByRole('heading', { name: 'Cuenta' })).toBeInTheDocument();

    // Failed logout preserves session and alerts user.
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No fue posible cerrar la sesión.');
    expect(screen.getByRole('heading', { name: 'Cuenta' })).toBeInTheDocument();

    // Successful logout clears session and returns to login page.
    allowLogout = true;
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(screen.queryByText('Sesión: Mariana López')).not.toBeInTheDocument();
  });

  test('supports explicit in-memory guest entry without writing to localStorage or granting /cliente/cuenta', async () => {
    server.use(http.get('/api/v1/auth/me', () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })));
    saveCartDraft({ version: 1, items: [{ productId: 'coffee-1', quantity: 1, optionValueIds: [] }] });

    renderAt('/cliente/iniciar-sesion');
    const guestNameInput = await screen.findByLabelText('Nombre para tu pedido (opcional)');
    fireEvent.change(guestNameInput, { target: { value: '  Ana  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar como invitado' }));

    expect(await screen.findByRole('heading', { name: 'Menú' })).toBeInTheDocument();
    expect(screen.getByText('Invitado: Ana')).toBeInTheDocument();
    expect(localStorage.getItem('taffy_is_guest')).toBeNull();
    expect(localStorage.getItem('taffy_guest_name')).toBeNull();

    // Guest cannot access private /cliente/cuenta route.
    fireEvent.click(screen.getByRole('link', { name: 'Cuenta' }));
    expect(await screen.findByRole('heading', { name: 'Acceso no disponible' })).toBeInTheDocument();

    // Exiting guest mode clears guest status and private draft.
    fireEvent.click(screen.getByRole('button', { name: 'Salir de invitado' }));
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(screen.queryByText('Invitado: Ana')).not.toBeInTheDocument();
    expect(localStorage.getItem(CART_DRAFT_KEY)).toBeNull();
  });

  test('blocks STAFF sessions from /cliente/menu and requires confirmed logout before replacing actor', async () => {
    let activeActor: typeof staffActor | null = staffActor;
    let allowLogout = false;
    server.use(
      http.get('/api/v1/auth/me', () =>
        activeActor !== null
          ? HttpResponse.json({ data: activeActor })
          : HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 }),
      ),
      http.get('/api/v1/auth/csrf', () => HttpResponse.json({ data: { csrfToken: 'staff-csrf' } })),
      http.post('/api/v1/auth/logout', () => {
        if (!allowLogout) {
          return HttpResponse.json({ code: 'TEMPORARY' }, { status: 503 });
        }
        activeActor = null;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderAt('/cliente/menu');
    expect(await screen.findByRole('heading', { name: 'Acceso no disponible' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Menú' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar a área de cliente' }));
    expect(await screen.findByRole('dialog', { name: 'Cambiar de sesión' })).toBeInTheDocument();
    expect(screen.getByText('Se cerrará la sesión de Cajero Uno para abrir el inicio de sesión de cliente.')).toBeInTheDocument();

    // Failed logout keeps dialog open and blocks access.
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión y continuar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No fue posible cerrar la sesión actual.');
    expect(screen.queryByRole('heading', { name: 'Menú' })).not.toBeInTheDocument();

    // Successful logout allows public menu access again.
    allowLogout = true;
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión y continuar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByRole('heading', { name: 'Menú' })).toBeInTheDocument();
  });

  test('requires confirmed logout before an authenticated CUSTOMER switches to guest mode', async () => {
    let authenticated = true;
    let allowLogout = false;
    server.use(
      http.get('/api/v1/auth/me', () =>
        authenticated
          ? HttpResponse.json({ data: customerActor })
          : HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 }),
      ),
      http.get('/api/v1/auth/csrf', () => HttpResponse.json({ data: { csrfToken: 'cust-csrf' } })),
      http.post('/api/v1/auth/logout', () => {
        if (!allowLogout) {
          return HttpResponse.json({ code: 'TEMPORARY' }, { status: 503 });
        }
        authenticated = false;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderAt('/cliente/iniciar-sesion');
    expect(await screen.findByText(/Sesión de cliente activa/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Teléfono o número de cliente')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Continuar como invitado' }));
    expect(await screen.findByRole('heading', { name: 'Confirmar salida de sesión' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cierre y continuar como invitado' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No fue posible cerrar la sesión actual');
    expect(screen.getByText(/Sesión de cliente activa/i)).toBeInTheDocument();

    allowLogout = true;
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cierre y continuar como invitado' }));
    expect(await screen.findByRole('heading', { name: 'Menú' })).toBeInTheDocument();
    expect(screen.getByText('Invitado: Invitado')).toBeInTheDocument();
  });

  test('ignores manipulated legacy localStorage keys and denies private client routes', async () => {
    localStorage.setItem('taffy_is_guest', 'true');
    localStorage.setItem('taffy_guest_name', 'AdminFalso');
    localStorage.setItem('taffy_account', JSON.stringify({ id: 'fake', role: 'CLIENTE' }));
    localStorage.setItem('coffees_current_employee', JSON.stringify({ id: 'fake', role: 'ADMINISTRADOR' }));

    server.use(http.get('/api/v1/auth/me', () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })));
    renderAt('/cliente/cuenta');

    expect(await screen.findByRole('heading', { name: 'Acceso no disponible' })).toBeInTheDocument();
    expect(screen.queryByText('Sesión: AdminFalso')).not.toBeInTheDocument();
  });

  test('redirects to mandatory PIN change screen when customer login returns mustChangePin', async () => {
    server.use(
      http.get('/api/v1/auth/me', () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
      http.get('/api/v1/auth/csrf', () => HttpResponse.json({ data: { csrfToken: 'prelogin-csrf' } })),
      http.post('/api/v1/auth/login/customer', () =>
        HttpResponse.json({
          data: { user: { ...customerActor, mustChangePin: true }, csrfToken: 'pin-csrf' },
        }),
      ),
    );
    renderAt('/cliente/iniciar-sesion');

    const identifierInput = await screen.findByLabelText('Teléfono o número de cliente');
    fireEvent.change(identifierInput, { target: { value: '5512345678' } });
    fireEvent.change(screen.getByLabelText('Dígito 1 del NIP'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión como cliente' }));

    expect(await screen.findByRole('heading', { name: 'Cambio de NIP obligatorio' })).toBeInTheDocument();
  });

  test('allows retrying session verification after a recoverable bootstrap failure', async () => {
    let attempts = 0;
    server.use(
      http.get('/api/v1/auth/me', () => {
        attempts += 1;
        return attempts === 1
          ? HttpResponse.json({ code: 'TEMPORARY' }, { status: 503 })
          : HttpResponse.json({ data: customerActor });
      }),
    );
    renderAt('/cliente/iniciar-sesion');

    const retryButton = await screen.findByRole('button', { name: 'Reintentar verificación' });
    fireEvent.click(retryButton);

    expect(await screen.findByText(/Sesión de cliente activa/i)).toBeInTheDocument();
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createTestRouter } from '../../../app/router';
import { invalidateCsrfToken } from '../../../shared/api/client';
import { clearIdempotencyOperations } from '../../../shared/api/idempotency';
import { SessionProvider } from '../../../shared/auth/SessionProvider';
import { server } from '../../../test/server';

const openSession = {
  id: '1',
  employeeId: '2',
  openedAt: '2099-01-01T12:00:00.000Z',
  closedAt: null,
  closedByEmployeeId: null,
  exceptionalCloseReason: null,
  openingAmountCents: '50000',
  expectedCashCents: null,
  countedCashCents: null,
  differenceCents: null,
  cashSalesCents: '0',
  successfulPayments: '0',
  computedExpectedCashCents: '50000',
};
const closedSession = {
  ...openSession,
  closedAt: '2099-01-01T13:00:00.000Z',
  closedByEmployeeId: '2',
  expectedCashCents: '50000',
  countedCashCents: '49000',
  differenceCents: '-1000',
};

function renderCash() {
  render(
    <SessionProvider>
      <RouterProvider router={createTestRouter(['/terminal/caja'])} />
    </SessionProvider>,
  );
}

function authenticate(actor: { id: string; name: string; role: string }) {
  server.use(http.get('/api/v1/auth/me', () => HttpResponse.json({
    data: { ...actor, accountType: 'STAFF', mustChangePin: false },
  })));
}

beforeEach(() => {
  server.use(http.get('/api/v1/auth/csrf', () => HttpResponse.json({ data: { csrfToken: 'csrf-test' } })));
});

afterEach(() => {
  invalidateCsrfToken();
  clearIdempotencyOperations();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('Terminal cash sessions (TASK-14)', () => {
  test('opens and closes the responsible cashier session with exact idempotent bodies', async () => {
    authenticate({ id: '2', name: 'Cajero Uno', role: 'CAJERO' });
    const bodies: unknown[] = [];
    const keys: Array<string | undefined> = [];
    server.use(
      http.get('/api/v1/cash-sessions/current', () => HttpResponse.json({ data: null })),
      http.get('/api/v1/auth/csrf', () => HttpResponse.json({ data: { csrfToken: 'csrf-test' } })),
      http.post('/api/v1/cash-sessions', async ({ request }) => {
        bodies.push(await request.json());
        keys.push(request.headers.get('Idempotency-Key') ?? undefined);
        return HttpResponse.json({ data: openSession }, { status: 201 });
      }),
      http.post('/api/v1/cash-sessions/1/close', async ({ request }) => {
        bodies.push(await request.json());
        keys.push(request.headers.get('Idempotency-Key') ?? undefined);
        return HttpResponse.json({ data: closedSession });
      }),
    );

    renderCash();
    expect(await screen.findByRole('heading', { name: 'Caja cerrada' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Fondo inicial (MXN)'), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir caja' }));
    expect(await screen.findByRole('heading', { name: 'Caja abierta' })).toBeInTheDocument();
    expect(screen.getByText('Caja abierta con fondo $500.00.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Motivo de cierre excepcional')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Efectivo contado (MXN)'), { target: { value: '490' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar caja' }));
    expect(await screen.findByText(/Caja cerrada. Diferencia calculada por el servidor: -\$10\.00/)).toBeInTheDocument();
    expect(bodies).toEqual([{ openingAmountCents: '50000' }, { countedCashCents: '49000' }]);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(keys[0]).not.toBe(keys[1]);
  });

  test('only offers an exceptional close reason to an administrator closing another session', async () => {
    authenticate({ id: '3', name: 'Admin Tres', role: 'ADMINISTRADOR' });
    let closeBody: unknown;
    server.use(
      http.get('/api/v1/cash-sessions/current', () => HttpResponse.json({ data: openSession })),
      http.post('/api/v1/cash-sessions/1/close', async ({ request }) => {
        closeBody = await request.json();
        return HttpResponse.json({ data: { ...closedSession, closedByEmployeeId: '3' } });
      }),
    );

    renderCash();
    expect(await screen.findByRole('heading', { name: 'Caja abierta' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Efectivo contado (MXN)'), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar caja' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('motivo para cerrar una caja ajena');

    fireEvent.change(screen.getByLabelText('Motivo de cierre excepcional'), { target: { value: 'Cajero ausente' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar caja' }));
    expect(await screen.findByRole('heading', { name: 'Última sesión cerrada' })).toBeInTheDocument();
    expect(closeBody).toEqual({ countedCashCents: '50000', exceptionalCloseReason: 'Cajero ausente' });
  });

  test('hides close controls from a cashier who does not own the session and reports 403/409', async () => {
    authenticate({ id: '4', name: 'Otro Cajero', role: 'CAJERO' });
    server.use(http.get('/api/v1/cash-sessions/current', () => HttpResponse.json({ data: openSession })));
    renderCash();
    expect(await screen.findByRole('heading', { name: 'Caja abierta' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Sólo el responsable de la caja puede cerrarla');
    expect(screen.queryByRole('button', { name: 'Cerrar caja' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Motivo de cierre excepcional')).not.toBeInTheDocument();
  });

  test('reports an unverifiable open response without allowing a second attempt', async () => {
    authenticate({ id: '2', name: 'Cajero Uno', role: 'CAJERO' });
    server.use(
      http.get('/api/v1/cash-sessions/current', () => HttpResponse.json({ data: null })),
      http.post('/api/v1/cash-sessions', () => HttpResponse.json({ data: { id: '1' } }, { status: 201 })),
    );
    renderCash();
    fireEvent.change(await screen.findByLabelText('Fondo inicial (MXN)'), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir caja' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No repitas la operación');
    expect(screen.getByRole('button', { name: 'Abrir caja' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Reintentar la misma operación de caja' })).not.toBeInTheDocument();
  });
});

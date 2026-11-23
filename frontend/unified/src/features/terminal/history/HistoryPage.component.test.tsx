import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, test } from 'vitest';
import { createTestRouter } from '../../../app/router';
import { invalidateCsrfToken } from '../../../shared/api/client';
import { clearIdempotencyOperations } from '../../../shared/api/idempotency';
import { SessionProvider } from '../../../shared/auth/SessionProvider';
import { server } from '../../../test/server';

const cajero = { id: '2', name: 'Cajero Uno', role: 'CAJERO', accountType: 'STAFF', mustChangePin: false };
const preparacion = { id: '3', name: 'Cocina Uno', role: 'PREPARACION', accountType: 'STAFF', mustChangePin: false };
const sale = { id: '9', saleNumber: 'V000009', orderId: '7', paymentId: '8', totalCents: '6500', soldAt: '2099-01-01T12:00:00.000Z', method: 'CASH' };
const summary = { count: '1', totalCents: '6500', cashCents: '6500', stripeCents: '0' };
const token = 'a'.repeat(43);
const ticket = {
  saleId: '9', saleNumber: 'V000009', orderFolio: 'A000007', soldAt: '2099-01-01T12:00:00.000Z',
  currency: 'MXN', totalCents: '6500', cashReceivedCents: '7000', changeCents: '500',
  items: [{ productName: 'Latte', quantity: 1, unitPriceCents: '6500', lineTotalCents: '6500' }],
  registration: { purpose: 'CUSTOMER_REGISTRATION', token, qrPayload: `cafeteria:register:${token}`, expiresAt: '2099-01-02T12:00:00.000Z' },
};

function renderHistory(actor = cajero) {
  server.use(http.get('/api/v1/auth/me', () => HttpResponse.json({ data: actor })));
  render(
    <SessionProvider>
      <RouterProvider router={createTestRouter(['/terminal/historial'])} />
    </SessionProvider>,
  );
}

afterEach(() => {
  invalidateCsrfToken();
  clearIdempotencyOperations();
  localStorage.clear();
});

describe('Terminal operational history (TASK-17)', () => {
  test('lists sales and totals, then reprints without charging or issuing ticket access', async () => {
    let posts = 0;
    let ticketAccessCalls = 0;
    let ticketGets = 0;
    server.use(
      http.get('/api/v1/sales', () => HttpResponse.json({ data: [sale], page: { limit: 20, nextCursor: null } })),
      http.get('/api/v1/sales/summary', () => HttpResponse.json({ data: summary })),
      http.get('/api/v1/sales/9/ticket', () => { ticketGets += 1; return HttpResponse.json({ data: ticket }); }),
      http.get('/api/v1/sales/9/ticket-access', () => { ticketAccessCalls += 1; return HttpResponse.json({ code: 'NOT_FOUND' }, { status: 404 }); }),
      http.post('*', () => { posts += 1; return HttpResponse.json({}); }),
    );

    renderHistory();
    expect(await screen.findByRole('heading', { name: 'Historial y ventas' })).toBeInTheDocument();
    expect(await screen.findByText('V000009')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Historial' })).toHaveAttribute('href', '/terminal/historial');
    expect(screen.queryByRole('link', { name: /historial personal/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reimprimir ticket V000009' }));
    expect(await screen.findByRole('heading', { name: 'Ticket reimpreso' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ticket V000009' })).toBeInTheDocument();
    expect(screen.queryByText(token, { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByText(/cafeteria:register/i)).not.toBeInTheDocument();
    expect(posts).toBe(0);
    expect(ticketAccessCalls).toBe(0);
    expect(ticketGets).toBe(1);
  });

  test('shows an empty state when there are no sales', async () => {
    server.use(
      http.get('/api/v1/sales', () => HttpResponse.json({ data: [], page: { limit: 20, nextCursor: null } })),
      http.get('/api/v1/sales/summary', () => HttpResponse.json({ data: { count: '0', totalCents: '0', cashCents: '0', stripeCents: '0' } })),
    );
    renderHistory();
    const empty = await screen.findByText(/No hay ventas/);
    expect(empty).toHaveAttribute('role', 'status');
  });

  test('shows a denied message for 403 and does not render private data', async () => {
    server.use(
      http.get('/api/v1/sales', () => HttpResponse.json({ code: 'FORBIDDEN' }, { status: 403 })),
      http.get('/api/v1/sales/summary', () => HttpResponse.json({ code: 'FORBIDDEN' }, { status: 403 })),
    );
    renderHistory();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Sólo caja y administración/);
    expect(screen.queryByText('V000009')).not.toBeInTheDocument();
  });

  test('reports a missing sale when reprinting returns 404 without another charge', async () => {
    let posts = 0;
    server.use(
      http.get('/api/v1/sales', () => HttpResponse.json({ data: [sale], page: { limit: 20, nextCursor: null } })),
      http.get('/api/v1/sales/summary', () => HttpResponse.json({ data: summary })),
      http.get('/api/v1/sales/9/ticket', () => HttpResponse.json({ code: 'NOT_FOUND' }, { status: 404 })),
      http.post('*', () => { posts += 1; return HttpResponse.json({}); }),
    );
    renderHistory();
    fireEvent.click(await screen.findByRole('button', { name: 'Reimprimir ticket V000009' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/la venta no existe/);
    expect(screen.queryByRole('heading', { name: 'Ticket reimpreso' })).not.toBeInTheDocument();
    expect(posts).toBe(0);
  });

  test('uses opaque cursors only on explicit pagination actions', async () => {
    const cursors: Array<string | null> = [];
    server.use(
      http.get('/api/v1/sales', ({ request }) => {
        cursors.push(new URL(request.url).searchParams.get('cursor'));
        return HttpResponse.json({
          data: [sale],
          page: { limit: 20, nextCursor: cursors.length === 1 ? 'opaque-2' : null },
        });
      }),
      http.get('/api/v1/sales/summary', () => HttpResponse.json({ data: summary })),
    );
    renderHistory();
    expect(await screen.findByText('V000009')).toBeInTheDocument();
    expect(cursors).toEqual([null]);
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(await screen.findByText('Página 2')).toBeInTheDocument();
    expect(cursors).toEqual([null, 'opaque-2']);
    fireEvent.click(screen.getByRole('button', { name: 'Página anterior' }));
    expect(await screen.findByText('Página 1')).toBeInTheDocument();
    expect(cursors).toEqual([null, 'opaque-2', null]);
  });

  test('reprints a STRIPE ticket without cash amounts or a new charge', async () => {
    let posts = 0;
    const stripeSale = { ...sale, id: '10', saleNumber: 'V000010', method: 'STRIPE', totalCents: '3500' };
    const stripeTicket = { ...ticket, saleId: '10', saleNumber: 'V000010', totalCents: '3500', cashReceivedCents: null, changeCents: null, registration: null };
    server.use(
      http.get('/api/v1/sales', () => HttpResponse.json({ data: [stripeSale], page: { limit: 20, nextCursor: null } })),
      http.get('/api/v1/sales/summary', () => HttpResponse.json({ data: { count: '1', totalCents: '3500', cashCents: '0', stripeCents: '3500' } })),
      http.get('/api/v1/sales/10/ticket', () => HttpResponse.json({ data: stripeTicket })),
      http.post('*', () => { posts += 1; return HttpResponse.json({}); }),
    );
    renderHistory();
    fireEvent.click(await screen.findByRole('button', { name: 'Reimprimir ticket V000010' }));
    expect(await screen.findByRole('heading', { name: 'Ticket reimpreso' })).toBeInTheDocument();
    expect(screen.getByText(/Total:/)).toHaveTextContent('$35.00');
    expect(screen.queryByText(/Recibido:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Cambio:/)).not.toBeInTheDocument();
    expect(posts).toBe(0);
  });

  test('ignores repeated pagination clicks while a request is in flight', async () => {
    const cursors: Array<string | null> = [];
    let release: ((value: Response) => void) | undefined;
    server.use(
      http.get('/api/v1/sales', ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        cursors.push(cursor);
        if (cursor !== null) return new Promise<Response>((resolve) => { release = resolve; });
        return HttpResponse.json({ data: [sale], page: { limit: 20, nextCursor: 'opaque-2' } });
      }),
      http.get('/api/v1/sales/summary', () => HttpResponse.json({ data: summary })),
    );
    renderHistory();
    expect(await screen.findByText('V000009')).toBeInTheDocument();
    const next = screen.getByRole('button', { name: 'Página siguiente' });
    fireEvent.click(next);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeDisabled());
    fireEvent.click(next);
    expect(cursors).toEqual([null, 'opaque-2']);
    release?.(HttpResponse.json({ data: [sale], page: { limit: 20, nextCursor: null } }));
    expect(await screen.findByText('Página 2')).toBeInTheDocument();
  });

  test('returns focus to the reprint button when the ticket is closed', async () => {
    server.use(
      http.get('/api/v1/sales', () => HttpResponse.json({ data: [sale], page: { limit: 20, nextCursor: null } })),
      http.get('/api/v1/sales/summary', () => HttpResponse.json({ data: summary })),
      http.get('/api/v1/sales/9/ticket', () => HttpResponse.json({ data: ticket })),
    );
    renderHistory();
    const reprint = await screen.findByRole('button', { name: 'Reimprimir ticket V000009' });
    fireEvent.click(reprint);
    expect(await screen.findByRole('heading', { name: 'Ticket reimpreso' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar ticket' }));
    await waitFor(() => expect(reprint).toHaveFocus());
  });

  test('blocks preparation staff from the operational history route', async () => {
    renderHistory(preparacion);
    expect(await screen.findByRole('heading', { name: 'Acceso no disponible' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Historial' })).not.toBeInTheDocument();
  });
});

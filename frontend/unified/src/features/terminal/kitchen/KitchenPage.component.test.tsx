import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createTestRouter } from '../../../app/router';
import { invalidateCsrfToken, setCsrfToken } from '../../../shared/api/client';
import { clearIdempotencyOperations } from '../../../shared/api/idempotency';
import { SessionProvider } from '../../../shared/auth/SessionProvider';
import { server } from '../../../test/server';

const preparacion = { id: '3', name: 'Cocina Uno', role: 'PREPARACION', accountType: 'STAFF', mustChangePin: false };
const cliente = { id: '1', name: 'Cliente', role: 'CLIENTE', accountType: 'CUSTOMER', mustChangePin: false };
const summary = { id: '7', folio: 'A000007', guestName: 'Ana', status: 'EN_PREPARACION', createdAt: '2099-01-01T12:00:00.000Z' };
const option = { optionValueId: '5', groupName: 'Tamaño', optionName: 'Grande', surchargeCents: '500' };
const item = { id: '11', productId: '10', productName: 'Latte', basePriceCents: '6000', unitPriceCents: '6500', quantity: 1, lineTotalCents: '6500', options: [option] };
const order = {
  id: '7', folio: 'A000007', source: 'CASHIER', status: 'EN_PREPARACION', paymentMethod: 'CASH',
  totalCents: '6500', customerId: null, guestName: 'Ana',
  paymentExpiresAt: '2099-01-01T12:30:00.000Z', paidAt: '2099-01-01T12:05:00.000Z',
  readyAt: null, readyByEmployeeId: null, createdAt: '2099-01-01T12:00:00.000Z', items: [item],
};

function renderKitchen(actor = preparacion, path = '/terminal/cocina') {
  server.use(http.get('/api/v1/auth/me', () => HttpResponse.json({ data: actor })));
  render(<SessionProvider><RouterProvider router={createTestRouter([path])} /></SessionProvider>);
}

beforeEach(() => { setCsrfToken('csrf-test'); });
afterEach(() => {
  invalidateCsrfToken();
  clearIdempotencyOperations();
  localStorage.clear();
});

describe('Terminal kitchen (TASK-18)', () => {
  test('shows the queue with contract option names and removes an order after a verified LISTO', async () => {
    let posts = 0;
    const bodies: unknown[] = [];
    server.use(
      http.get('/api/v1/preparation/orders', () => HttpResponse.json({ data: [summary], page: { limit: 20, nextCursor: null } })),
      http.get('/api/v1/orders/7', () => HttpResponse.json({ data: order })),
      http.post('/api/v1/orders/7/ready', async ({ request }) => {
        posts += 1;
        bodies.push(await request.json());
        return HttpResponse.json({ data: { ...order, status: 'LISTO', readyAt: '2099-01-01T12:10:00.000Z', readyByEmployeeId: '3' } });
      }),
    );
    renderKitchen();
    expect(await screen.findByRole('heading', { name: 'Orden A000007' })).toBeInTheDocument();
    expect(screen.getByText('Grande')).toBeInTheDocument();
    expect(screen.getByText('$65.00')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Marcar orden A000007 como LISTO' }));
    expect(await screen.findByText(/marcada como LISTO/)).toHaveTextContent('marcada como LISTO');
    expect(screen.queryByRole('heading', { name: 'Orden A000007' })).not.toBeInTheDocument();
    expect(posts).toBe(1);
    expect(bodies).toEqual([{}]);
  });

  test('a 409 refreshes the queue once, reports the conflict and never replays the mutation', async () => {
    let lists = 0;
    let readyCalls = 0;
    server.use(
      http.get('/api/v1/preparation/orders', () => {
        lists += 1;
        return HttpResponse.json({ data: [summary], page: { limit: 20, nextCursor: null } });
      }),
      http.get('/api/v1/orders/7', () => HttpResponse.json({ data: order })),
      http.post('/api/v1/orders/7/ready', () => {
        readyCalls += 1;
        return HttpResponse.json({ status: 409, code: 'ORDER_CONFLICT', title: 'Conflicto', detail: 'La orden ya no está en preparación.' }, { status: 409 });
      }),
    );
    renderKitchen();
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar orden A000007 como LISTO' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/ya no está en preparación/i);
    await waitFor(() => expect(lists).toBe(2));
    expect(readyCalls).toBe(1);
    expect(screen.getByRole('heading', { name: 'Orden A000007' })).toBeInTheDocument();
  });

  test('a failed detail never leaves a loading placeholder or enables LISTO', async () => {
    server.use(
      http.get('/api/v1/preparation/orders', () => HttpResponse.json({ data: [summary], page: { limit: 20, nextCursor: null } })),
      http.get('/api/v1/orders/7', () => HttpResponse.json({ status: 404, title: 'No encontrado' }, { status: 404 })),
    );
    renderKitchen();
    expect(await screen.findByText(/Detalle no disponible/)).toBeInTheDocument();
    expect(screen.queryByText('Cargando detalle…')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Marcar orden A000007 como LISTO' })).toBeDisabled();
  });

  test('shows an empty queue and blocks stale pagination clicks', async () => {
    const cursors: Array<string | null> = [];
    let release: ((value: Response) => void) | undefined;
    server.use(
      http.get('/api/v1/preparation/orders', ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        cursors.push(cursor);
        if (cursor !== null) return new Promise<Response>((resolve) => { release = resolve; });
        return HttpResponse.json({ data: [summary], page: { limit: 20, nextCursor: 'opaque-2' } });
      }),
      http.get('/api/v1/orders/7', () => HttpResponse.json({ data: order })),
    );
    renderKitchen();
    expect(await screen.findByRole('heading', { name: 'Orden A000007' })).toBeInTheDocument();
    const next = screen.getByRole('button', { name: 'Página siguiente' });
    fireEvent.click(next);
    await waitFor(() => expect(next).toBeDisabled());
    fireEvent.click(next);
    expect(cursors).toEqual([null, 'opaque-2']);
    release?.(HttpResponse.json({ data: [], page: { limit: 20, nextCursor: null } }));
    expect(await screen.findByText('No hay órdenes en preparación.')).toBeInTheDocument();
  });

  test('denies client and unauthorised staff without calling the preparation API', async () => {
    for (const [actor, path] of [
      [cliente, '/terminal/cocina'],
      [cliente, '/terminal/disponibilidad'],
      [preparacion, '/terminal/disponibilidad'],
    ] as const) {
      let calls = 0;
      server.use(
        http.get('/api/v1/auth/me', () => HttpResponse.json({ data: actor })),
        http.get('/api/v1/preparation/orders', () => { calls += 1; return HttpResponse.json({ data: [], page: { limit: 20, nextCursor: null } }); }),
        http.get('/api/v1/products', () => { calls += 1; return HttpResponse.json({ data: [], page: { limit: 100, nextCursor: null } }); }),
      );
      const view = render(<SessionProvider><RouterProvider router={createTestRouter([path])} /></SessionProvider>);
      expect(await screen.findByRole('heading', { name: 'Acceso no disponible' })).toBeInTheDocument();
      expect(calls).toBe(0);
      view.unmount();
    }
  });
});

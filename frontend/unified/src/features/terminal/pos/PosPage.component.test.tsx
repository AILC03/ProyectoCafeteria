import { fireEvent, render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createTestRouter } from '../../../app/router';
import { invalidateCsrfToken } from '../../../shared/api/client';
import { clearIdempotencyOperations } from '../../../shared/api/idempotency';
import { SessionProvider } from '../../../shared/auth/SessionProvider';
import { server } from '../../../test/server';

const cajero = { id: '2', name: 'Cajero Uno', role: 'CAJERO', accountType: 'STAFF', mustChangePin: false };
const product = {
  id: '10',
  categoryId: '1',
  name: 'Latte',
  description: null,
  imageUrl: null,
  isAvailable: true,
  basePriceCents: '6500',
};
const options = [{
  id: 'g-size',
  name: 'Tamaño',
  pricingScope: 'PER_PRODUCT',
  minSelections: 1,
  maxSelections: 1,
  values: [{ id: '5', name: 'Mediano', surchargeCents: '0', isAvailable: true }],
}];
const pendingOrder = {
  id: '7',
  folio: 'A000007',
  source: 'CASHIER',
  status: 'PENDIENTE_PAGO',
  paymentMethod: 'CASH',
  totalCents: '6500',
  customerId: '10',
  guestName: null,
  paymentExpiresAt: '2099-01-01T12:30:00.000Z',
  paidAt: null,
  readyAt: null,
  readyByEmployeeId: null,
  createdAt: '2099-01-01T12:00:00.000Z',
  items: [{
    id: '1', productId: '10', productName: 'Latte', basePriceCents: '6500', unitPriceCents: '6500',
    quantity: 1, lineTotalCents: '6500', options: [],
  }],
};

function renderPos() {
  return render(
    <SessionProvider>
      <RouterProvider router={createTestRouter(['/terminal/pos'])} />
    </SessionProvider>,
  );
}

beforeEach(() => {
  server.use(
    http.get('/api/v1/auth/me', () => HttpResponse.json({ data: cajero })),
    http.get('/api/v1/auth/csrf', () => HttpResponse.json({ data: { csrfToken: 'csrf-test' } })),
    http.get('/api/v1/products', () => HttpResponse.json({ data: [product], page: { limit: 100, nextCursor: null } })),
    http.get('/api/v1/products/10', () => HttpResponse.json({ data: product })),
    http.get('/api/v1/products/10/options', () => HttpResponse.json({ data: options })),
  );
});

afterEach(() => {
  invalidateCsrfToken();
  clearIdempotencyOperations();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('Terminal POS (TASK-14)', () => {
  test('creates a pending cashier order with a searched customer and no payment claim', async () => {
    let orderBody: unknown;
    let orderKey: string | undefined;
    let searchBody: unknown;
    let patchBody: unknown;
    server.use(
      http.post('/api/v1/cashier/customers/search', async ({ request }) => {
        searchBody = await request.json();
        return HttpResponse.json({ data: { id: '10', name: 'Cliente Uno', customerNumber: 'C10' } });
      }),
      http.post('/api/v1/cashier/orders', async ({ request }) => {
        orderBody = await request.json();
        orderKey = request.headers.get('Idempotency-Key') ?? undefined;
        expect(request.headers.get('X-CSRF-Token')).toBe('csrf-test');
        return HttpResponse.json({ data: pendingOrder }, { status: 201 });
      }),
      http.patch('/api/v1/cashier/orders/7/customer', async ({ request }) => {
        patchBody = await request.json();
        return HttpResponse.json({ data: pendingOrder });
      }),
    );

    renderPos();
    await screen.findByRole('heading', { name: 'Punto de venta' });
    fireEvent.click(await screen.findByRole('button', { name: 'Personalizar Latte' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar personalización' }));
    expect(await screen.findByText('1 × Latte (Mediano)')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Teléfono o número de cliente'), { target: { value: 'c10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar cliente' }));
    expect(await screen.findByText('Cliente encontrado: Cliente Uno (C10). Confirma el nombre antes de usarlo.')).toBeInTheDocument();
    expect(searchBody).toEqual({ identifier: 'C10' });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cliente' }));

    fireEvent.click(screen.getByRole('button', { name: 'Crear orden pendiente' }));
    expect(await screen.findByText(/Orden A000007 creada/)).toBeInTheDocument();
    expect(orderBody).toEqual({
      paymentMethod: 'CASH',
      items: [{ productId: '10', quantity: 1, optionValueIds: ['5'] }],
      customer: { identifier: 'C10', confirmedName: 'Cliente Uno' },
    });
    expect(orderKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(screen.getByText('Crear la orden no confirma el pago ni genera un QR.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Asociar cliente' }));
    expect(await screen.findByText('Cliente asociado a la orden A000007.')).toBeInTheDocument();
    expect(patchBody).toEqual({ identifier: 'C10', confirmedName: 'Cliente Uno' });
  });

  test('blocks new orders after an unverifiable 201 response', async () => {
    server.use(http.post('/api/v1/cashier/orders', () => HttpResponse.json({ data: { id: '7' } }, { status: 201 })));
    renderPos();
    fireEvent.click(await screen.findByRole('button', { name: 'Personalizar Latte' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar personalización' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Crear orden pendiente' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('confirma con la cafetería');
    expect(screen.getByRole('button', { name: 'Crear orden pendiente' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Reintentar la misma orden' })).not.toBeInTheDocument();
  });

  test('shows a safe 409 message when the order can no longer accept a customer', async () => {
    server.use(
      http.post('/api/v1/cashier/customers/search', () => HttpResponse.json({ data: { id: '10', name: 'Cliente Uno', customerNumber: 'C10' } })),
      http.patch('/api/v1/cashier/orders/7/customer', () => HttpResponse.json({ code: 'ORDER_CONFLICT' }, { status: 409 })),
    );
    renderPos();
    fireEvent.change(await screen.findByLabelText('Teléfono o número de cliente'), { target: { value: 'C10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar cliente' }));
    await screen.findByText(/Confirma el nombre antes de usarlo/);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cliente' }));
    fireEvent.change(screen.getByLabelText('ID de orden pendiente'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Asociar cliente' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ya no permite asociar clientes');
  });

  test('adopts the compatible order returned by association as the POS-selected payment order', async () => {
    server.use(
      http.post('/api/v1/cashier/customers/search', () => HttpResponse.json({ data: { id: '10', name: 'Cliente Uno', customerNumber: 'C10' } })),
      http.patch('/api/v1/cashier/orders/7/customer', () => HttpResponse.json({ data: pendingOrder })),
    );
    renderPos();
    fireEvent.change(await screen.findByLabelText('Teléfono o número de cliente'), { target: { value: 'C10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar cliente' }));
    await screen.findByText(/Confirma el nombre antes de usarlo/);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cliente' }));
    fireEvent.change(screen.getByLabelText('ID de orden pendiente'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Asociar cliente' }));
    expect(await screen.findByRole('link', { name: 'Cobrar efectivo' })).toHaveAttribute('href', '/terminal/cobro');
  });
});

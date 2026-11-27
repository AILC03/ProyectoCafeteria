import { fireEvent, render, screen, within } from '@testing-library/react';
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
const openCashSession = {
  id: '1',
  employeeId: '2',
  openedAt: '2099-01-01T12:00:00.000Z',
  closedAt: null,
  closedByEmployeeId: null,
  exceptionalCloseReason: null,
  openingAmountCents: '0',
  expectedCashCents: null,
  countedCashCents: null,
  differenceCents: null,
  cashSalesCents: '0',
  successfulPayments: '0',
  computedExpectedCashCents: '0',
};
const paidResult = {
  payment: {
    id: '8', orderId: '7', method: 'CASH', status: 'SUCCEEDED', amountCents: '6500', currency: 'MXN',
    cashierId: '2', cashSessionId: '1', cashReceivedCents: '7000', changeCents: '500',
    confirmedAt: '2099-01-01T12:00:00.000Z',
  },
  sale: { id: '9', saleNumber: 'V000009', orderId: '7', paymentId: '8', totalCents: '6500', soldAt: '2099-01-01T12:00:00.000Z' },
  order: { id: '7', folio: 'A000007', status: 'EN_PREPARACION', paidAt: '2099-01-01T12:00:00.000Z' },
  ticket: { saleId: '9', path: '/api/v1/sales/9/ticket' },
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
    http.get('/api/v1/categories', () => HttpResponse.json({ data: [], page: { limit: 100, nextCursor: null } })),
    http.get('/api/v1/products', () => HttpResponse.json({ data: [product], page: { limit: 100, nextCursor: null } })),
    http.get('/api/v1/products/10', () => HttpResponse.json({ data: product })),
    http.get('/api/v1/products/10/options', () => HttpResponse.json({ data: options })),
    http.get('/api/v1/cash-sessions/current', () => HttpResponse.json({ data: null })),
  );
});

afterEach(() => {
  invalidateCsrfToken();
  clearIdempotencyOperations();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('Terminal POS (TASK-14)', () => {
  test('keeps the product catalog usable when only category loading fails', async () => {
    server.use(http.get('/api/v1/categories', () => HttpResponse.json({ code: 'TEMPORARY' }, { status: 503 })));
    renderPos();
    expect(await screen.findByRole('button', { name: /Personalizar.*Latte.*\$65\.00/ })).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent('No se pudieron cargar las categorías');
    expect(screen.getByRole('button', { name: 'Reintentar categorías' })).toBeEnabled();
  });

  test('filters API categories and products without enabling unavailable items or losing accessible price', async () => {
    const longName = 'Flat White de Especialidad Tostado Medio Origen Único Chiapas';
    server.use(
      http.get('/api/v1/categories', () => HttpResponse.json({ data: [
        { id: '1', name: 'Café' }, { id: '2', name: 'Panadería' },
      ], page: { limit: 100, nextCursor: null } })),
      http.get('/api/v1/products', () => HttpResponse.json({ data: [
        product,
        { ...product, id: '11', name: longName, imageUrl: null },
        { ...product, id: '12', name: 'Agotado', isAvailable: false },
        { ...product, id: '13', categoryId: '2', name: 'Croissant' },
      ], page: { limit: 100, nextCursor: null } })),
    );
    renderPos();
    const catalog = await screen.findByRole('region', { name: 'Productos disponibles' });
    expect(await within(catalog).findByRole('button', { name: new RegExp(`Personalizar.*${longName}.*\\$65\\.00`) })).toBeEnabled();
    expect(within(catalog).getByRole('button', { name: /Personalizar.*Agotado.*\$65\.00/ })).toBeDisabled();
    expect(within(catalog).getAllByText('Sin imagen')).toHaveLength(4);
    fireEvent.click(within(catalog).getByRole('button', { name: 'Panadería' }));
    expect(within(catalog).queryByRole('button', { name: /Personalizar.*Latte.*\$65\.00/ })).not.toBeInTheDocument();
    expect(within(catalog).getByRole('button', { name: /Personalizar.*Croissant.*\$65\.00/ })).toBeVisible();
    fireEvent.change(within(catalog).getByRole('searchbox', { name: 'Buscar productos' }), { target: { value: 'ninguno' } });
    expect(within(catalog).getByText('No se encontraron productos')).toBeInTheDocument();
    fireEvent.click(within(catalog).getByRole('button', { name: 'Todas' }));
    fireEvent.change(within(catalog).getByRole('searchbox', { name: 'Buscar productos' }), { target: { value: 'Latte' } });
    expect(within(catalog).getByRole('button', { name: /Personalizar.*Latte.*\$65\.00/ })).toBeVisible();
  });

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
    expect(await screen.findByRole('button', { name: /Personalizar.*Latte.*\$65\.00/ })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /Personalizar.*Latte/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar personalización' }));
    expect(await screen.findByText('1 × Latte (Mediano)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Buscar cliente' }));
    fireEvent.change(await screen.findByLabelText('Teléfono o número de cliente'), { target: { value: 'c10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(await screen.findByText('Cliente encontrado: Cliente Uno (C10). Confirma el nombre antes de usarlo.')).toBeInTheDocument();
    expect(searchBody).toEqual({ identifier: 'C10' });
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }));

    fireEvent.click(screen.getByRole('button', { name: 'Crear orden pendiente' }));
    expect(await screen.findByRole('heading', { name: 'Cobro en efectivo' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Efectivo recibido (MXN)'), { target: { value: '70' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar y cobrar' }));
    expect(await screen.findByText(/Sólo el responsable de la caja abierta puede cobrar/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
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

  test('creates and charges from the checkout dialog only when cash covers the total', async () => {
    let paymentBody: unknown;
    let paymentKey: string | undefined;
    server.use(
      http.post('/api/v1/cashier/orders', () => HttpResponse.json({ data: pendingOrder }, { status: 201 })),
      http.get('/api/v1/cash-sessions/current', () => HttpResponse.json({ data: openCashSession })),
      http.post('/api/v1/payments/cash', async ({ request }) => {
        paymentBody = await request.json();
        paymentKey = request.headers.get('idempotency-key') ?? undefined;
        return HttpResponse.json({ data: paidResult }, { status: 201 });
      }),
      http.get('/api/v1/sales/9/ticket', () => HttpResponse.json({
        data: {
          saleId: '9', saleNumber: 'V000009', orderFolio: 'A000007', soldAt: '2099-01-01T12:00:00.000Z',
          currency: 'MXN', totalCents: '6500', cashReceivedCents: '7000', changeCents: '500',
          items: [{ productName: 'Latte', quantity: 1, unitPriceCents: '6500', lineTotalCents: '6500' }],
          registration: null,
        },
      })),
    );

    renderPos();
    fireEvent.click(await screen.findByRole('button', { name: /Personalizar.*Latte/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar personalización' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear orden pendiente' }));
    expect(await screen.findByRole('heading', { name: 'Cobro en efectivo' })).toBeInTheDocument();

    const accept = screen.getByRole('button', { name: 'Aceptar y cobrar' });
    expect(accept).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Efectivo recibido (MXN)'), { target: { value: '60' } });
    expect(accept).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Efectivo recibido (MXN)'), { target: { value: '70' } });
    expect(accept).toBeEnabled();
    fireEvent.click(accept);

    expect(await screen.findByRole('heading', { name: 'Venta completada' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Ticket V000009' })).toBeInTheDocument();
    expect(paymentBody).toEqual({ cashSessionId: '1', orderId: '7', cashReceivedCents: '7000' });
    expect(paymentKey).toMatch(/^[0-9a-f-]{36}$/i);
  });

  test('blocks new orders after an unverifiable 201 response', async () => {
    server.use(http.post('/api/v1/cashier/orders', () => HttpResponse.json({ data: { id: '7' } }, { status: 201 })));
    renderPos();
    expect(await screen.findByRole('button', { name: /Personalizar.*Latte.*\$65\.00/ })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /Personalizar.*Latte/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar personalización' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Crear orden pendiente' }));
    fireEvent.change(await screen.findByLabelText('Efectivo recibido (MXN)'), { target: { value: '70' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar y cobrar' }));

    const checkout = screen.getByRole('dialog', { name: 'Cobro en efectivo' });
    expect(await within(checkout).findByRole('button', { name: 'Reintentar cobro' })).toBeEnabled();
    expect(within(checkout).getByText(/confirma con la cafetería/)).toBeInTheDocument();
    expect(within(checkout).queryByRole('button', { name: 'Aceptar y cobrar' })).not.toBeInTheDocument();
  });

  test('shows a safe 409 message when the order can no longer accept a customer', async () => {
    server.use(
      http.post('/api/v1/cashier/customers/search', () => HttpResponse.json({ data: { id: '10', name: 'Cliente Uno', customerNumber: 'C10' } })),
      http.patch('/api/v1/cashier/orders/7/customer', () => HttpResponse.json({ code: 'ORDER_CONFLICT' }, { status: 409 })),
    );
    renderPos();
    fireEvent.click(await screen.findByRole('button', { name: 'Buscar cliente' }));
    fireEvent.change(await screen.findByLabelText('Teléfono o número de cliente'), { target: { value: 'C10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await screen.findByText(/Confirma el nombre antes de usarlo/);
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }));
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
    fireEvent.click(await screen.findByRole('button', { name: 'Buscar cliente' }));
    fireEvent.change(await screen.findByLabelText('Teléfono o número de cliente'), { target: { value: 'C10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await screen.findByText(/Confirma el nombre antes de usarlo/);
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }));
    fireEvent.change(screen.getByLabelText('ID de orden pendiente'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Asociar cliente' }));
    expect(await screen.findByRole('link', { name: 'Abrir cobro en pantalla completa' })).toHaveAttribute('href', '/terminal/cobro');
  });

  test('updates quantities, removes lines and shows the IVA-inclusive breakdown', async () => {
    renderPos();
    fireEvent.click(await screen.findByRole('button', { name: /Personalizar.*Latte/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar personalización' }));
    expect(await screen.findByText('1 × Latte (Mediano)')).toBeInTheDocument();
    expect(screen.getByText('Subtotal')).toBeInTheDocument();
    expect(screen.getByText('IVA incluido (16%)')).toBeInTheDocument();
    expect(screen.getByText('$56.03')).toBeInTheDocument();
    expect(screen.getByText('$8.97')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Aumentar cantidad de Latte' }));
    expect(await screen.findByText('2 × Latte (Mediano)')).toBeInTheDocument();
    expect(screen.getByText('$112.07')).toBeInTheDocument();
    expect(screen.getByText('$17.93')).toBeInTheDocument();
    expect(screen.getAllByText('$130.00').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Disminuir cantidad de Latte' }));
    expect(await screen.findByText('1 × Latte (Mediano)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Latte' }));
    expect(await screen.findByText('Agrega productos para preparar la orden.')).toBeInTheDocument();
  });

  test('offers scan and token QR actions and loads an order from a token', async () => {
    let scanBody: unknown;
    server.use(http.post('/api/v1/cashier/orders/scan-cash-qr', async ({ request }) => {
      scanBody = await request.json();
      return HttpResponse.json({
        data: {
          orderId: '7',
          orderFolio: 'A000007',
          totalCents: '6500',
          paymentExpiresAt: '2099-01-01T12:30:00.000Z',
          items: [{ productName: 'Latte', quantity: 1, options: [{ optionName: 'Grande' }] }],
        },
      });
    }));

    renderPos();
    expect(await screen.findByRole('heading', { name: 'Cobrar pedido con QR' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Escanear QR' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar token' }));
    fireEvent.change(screen.getByLabelText('Código QR o token'), {
      target: { value: `cafeteria:cash:${'A'.repeat(43)}` },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cargar pedido' }));

    expect(await screen.findByRole('heading', { name: 'Pedido cargado por QR' })).toBeInTheDocument();
    expect(screen.getByText('1 × Latte (Grande)')).toBeInTheDocument();
    expect(scanBody).toEqual({ token: 'A'.repeat(43) });
  });
});

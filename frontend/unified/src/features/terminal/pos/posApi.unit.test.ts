import { afterEach, describe, expect, test } from 'vitest';
import { ApiError, invalidateCsrfToken, setCsrfToken } from '../../../shared/api/client';
import { clearIdempotencyOperations } from '../../../shared/api/idempotency';
import { server } from '../../../test/server';
import { HttpResponse, http } from 'msw';
import {
  UnverifiableCashierOrderResponseError,
  associateOrderCustomer,
  formatPosError,
  isOrderAssociable,
  isValidCustomerIdentifier,
  prepareCashierOrder,
  searchOrderCustomer,
  sendCashierOrder,
} from './posApi';

const order = {
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
    id: '1',
    productId: '10',
    productName: 'Latte',
    basePriceCents: '6500',
    unitPriceCents: '6500',
    quantity: 1,
    lineTotalCents: '6500',
    options: [],
  }],
};

afterEach(() => {
  invalidateCsrfToken();
  clearIdempotencyOperations();
});

describe('POS API contract (TASK-14)', () => {
  test('builds only contract fields and reuses the exact snapshot and key', async () => {
    clearIdempotencyOperations();
    setCsrfToken('csrf-test');
    const bodies: unknown[] = [];
    const keys: Array<string | undefined> = [];
    let attempt = 0;
    server.use(http.post('/api/v1/cashier/orders', async ({ request }) => {
      bodies.push(await request.json());
      keys.push(request.headers.get('Idempotency-Key') ?? undefined);
      attempt += 1;
      if (attempt === 1) return HttpResponse.json({ code: 'DEPENDENCY_UNAVAILABLE' }, { status: 503 });
      return HttpResponse.json({ data: order }, { status: 201 });
    }));

    const operation = prepareCashierOrder(
      [{ productId: '10', quantity: 2, optionValueIds: ['5'] }],
      { identifier: 'C10', confirmedName: 'Cliente Uno' },
    );
    expect(bodies).toHaveLength(0);
    await expect(sendCashierOrder(operation)).rejects.toMatchObject({ status: 503 });
    const replay = await sendCashierOrder(operation);
    expect(replay.id).toBe('7');
    expect(bodies).toEqual([
      {
        paymentMethod: 'CASH',
        items: [{ productId: '10', quantity: 2, optionValueIds: ['5'] }],
        customer: { identifier: 'C10', confirmedName: 'Cliente Uno' },
      },
      {
        paymentMethod: 'CASH',
        items: [{ productId: '10', quantity: 2, optionValueIds: ['5'] }],
        customer: { identifier: 'C10', confirmedName: 'Cliente Uno' },
      },
    ]);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(keys[0]).toBe(keys[1]);
    expect(operation.snapshot).toBe(JSON.stringify(bodies[0]));
  });

  test('rejects extra authority fields, mixed customer identity and malformed responses', () => {
    expect(() => prepareCashierOrder([], undefined)).toThrow('entre 1 y 50');
    expect(() => prepareCashierOrder([{ productId: '0', quantity: 1 }])).toThrow('Producto no válido');
    expect(() => prepareCashierOrder([{ productId: '10', quantity: 0 }])).toThrow('Cantidad no válida');
    expect(() => prepareCashierOrder(
      [{ productId: '10', quantity: 1 }],
      { identifier: 'C10', confirmedName: 'Uno' },
      'Invitado',
    )).toThrow('excluyentes');
    expect(() => prepareCashierOrder(
      [{ productId: '10', quantity: 1 }],
      { identifier: 'bad', confirmedName: 'Uno' },
    )).toThrow('identificador');
    expect(isValidCustomerIdentifier('  c10  ')).toBe(true);
    expect(isValidCustomerIdentifier('+521234567890')).toBe(true);
    expect(isValidCustomerIdentifier('1234567890')).toBe(true);
    expect(isValidCustomerIdentifier('12345')).toBe(false);
  });

  test('verifies search and association responses and exposes errors safely', async () => {
    setCsrfToken('csrf-test');
    server.use(
      http.post('/api/v1/cashier/customers/search', async ({ request }) => {
        expect(await request.json()).toEqual({ identifier: 'C10' });
        return HttpResponse.json({ data: { id: '10', name: 'Cliente Uno', customerNumber: 'C10' } });
      }),
      http.patch('/api/v1/cashier/orders/7/customer', async ({ request }) => {
        expect(await request.json()).toEqual({ identifier: 'C10', confirmedName: 'Cliente Uno' });
        expect(request.headers.get('X-CSRF-Token')).toBe('csrf-test');
        return HttpResponse.json({ data: order });
      }),
    );
    const found = await searchOrderCustomer(' c10 ');
    expect(found).toEqual({ id: '10', name: 'Cliente Uno', customerNumber: 'C10' });
    const associated = await associateOrderCustomer('7', { identifier: 'C10', confirmedName: ' Cliente Uno ' });
    expect(associated.folio).toBe('A000007');
    expect(isOrderAssociable(associated, Date.parse('2099-01-01T12:10:00.000Z'))).toBe(true);
    expect(isOrderAssociable(associated, Date.parse('2099-01-01T12:40:00.000Z'))).toBe(false);
    expect(isOrderAssociable({ ...associated, paidAt: '2099-01-01T12:05:00.000Z' })).toBe(false);
  });

  test('accepts a pending MOBILE/STRIPE order for association but never as a cashier creation', async () => {
    setCsrfToken('csrf-test');
    const stripeOrder = { ...order, source: 'MOBILE', paymentMethod: 'STRIPE' };
    server.use(
      http.patch('/api/v1/cashier/orders/7/customer', () => HttpResponse.json({ data: stripeOrder })),
      http.post('/api/v1/cashier/orders', () => HttpResponse.json({ data: stripeOrder }, { status: 201 })),
    );
    const associated = await associateOrderCustomer('7', { identifier: 'C10', confirmedName: 'Cliente Uno' });
    expect(associated.paymentMethod).toBe('STRIPE');
    expect(isOrderAssociable(associated, Date.parse('2099-01-01T12:10:00.000Z'))).toBe(true);

    const operation = prepareCashierOrder([{ productId: '10', quantity: 1 }]);
    await expect(sendCashierOrder(operation)).rejects.toBeInstanceOf(UnverifiableCashierOrderResponseError);
  });

  test('unverifiable 201 responses cannot be treated as a created order', async () => {
    clearIdempotencyOperations();
    setCsrfToken('csrf-test');
    server.use(http.post('/api/v1/cashier/orders', () => HttpResponse.json({ data: { id: '7' } }, { status: 201 })));
    const operation = prepareCashierOrder([{ productId: '10', quantity: 1 }]);
    await expect(sendCashierOrder(operation)).rejects.toBeInstanceOf(UnverifiableCashierOrderResponseError);
    expect(formatPosError(new UnverifiableCashierOrderResponseError())).toContain('confirma con la cafetería');
  });

  test('formats 401/403/404/409 without claiming a payment', () => {
    expect(formatPosError(new ApiError(401, '401'))).toContain('sesión venció');
    expect(formatPosError(new ApiError(403, '403', { code: 'FORBIDDEN' }))).toContain('permiso');
    expect(formatPosError(new ApiError(404, '404'))).toContain('No encontramos');
    expect(formatPosError(new ApiError(409, '409'))).toContain('no permite asociar');
  });
});

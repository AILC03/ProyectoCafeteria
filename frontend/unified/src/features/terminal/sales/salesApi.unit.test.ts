import { describe, expect, test } from 'vitest';
import { HttpResponse, http } from 'msw';
import { ApiError } from '../../../shared/api/client';
import { UnverifiableCashPaymentResponseError } from '../payment/paymentApi';
import { server } from '../../../test/server';
import {
  UnverifiableSalesResponseError,
  buildSalesQuery,
  formatSalesError,
  formatTicketError,
  getSalesSummary,
  listSales,
  reprintSaleTicket,
  type SalesFilter,
} from './salesApi';

const sale = {
  id: '9',
  saleNumber: 'V000009',
  orderId: '7',
  paymentId: '8',
  totalCents: '6500',
  soldAt: '2099-01-01T12:00:00.000Z',
  method: 'CASH',
};
const summary = { count: '2', totalCents: '10000', cashCents: '6500', stripeCents: '3500' };
const token = 'a'.repeat(43);
const ticket = {
  saleId: '9',
  saleNumber: 'V000009',
  orderFolio: 'A000007',
  soldAt: '2099-01-01T12:00:00.000Z',
  currency: 'MXN',
  totalCents: '6500',
  cashReceivedCents: '7000',
  changeCents: '500',
  items: [{ productName: 'Latte', quantity: 1, unitPriceCents: '6500', lineTotalCents: '6500' }],
  registration: { purpose: 'CUSTOMER_REGISTRATION', token, qrPayload: `cafeteria:register:${token}`, expiresAt: '2099-01-02T12:00:00.000Z' },
};

const validPage = { data: [sale], page: { limit: 20, nextCursor: null } };

describe('operational sales API (TASK-17)', () => {
  test('builds only contract query parameters with strict filters and cursor', () => {
    expect(buildSalesQuery()).toBe('?limit=20');
    const query = new URLSearchParams(buildSalesQuery(
      {
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-02-01T00:00:00.000Z',
        method: 'STRIPE',
        order: 'desc',
        limit: 50,
      },
      'opaque-1',
    ));
    expect([...query.keys()]).toEqual(['from', 'to', 'method', 'order', 'limit', 'cursor']);
    expect(query.get('from')).toBe('2026-01-01T00:00:00.000Z');
    expect(query.get('to')).toBe('2026-02-01T00:00:00.000Z');
    expect(query.get('method')).toBe('STRIPE');
    expect(query.get('order')).toBe('desc');
    expect(query.get('limit')).toBe('50');
    expect(query.get('cursor')).toBe('opaque-1');
    expect(new URLSearchParams(buildSalesQuery({ limit: 10 }, undefined, false)).toString()).toBe('');
  });

  test.each([
    [{ extra: 'value' } as unknown as SalesFilter],
    [{ from: '2026-01-01' } as unknown as SalesFilter],
    [{ from: '2026-01-01T00:00:00+01:00' } as unknown as SalesFilter],
    [{ to: 'not-a-date' } as unknown as SalesFilter],
    [{ from: '2026-02-01T00:00:00.000Z', to: '2026-01-01T00:00:00.000Z' } as unknown as SalesFilter],
    [{ method: 'TRANSFER' } as unknown as SalesFilter],
    [{ order: 'sideways' } as unknown as SalesFilter],
    [{ limit: 0 } as unknown as SalesFilter],
    [{ limit: 101 } as unknown as SalesFilter],
    [{ limit: 2.5 } as unknown as SalesFilter],
  ])('rejects unsupported filters %#', async (filter) => {
    await expect(listSales(filter)).rejects.toBeInstanceOf(TypeError);
  });

  test('rejects an invalid cursor without issuing a request', async () => {
    await expect(listSales({}, 'x'.repeat(2049))).rejects.toBeInstanceOf(TypeError);
  });

  test('lists sales and verifies rows and pagination strictly', async () => {
    const queries: URL[] = [];
    server.use(http.get('/api/v1/sales', ({ request }) => {
      queries.push(new URL(request.url));
      return HttpResponse.json(validPage);
    }));
    const first = await listSales({ limit: 20 });
    expect(first.items).toEqual([sale]);
    expect(first.nextCursor).toBeNull();
    expect([...queries[0].searchParams.keys()]).toEqual(['limit']);

    server.use(http.get('/api/v1/sales', () => HttpResponse.json({
      data: [sale],
      page: { limit: 20, nextCursor: 'opaque-1' },
    })));
    const second = await listSales({ limit: 20 }, 'opaque-1');
    expect(second.nextCursor).toBe('opaque-1');
    expect(queries).toHaveLength(1);

    server.use(http.get('/api/v1/sales', () => HttpResponse.json({ data: [{ ...sale, customerId: '10' }], page: { limit: 20, nextCursor: null } })));
    await expect(listSales({})).rejects.toBeInstanceOf(UnverifiableSalesResponseError);

    server.use(http.get('/api/v1/sales', () => HttpResponse.json({ data: [{ ...sale, totalCents: '65.00' }], page: { limit: 20, nextCursor: null } })));
    await expect(listSales({})).rejects.toBeInstanceOf(UnverifiableSalesResponseError);

    server.use(http.get('/api/v1/sales', () => HttpResponse.json({ data: [sale], page: { limit: 20, nextCursor: 9 } })));
    await expect(listSales({})).rejects.toBeInstanceOf(UnverifiableSalesResponseError);

    server.use(http.get('/api/v1/sales', () => HttpResponse.json({ ...validPage, customerId: '10' })));
    await expect(listSales({})).rejects.toBeInstanceOf(UnverifiableSalesResponseError);
  });

  test('summarizes the whole filtered set without limit or cursor', async () => {
    const queries: URL[] = [];
    server.use(http.get('/api/v1/sales/summary', ({ request }) => {
      queries.push(new URL(request.url));
      return HttpResponse.json({ data: summary });
    }));
    expect(await getSalesSummary({ method: 'CASH', limit: 50 })).toEqual(summary);
    expect([...queries[0].searchParams.keys()]).toEqual(['method']);
    expect(queries[0].searchParams.get('method')).toBe('CASH');

    server.use(http.get('/api/v1/sales/summary', () => HttpResponse.json({ data: { ...summary, extra: 1 } })));
    await expect(getSalesSummary()).rejects.toBeInstanceOf(UnverifiableSalesResponseError);
    server.use(http.get('/api/v1/sales/summary', () => HttpResponse.json({ data: { ...summary, totalCents: '-1' } })));
    await expect(getSalesSummary()).rejects.toBeInstanceOf(UnverifiableSalesResponseError);
    server.use(http.get('/api/v1/sales/summary', () => HttpResponse.json({ data: summary, customerId: '10' })));
    await expect(getSalesSummary()).rejects.toBeInstanceOf(UnverifiableSalesResponseError);
  });

  test('maps denied, missing and unavailable responses', async () => {
    for (const status of [400, 401, 403, 404, 429, 503]) {
      server.use(http.get('/api/v1/sales', () => HttpResponse.json({ code: 'X' }, { status })));
      await expect(listSales({})).rejects.toMatchObject({ status });
    }
    expect(formatSalesError(new ApiError(403, 'x', { code: 'FORBIDDEN' }))).toMatch(/Sólo caja/);
    expect(formatSalesError(new ApiError(404, 'x', { code: 'NOT_FOUND' }))).toMatch(/no está disponible/);
    expect(formatSalesError(new ApiError(503, 'x'))).toMatch(/Inténtalo de nuevo/);
    expect(formatSalesError(new TypeError('fecha inválida'))).toBe('fecha inválida');
    expect(formatTicketError(new ApiError(404, 'x', { code: 'NOT_FOUND' }))).toMatch(/no existe/);
    expect(formatTicketError(new ApiError(403, 'x', { code: 'FORBIDDEN' }))).toMatch(/permiso/);
    expect(formatTicketError(new ApiError(503, 'x'))).toMatch(/Inténtalo de nuevo/);
  });

  test('reprints only through the existing protected GET ticket endpoint', async () => {
    let posts = 0;
    let ticketAccessCalls = 0;
    server.use(
      http.get('/api/v1/sales/9/ticket', () => HttpResponse.json({ data: ticket })),
      http.get('/api/v1/sales/9/ticket-access', () => { ticketAccessCalls += 1; return HttpResponse.json({ code: 'NOT_FOUND' }, { status: 404 }); }),
      http.post('*', () => { posts += 1; return HttpResponse.json({}); }),
    );
    expect((await reprintSaleTicket('9')).saleId).toBe('9');
    expect(posts).toBe(0);
    expect(ticketAccessCalls).toBe(0);
    await expect(reprintSaleTicket('not-an-id')).rejects.toBeInstanceOf(TypeError);
  });

  test('reprints a STRIPE ticket with null cash amounts as required by the contract', async () => {
    const stripeTicket = {
      ...ticket,
      saleId: '10',
      saleNumber: 'V000010',
      cashReceivedCents: null,
      changeCents: null,
      registration: null,
    };
    server.use(http.get('/api/v1/sales/10/ticket', () => HttpResponse.json({ data: stripeTicket })));
    const reprinted = await reprintSaleTicket('10');
    expect(reprinted.cashReceivedCents).toBeNull();
    expect(reprinted.changeCents).toBeNull();
    expect(reprinted.registration).toBeNull();

    server.use(http.get('/api/v1/sales/10/ticket', () => HttpResponse.json({ data: { ...stripeTicket, changeCents: 'abc' } })));
    await expect(reprintSaleTicket('10')).rejects.toBeInstanceOf(UnverifiableCashPaymentResponseError);
  });
});

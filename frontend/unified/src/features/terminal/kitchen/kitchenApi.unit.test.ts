import { beforeEach, describe, expect, test } from 'vitest';
import { HttpResponse, http } from 'msw';
import { ApiError, setCsrfToken } from '../../../shared/api/client';
import { server } from '../../../test/server';
import {
  UnverifiableKitchenResponseError,
  buildPreparationQuery,
  formatKitchenError,
  getKitchenOrder,
  listPreparationOrders,
  markOrderReady,
} from './kitchenApi';

const summary = {
  id: '7',
  folio: 'A000007',
  guestName: 'Ana',
  status: 'EN_PREPARACION',
  createdAt: '2099-01-01T12:00:00.000Z',
};
const option = { optionValueId: '5', groupName: 'Tamaño', optionName: 'Grande', surchargeCents: '500' };
const item = {
  id: '11', productId: '10', productName: 'Latte', basePriceCents: '6000',
  unitPriceCents: '6500', quantity: 1, lineTotalCents: '6500', options: [option],
};
const order = {
  id: '7', folio: 'A000007', source: 'CASHIER', status: 'EN_PREPARACION', paymentMethod: 'CASH',
  totalCents: '6500', customerId: null, guestName: 'Ana',
  paymentExpiresAt: '2099-01-01T12:30:00.000Z', paidAt: '2099-01-01T12:05:00.000Z',
  readyAt: null, readyByEmployeeId: null, createdAt: '2099-01-01T12:00:00.000Z', items: [item],
};
const page = { data: [summary], page: { limit: 20, nextCursor: null } };

beforeEach(() => { setCsrfToken('csrf-test'); });

describe('kitchen API (TASK-18)', () => {
  test('builds only the two contract query parameters', () => {
    expect(buildPreparationQuery()).toBe('?limit=20');
    expect(buildPreparationQuery(50, 'opaque-2')).toBe('?limit=50&cursor=opaque-2');
    expect(() => buildPreparationQuery(0)).toThrow(TypeError);
    expect(() => buildPreparationQuery(101)).toThrow(TypeError);
    expect(() => buildPreparationQuery(20, '')).toThrow(TypeError);
    expect(() => buildPreparationQuery(20, 'x'.repeat(2049))).toThrow(TypeError);
  });

  test('lists only EN_PREPARACION summaries with a verifiable envelope', async () => {
    const queries: URL[] = [];
    server.use(http.get('/api/v1/preparation/orders', ({ request }) => {
      queries.push(new URL(request.url));
      return HttpResponse.json(page);
    }));
    const result = await listPreparationOrders();
    expect(result.items).toEqual([summary]);
    expect([...queries[0].searchParams.keys()]).toEqual(['limit']);

    server.use(http.get('/api/v1/preparation/orders', () => HttpResponse.json({ ...page, customerId: '10' })));
    await expect(listPreparationOrders()).rejects.toBeInstanceOf(UnverifiableKitchenResponseError);
    server.use(http.get('/api/v1/preparation/orders', () => HttpResponse.json({ data: [{ ...summary, status: 'LISTO' }], page: page.page })));
    await expect(listPreparationOrders()).rejects.toBeInstanceOf(UnverifiableKitchenResponseError);
    server.use(http.get('/api/v1/preparation/orders', () => HttpResponse.json({ data: [{ ...summary, email: 'a@b.c' }], page: page.page })));
    await expect(listPreparationOrders()).rejects.toBeInstanceOf(UnverifiableKitchenResponseError);
  });

  test('reads order detail strictly, including optionName from the contract', async () => {
    const queries: URL[] = [];
    server.use(http.get('/api/v1/orders/7', ({ request }) => {
      queries.push(new URL(request.url));
      return HttpResponse.json({ data: order });
    }));
    expect((await getKitchenOrder('7')).items[0].options[0].optionName).toBe('Grande');
    expect([...queries[0].searchParams.keys()]).toEqual([]);

    const legacyOption = { ...option, optionName: undefined, valueName: 'Grande' };
    server.use(http.get('/api/v1/orders/7', () => HttpResponse.json({ data: { ...order, items: [{ ...item, options: [legacyOption] }] } })));
    await expect(getKitchenOrder('7')).rejects.toBeInstanceOf(UnverifiableKitchenResponseError);
    server.use(http.get('/api/v1/orders/7', () => HttpResponse.json({ data: { ...order, status: 'LISTO' } })));
    await expect(getKitchenOrder('7')).rejects.toBeInstanceOf(UnverifiableKitchenResponseError);
    server.use(http.get('/api/v1/orders/7', () => HttpResponse.json({ data: { ...order, id: '8' } })));
    await expect(getKitchenOrder('7')).rejects.toBeInstanceOf(UnverifiableKitchenResponseError);
    server.use(http.get('/api/v1/orders/7', () => HttpResponse.json({ data: { ...order, totalCents: '10000000' } })));
    await expect(getKitchenOrder('7')).rejects.toBeInstanceOf(UnverifiableKitchenResponseError);
    await expect(getKitchenOrder('abc')).rejects.toBeInstanceOf(TypeError);
  });

  test('marks LISTO with an empty body, CSRF and a verified response', async () => {
    const bodies: unknown[] = [];
    const headers: Array<string | null> = [];
    const readyOrder = {
      ...order, status: 'LISTO', readyAt: '2099-01-01T12:10:00.000Z', readyByEmployeeId: '2',
    };
    server.use(http.post('/api/v1/orders/7/ready', async ({ request }) => {
      bodies.push(await request.json());
      headers.push(request.headers.get('X-CSRF-Token'));
      return HttpResponse.json({ data: readyOrder });
    }));
    const result = await markOrderReady('7');
    expect(result.status).toBe('LISTO');
    expect(bodies).toEqual([{}]);
    expect(headers).toEqual(['csrf-test']);

    server.use(http.post('/api/v1/orders/7/ready', () => HttpResponse.json({ data: { ...readyOrder, readyAt: null } })));
    await expect(markOrderReady('7')).rejects.toBeInstanceOf(UnverifiableKitchenResponseError);
    server.use(http.post('/api/v1/orders/7/ready', () => HttpResponse.json({ data: readyOrder, traceId: 'x' })));
    await expect(markOrderReady('7')).rejects.toBeInstanceOf(UnverifiableKitchenResponseError);
    server.use(http.post('/api/v1/orders/7/ready', () => HttpResponse.json({ data: { ...readyOrder, id: '8' } })));
    await expect(markOrderReady('7')).rejects.toBeInstanceOf(UnverifiableKitchenResponseError);
  });

  test('does not turn a state conflict into success or an automatic retry', async () => {
    let calls = 0;
    server.use(http.post('/api/v1/orders/7/ready', () => {
      calls += 1;
      return HttpResponse.json({ status: 409, code: 'ORDER_CONFLICT', title: 'Conflicto', detail: 'La orden ya no está en preparación.' }, { status: 409 });
    }));
    await expect(markOrderReady('7')).rejects.toMatchObject({ status: 409 });
    expect(calls).toBe(1);
    expect(formatKitchenError(new ApiError(409, 'conflict', { code: 'ORDER_CONFLICT' }))).toMatch(/ya no está en preparación/i);
  });
});

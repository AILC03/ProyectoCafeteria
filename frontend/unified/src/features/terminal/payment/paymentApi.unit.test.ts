import { afterEach, describe, expect, test } from 'vitest';
import { HttpResponse, http } from 'msw';
import { clearIdempotencyOperations } from '../../../shared/api/idempotency';
import { invalidateCsrfToken, setCsrfToken } from '../../../shared/api/client';
import { server } from '../../../test/server';
import { getProtectedTicket, prepareCashPayment, sendCashPayment } from './paymentApi';

afterEach(() => { invalidateCsrfToken(); clearIdempotencyOperations(); });

describe('cash payment contract (TASK-15)', () => {
  test('retries uncertainty with the same exact body and idempotency key', async () => {
    setCsrfToken('csrf'); const bodies: unknown[] = []; const keys: string[] = []; let count = 0;
    server.use(http.post('/api/v1/payments/cash', async ({ request }) => { bodies.push(await request.json()); keys.push(request.headers.get('Idempotency-Key') ?? ''); count += 1; if (count === 1) return HttpResponse.json({ code: 'UNAVAILABLE' }, { status: 503 }); return HttpResponse.json({ data: { payment: { id: '8', orderId: '7', method: 'CASH', status: 'SUCCEEDED', amountCents: '6500', currency: 'MXN', cashierId: '2', cashSessionId: '1', cashReceivedCents: '7000', changeCents: '500', confirmedAt: '2099-01-01T12:00:00.000Z' }, sale: { id: '9', saleNumber: 'V000009', orderId: '7', paymentId: '8', totalCents: '6500', soldAt: '2099-01-01T12:00:00.000Z' }, order: { id: '7', folio: 'A000007', status: 'EN_PREPARACION', paidAt: '2099-01-01T12:00:00.000Z' }, ticket: { saleId: '9', path: '/api/v1/sales/9/ticket' } } }, { status: 201 }); }));
    const operation = prepareCashPayment('1', '7', '7000', '500');
    await expect(sendCashPayment(operation)).rejects.toMatchObject({ status: 503 });
    await expect(sendCashPayment(operation)).resolves.toMatchObject({ saleId: '9', changeCents: '500' });
    expect(bodies).toEqual([{ cashSessionId: '1', orderId: '7', cashReceivedCents: '7000', changeCents: '500' }, { cashSessionId: '1', orderId: '7', cashReceivedCents: '7000', changeCents: '500' }]);
    expect(keys[0]).toBe(keys[1]);
  });
  test('rejects a 201 whose order/session or CASH semantics do not match the submitted operation', async () => {
    setCsrfToken('csrf');
    server.use(http.post('/api/v1/payments/cash', () => HttpResponse.json({ data: { payment: { id: '8', orderId: '99', method: 'STRIPE', status: 'SUCCEEDED', amountCents: '6500', currency: 'MXN', cashierId: '2', cashSessionId: '2', cashReceivedCents: '7000', changeCents: '500', confirmedAt: '2099-01-01T12:00:00.000Z' }, sale: { id: '9', saleNumber: 'V000009', orderId: '7', paymentId: '8', totalCents: '6500', soldAt: '2099-01-01T12:00:00.000Z' }, order: { id: '7', folio: 'A000007', status: 'EN_PREPARACION', paidAt: '2099-01-01T12:00:00.000Z' }, ticket: { saleId: '9', path: '/api/v1/sales/9/ticket' } } }, { status: 201 })));
    await expect(sendCashPayment(prepareCashPayment('1', '7', '7000', '500'))).rejects.toBeInstanceOf(Error);
  });
  test('rejects a 201 when ticket.saleId differs from the confirmed sale', async () => {
    setCsrfToken('csrf');
    server.use(http.post('/api/v1/payments/cash', () => HttpResponse.json({ data: { payment: { id: '8', orderId: '7', method: 'CASH', status: 'SUCCEEDED', amountCents: '6500', currency: 'MXN', cashierId: '2', cashSessionId: '1', cashReceivedCents: '7000', changeCents: '500', confirmedAt: '2099-01-01T12:00:00.000Z' }, sale: { id: '9', saleNumber: 'V000009', orderId: '7', paymentId: '8', totalCents: '6500', soldAt: '2099-01-01T12:00:00.000Z' }, order: { id: '7', folio: 'A000007', status: 'EN_PREPARACION', paidAt: '2099-01-01T12:00:00.000Z' }, ticket: { saleId: '10', path: '/api/v1/sales/9/ticket' } } }, { status: 201 })));
    await expect(sendCashPayment(prepareCashPayment('1', '7', '7000', '500'))).rejects.toMatchObject({ name: 'UnverifiableCashPaymentResponseError' });
  });
  test('never exposes registration fields while reading a printable ticket', async () => {
    server.use(http.get('/api/v1/sales/9/ticket', () => HttpResponse.json({ data: { saleId: '9', saleNumber: 'V000009', orderFolio: 'A000007', soldAt: '2099-01-01T12:00:00.000Z', currency: 'MXN', totalCents: '6500', cashReceivedCents: '7000', changeCents: '500', items: [{ productName: 'Latte', quantity: 1, unitPriceCents: '6500', lineTotalCents: '6500' }], registration: { token: 'secret', qrPayload: 'cafeteria:register:secret' } } })));
    const ticket = await getProtectedTicket('9');
    expect(JSON.stringify(ticket)).not.toContain('secret');
    expect(ticket.items[0]?.productName).toBe('Latte');
  });
  test('rejects a protected ticket whose saleId differs from the requested sale', async () => {
    server.use(http.get('/api/v1/sales/9/ticket', () => HttpResponse.json({ data: { saleId: '10', saleNumber: 'V000010', orderFolio: 'A000007', soldAt: '2099-01-01T12:00:00.000Z', currency: 'MXN', totalCents: '6500', cashReceivedCents: '7000', changeCents: '500', items: [] } })));
    await expect(getProtectedTicket('9')).rejects.toMatchObject({ name: 'UnverifiableCashPaymentResponseError' });
  });
});

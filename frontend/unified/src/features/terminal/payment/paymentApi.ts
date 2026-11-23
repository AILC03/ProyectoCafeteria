import { ApiError, apiFetch } from '../../../shared/api/client';
import { idempotencyOperations, isUncertainIdempotencyFailure, type IdempotentOperation } from '../../../shared/api/idempotency';

const ID = /^[1-9][0-9]{0,18}$/;
const CENTS = /^(0|[1-9][0-9]{0,18})$/;

export type CashPayment = { saleId: string; totalCents: string; cashReceivedCents: string; changeCents: string };
export type TicketRegistration = { token: string; qrPayload: string; expiresAt: string };
export type Ticket = { saleId: string; saleNumber: string; orderFolio: string; soldAt: string; currency: string; totalCents: string; cashReceivedCents: string | null; changeCents: string | null; items: Array<{ productName: string; quantity: number; unitPriceCents: string; lineTotalCents: string }>; registration: TicketRegistration | null };
export class UnverifiableCashPaymentResponseError extends Error { constructor() { super('Cash payment response cannot be verified'); this.name = 'UnverifiableCashPaymentResponseError'; } }

function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function cents(value: unknown): value is string { return typeof value === 'string' && CENTS.test(value); }
function nullableCents(value: unknown): value is string | null { return value === null || cents(value); }
function id(value: unknown): value is string { return typeof value === 'string' && ID.test(value); }
function registration(value: unknown): TicketRegistration | null {
  if (value === null || value === undefined) return null;
  if (!record(value) || value.purpose !== 'CUSTOMER_REGISTRATION' || typeof value.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.token) || typeof value.qrPayload !== 'string' || value.qrPayload !== `cafeteria:register:${value.token}` || typeof value.expiresAt !== 'string' || !Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= Date.now()) return null;
  return { token: value.token, qrPayload: value.qrPayload, expiresAt: value.expiresAt };
}

export function prepareCashPayment(cashSessionId: string, orderId: string, cashReceivedCents: string, changeCents?: string): IdempotentOperation {
  if (!ID.test(cashSessionId) || !ID.test(orderId) || !CENTS.test(cashReceivedCents) || (changeCents !== undefined && !CENTS.test(changeCents))) throw new TypeError('Los datos del cobro no son válidos.');
  return idempotencyOperations.create({ cashSessionId, orderId, cashReceivedCents, ...(changeCents === undefined ? {} : { changeCents }) });
}

function date(value: unknown): value is string { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
function payment(value: unknown, operation: IdempotentOperation): CashPayment | null {
  if (!record(value) || !record(value.sale) || !record(value.payment) || !record(value.ticket)) return null;
  const request = JSON.parse(operation.snapshot) as { cashSessionId?: unknown; orderId?: unknown; cashReceivedCents?: unknown; changeCents?: unknown };
  if (typeof request.cashSessionId !== 'string' || typeof request.orderId !== 'string' || typeof request.cashReceivedCents !== 'string') return null;
  const sale = value.sale; const paid = value.payment; const order = value.order; const ticket = value.ticket;
  if (!record(order) || !id(paid.id) || paid.orderId !== request.orderId || paid.cashSessionId !== request.cashSessionId || paid.method !== 'CASH' || paid.status !== 'SUCCEEDED' || !cents(paid.amountCents) || !cents(paid.cashReceivedCents) || !cents(paid.changeCents) || paid.cashReceivedCents !== request.cashReceivedCents || (request.changeCents !== undefined && paid.changeCents !== request.changeCents) || paid.currency !== 'MXN' || !id(paid.cashierId) || !date(paid.confirmedAt)) return null;
  if (!id(sale.id) || !/^V[0-9]{6,}$/.test(String(sale.saleNumber)) || sale.orderId !== request.orderId || sale.paymentId !== paid.id || !cents(sale.totalCents) || !date(sale.soldAt) || paid.amountCents !== sale.totalCents) return null;
  if (order.id !== request.orderId || !/^A[0-9]{6,}$/.test(String(order.folio)) || order.status !== 'EN_PREPARACION' || !date(order.paidAt)) return null;
  if (!id(ticket.saleId) || ticket.saleId !== sale.id || ticket.path !== `/api/v1/sales/${sale.id}/ticket`) return null;
  try { if (BigInt(paid.cashReceivedCents) - BigInt(paid.changeCents) !== BigInt(sale.totalCents)) return null; } catch { return null; }
  return { saleId: sale.id, totalCents: sale.totalCents, cashReceivedCents: paid.cashReceivedCents, changeCents: paid.changeCents };
}

export async function sendCashPayment(operation: IdempotentOperation): Promise<CashPayment> {
  let response: { data?: unknown };
  try { response = await idempotencyOperations.send(operation, '/payments/cash', { method: 'POST' }); } catch (error) { if (error instanceof SyntaxError) throw new UnverifiableCashPaymentResponseError(); throw error; }
  const verified = payment(response?.data, operation);
  if (verified === null) throw new UnverifiableCashPaymentResponseError();
  return verified;
}

/** Reads a protected receipt and retains a valid guest-registration QR only in memory. */
export async function getProtectedTicket(saleId: string): Promise<Ticket> {
  if (!ID.test(saleId)) throw new TypeError('Venta no válida.');
  const response = await apiFetch<{ data?: unknown }>(`/sales/${encodeURIComponent(saleId)}/ticket`);
  const value = response?.data;
  if (!record(value) || !id(value.saleId) || value.saleId !== saleId || !cents(value.totalCents) || !nullableCents(value.cashReceivedCents) || !nullableCents(value.changeCents) || typeof value.saleNumber !== 'string' || typeof value.orderFolio !== 'string' || typeof value.soldAt !== 'string' || !Number.isFinite(Date.parse(value.soldAt)) || typeof value.currency !== 'string' || !Array.isArray(value.items)) throw new UnverifiableCashPaymentResponseError();
  const items: Ticket['items'] = [];
  for (const item of value.items) {
    if (!record(item) || typeof item.productName !== 'string' || typeof item.quantity !== 'number' || !Number.isInteger(item.quantity) || item.quantity < 1 || !cents(item.unitPriceCents) || !cents(item.lineTotalCents)) throw new UnverifiableCashPaymentResponseError();
    items.push({ productName: item.productName, quantity: item.quantity, unitPriceCents: item.unitPriceCents, lineTotalCents: item.lineTotalCents });
  }
  return { saleId: value.saleId, saleNumber: value.saleNumber, orderFolio: value.orderFolio, soldAt: value.soldAt, currency: value.currency, totalCents: value.totalCents, cashReceivedCents: value.cashReceivedCents, changeCents: value.changeCents, items, registration: registration(value.registration) };
}

export function shouldRetryCashPayment(error: unknown): boolean { return isUncertainIdempotencyFailure(error) || error instanceof ApiError && error.status === 403 && error.code === 'CSRF_INVALID'; }
export function formatPaymentError(error: unknown): string {
  if (error instanceof UnverifiableCashPaymentResponseError) return 'La respuesta de pago no se puede verificar. No cobres otra vez; requiere conciliación operativa.';
  if (error instanceof TypeError) return error.message;
  if (!(error instanceof ApiError)) return 'No fue posible completar el cobro.';
  if (error.status === 0 || error.status === 503) return 'Resultado incierto. No hay recibo definitivo; reintenta exactamente el mismo cobro o realiza conciliación.';
  if (error.status === 403 && error.code === 'CSRF_INVALID') return 'La sesión de seguridad cambió. Reintenta exactamente el mismo cobro.';
  if (error.status === 409) return 'La orden o la caja cambió de estado. No se confirmó un cobro ni se emitió ticket.';
  if (error.status === 403) return 'Sólo el responsable de la caja abierta puede cobrar.';
  if (error.status === 401) return 'Tu sesión venció. Vuelve a acceder.';
  return 'No fue posible completar el cobro. No hay ticket definitivo.';
}

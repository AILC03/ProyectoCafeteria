import { ApiError, apiFetch } from '../../../shared/api/client';
import {
  UnverifiableCashPaymentResponseError,
  getProtectedTicket,
  type Ticket,
} from '../payment/paymentApi';

const ID = /^[1-9][0-9]{0,18}$/;
const SALE_NUMBER = /^V[0-9]{6,}$/;
const CENTS = /^[0-9]+$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const METHODS = new Set(['CASH', 'STRIPE']);
const ORDERS = new Set(['asc', 'desc']);
const FILTER_KEYS = new Set(['from', 'to', 'method', 'order', 'limit']);
const SALE_KEYS = new Set(['id', 'saleNumber', 'orderId', 'paymentId', 'totalCents', 'soldAt', 'method']);
const PAGE_KEYS = new Set(['limit', 'nextCursor']);
const SALES_ROOT_KEYS = new Set(['data', 'page']);
const SUMMARY_KEYS = new Set(['count', 'totalCents', 'cashCents', 'stripeCents']);
const SUMMARY_ROOT_KEYS = new Set(['data']);

export type SalesMethod = 'CASH' | 'STRIPE';
export type SalesOrder = 'asc' | 'desc';
export type SalesFilter = {
  from?: string;
  to?: string;
  method?: SalesMethod;
  order?: SalesOrder;
  limit?: number;
};
export type Sale = {
  id: string;
  saleNumber: string;
  orderId: string;
  paymentId: string;
  totalCents: string;
  soldAt: string;
  method: SalesMethod;
};
export type SalesPage = { items: Sale[]; limit: number; nextCursor: string | null };
export type SalesSummary = { count: string; totalCents: string; cashCents: string; stripeCents: string };

export class UnverifiableSalesResponseError extends Error {
  constructor() {
    super('La respuesta de ventas no se puede verificar');
    this.name = 'UnverifiableSalesResponseError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => keys.has(key));
}

function dateTime(value: unknown): value is string {
  return typeof value === 'string' && DATE_TIME.test(value) && Number.isFinite(Date.parse(value));
}

function id(value: unknown): value is string {
  return typeof value === 'string' && ID.test(value);
}

function cents(value: unknown): value is string {
  return typeof value === 'string' && CENTS.test(value);
}

function method(value: unknown): value is SalesMethod {
  return typeof value === 'string' && METHODS.has(value);
}

function cursorValue(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 2048;
}

function normalizeFilter(value: unknown): SalesFilter {
  if (value === undefined || value === null) return {};
  if (!isRecord(value) || !hasOnlyKeys(value, FILTER_KEYS)) {
    throw new TypeError('Los filtros de ventas contienen campos no permitidos.');
  }
  const filter: SalesFilter = {};
  if (value.from !== undefined) {
    if (!dateTime(value.from)) throw new TypeError('La fecha de inicio no es válida.');
    filter.from = value.from;
  }
  if (value.to !== undefined) {
    if (!dateTime(value.to)) throw new TypeError('La fecha de fin no es válida.');
    filter.to = value.to;
  }
  if (filter.from !== undefined && filter.to !== undefined && Date.parse(filter.from) >= Date.parse(filter.to)) {
    throw new TypeError('El rango de fechas no es válido.');
  }
  if (value.method !== undefined) {
    if (!method(value.method)) throw new TypeError('El método de pago no es válido.');
    filter.method = value.method;
  }
  if (value.order !== undefined) {
    if (typeof value.order !== 'string' || !ORDERS.has(value.order)) {
      throw new TypeError('El orden de ventas no es válido.');
    }
    filter.order = value.order as SalesOrder;
  }
  if (value.limit !== undefined) {
    if (!Number.isInteger(value.limit) || (value.limit as number) < 1 || (value.limit as number) > 100) {
      throw new TypeError('El límite de ventas debe estar entre 1 y 100.');
    }
    filter.limit = value.limit as number;
  }
  return filter;
}

/** Builds only the query parameters accepted by the contract, in a stable order. */
export function buildSalesQuery(
  filter: SalesFilter = {},
  cursor?: string,
  includeLimit = true,
): string {
  const normalized = normalizeFilter(filter);
  if (cursor !== undefined && !cursorValue(cursor)) throw new TypeError('El cursor no es válido.');
  const params = new URLSearchParams();
  if (normalized.from !== undefined) params.set('from', normalized.from);
  if (normalized.to !== undefined) params.set('to', normalized.to);
  if (normalized.method !== undefined) params.set('method', normalized.method);
  if (normalized.order !== undefined) params.set('order', normalized.order);
  if (includeLimit) params.set('limit', String(normalized.limit ?? 20));
  if (cursor !== undefined) params.set('cursor', cursor);
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}

function parseSale(value: unknown): Sale {
  if (!isRecord(value) || !hasOnlyKeys(value, SALE_KEYS)
    || !id(value.id) || typeof value.saleNumber !== 'string' || !SALE_NUMBER.test(value.saleNumber)
    || !id(value.orderId) || !id(value.paymentId)
    || !cents(value.totalCents) || !dateTime(value.soldAt) || !method(value.method)) {
    throw new UnverifiableSalesResponseError();
  }
  return {
    id: value.id,
    saleNumber: value.saleNumber,
    orderId: value.orderId,
    paymentId: value.paymentId,
    totalCents: value.totalCents,
    soldAt: value.soldAt,
    method: value.method,
  };
}

function parsePage(value: unknown): SalesPage {
  if (!isRecord(value) || !hasOnlyKeys(value, SALES_ROOT_KEYS) || !Array.isArray(value.data) || !isRecord(value.page)
    || !hasOnlyKeys(value.page, PAGE_KEYS)
    || !Number.isInteger(value.page.limit) || (value.page.limit as number) < 1
    || (value.page.limit as number) > 100
    || (value.page.nextCursor !== null && !cursorValue(value.page.nextCursor))) {
    throw new UnverifiableSalesResponseError();
  }
  return {
    items: value.data.map(parseSale),
    limit: value.page.limit as number,
    nextCursor: value.page.nextCursor as string | null,
  };
}

function parseSummary(value: unknown): SalesSummary {
  if (!isRecord(value) || !hasOnlyKeys(value, SUMMARY_KEYS)
    || !cents(value.count) || !cents(value.totalCents)
    || !cents(value.cashCents) || !cents(value.stripeCents)) {
    throw new UnverifiableSalesResponseError();
  }
  return {
    count: value.count,
    totalCents: value.totalCents,
    cashCents: value.cashCents,
    stripeCents: value.stripeCents,
  };
}

/** Lists operational sales. The cursor is sent only after an explicit user action. */
export async function listSales(
  filter: SalesFilter = {},
  cursor?: string,
  signal?: AbortSignal,
): Promise<SalesPage> {
  const response = await apiFetch<unknown>(`/sales${buildSalesQuery(filter, cursor, true)}`, {
    signal,
  });
  return parsePage(response);
}

/** Totals for the whole filtered set, not just the current page. */
export async function getSalesSummary(filter: SalesFilter = {}): Promise<SalesSummary> {
  const response = await apiFetch<{ data?: unknown }>(`/sales/summary${buildSalesQuery(filter, undefined, false)}`);
  if (!isRecord(response) || !hasOnlyKeys(response, SUMMARY_ROOT_KEYS)) throw new UnverifiableSalesResponseError();
  return parseSummary(response.data);
}

/**
 * Reprints an existing sale receipt. It is a read-only GET: it never charges,
 * issues ticket access or renews a registration token.
 */
export async function reprintSaleTicket(saleId: string): Promise<Ticket> {
  if (!id(saleId)) throw new TypeError('Venta no válida.');
  return getProtectedTicket(saleId);
}

export function formatSalesError(error: unknown): string {
  if (error instanceof UnverifiableSalesResponseError) return 'La respuesta de ventas no se puede verificar. No hay datos operativos seguros para mostrar.';
  if (error instanceof TypeError) return error.message;
  if (!(error instanceof ApiError)) return 'No fue posible consultar las ventas.';
  if (error.status === 403) return 'Sólo caja y administración pueden consultar las ventas.';
  if (error.status === 404) return 'La consulta de ventas no está disponible.';
  if (error.status === 400) return 'Los filtros de ventas no son válidos.';
  if (error.status === 401) return 'Tu sesión venció. Vuelve a acceder.';
  if (error.status === 429) return 'Demasiadas consultas. Inténtalo más tarde.';
  if (error.status === 0 || error.status === 503) return 'No fue posible consultar las ventas. Inténtalo de nuevo.';
  return 'No fue posible consultar las ventas.';
}

export function formatTicketError(error: unknown): string {
  if (error instanceof UnverifiableCashPaymentResponseError) return 'La respuesta del ticket no se puede verificar. No se realizó ningún cobro.';
  if (error instanceof TypeError) return error.message;
  if (!(error instanceof ApiError)) return 'No fue posible reimprimir el ticket.';
  if (error.status === 404) return 'No fue posible reimprimir: la venta no existe.';
  if (error.status === 403) return 'No tienes permiso para reimprimir esta venta.';
  if (error.status === 401) return 'Tu sesión venció. Vuelve a acceder.';
  if (error.status === 0 || error.status === 503) return 'No fue posible reimprimir el ticket. Inténtalo de nuevo.';
  return 'No fue posible reimprimir el ticket.';
}

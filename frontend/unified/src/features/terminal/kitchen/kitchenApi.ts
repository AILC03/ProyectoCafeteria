import { ApiError, apiFetch } from '../../../shared/api/client';

const ID = /^[1-9][0-9]{0,18}$/;
const FOLIO = /^A[0-9]{6,}$/;
const CENTS = /^(0|[1-9][0-9]{0,6})$/;
const SURCHARGE = /^(0|[1-9][0-9]{0,6})$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const SOURCES = new Set(['MOBILE', 'CASHIER']);
const STATUSES = new Set(['PENDIENTE_PAGO', 'EN_PREPARACION', 'LISTO', 'EXPIRADA']);
const METHODS = new Set(['CASH', 'STRIPE']);
const ROOT_KEYS = new Set(['data', 'page']);
const PAGE_KEYS = new Set(['limit', 'nextCursor']);
const SUMMARY_KEYS = new Set(['id', 'folio', 'guestName', 'status', 'createdAt']);
const ORDER_KEYS = new Set([
  'id', 'folio', 'source', 'status', 'paymentMethod', 'totalCents', 'customerId',
  'guestName', 'paymentExpiresAt', 'paidAt', 'readyAt', 'readyByEmployeeId',
  'createdAt', 'items',
]);
const ITEM_KEYS = new Set([
  'id', 'productId', 'productName', 'basePriceCents', 'unitPriceCents',
  'quantity', 'lineTotalCents', 'options',
]);
const OPTION_KEYS = new Set(['optionValueId', 'groupName', 'optionName', 'surchargeCents']);
const READY_ROOT_KEYS = new Set(['data']);

export type KitchenOrderSummary = {
  id: string;
  folio: string;
  guestName: string | null;
  status: 'EN_PREPARACION';
  createdAt: string;
};
export type KitchenPageData = {
  items: KitchenOrderSummary[];
  limit: number;
  nextCursor: string | null;
};
export type KitchenOrderOption = {
  optionValueId: string;
  groupName: string;
  optionName: string;
  surchargeCents: string;
};
export type KitchenOrderItem = {
  id: string;
  productId: string;
  productName: string;
  basePriceCents: string;
  unitPriceCents: string;
  quantity: number;
  lineTotalCents: string;
  options: KitchenOrderOption[];
};
export type KitchenOrder = {
  id: string;
  folio: string;
  source: string;
  status: string;
  paymentMethod: string;
  totalCents: string;
  customerId: string | null;
  guestName: string | null;
  paymentExpiresAt: string;
  paidAt: string | null;
  readyAt: string | null;
  readyByEmployeeId: string | null;
  createdAt: string;
  items: KitchenOrderItem[];
};

/** A successful response that cannot be matched to the contract is never rendered as truth. */
export class UnverifiableKitchenResponseError extends Error {
  constructor() {
    super('La respuesta de cocina no se puede verificar');
    this.name = 'UnverifiableKitchenResponseError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => keys.has(key));
}

function id(value: unknown): value is string {
  return typeof value === 'string' && ID.test(value);
}

function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= max;
}

function dateTime(value: unknown): value is string {
  return typeof value === 'string' && DATE_TIME.test(value) && Number.isFinite(Date.parse(value));
}

function cursorValue(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 2048;
}

function parseOption(value: unknown): KitchenOrderOption {
  if (!isRecord(value) || !hasOnlyKeys(value, OPTION_KEYS)
    || !id(value.optionValueId) || !text(value.groupName, 120) || !text(value.optionName, 120)
    || typeof value.surchargeCents !== 'string' || !SURCHARGE.test(value.surchargeCents)) {
    throw new UnverifiableKitchenResponseError();
  }
  return {
    optionValueId: value.optionValueId,
    groupName: value.groupName,
    optionName: value.optionName,
    surchargeCents: value.surchargeCents,
  };
}

function parseItem(value: unknown): KitchenOrderItem {
  if (!isRecord(value) || !hasOnlyKeys(value, ITEM_KEYS)
    || !id(value.id) || !id(value.productId) || !text(value.productName, 160)
    || typeof value.basePriceCents !== 'string' || !CENTS.test(value.basePriceCents)
    || typeof value.unitPriceCents !== 'string' || !CENTS.test(value.unitPriceCents)
    || !Number.isInteger(value.quantity) || (value.quantity as number) < 1 || (value.quantity as number) > 99
    || typeof value.lineTotalCents !== 'string' || !CENTS.test(value.lineTotalCents)
    || !Array.isArray(value.options)) {
    throw new UnverifiableKitchenResponseError();
  }
  return {
    id: value.id,
    productId: value.productId,
    productName: value.productName,
    basePriceCents: value.basePriceCents,
    unitPriceCents: value.unitPriceCents,
    quantity: value.quantity as number,
    lineTotalCents: value.lineTotalCents,
    options: value.options.map(parseOption),
  };
}

function parseOrder(value: unknown, expectedStatus: string): KitchenOrder {
  if (!isRecord(value) || !hasOnlyKeys(value, ORDER_KEYS)
    || !id(value.id) || typeof value.folio !== 'string' || !FOLIO.test(value.folio)
    || typeof value.source !== 'string' || !SOURCES.has(value.source)
    || value.status !== expectedStatus || typeof value.status !== 'string' || !STATUSES.has(value.status)
    || typeof value.paymentMethod !== 'string' || !METHODS.has(value.paymentMethod)
    || typeof value.totalCents !== 'string' || !CENTS.test(value.totalCents)
    || (value.customerId !== null && !id(value.customerId))
    || (value.guestName !== null && !text(value.guestName, 120))
    || !dateTime(value.paymentExpiresAt)
    || (value.paidAt !== null && !dateTime(value.paidAt))
    || (value.readyAt !== null && !dateTime(value.readyAt))
    || (value.readyByEmployeeId !== null && !id(value.readyByEmployeeId))
    || !dateTime(value.createdAt)
    || !Array.isArray(value.items) || value.items.length < 1 || value.items.length > 50) {
    throw new UnverifiableKitchenResponseError();
  }
  return {
    id: value.id,
    folio: value.folio,
    source: value.source,
    status: value.status,
    paymentMethod: value.paymentMethod,
    totalCents: value.totalCents,
    customerId: value.customerId as string | null,
    guestName: value.guestName as string | null,
    paymentExpiresAt: value.paymentExpiresAt,
    paidAt: value.paidAt as string | null,
    readyAt: value.readyAt as string | null,
    readyByEmployeeId: value.readyByEmployeeId as string | null,
    createdAt: value.createdAt,
    items: value.items.map(parseItem),
  };
}

function parseSummary(value: unknown): KitchenOrderSummary {
  if (!isRecord(value) || !hasOnlyKeys(value, SUMMARY_KEYS)
    || !id(value.id) || typeof value.folio !== 'string' || !FOLIO.test(value.folio)
    || (value.guestName !== null && !text(value.guestName, 120))
    || value.status !== 'EN_PREPARACION' || !dateTime(value.createdAt)) {
    throw new UnverifiableKitchenResponseError();
  }
  return {
    id: value.id,
    folio: value.folio,
    guestName: value.guestName as string | null,
    status: 'EN_PREPARACION',
    createdAt: value.createdAt,
  };
}

function parsePage(value: unknown): KitchenPageData {
  if (!isRecord(value) || !hasOnlyKeys(value, ROOT_KEYS)
    || !Array.isArray(value.data) || !isRecord(value.page)
    || !hasOnlyKeys(value.page, PAGE_KEYS)
    || !Number.isInteger(value.page.limit) || (value.page.limit as number) < 1
    || (value.page.limit as number) > 100
    || (value.page.nextCursor !== null && !cursorValue(value.page.nextCursor))) {
    throw new UnverifiableKitchenResponseError();
  }
  return {
    items: value.data.map(parseSummary),
    limit: value.page.limit as number,
    nextCursor: value.page.nextCursor as string | null,
  };
}

/** Only the two contract query parameters are emitted, in a stable order. */
export function buildPreparationQuery(limit = 20, cursor?: string): string {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new TypeError('El límite de la cola debe estar entre 1 y 100.');
  if (cursor !== undefined && !cursorValue(cursor)) throw new TypeError('El cursor de la cola no es válido.');
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  if (cursor !== undefined) params.set('cursor', cursor);
  return `?${params.toString()}`;
}

/** Only orders still in EN_PREPARACION are returned by the backend. */
export async function listPreparationOrders(limit = 20, cursor?: string, signal?: AbortSignal): Promise<KitchenPageData> {
  const response = await apiFetch<unknown>(`/preparation/orders${buildPreparationQuery(limit, cursor)}`, { signal });
  return parsePage(response);
}

/** Detail required to display products and options; status is rechecked locally. */
export async function getKitchenOrder(orderId: string, signal?: AbortSignal): Promise<KitchenOrder> {
  if (!id(orderId)) throw new TypeError('Orden no válida.');
  const response = await apiFetch<unknown>(`/orders/${orderId}`, { signal });
  if (!isRecord(response) || !hasOnlyKeys(response, new Set(['data']))) throw new UnverifiableKitchenResponseError();
  const order = parseOrder(response.data, 'EN_PREPARACION');
  if (order.id !== orderId) throw new UnverifiableKitchenResponseError();
  return order;
}

/**
 * Marks a paid EN_PREPARACION order as LISTO. Body is exactly `{}`; the backend
 * rejects invalid states with 409 and never needs an automatic retry here.
 */
export async function markOrderReady(orderId: string): Promise<KitchenOrder> {
  if (!id(orderId)) throw new TypeError('Orden no válida.');
  const response = await apiFetch<unknown>(`/orders/${orderId}/ready`, { method: 'POST', body: {} });
  if (!isRecord(response) || !hasOnlyKeys(response, READY_ROOT_KEYS)) throw new UnverifiableKitchenResponseError();
  const order = parseOrder(response.data, 'LISTO');
  if (order.id !== orderId || order.paidAt === null || order.readyAt === null || order.readyByEmployeeId === null) {
    throw new UnverifiableKitchenResponseError();
  }
  return order;
}

export function formatKitchenError(error: unknown): string {
  if (error instanceof UnverifiableKitchenResponseError) return 'La respuesta de cocina no se puede verificar. No se mostró ningún cambio.';
  if (error instanceof TypeError) return error.message;
  if (!(error instanceof ApiError)) return 'No fue posible consultar la cola de cocina.';
  if (error.status === 403) return 'Sólo preparación, caja y administración pueden usar la cocina.';
  if (error.status === 404) return 'La orden ya no está disponible.';
  if (error.status === 409) return 'La orden ya no está en preparación. Se intentará actualizar la cola; no se marcará de nuevo.';
  if (error.status === 400) return 'La consulta de cocina no es válida.';
  if (error.status === 401) return 'Tu sesión venció. Vuelve a acceder.';
  if (error.status === 429) return 'Demasiadas consultas. Inténtalo más tarde.';
  if (error.status === 0 || error.status === 503) return 'No fue posible consultar la cocina. Inténtalo de nuevo.';
  return 'No fue posible completar la operación de cocina.';
}

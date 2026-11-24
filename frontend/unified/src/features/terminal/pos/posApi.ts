import { ApiError, apiFetch } from '../../../shared/api/client';
import { idempotencyOperations, isUncertainIdempotencyFailure, type IdempotentOperation } from '../../../shared/api/idempotency';

const ID_PATTERN = /^[1-9][0-9]{0,18}$/;
const IDENTIFIER_PATTERN = /^(C[0-9]{1,19}|\+52[0-9]{10}|[0-9]{10})$/;
const CENTS_PATTERN = /^(0|[1-9][0-9]{0,6})$/;
const ORDER_STATUSES = new Set(['PENDIENTE_PAGO', 'EN_PREPARACION', 'LISTO', 'EXPIRADA']);
const CREATED_PAYMENT_METHODS = new Set(['CASH']);
const ASSOCIABLE_PAYMENT_METHODS = new Set(['CASH', 'STRIPE']);

export type PosLineInput = {
  productId: string;
  quantity: number;
  optionValueIds?: readonly string[];
};

export type OrderCustomerMinimum = {
  id: string;
  name: string;
  customerNumber: string;
};

export type OrderCustomerSelection = {
  identifier: string;
  confirmedName: string;
};

export type PosOrderItem = {
  id: string;
  productId: string;
  productName: string;
  basePriceCents: string;
  unitPriceCents: string;
  quantity: number;
  lineTotalCents: string;
  options: Array<{
    optionValueId: string;
    groupName: string;
    optionName: string;
    surchargeCents: string;
  }>;
};

/** Public order payload. It never includes payment, ticket or QR material. */
export type PosOrder = {
  id: string;
  folio: string;
  source: 'MOBILE' | 'CASHIER';
  status: string;
  paymentMethod: 'CASH' | 'STRIPE';
  totalCents: string;
  customerId: string | null;
  guestName: string | null;
  paymentExpiresAt: string;
  paidAt: string | null;
  readyAt: string | null;
  readyByEmployeeId: string | null;
  createdAt: string;
  items: PosOrderItem[];
};

/** A successful HTTP response consumed the key but cannot establish an order. */
export class UnverifiableCashierOrderResponseError extends Error {
  constructor() {
    super('Cashier order response cannot be verified');
    this.name = 'UnverifiableCashierOrderResponseError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isVerifiableOrder(
  value: unknown,
  paymentMethods: ReadonlySet<string> = CREATED_PAYMENT_METHODS,
): value is PosOrder {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string' && ID_PATTERN.test(value.id)
    && typeof value.folio === 'string' && /^A[0-9]{6,}$/.test(value.folio)
    && (value.source === 'CASHIER' || value.source === 'MOBILE')
    && typeof value.status === 'string' && ORDER_STATUSES.has(value.status)
    && typeof value.paymentMethod === 'string' && paymentMethods.has(value.paymentMethod)
    && typeof value.totalCents === 'string' && CENTS_PATTERN.test(value.totalCents)
    && (value.customerId === null || typeof value.customerId === 'string' && ID_PATTERN.test(value.customerId))
    && (value.guestName === null || typeof value.guestName === 'string')
    && typeof value.paymentExpiresAt === 'string' && Number.isFinite(Date.parse(value.paymentExpiresAt))
    && (value.paidAt === null || typeof value.paidAt === 'string' && Number.isFinite(Date.parse(value.paidAt)))
    && (value.readyAt === null || typeof value.readyAt === 'string')
    && (value.readyByEmployeeId === null || typeof value.readyByEmployeeId === 'string')
    && typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt))
    && Array.isArray(value.items) && value.items.length > 0 && value.items.length <= 50;
}

function isVerifiableCustomer(value: unknown): value is OrderCustomerMinimum {
  return isRecord(value)
    && typeof value.id === 'string' && ID_PATTERN.test(value.id)
    && typeof value.name === 'string' && value.name.trim().length > 0 && value.name.length <= 120
    && typeof value.customerNumber === 'string' && value.customerNumber.trim().length > 0 && value.customerNumber.length <= 20;
}

/** Normalization is limited to trim/uppercase; the API owns exact matching rules. */
export function normalizeCustomerIdentifier(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidCustomerIdentifier(value: string): boolean {
  return IDENTIFIER_PATTERN.test(normalizeCustomerIdentifier(value));
}

function assertSelection(selection: OrderCustomerSelection): OrderCustomerSelection {
  const identifier = normalizeCustomerIdentifier(selection.identifier);
  const confirmedName = selection.confirmedName.trim();
  if (!IDENTIFIER_PATTERN.test(identifier)) throw new TypeError('El identificador de cliente no es válido.');
  if (confirmedName.length < 1 || confirmedName.length > 120) throw new TypeError('Confirma un nombre de hasta 120 caracteres.');
  return Object.freeze({ identifier, confirmedName });
}

/**
 * No prices, totals, QR flags, customerId, source or state enter the snapshot.
 * The exact snapshot is reused by every authorized retry.
 */
export function prepareCashierOrder(
  lines: readonly PosLineInput[],
  customer?: OrderCustomerSelection,
  guestName?: string,
): IdempotentOperation {
  if (lines.length < 1 || lines.length > 50) throw new TypeError('La orden debe tener entre 1 y 50 líneas.');
  const items = lines.map((line) => {
    if (typeof line.productId !== 'string' || !ID_PATTERN.test(line.productId)) {
      throw new TypeError('Producto no válido en la orden.');
    }
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) {
      throw new TypeError('Cantidad no válida en la orden.');
    }
    const optionValueIds = [...(line.optionValueIds ?? [])];
    if (optionValueIds.length > 5000 || new Set(optionValueIds).size !== optionValueIds.length
      || optionValueIds.some((id) => typeof id !== 'string' || !ID_PATTERN.test(id))) {
      throw new TypeError('Opciones no válidas en la orden.');
    }
    return { productId: line.productId, quantity: line.quantity, optionValueIds };
  });

  const selection = customer === undefined ? undefined : assertSelection(customer);
  const trimmedGuest = guestName?.trim();
  if (selection !== undefined && trimmedGuest !== undefined && trimmedGuest.length > 0) {
    throw new TypeError('Cliente y nombre de invitado son excluyentes.');
  }
  if (trimmedGuest !== undefined && trimmedGuest.length > 120) {
    throw new TypeError('El nombre de invitado no puede superar 120 caracteres.');
  }

  return idempotencyOperations.create({
    paymentMethod: 'CASH',
    items,
    ...(selection !== undefined ? { customer: selection } : {}),
    ...(selection === undefined && trimmedGuest !== undefined && trimmedGuest.length > 0 ? { guestName: trimmedGuest } : {}),
  });
}

export async function sendCashierOrder(
  operation: IdempotentOperation,
  signal?: AbortSignal,
): Promise<PosOrder> {
  let response: { data?: unknown };
  try {
    response = await idempotencyOperations.send<{ data?: unknown }>(operation, '/cashier/orders', { method: 'POST', signal });
  } catch (error) {
    // A malformed 2xx body raises SyntaxError after the key has been finalized.
    if (error instanceof SyntaxError) throw new UnverifiableCashierOrderResponseError();
    throw error;
  }
  if (!isVerifiableOrder(response?.data) || response.data.source !== 'CASHIER'
    || response.data.status !== 'PENDIENTE_PAGO' || response.data.paidAt !== null) {
    throw new UnverifiableCashierOrderResponseError();
  }
  return response.data;
}

/** Client-side guard only; the API still enforces state under lock. */
export function isOrderAssociable(order: PosOrder, now = Date.now()): boolean {
  return order.status === 'PENDIENTE_PAGO'
    && order.paidAt === null
    && Number.isFinite(Date.parse(order.paymentExpiresAt))
    && Date.parse(order.paymentExpiresAt) > now;
}

export async function searchOrderCustomer(
  rawIdentifier: string,
  signal?: AbortSignal,
): Promise<OrderCustomerMinimum> {
  const identifier = normalizeCustomerIdentifier(rawIdentifier);
  if (!IDENTIFIER_PATTERN.test(identifier)) throw new TypeError('Introduce un teléfono MX de 10 dígitos o un número de cliente.');
  const response = await apiFetch<{ data?: unknown }>('/cashier/customers/search', {
    method: 'POST',
    body: { identifier },
    signal,
  });
  if (!isVerifiableCustomer(response?.data)) throw new UnverifiableCashierOrderResponseError();
  return response.data;
}

export async function associateOrderCustomer(
  orderId: string,
  selection: OrderCustomerSelection,
  signal?: AbortSignal,
): Promise<PosOrder> {
  const normalizedId = orderId.trim();
  if (!ID_PATTERN.test(normalizedId)) throw new TypeError('Introduce un ID de orden válido.');
  const body = assertSelection(selection);
  const response = await apiFetch<{ data?: unknown }>(`/cashier/orders/${encodeURIComponent(normalizedId)}/customer`, {
    method: 'PATCH',
    body,
    signal,
  });
  if (!isVerifiableOrder(response?.data, ASSOCIABLE_PAYMENT_METHODS)
    || response.data.status !== 'PENDIENTE_PAGO' || response.data.paidAt !== null) {
    throw new UnverifiableCashierOrderResponseError();
  }
  return response.data;
}

export function shouldKeepCashierOrderOperation(error: unknown): boolean {
  return isUncertainIdempotencyFailure(error)
    || error instanceof ApiError && error.status === 403 && error.code === 'CSRF_INVALID';
}

export function formatPosError(error: unknown): string {
  if (error instanceof UnverifiableCashierOrderResponseError) {
    return 'La respuesta no permite verificar la orden. No crees otra ni reintentes; confirma con la cafetería si se registró. No hay pago confirmado.';
  }
  if (error instanceof TypeError) return error.message;
  if (!(error instanceof ApiError)) return 'No fue posible completar la operación. Inténtalo de nuevo.';
  if (error.status === 0) return 'Sin conexión con el servidor. No repitas como pedido nuevo; usa el reintento de la misma operación.';
  if (error.status === 401) return 'Tu sesión venció. Vuelve a acceder antes de continuar.';
  if (error.status === 403) {
    return error.code === 'CSRF_INVALID'
      ? 'Sesión de seguridad desactualizada. Reintenta la misma operación.'
      : 'Tu perfil no tiene permiso para esta operación de terminal.';
  }
  if (error.status === 404) return 'No encontramos el cliente o la orden indicada.';
  if (error.status === 409) return 'La orden ya no permite asociar clientes o el nombre confirmado no coincide.';
  if (error.status === 429) return 'Demasiadas operaciones seguidas. Espera un momento e inténtalo de nuevo.';
  if (error.status >= 500) return 'El servicio no está disponible. No repitas como pedido nuevo; usa el reintento de la misma operación.';
  return 'No fue posible completar la operación. Revisa los datos e inténtalo de nuevo.';
}

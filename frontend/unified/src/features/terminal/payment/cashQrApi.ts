import { ApiError, apiFetch } from '../../../shared/api/client';

const ID = /^[1-9][0-9]{0,18}$/;
const CENTS = /^(0|[1-9][0-9]{0,18})$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const PREFIX = 'cafeteria:cash:';

export type ScannedCashOrder = {
  orderId: string;
  orderFolio: string;
  totalCents: string;
  paymentExpiresAt: string;
  items: Array<{
    productName: string;
    quantity: number;
    options?: Array<{ optionName: string }>;
  }>;
};

/** Accepts the raw token or the exact QR payload; URLs and other purposes are rejected. */
export function cashQrToken(value: string): string | null {
  const trimmed = value.trim();
  const token = trimmed.startsWith(PREFIX) ? trimmed.slice(PREFIX.length) : trimmed;
  if (!TOKEN.test(token)) return null;
  if (trimmed.includes(':') && !trimmed.startsWith(PREFIX)) return null;
  return token;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function verified(value: unknown): ScannedCashOrder | null {
  if (!record(value) || typeof value.orderId !== 'string' || !ID.test(value.orderId)
    || typeof value.orderFolio !== 'string' || !/^A[0-9]{6,}$/.test(value.orderFolio)
    || typeof value.totalCents !== 'string' || !CENTS.test(value.totalCents)
    || typeof value.paymentExpiresAt !== 'string' || !Number.isFinite(Date.parse(value.paymentExpiresAt))
    || !Array.isArray(value.items)) return null;
  const items: ScannedCashOrder['items'] = [];
  for (const item of value.items) {
    if (!record(item) || typeof item.productName !== 'string' || typeof item.quantity !== 'number'
      || !Number.isInteger(item.quantity) || item.quantity < 1) return null;
    const options: Array<{ optionName: string }> = [];
    if (item.options !== undefined) {
      if (!Array.isArray(item.options)) return null;
      for (const option of item.options) {
        if (!record(option) || typeof option.optionName !== 'string') return null;
        options.push({ optionName: option.optionName });
      }
    }
    items.push({ productName: item.productName, quantity: item.quantity, ...(options.length > 0 ? { options } : {}) });
  }
  return {
    orderId: value.orderId,
    orderFolio: value.orderFolio,
    totalCents: value.totalCents,
    paymentExpiresAt: value.paymentExpiresAt,
    items,
  };
}

/** Read-only lookup: scanning never confirms a payment or changes the kitchen queue. */
export async function scanCashQr(token: string): Promise<ScannedCashOrder> {
  if (!TOKEN.test(token)) throw new TypeError('El código QR no es válido.');
  const response = await apiFetch<{ data?: unknown }>('/cashier/orders/scan-cash-qr', {
    method: 'POST',
    body: { token },
  });
  const order = verified(response?.data);
  if (order === null) throw new Error('La orden escaneada no se puede verificar.');
  return order;
}

export function formatCashQrError(error: unknown): string {
  if (error instanceof TypeError) return error.message;
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión venció. Vuelve a acceder.';
    if (error.status === 403) return 'Sólo caja o administración pueden escanear y cobrar QR.';
    if (error.status === 404) return 'El código no corresponde a una orden disponible. Pide al cliente que lo genere de nuevo.';
    if (error.status === 409) return 'La orden ya fue pagada, venció o no es cobrable en efectivo.';
    if (error.status === 429) return 'Demasiados intentos. Espera un momento.';
    if (error.status === 0 || error.status >= 500) return 'No se pudo consultar la orden. Reintenta.';
  }
  return 'No se pudo cargar la orden escaneada.';
}

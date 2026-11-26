import { ApiError, apiFetch } from '../../../shared/api/client';
import { idempotencyOperations, isUncertainIdempotencyFailure, type IdempotentOperation } from '../../../shared/api/idempotency';

const ID_PATTERN = /^[1-9][0-9]{0,18}$/;
const CENTS_PATTERN = /^(0|[1-9][0-9]{0,18})$/;
const MXN_INPUT_PATTERN = /^(0|[1-9][0-9]{0,17})(\.[0-9]{1,2})?$/;

export type CashSession = {
  id: string;
  employeeId: string;
  openedAt: string;
  closedAt: string | null;
  closedByEmployeeId: string | null;
  exceptionalCloseReason: string | null;
  openingAmountCents: string;
  expectedCashCents: string | null;
  countedCashCents: string | null;
  differenceCents: string | null;
  cashSalesCents: string;
  successfulPayments: string;
  computedExpectedCashCents: string;
};

export type CashCloseInput = {
  countedCashCents: string;
  exceptionalCloseReason?: string;
};

/** A successful HTTP response that cannot be parsed must not be acted upon. */
export class UnverifiableCashSessionResponseError extends Error {
  constructor() {
    super('Cash session response cannot be verified');
    this.name = 'UnverifiableCashSessionResponseError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isDateString(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isNullableCents(value: unknown): boolean {
  return value === null || typeof value === 'string' && CENTS_PATTERN.test(value);
}

function isVerifiableCashSession(value: unknown): value is CashSession {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string' && ID_PATTERN.test(value.id)
    && typeof value.employeeId === 'string' && ID_PATTERN.test(value.employeeId)
    && isDateString(value.openedAt)
    && (value.closedAt === null || isDateString(value.closedAt))
    && (value.closedByEmployeeId === null || typeof value.closedByEmployeeId === 'string' && ID_PATTERN.test(value.closedByEmployeeId))
    && (value.exceptionalCloseReason === null || typeof value.exceptionalCloseReason === 'string'
      && value.exceptionalCloseReason.trim().length > 0 && value.exceptionalCloseReason.length <= 500)
    && isNullableCents(value.openingAmountCents) && value.openingAmountCents !== null
    && isNullableCents(value.expectedCashCents)
    && isNullableCents(value.countedCashCents)
    && (value.differenceCents === null || typeof value.differenceCents === 'string' && /^-?(0|[1-9][0-9]{0,18})$/.test(value.differenceCents))
    && isNullableCents(value.cashSalesCents) && value.cashSalesCents !== null
    && typeof value.successfulPayments === 'string' && /^[0-9]+$/.test(value.successfulPayments)
    && isNullableCents(value.computedExpectedCashCents) && value.computedExpectedCashCents !== null;
}

/** Converts a typed MXN amount to an integer cent string without using Number. */
export function parseMxnAmountToCents(input: string): string {
  const value = input.trim();
  if (!MXN_INPUT_PATTERN.test(value)) throw new TypeError('Introduce un importe válido en MXN (hasta 2 decimales).');
  const [whole, fraction = ''] = value.split('.');
  const cents = `${whole ?? '0'}${(fraction ?? '').padEnd(2, '0')}`.replace(/^0+(?=\d)/, '');
  const normalized = cents.length === 0 ? '0' : cents;
  if (!CENTS_PATTERN.test(normalized)) throw new TypeError('El importe excede el máximo permitido.');
  return normalized;
}

function assertAmount(cents: string, label: string): string {
  const value = cents.trim();
  if (!CENTS_PATTERN.test(value)) throw new TypeError(`${label} no válido.`);
  return value;
}

function assertSessionId(id: string): string {
  const value = id.trim();
  if (!ID_PATTERN.test(value)) throw new TypeError('ID de caja no válido.');
  return value;
}

function assertCloseInput(input: CashCloseInput): CashCloseInput {
  const countedCashCents = assertAmount(input.countedCashCents, 'Importe contado');
  const reason = input.exceptionalCloseReason?.trim();
  const hasReason = reason !== undefined && reason.length > 0;
  if (hasReason && reason.length > 500) throw new TypeError('El motivo no puede superar 500 caracteres.');
  return Object.freeze({
    countedCashCents,
    ...(hasReason ? { exceptionalCloseReason: reason } : {}),
  });
}

export async function getCurrentCashSession(signal?: AbortSignal): Promise<CashSession | null> {
  const response = await apiFetch<{ data?: unknown }>('/cash-sessions/current', { signal });
  if (response?.data === null) return null;
  if (!isVerifiableCashSession(response?.data)) throw new UnverifiableCashSessionResponseError();
  return response.data;
}

export async function getCashSession(id: string, signal?: AbortSignal): Promise<CashSession> {
  const response = await apiFetch<{ data?: unknown }>(`/cash-sessions/${encodeURIComponent(assertSessionId(id))}`, { signal });
  if (!isVerifiableCashSession(response?.data)) throw new UnverifiableCashSessionResponseError();
  return response.data;
}

export function prepareCashOpen(openingAmountCents: string): IdempotentOperation {
  return idempotencyOperations.create({ openingAmountCents: assertAmount(openingAmountCents, 'Fondo inicial') });
}

export async function sendCashOpen(operation: IdempotentOperation, signal?: AbortSignal): Promise<CashSession> {
  let response: { data?: unknown };
  try {
    response = await idempotencyOperations.send<{ data?: unknown }>(operation, '/cash-sessions', { method: 'POST', signal });
  } catch (error) {
    if (error instanceof SyntaxError) throw new UnverifiableCashSessionResponseError();
    throw error;
  }
  if (!isVerifiableCashSession(response?.data) || response.data.closedAt !== null) {
    throw new UnverifiableCashSessionResponseError();
  }
  return response.data;
}

export function prepareCashClose(sessionId: string, input: CashCloseInput): IdempotentOperation {
  assertSessionId(sessionId);
  const body = assertCloseInput(input);
  return idempotencyOperations.create(body);
}

export async function sendCashClose(
  sessionId: string,
  operation: IdempotentOperation,
  signal?: AbortSignal,
): Promise<CashSession> {
  let response: { data?: unknown };
  try {
    response = await idempotencyOperations.send<{ data?: unknown }>(
      operation,
      `/cash-sessions/${encodeURIComponent(assertSessionId(sessionId))}/close`,
      { method: 'POST', signal },
    );
  } catch (error) {
    if (error instanceof SyntaxError) throw new UnverifiableCashSessionResponseError();
    throw error;
  }
  if (!isVerifiableCashSession(response?.data) || response.data.closedAt === null) {
    throw new UnverifiableCashSessionResponseError();
  }
  return response.data;
}

export function shouldKeepCashOperation(error: unknown): boolean {
  return isUncertainIdempotencyFailure(error)
    || error instanceof ApiError && error.status === 403 && error.code === 'CSRF_INVALID';
}

export function formatCashError(error: unknown): string {
  if (error instanceof UnverifiableCashSessionResponseError) {
    return 'La respuesta no permite verificar la caja. No repitas la operación; consulta el estado con la cafetería.';
  }
  if (error instanceof TypeError) return error.message;
  if (!(error instanceof ApiError)) return 'No fue posible completar la operación de caja.';
  if (error.status === 0) return 'Sin conexión con el servidor. Usa el reintento de la misma operación.';
  if (error.status === 401) return 'Tu sesión venció. Vuelve a acceder antes de continuar.';
  if (error.status === 403) {
    return error.code === 'CSRF_INVALID'
      ? 'Sesión de seguridad desactualizada. Reintenta la misma operación.'
      : 'Tu perfil no tiene permiso para operar esta caja.';
  }
  if (error.status === 404) return 'No encontramos la sesión de caja indicada.';
  if (error.status === 409) return 'La caja cambió de estado o no eres el responsable. Consulta el estado actual.';
  if (error.status === 429) return 'Demasiadas operaciones seguidas. Espera un momento e inténtalo de nuevo.';
  if (error.status >= 500) return 'El servicio de caja no está disponible. Usa el reintento de la misma operación.';
  return 'No fue posible completar la operación de caja.';
}

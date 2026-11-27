import { ApiError, apiFetch } from '../../../../shared/api/client';
import { MAX_PERIOD_MS, type PeriodRange } from '../dashboard/periods';

const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;
const ID_PATTERN = /^[1-9][0-9]{0,18}$/;
const CENTS_PATTERN = /^(0|[1-9][0-9]{0,18})$/;
const SIGNED_CENTS_PATTERN = /^(0|[1-9][0-9]{0,18}|-[1-9][0-9]{0,18})$/;

export type AdminCashStatus = 'OPEN' | 'CLOSED';
export type AdminCashDifference = 'SHORTAGE' | 'SURPLUS' | 'NONE';
export type AdminCashFilter = {
  from: string;
  to: string;
  status?: AdminCashStatus;
  difference?: AdminCashDifference;
};

export type AdminCashSession = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeUsername: string | null;
  openedAt: string;
  closedAt: string | null;
  closedByEmployeeId: string | null;
  closedByName: string | null;
  exceptionalCloseReason: string | null;
  openingAmountCents: string;
  cashSalesCents: string;
  successfulPayments: string;
  computedExpectedCashCents: string;
  expectedCashCents: string | null;
  countedCashCents: string | null;
  differenceCents: string | null;
};

export type AdminCashSummary = {
  sessionCount: string;
  closedCount: string;
  openCount: string;
  shortageCents: string;
  surplusCents: string;
  differenceCount: string;
};

export type AdminCashPage = {
  items: AdminCashSession[];
  summary: AdminCashSummary;
  nextCursor: string | null;
  limit: number;
};

/** Una respuesta 200 no verificable nunca se presenta como historial seguro. */
export class UnverifiableAdminCashError extends Error {
  constructor() {
    super('La respuesta del historial de caja no se puede verificar');
    this.name = 'UnverifiableAdminCashError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isUtc(value: unknown): value is string {
  return typeof value === 'string' && UTC_INSTANT.test(value) && Number.isFinite(Date.parse(value));
}

function isNullableDate(value: unknown): value is string | null {
  return value === null || isUtc(value);
}

function isNullableId(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && ID_PATTERN.test(value));
}

function isNullableCents(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && CENTS_PATTERN.test(value));
}

function isNullableSignedCents(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && SIGNED_CENTS_PATTERN.test(value));
}

function isNullableReason(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === 'string' && value.trim().length > 0 && value.length <= 500)
  );
}

function nonNegativeInteger(value: unknown): string {
  if (typeof value !== 'string' || !CENTS_PATTERN.test(value)) throw new UnverifiableAdminCashError();
  return value;
}

function parseSession(value: unknown): AdminCashSession {
  if (!isRecord(value)) throw new UnverifiableAdminCashError();
  if (
    !exactKeys(value, [
      'id',
      'employeeId',
      'employeeName',
      'employeeUsername',
      'openedAt',
      'closedAt',
      'closedByEmployeeId',
      'closedByName',
      'exceptionalCloseReason',
      'openingAmountCents',
      'cashSalesCents',
      'successfulPayments',
      'computedExpectedCashCents',
      'expectedCashCents',
      'countedCashCents',
      'differenceCents',
    ]) ||
    typeof value.id !== 'string' ||
    !ID_PATTERN.test(value.id) ||
    typeof value.employeeId !== 'string' ||
    !ID_PATTERN.test(value.employeeId) ||
    typeof value.employeeName !== 'string' ||
    value.employeeName.length === 0 ||
    !(value.employeeUsername === null || typeof value.employeeUsername === 'string') ||
    !isUtc(value.openedAt) ||
    !isNullableDate(value.closedAt) ||
    !isNullableId(value.closedByEmployeeId) ||
    !(value.closedByName === null || typeof value.closedByName === 'string') ||
    !isNullableReason(value.exceptionalCloseReason) ||
    !isNullableCents(value.openingAmountCents) ||
    !isNullableCents(value.cashSalesCents) ||
    typeof value.successfulPayments !== 'string' ||
    !/^[0-9]+$/.test(value.successfulPayments) ||
    !isNullableCents(value.computedExpectedCashCents) ||
    !isNullableCents(value.expectedCashCents) ||
    !isNullableCents(value.countedCashCents) ||
    !isNullableSignedCents(value.differenceCents)
  ) {
    throw new UnverifiableAdminCashError();
  }
  // Coherencia mínima verificable: esperado calculado = fondo + ventas efectivo.
  if (
    BigInt(value.openingAmountCents as string) + BigInt(value.cashSalesCents as string) !==
    BigInt(value.computedExpectedCashCents as string)
  ) {
    throw new UnverifiableAdminCashError();
  }
  if (value.closedAt === null) {
    if (value.countedCashCents !== null || value.differenceCents !== null) {
      throw new UnverifiableAdminCashError();
    }
  } else if (
    value.countedCashCents !== null &&
    value.differenceCents !== null &&
    BigInt(value.countedCashCents) - BigInt(value.computedExpectedCashCents as string) !==
      BigInt(value.differenceCents)
  ) {
    throw new UnverifiableAdminCashError();
  }
  return value as AdminCashSession;
}

function parseSummary(value: unknown): AdminCashSummary {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      'sessionCount',
      'closedCount',
      'openCount',
      'shortageCents',
      'surplusCents',
      'differenceCount',
    ])
  ) {
    throw new UnverifiableAdminCashError();
  }
  const sessionCount = nonNegativeInteger(value.sessionCount);
  const closedCount = nonNegativeInteger(value.closedCount);
  const openCount = nonNegativeInteger(value.openCount);
  const differenceCount = nonNegativeInteger(value.differenceCount);
  if (
    !isNullableSignedCents(value.shortageCents) ||
    value.shortageCents === null ||
    !isNullableCents(value.surplusCents) ||
    value.surplusCents === null
  ) {
    throw new UnverifiableAdminCashError();
  }
  if (
    BigInt(closedCount) + BigInt(openCount) !== BigInt(sessionCount) ||
    BigInt(value.shortageCents) > 0n ||
    BigInt(differenceCount) > BigInt(closedCount)
  ) {
    throw new UnverifiableAdminCashError();
  }
  return value as AdminCashSummary;
}

export function buildAdminCashQuery(
  filter: AdminCashFilter,
  cursor?: string,
  limit = 20,
): string {
  if (!isUtc(filter.from) || !isUtc(filter.to)) {
    throw new TypeError('El periodo de caja no es válido.');
  }
  const from = Date.parse(filter.from);
  const to = Date.parse(filter.to);
  if (!(from < to) || to - from > MAX_PERIOD_MS) {
    throw new TypeError('El rango de caja no es válido.');
  }
  if (filter.status !== undefined && !['OPEN', 'CLOSED'].includes(filter.status)) {
    throw new TypeError('El estado de caja no es válido.');
  }
  if (
    filter.difference !== undefined &&
    !['SHORTAGE', 'SURPLUS', 'NONE'].includes(filter.difference)
  ) {
    throw new TypeError('La diferencia de caja no es válida.');
  }
  if (filter.status === 'OPEN' && filter.difference !== undefined) {
    throw new TypeError('Una caja abierta no tiene diferencia.');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new TypeError('El límite de caja no es válido.');
  }
  const params = new URLSearchParams();
  params.set('from', filter.from);
  params.set('to', filter.to);
  params.set('limit', String(limit));
  if (filter.status !== undefined) params.set('status', filter.status);
  if (filter.difference !== undefined) params.set('difference', filter.difference);
  if (cursor !== undefined) params.set('cursor', cursor);
  return `?${params.toString()}`;
}

export function parseAdminCashPage(value: unknown): AdminCashPage {
  if (
    !isRecord(value) ||
    !exactKeys(value, ['data', 'summary', 'page']) ||
    !Array.isArray(value.data) ||
    !isRecord(value.page) ||
    !exactKeys(value.page, ['limit', 'nextCursor'])
  ) {
    throw new UnverifiableAdminCashError();
  }
  const limit = value.page.limit;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new UnverifiableAdminCashError();
  }
  if (value.page.nextCursor !== null && typeof value.page.nextCursor !== 'string') {
    throw new UnverifiableAdminCashError();
  }
  return {
    items: value.data.map(parseSession),
    summary: parseSummary(value.summary),
    nextCursor: value.page.nextCursor,
    limit,
  };
}

export async function getAdminCashSessions(
  filter: AdminCashFilter,
  cursor?: string,
  limit = 20,
  signal?: AbortSignal,
): Promise<AdminCashPage> {
  const response = await apiFetch<unknown>(`/admin/cash-sessions${buildAdminCashQuery(filter, cursor, limit)}`, {
    signal,
  });
  return parseAdminCashPage(response);
}

export function formatAdminCashError(error: unknown): string {
  if (error instanceof UnverifiableAdminCashError) {
    return 'La respuesta del historial de caja no se puede verificar. No hay datos seguros para mostrar.';
  }
  if (error instanceof TypeError) return error.message;
  if (!(error instanceof ApiError)) return 'No fue posible consultar el historial de caja.';
  if (error.status === 400) return 'El periodo o filtro de caja no es válido.';
  if (error.status === 401) return 'Tu sesión venció. Vuelve a acceder.';
  if (error.status === 403 && error.code === 'PIN_CHANGE_REQUIRED') {
    return 'Debes cambiar tu NIP antes de continuar.';
  }
  if (error.status === 403) return 'Sólo administración puede consultar el historial de caja.';
  if (error.status === 429) return 'Demasiadas consultas. Inténtalo más tarde.';
  if (error.status === 0 || error.status === 503) {
    return 'No fue posible consultar el historial de caja. Inténtalo de nuevo.';
  }
  return 'No fue posible consultar el historial de caja.';
}

/** Atajo para reutilizar el periodo del dashboard sin exponer su tipo interno. */
export function filterFromPeriod(period: Pick<PeriodRange, 'from' | 'to'>): AdminCashFilter {
  return { from: period.from, to: period.to };
}

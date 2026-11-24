import { ApiError, apiFetch } from '../../../../shared/api/client';
import { MAX_PERIOD_MS } from './periods';

const UTC_COMPONENTS =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?Z$/;
const NON_NEGATIVE_INTEGER = /^(0|[1-9][0-9]{0,18})$/;
const SIGNED_INTEGER = /^(0|[1-9][0-9]{0,18}|-[1-9][0-9]{0,18})$/;
const PERCENT = /^(0\.[0-9]{2}|[1-9][0-9]*\.[0-9]{2}|-0\.(?:0[1-9]|[1-9][0-9])|-[1-9][0-9]*\.[0-9]{2})$/;

export type DashboardMethod = 'CASH' | 'STRIPE';
export type DashboardSummaryFilter = {
  from: string;
  to: string;
  method?: DashboardMethod;
};
export type DashboardComparisonMetric = {
  previous: string;
  change: string;
  changePercent: string | null;
};
export type DashboardSummary = {
  generatedAt: string;
  currency: 'MXN';
  period: {
    from: string;
    to: string;
    timeZone: 'America/Tijuana';
    previousFrom: string;
    previousTo: string;
  };
  totalCents: string;
  ticketCount: string;
  averageTicketCents: string;
  unitsSold: string;
  paymentMix: { cashCents: string; stripeCents: string };
  comparison: {
    totalCents: DashboardComparisonMetric;
    ticketCount: DashboardComparisonMetric;
    averageTicketCents: DashboardComparisonMetric;
    unitsSold: DashboardComparisonMetric;
  };
};

export class UnverifiableDashboardSummaryError extends Error {
  constructor() {
    super('La respuesta del resumen no se puede verificar');
    this.name = 'UnverifiableDashboardSummaryError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[] = allowed,
): boolean {
  return (
    Object.keys(value).every((key) => allowed.includes(key)) &&
    required.every((key) => Object.hasOwn(value, key))
  );
}

function isUtc(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = UTC_COMPONENTS.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const millisecond = Number((match[7] ?? '').padEnd(3, '0').slice(0, 3));
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second
  );
}

function nonNegativeInteger(value: unknown): string {
  if (typeof value !== 'string' || !NON_NEGATIVE_INTEGER.test(value)) {
    throw new UnverifiableDashboardSummaryError();
  }
  return value;
}

function signedInteger(value: unknown): value is string {
  return typeof value === 'string' && SIGNED_INTEGER.test(value);
}

function comparisonMetric(value: unknown, current: string): DashboardComparisonMetric {
  if (
    !isRecord(value) ||
    !exactKeys(value, ['previous', 'change', 'changePercent']) ||
    !signedInteger(value.change) ||
    (value.changePercent !== null &&
      (typeof value.changePercent !== 'string' || !PERCENT.test(value.changePercent)))
  ) {
    throw new UnverifiableDashboardSummaryError();
  }
  const previous = nonNegativeInteger(value.previous);
  const previousValue = BigInt(previous);
  const change = BigInt(value.change);
  if (change !== BigInt(current) - previousValue) {
    throw new UnverifiableDashboardSummaryError();
  }
  const changePercent = value.changePercent as string | null;
  if (previousValue === 0n ? changePercent !== null : changePercent === null) {
    throw new UnverifiableDashboardSummaryError();
  }
  return { previous, change: value.change, changePercent };
}

function parsePeriod(value: unknown, expected?: { from: string; to: string }) {
  if (
    !isRecord(value) ||
    !exactKeys(value, ['from', 'to', 'timeZone', 'previousFrom', 'previousTo']) ||
    !isUtc(value.from) ||
    !isUtc(value.to) ||
    value.timeZone !== 'America/Tijuana' ||
    !isUtc(value.previousFrom) ||
    !isUtc(value.previousTo)
  ) {
    throw new UnverifiableDashboardSummaryError();
  }
  const from = Date.parse(value.from);
  const to = Date.parse(value.to);
  const previousFrom = Date.parse(value.previousFrom);
  const previousTo = Date.parse(value.previousTo);
  const duration = to - from;
  if (
    !(from < to) ||
    duration > MAX_PERIOD_MS ||
    previousTo !== from ||
    from - previousFrom !== duration ||
    (expected !== undefined &&
      (Date.parse(expected.from) !== from || Date.parse(expected.to) !== to))
  ) {
    throw new UnverifiableDashboardSummaryError();
  }
  return {
    from: value.from,
    to: value.to,
    timeZone: value.timeZone,
    previousFrom: value.previousFrom,
    previousTo: value.previousTo,
  } as DashboardSummary['period'];
}

export function buildDashboardSummaryQuery(input: DashboardSummaryFilter): string {
  if (
    !isRecord(input) ||
    Object.keys(input).some((key) => !['from', 'to', 'method'].includes(key)) ||
    !isUtc(input.from) ||
    !isUtc(input.to)
  ) {
    throw new TypeError('El periodo del resumen no es válido.');
  }
  const from = Date.parse(input.from);
  const to = Date.parse(input.to);
  if (!(from < to) || to - from > MAX_PERIOD_MS) {
    throw new TypeError('El rango del resumen no es válido.');
  }
  if (input.method !== undefined && input.method !== 'CASH' && input.method !== 'STRIPE') {
    throw new TypeError('El método de pago no es válido.');
  }
  const params = new URLSearchParams();
  params.set('from', input.from);
  params.set('to', input.to);
  if (input.method !== undefined) params.set('method', input.method);
  return `?${params.toString()}`;
}

/** Parses only the approved administrative summary DTO and rejects inconsistencies. */
export function parseDashboardSummary(
  value: unknown,
  expected?: { from: string; to: string },
): DashboardSummary {
  if (
    !isRecord(value) ||
    !exactKeys(value, ['data']) ||
    !isRecord(value.data) ||
    !exactKeys(value.data, [
      'generatedAt',
      'currency',
      'period',
      'totalCents',
      'ticketCount',
      'averageTicketCents',
      'unitsSold',
      'paymentMix',
      'comparison',
    ])
  ) {
    throw new UnverifiableDashboardSummaryError();
  }
  const data = value.data;
  const generatedAt = data.generatedAt;
  const paymentMixValue = data.paymentMix;
  const comparisonValue = data.comparison;
  if (
    !isUtc(generatedAt) ||
    data.currency !== 'MXN' ||
    !isRecord(paymentMixValue) ||
    !exactKeys(paymentMixValue, ['cashCents', 'stripeCents']) ||
    !isRecord(comparisonValue) ||
    !exactKeys(comparisonValue, [
      'totalCents',
      'ticketCount',
      'averageTicketCents',
      'unitsSold',
    ])
  ) {
    throw new UnverifiableDashboardSummaryError();
  }
  const period = parsePeriod(data.period, expected);
  const totalCents = nonNegativeInteger(data.totalCents);
  const ticketCount = nonNegativeInteger(data.ticketCount);
  const averageTicketCents = nonNegativeInteger(data.averageTicketCents);
  const unitsSold = nonNegativeInteger(data.unitsSold);
  const cashCents = nonNegativeInteger(paymentMixValue.cashCents);
  const stripeCents = nonNegativeInteger(paymentMixValue.stripeCents);
  if (BigInt(cashCents) + BigInt(stripeCents) !== BigInt(totalCents)) {
    throw new UnverifiableDashboardSummaryError();
  }
  if (BigInt(ticketCount) === 0n && averageTicketCents !== '0') {
    throw new UnverifiableDashboardSummaryError();
  }
  const comparison = {
    totalCents: comparisonMetric(comparisonValue.totalCents, totalCents),
    ticketCount: comparisonMetric(comparisonValue.ticketCount, ticketCount),
    averageTicketCents: comparisonMetric(comparisonValue.averageTicketCents, averageTicketCents),
    unitsSold: comparisonMetric(comparisonValue.unitsSold, unitsSold),
  };
  return {
    generatedAt,
    currency: 'MXN',
    period,
    totalCents,
    ticketCount,
    averageTicketCents,
    unitsSold,
    paymentMix: { cashCents, stripeCents },
    comparison,
  };
}

export async function getDashboardSummary(
  filter: DashboardSummaryFilter,
  signal?: AbortSignal,
): Promise<DashboardSummary> {
  try {
    const response = await apiFetch<unknown>(
      `/admin/dashboard/summary${buildDashboardSummaryQuery(filter)}`,
      { signal },
    );
    return parseDashboardSummary(response, filter);
  } catch (error) {
    if (signal?.aborted) {
      throw new DOMException('La consulta del resumen fue cancelada', 'AbortError');
    }
    throw error;
  }
}

export function formatDashboardSummaryError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'La consulta del resumen fue cancelada.';
  }
  if (error instanceof UnverifiableDashboardSummaryError) {
    return 'La respuesta del resumen no se puede verificar. No hay datos seguros para mostrar.';
  }
  if (error instanceof TypeError) return error.message;
  if (!(error instanceof ApiError)) return 'No fue posible consultar el resumen.';
  if (error.status === 400) return 'El periodo o filtro del resumen no es válido.';
  if (error.status === 401) return 'Tu sesión venció. Vuelve a acceder.';
  if (error.status === 403 && error.code === 'PIN_CHANGE_REQUIRED') {
    return 'Debes cambiar tu NIP antes de continuar.';
  }
  if (error.status === 403 && error.code === 'ORIGIN_NOT_ALLOWED') {
    return 'El origen de la solicitud no está permitido.';
  }
  if (error.status === 403) return 'Sólo administración puede consultar el resumen.';
  if (error.status === 429) return 'Demasiadas consultas. Inténtalo más tarde.';
  if (error.status === 0 || error.status === 503) {
    return 'No fue posible consultar el resumen. Inténtalo de nuevo.';
  }
  return 'No fue posible consultar el resumen.';
}

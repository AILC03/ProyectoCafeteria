import { ApiError, apiFetch } from '../../../../shared/api/client';
import { BUSINESS_TIME_ZONE } from '../dashboard/periods';
import type { DashboardMethod } from '../dashboard/summaryApi';

const MIN_FROM_MS = Date.parse('2000-01-01T08:00:00.000Z');
const UTC_INPUT_COMPONENTS =
  /^([2-9]\d{3})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d{1,3}))?Z$/;
const UTC_OUTPUT_COMPONENTS =
  /^([2-9]\d{3})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)\.(\d{3})Z$/;
const LOCAL_START_COMPONENTS =
  /^([2-9]\d{3})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):00:00(-0[78]:00)$/;
const EXACT_NON_NEGATIVE_INTEGER = /^(0|[1-9][0-9]*)$/;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type SalesSeriesGranularity = 'hour' | 'day';
export type SalesSeriesFilter = {
  from: string;
  to: string;
  granularity: SalesSeriesGranularity;
  method?: DashboardMethod;
};
export type SalesSeriesTotals = {
  totalCents: string;
  ticketCount: string;
  unitsSold: string;
};
export type SalesSeriesBucket = SalesSeriesTotals & {
  start: string;
  end: string;
  localStart: string;
  effectiveFrom: string;
  effectiveTo: string;
  partial: boolean;
};
export type SalesSeries = {
  generatedAt: string;
  currency: 'MXN';
  period: {
    from: string;
    to: string;
    timeZone: 'America/Tijuana';
  };
  method: DashboardMethod | null;
  granularity: SalesSeriesGranularity;
  bucketCount: string;
  totals: SalesSeriesTotals;
  buckets: SalesSeriesBucket[];
};

const MAX_DURATION_MS: Record<SalesSeriesGranularity, number> = {
  hour: 31 * DAY_MS,
  day: 366 * DAY_MS,
};
const MAX_BUCKETS: Record<SalesSeriesGranularity, number> = {
  hour: 745,
  day: 368,
};

export class UnverifiableSalesSeriesError extends Error {
  constructor() {
    super('La respuesta de las series no se puede verificar');
    this.name = 'UnverifiableSalesSeriesError';
  }
}

function fail(): never {
  throw new UnverifiableSalesSeriesError();
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

function invalid(): TypeError {
  return new TypeError('El periodo, la granularidad o el método de las series no es válido.');
}

function parseUtc(value: unknown, normalized: boolean): number | null {
  if (typeof value !== 'string') return null;
  const match = (normalized ? UTC_OUTPUT_COMPONENTS : UTC_INPUT_COMPONENTS).exec(value);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const fraction = match[7] ?? '';
  if (!normalized && fraction.length > 3) return null;
  const millisecond = Number(fraction.padEnd(3, '0'));
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second ||
    date.getUTCMilliseconds() !== millisecond
  ) {
    return null;
  }
  return date.getTime();
}

function requireRange(from: unknown, to: unknown, granularity: SalesSeriesGranularity) {
  const start = parseUtc(from, false);
  const end = parseUtc(to, false);
  if (start === null || end === null) throw invalid();
  if (start < MIN_FROM_MS || end <= start) throw invalid();
  if (end - start > MAX_DURATION_MS[granularity]) throw invalid();
  return { start, end };
}

function exactInteger(value: unknown): string {
  if (typeof value !== 'string' || !EXACT_NON_NEGATIVE_INTEGER.test(value)) fail();
  return value;
}

function parseTotals(value: unknown): SalesSeriesTotals {
  if (!isRecord(value) || !exactKeys(value, ['totalCents', 'ticketCount', 'unitsSold'])) fail();
  return {
    totalCents: exactInteger(value.totalCents),
    ticketCount: exactInteger(value.ticketCount),
    unitsSold: exactInteger(value.unitsSold),
  };
}

const tijuanaParts = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function tijuanaCivil(ms: number) {
  const parts = Object.fromEntries(
    tijuanaParts
      .formatToParts(new Date(ms))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function exactLocalStart(value: unknown, startMs: number, granularity: SalesSeriesGranularity): string {
  if (typeof value !== 'string') fail();
  const match = LOCAL_START_COMPONENTS.exec(value);
  if (match === null) fail();
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const offsetMinutes = match[5] === '-08:00' ? -480 : -420;
  const civilMs = Date.UTC(year, month - 1, day, hour, 0, 0);
  const represented = new Date(civilMs);
  if (
    represented.getUTCFullYear() !== year ||
    represented.getUTCMonth() !== month - 1 ||
    represented.getUTCDate() !== day ||
    represented.getUTCHours() !== hour
  ) {
    fail();
  }
  if (civilMs - offsetMinutes * 60 * 1000 !== startMs) fail();
  if (granularity === 'day' && hour !== 0) fail();
  const local = tijuanaCivil(startMs);
  if (
    local.year !== year ||
    local.month !== month ||
    local.day !== day ||
    local.hour !== hour ||
    local.minute !== 0 ||
    local.second !== 0
  ) {
    fail();
  }
  const actualOffsetMinutes = (Date.UTC(local.year, local.month - 1, local.day, local.hour) - startMs) / 60000;
  if (actualOffsetMinutes !== offsetMinutes) fail();
  return value;
}

function isoAt(ms: number): string {
  return new Date(ms).toISOString();
}

/** A day bucket must end exactly at the next local midnight under the IANA rules. */
function isNextLocalMidnight(startMs: number, endMs: number): boolean {
  const startLocal = tijuanaCivil(startMs);
  const endLocal = tijuanaCivil(endMs);
  const nextDay = new Date(Date.UTC(startLocal.year, startLocal.month - 1, startLocal.day + 1));
  return (
    endLocal.year === nextDay.getUTCFullYear() &&
    endLocal.month === nextDay.getUTCMonth() + 1 &&
    endLocal.day === nextDay.getUTCDate() &&
    endLocal.hour === 0 &&
    endLocal.minute === 0 &&
    endLocal.second === 0
  );
}

function parseBucket(
  value: unknown,
  granularity: SalesSeriesGranularity,
  periodFrom: number,
  periodTo: number,
): SalesSeriesBucket {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      'start',
      'end',
      'localStart',
      'effectiveFrom',
      'effectiveTo',
      'partial',
      'totalCents',
      'ticketCount',
      'unitsSold',
    ])
  ) {
    fail();
  }
  if (typeof value.partial !== 'boolean') fail();
  const start = parseUtc(value.start, true);
  const end = parseUtc(value.end, true);
  if (start === null || end === null) fail();
  const duration = end - start;
  if (duration <= 0) fail();
  if (granularity === 'hour' && duration !== HOUR_MS) fail();
  if (granularity === 'day') {
    if (duration < 23 * HOUR_MS || duration > 25 * HOUR_MS) fail();
    if (!isNextLocalMidnight(start, end)) fail();
  }
  if (start < MIN_FROM_MS || end < MIN_FROM_MS) fail();
  const localStart = exactLocalStart(value.localStart, start, granularity);
  const expectedFrom = Math.max(start, periodFrom);
  const expectedTo = Math.min(end, periodTo);
  if (expectedFrom >= expectedTo) fail();
  const effectiveFrom = parseUtc(value.effectiveFrom, true);
  const effectiveTo = parseUtc(value.effectiveTo, true);
  if (
    effectiveFrom === null ||
    effectiveTo === null ||
    effectiveFrom < MIN_FROM_MS ||
    effectiveTo < MIN_FROM_MS ||
    effectiveFrom !== expectedFrom ||
    effectiveTo !== expectedTo
  ) {
    fail();
  }
  if (value.partial !== (start !== expectedFrom || end !== expectedTo)) fail();
  const totals = parseTotals({
    totalCents: value.totalCents,
    ticketCount: value.ticketCount,
    unitsSold: value.unitsSold,
  });
  return {
    start: value.start as string,
    end: value.end as string,
    localStart,
    effectiveFrom: value.effectiveFrom as string,
    effectiveTo: value.effectiveTo as string,
    partial: value.partial,
    ...totals,
  };
}

export function buildSalesSeriesQuery(input: SalesSeriesFilter): string {
  if (
    !isRecord(input) ||
    Object.keys(input).some((key) => !['from', 'to', 'granularity', 'method'].includes(key))
  ) {
    throw invalid();
  }
  if (input.granularity !== 'hour' && input.granularity !== 'day') throw invalid();
  if (
    input.method !== undefined &&
    input.method !== 'CASH' &&
    input.method !== 'STRIPE'
  ) {
    throw invalid();
  }
  const { start, end } = requireRange(input.from, input.to, input.granularity);
  const params = new URLSearchParams();
  params.set('from', isoAt(start));
  params.set('to', isoAt(end));
  params.set('granularity', input.granularity);
  if (input.method !== undefined) params.set('method', input.method);
  return `?${params.toString()}`;
}

/** Parses only the accepted sales-series DTO and rejects inconsistent data. */
export function parseSalesSeries(
  value: unknown,
  expected?: SalesSeriesFilter,
): SalesSeries {
  if (
    !isRecord(value) ||
    !exactKeys(value, ['data']) ||
    !isRecord(value.data) ||
    !exactKeys(value.data, [
      'generatedAt',
      'currency',
      'period',
      'method',
      'granularity',
      'bucketCount',
      'totals',
      'buckets',
    ])
  ) {
    fail();
  }
  const data = value.data;
  if (expected !== undefined && (expected.granularity !== 'hour' && expected.granularity !== 'day')) {
    throw invalid();
  }
  const generatedAtMs = parseUtc(data.generatedAt, true);
  if (generatedAtMs === null || generatedAtMs < MIN_FROM_MS) fail();
  if (data.currency !== 'MXN') fail();
  if (data.granularity !== 'hour' && data.granularity !== 'day') fail();
  const granularity = data.granularity;
  if (expected !== undefined && granularity !== expected.granularity) fail();
  if (
    data.method !== null &&
    data.method !== 'CASH' &&
    data.method !== 'STRIPE'
  ) {
    fail();
  }
  if (expected !== undefined && data.method !== (expected.method ?? null)) fail();
  if (
    !isRecord(data.period) ||
    !exactKeys(data.period, ['from', 'to', 'timeZone']) ||
    data.period.timeZone !== 'America/Tijuana'
  ) {
    fail();
  }
  const periodFrom = parseUtc(data.period.from, true);
  const periodTo = parseUtc(data.period.to, true);
  if (
    periodFrom === null ||
    periodTo === null ||
    periodFrom < MIN_FROM_MS ||
    periodTo <= periodFrom ||
    periodTo - periodFrom > MAX_DURATION_MS[granularity]
  ) {
    fail();
  }
  if (expected !== undefined) {
    const expectedFrom = parseUtc(expected.from, false);
    const expectedTo = parseUtc(expected.to, false);
    if (
      expectedFrom === null ||
      expectedTo === null ||
      periodFrom !== expectedFrom ||
      periodTo !== expectedTo
    ) {
      fail();
    }
  }
  if (!Array.isArray(data.buckets) || data.buckets.length === 0) fail();
  if (data.buckets.length > MAX_BUCKETS[granularity]) fail();
  const bucketCount = exactInteger(data.bucketCount);
  if (BigInt(bucketCount) !== BigInt(data.buckets.length)) fail();
  const totals = parseTotals(data.totals);
  const buckets = data.buckets.map((bucket) =>
    parseBucket(bucket, granularity, periodFrom, periodTo),
  );
  const summed = { totalCents: 0n, ticketCount: 0n, unitsSold: 0n };
  let previousStart: number | null = null;
  let coveredFrom: number | null = null;
  for (const bucket of buckets) {
    const start = parseUtc(bucket.start, true) as number;
    const end = parseUtc(bucket.end, true) as number;
    const effectiveFrom = parseUtc(bucket.effectiveFrom, true) as number;
    const effectiveTo = parseUtc(bucket.effectiveTo, true) as number;
    if (previousStart !== null && start !== previousStart) fail();
    if (coveredFrom !== null && effectiveFrom !== coveredFrom) fail();
    if (previousStart === null && effectiveFrom !== periodFrom) fail();
    previousStart = end;
    coveredFrom = effectiveTo;
    summed.totalCents += BigInt(bucket.totalCents);
    summed.ticketCount += BigInt(bucket.ticketCount);
    summed.unitsSold += BigInt(bucket.unitsSold);
  }
  if (coveredFrom !== periodTo) fail();
  if (
    summed.totalCents !== BigInt(totals.totalCents) ||
    summed.ticketCount !== BigInt(totals.ticketCount) ||
    summed.unitsSold !== BigInt(totals.unitsSold)
  ) {
    fail();
  }
  return {
    generatedAt: data.generatedAt as string,
    currency: 'MXN',
    period: {
      from: data.period.from as string,
      to: data.period.to as string,
      timeZone: 'America/Tijuana',
    },
    method: data.method as DashboardMethod | null,
    granularity,
    bucketCount,
    totals,
    buckets,
  };
}

export async function getSalesSeries(
  filter: SalesSeriesFilter,
  signal?: AbortSignal,
): Promise<SalesSeries> {
  const query = buildSalesSeriesQuery(filter);
  try {
    const response = await apiFetch<unknown>(`/admin/dashboard/sales-series${query}`, { signal });
    return parseSalesSeries(response, filter);
  } catch (error) {
    if (signal?.aborted) {
      throw new DOMException('La consulta de las series fue cancelada', 'AbortError');
    }
    throw error;
  }
}

export function formatSalesSeriesError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'La consulta de las series fue cancelada.';
  }
  if (error instanceof UnverifiableSalesSeriesError) {
    return 'La respuesta de las series no se puede verificar. No hay datos seguros para mostrar.';
  }
  if (error instanceof TypeError) return error.message;
  if (!(error instanceof ApiError)) return 'No fue posible consultar las series.';
  if (error.status === 400) return 'El periodo, la granularidad o el método de las series no es válido.';
  if (error.status === 401) return 'Tu sesión venció. Vuelve a acceder.';
  if (error.status === 403 && error.code === 'PIN_CHANGE_REQUIRED') {
    return 'Debes cambiar tu NIP antes de continuar.';
  }
  if (error.status === 403 && error.code === 'ORIGIN_NOT_ALLOWED') {
    return 'El origen de la solicitud no está permitido.';
  }
  if (error.status === 403) return 'Sólo administración puede consultar las series.';
  if (error.status === 429) return 'Demasiadas consultas. Inténtalo más tarde.';
  if (error.status === 0 || error.status === 503) {
    return 'Las series no están disponibles en este momento. Inténtalo de nuevo.';
  }
  return 'No fue posible consultar las series.';
}

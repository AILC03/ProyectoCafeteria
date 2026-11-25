import { ApiError, apiFetch } from '../../../../shared/api/client';
import type { DashboardMethod } from '../dashboard/summaryApi';

const MIN_FROM_MS = Date.parse('2000-01-01T08:00:00.000Z');
const UTC_INPUT_COMPONENTS =
  /^([2-9]\d{3})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d{1,3}))?Z$/;
const UTC_OUTPUT_COMPONENTS =
  /^([2-9]\d{3})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)\.(\d{3})Z$/;
const EXACT_NON_NEGATIVE_INTEGER = /^(0|[1-9][0-9]*)$/;
const EXACT_POSITIVE_INTEGER = /^[1-9][0-9]*$/;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_RANGE_MS = 366 * DAY_MS;
const TOP_VALUES = ['5', '10', '20'] as const;
const utf8 = new TextEncoder();

export type ProductRankingMetric = 'units' | 'amount';
export type ProductRankingDirection = 'top' | 'bottom';
export type ProductRankingTop = (typeof TOP_VALUES)[number];
export type ProductRankingNameSource = 'current' | 'snapshot';
export type ProductRankingFilter = {
  from: string;
  to: string;
  metric: ProductRankingMetric;
  direction: ProductRankingDirection;
  top?: ProductRankingTop;
  method?: DashboardMethod | 'ALL';
};
export type ProductRankingItem = {
  position?: string;
  productId: string;
  name: string;
  nameSource?: ProductRankingNameSource;
  unitsSold: string;
  totalCents: string;
};
export type ProductRankingTotals = {
  unitsSold: string;
  totalCents: string;
};
export type ProductRanking = {
  generatedAt: string;
  currency: 'MXN';
  period: {
    from: string;
    to: string;
    timeZone: 'America/Tijuana';
  };
  method: DashboardMethod | null;
  metric: ProductRankingMetric;
  direction: ProductRankingDirection;
  top: ProductRankingTop;
  matchedProductCount: string;
  matchedTotals: ProductRankingTotals;
  truncated: boolean;
  items: ProductRankingItem[];
};

type NormalizedFilter = {
  from: number;
  to: number;
  metric: ProductRankingMetric;
  direction: ProductRankingDirection;
  top: ProductRankingTop;
  method: DashboardMethod | null;
};

export class UnverifiableProductRankingError extends Error {
  constructor() {
    super('La respuesta del ranking no se puede verificar');
    this.name = 'UnverifiableProductRankingError';
  }
}

function fail(): never {
  throw new UnverifiableProductRankingError();
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
  return new TypeError('El periodo, la métrica, la dirección o el conjunto del ranking no es válido.');
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

function isMetric(value: unknown): value is ProductRankingMetric {
  return value === 'units' || value === 'amount';
}

function isDirection(value: unknown): value is ProductRankingDirection {
  return value === 'top' || value === 'bottom';
}

function isTop(value: unknown): value is ProductRankingTop {
  return value === '5' || value === '10' || value === '20';
}

function normalizeFilter(input: unknown): NormalizedFilter {
  if (!isRecord(input)) throw invalid();
  if (Object.keys(input).some((key) => !['from', 'to', 'metric', 'direction', 'top', 'method'].includes(key))) {
    throw invalid();
  }
  const from = parseUtc(input.from, false);
  const to = parseUtc(input.to, false);
  if (from === null || to === null) throw invalid();
  if (from < MIN_FROM_MS || to <= from || to - from > MAX_RANGE_MS) throw invalid();
  if (!isMetric(input.metric) || !isDirection(input.direction)) throw invalid();
  let top: ProductRankingTop = '5';
  if (input.top !== undefined) {
    if (!isTop(input.top)) throw invalid();
    top = input.top;
  }
  let method: DashboardMethod | null = null;
  if (input.method !== undefined) {
    if (input.method === 'ALL') {
      method = null;
    } else if (input.method === 'CASH' || input.method === 'STRIPE') {
      method = input.method;
    } else {
      throw invalid();
    }
  }
  return { from, to, metric: input.metric, direction: input.direction, top, method };
}

function isoAt(ms: number): string {
  return new Date(ms).toISOString();
}

export function buildProductRankingQuery(input: ProductRankingFilter): string {
  const filter = normalizeFilter(input);
  const params = new URLSearchParams();
  params.set('from', isoAt(filter.from));
  params.set('to', isoAt(filter.to));
  params.set('metric', filter.metric);
  params.set('direction', filter.direction);
  if (input.top !== undefined) params.set('top', filter.top);
  if (filter.method !== null) params.set('method', filter.method);
  return `?${params.toString()}`;
}

function exactInteger(value: unknown): string {
  if (typeof value !== 'string' || !EXACT_NON_NEGATIVE_INTEGER.test(value)) fail();
  return value;
}

function positiveInteger(value: unknown): string {
  if (typeof value !== 'string' || !EXACT_POSITIVE_INTEGER.test(value)) fail();
  return value;
}

function parseTotals(value: unknown): ProductRankingTotals {
  if (!isRecord(value) || !exactKeys(value, ['unitsSold', 'totalCents'])) fail();
  return {
    unitsSold: exactInteger(value.unitsSold),
    totalCents: exactInteger(value.totalCents),
  };
}

function parseItem(value: unknown): ProductRankingItem {
  if (
    !isRecord(value) ||
    !exactKeys(
      value,
      ['position', 'productId', 'name', 'nameSource', 'unitsSold', 'totalCents'],
      ['productId', 'name', 'unitsSold', 'totalCents'],
    )
  ) {
    fail();
  }
  if (typeof value.name !== 'string' || value.name.length === 0 || value.name.length > 160) fail();
  const unitsSold = positiveInteger(value.unitsSold);
  const totalCents = exactInteger(value.totalCents);
  let position: string | undefined;
  if (value.position !== undefined) position = positiveInteger(value.position);
  let nameSource: ProductRankingNameSource | undefined;
  if (value.nameSource !== undefined) {
    if (value.nameSource !== 'current' && value.nameSource !== 'snapshot') fail();
    nameSource = value.nameSource;
  }
  return {
    ...(position === undefined ? {} : { position }),
    productId: positiveInteger(value.productId),
    name: value.name,
    ...(nameSource === undefined ? {} : { nameSource }),
    unitsSold,
    totalCents,
  };
}

function compareExact(a: string, b: string): number {
  const left = BigInt(a);
  const right = BigInt(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

/** UTF-8 byte comparison equivalent to PostgreSQL COLLATE "C". */
function compareUtf8(a: string, b: string): number {
  const left = utf8.encode(a);
  const right = utf8.encode(b);
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return left.length - right.length;
}

function compareItems(
  a: ProductRankingItem,
  b: ProductRankingItem,
  metric: ProductRankingMetric,
  direction: ProductRankingDirection,
): number {
  const sign = direction === 'top' ? -1 : 1;
  const primary = metric === 'units' ? 'unitsSold' : 'totalCents';
  const secondary = metric === 'units' ? 'totalCents' : 'unitsSold';
  const primaryOrder = compareExact(a[primary], b[primary]);
  if (primaryOrder !== 0) return sign * primaryOrder;
  const secondaryOrder = compareExact(a[secondary], b[secondary]);
  if (secondaryOrder !== 0) return sign * secondaryOrder;
  const nameOrder = compareUtf8(a.name, b.name);
  if (nameOrder !== 0) return nameOrder;
  return compareExact(a.productId, b.productId);
}

/** Parses only the accepted product-ranking DTO and rejects inconsistent data. */
export function parseProductRanking(
  value: unknown,
  expected?: ProductRankingFilter,
): ProductRanking {
  const expectedFilter = expected === undefined ? null : normalizeFilter(expected);
  if (
    !isRecord(value) ||
    !exactKeys(value, ['data']) ||
    !isRecord(value.data) ||
    !exactKeys(value.data, [
      'generatedAt',
      'currency',
      'period',
      'method',
      'metric',
      'direction',
      'top',
      'matchedProductCount',
      'matchedTotals',
      'truncated',
      'items',
    ])
  ) {
    fail();
  }
  const data = value.data;
  const generatedAtMs = parseUtc(data.generatedAt, true);
  if (generatedAtMs === null || generatedAtMs < MIN_FROM_MS) fail();
  if (data.currency !== 'MXN') fail();
  if (!isRecord(data.period) || !exactKeys(data.period, ['from', 'to', 'timeZone'])) fail();
  if (data.period.timeZone !== 'America/Tijuana') fail();
  const periodFrom = parseUtc(data.period.from, true);
  const periodTo = parseUtc(data.period.to, true);
  if (
    periodFrom === null ||
    periodTo === null ||
    periodFrom < MIN_FROM_MS ||
    periodTo <= periodFrom ||
    periodTo - periodFrom > MAX_RANGE_MS
  ) {
    fail();
  }
  if (!isMetric(data.metric) || !isDirection(data.direction) || !isTop(data.top)) fail();
  if (data.method !== null && data.method !== 'CASH' && data.method !== 'STRIPE') fail();
  if (typeof data.truncated !== 'boolean') fail();
  if (expectedFilter !== null) {
    if (
      periodFrom !== expectedFilter.from ||
      periodTo !== expectedFilter.to ||
      data.metric !== expectedFilter.metric ||
      data.direction !== expectedFilter.direction ||
      data.top !== expectedFilter.top ||
      data.method !== expectedFilter.method
    ) {
      fail();
    }
  }
  const matchedProductCount = exactInteger(data.matchedProductCount);
  const matchedTotals = parseTotals(data.matchedTotals);
  if (!Array.isArray(data.items) || data.items.length > Number(data.top)) fail();
  const items = data.items.map((item) => parseItem(item));
  const expectedLength =
    BigInt(matchedProductCount) < BigInt(data.top)
      ? BigInt(matchedProductCount)
      : BigInt(data.top);
  if (BigInt(items.length) !== expectedLength) fail();
  if (data.truncated !== BigInt(matchedProductCount) > BigInt(items.length)) fail();

  const ids = new Set<string>();
  let unitsSum = 0n;
  let centsSum = 0n;
  for (const item of items) {
    if (ids.has(item.productId)) fail();
    ids.add(item.productId);
    unitsSum += BigInt(item.unitsSold);
    centsSum += BigInt(item.totalCents);
  }
  const hasPositions = items.some((item) => item.position !== undefined);
  if (hasPositions && !items.every((item) => item.position !== undefined)) fail();
  if (hasPositions) {
    items.forEach((item, index) => {
      if (item.position !== String(index + 1)) fail();
    });
  }
  for (let index = 0; index < items.length - 1; index += 1) {
    if (compareItems(items[index], items[index + 1], data.metric, data.direction) >= 0) fail();
  }

  const matchedUnits = BigInt(matchedTotals.unitsSold);
  const matchedCents = BigInt(matchedTotals.totalCents);
  if (unitsSum > matchedUnits || centsSum > matchedCents) fail();
  if (!data.truncated && (unitsSum !== matchedUnits || centsSum !== matchedCents)) fail();
  if (BigInt(matchedProductCount) === 0n) {
    if (matchedUnits !== 0n || matchedCents !== 0n) fail();
  } else if (matchedUnits === 0n) {
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
    metric: data.metric,
    direction: data.direction,
    top: data.top,
    matchedProductCount,
    matchedTotals,
    truncated: data.truncated,
    items,
  };
}

export async function getProductRanking(
  filter: ProductRankingFilter,
  signal?: AbortSignal,
): Promise<ProductRanking> {
  const query = buildProductRankingQuery(filter);
  try {
    const response = await apiFetch<unknown>(`/admin/dashboard/product-ranking${query}`, { signal });
    return parseProductRanking(response, filter);
  } catch (error) {
    if (signal?.aborted) {
      throw new DOMException('La consulta del ranking fue cancelada', 'AbortError');
    }
    throw error;
  }
}

export function formatProductRankingError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'La consulta del ranking fue cancelada.';
  }
  if (error instanceof UnverifiableProductRankingError) {
    return 'La respuesta del ranking no se puede verificar. No hay datos seguros para mostrar.';
  }
  if (error instanceof TypeError) return error.message;
  if (!(error instanceof ApiError)) return 'No fue posible consultar el ranking.';
  if (error.status === 400) {
    return 'El periodo, la métrica, la dirección o el conjunto del ranking no es válido.';
  }
  if (error.status === 401) return 'Tu sesión venció. Vuelve a acceder.';
  if (error.status === 403 && error.code === 'PIN_CHANGE_REQUIRED') {
    return 'Debes cambiar tu NIP antes de continuar.';
  }
  if (error.status === 403 && error.code === 'ORIGIN_NOT_ALLOWED') {
    return 'El origen de la solicitud no está permitido.';
  }
  if (error.status === 403) return 'Sólo administración puede consultar el ranking.';
  if (error.status === 413) return 'La solicitud del ranking es demasiado grande.';
  if (error.status === 429) return 'Demasiadas consultas. Inténtalo más tarde.';
  if (error.status === 0 || error.status === 503) {
    return 'El ranking no está disponible en este momento. Inténtalo de nuevo.';
  }
  return 'No fue posible consultar el ranking.';
}

import { ApiError, apiFetch } from '../../../../shared/api/client';
import type { DashboardMethod } from '../dashboard/summaryApi';

const MIN_FROM_MS = Date.parse('2000-01-01T08:00:00.000Z');
const UTC_INPUT_COMPONENTS =
  /^([2-9]\d{3})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d{1,3}))?Z$/;
const UTC_OUTPUT_COMPONENTS =
  /^([2-9]\d{3})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)\.(\d{3})Z$/;
const EXACT_NON_NEGATIVE_INTEGER = /^(0|[1-9][0-9]*)$/;
const EXACT_POSITIVE_INTEGER = /^[1-9][0-9]*$/;
const SHARE_PERCENT = /^(?:100\.00|(?:0|[1-9][0-9]?)\.[0-9]{2})$/;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_RANGE_MS = 366 * DAY_MS;
const CATEGORY_NAME_MAX = 120;
const utf8 = new TextEncoder();

export type CategoryParticipationMetric = 'units' | 'amount';
export type CategoryParticipationFilter = {
  from: string;
  to: string;
  metric: CategoryParticipationMetric;
  method?: DashboardMethod | 'ALL';
};
export type CategoryParticipationItem = {
  categoryId: string;
  name: string;
  isActive: boolean;
  unitsSold: string;
  totalCents: string;
  sharePercent: string;
};
export type CategoryParticipationDenominator = {
  unitsSold: string;
  totalCents: string;
};
export type DashboardCategoryParticipation = {
  generatedAt: string;
  currency: 'MXN';
  period: {
    from: string;
    to: string;
    timeZone: 'America/Tijuana';
  };
  method: DashboardMethod | null;
  metric: CategoryParticipationMetric;
  denominator: CategoryParticipationDenominator;
  totalCategories: string;
  items: CategoryParticipationItem[];
};

type NormalizedFilter = {
  from: number;
  to: number;
  metric: CategoryParticipationMetric;
  method: DashboardMethod | null;
};

export class UnverifiableCategoryParticipationError extends Error {
  constructor() {
    super('La respuesta de la participación por categorías no se puede verificar');
    this.name = 'UnverifiableCategoryParticipationError';
  }
}

function fail(): never {
  throw new UnverifiableCategoryParticipationError();
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
  return new TypeError('El periodo, la métrica o el método de participación no es válido.');
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

function isMetric(value: unknown): value is CategoryParticipationMetric {
  return value === 'units' || value === 'amount';
}

function isMethod(value: unknown): value is DashboardMethod {
  return value === 'CASH' || value === 'STRIPE';
}

function normalizeFilter(input: unknown): NormalizedFilter {
  if (!isRecord(input)) throw invalid();
  if (Object.keys(input).some((key) => !['from', 'to', 'metric', 'method'].includes(key))) {
    throw invalid();
  }
  const from = parseUtc(input.from, false);
  const to = parseUtc(input.to, false);
  if (from === null || to === null) throw invalid();
  if (from < MIN_FROM_MS || to <= from || to - from > MAX_RANGE_MS) throw invalid();
  if (!isMetric(input.metric)) throw invalid();
  let method: DashboardMethod | null = null;
  if (input.method !== undefined) {
    if (input.method === 'ALL') {
      method = null;
    } else if (isMethod(input.method)) {
      method = input.method;
    } else {
      throw invalid();
    }
  }
  return { from, to, metric: input.metric, method };
}

function isoAt(ms: number): string {
  return new Date(ms).toISOString();
}

export function buildCategoryParticipationQuery(input: CategoryParticipationFilter): string {
  const filter = normalizeFilter(input);
  const params = new URLSearchParams();
  params.set('from', isoAt(filter.from));
  params.set('to', isoAt(filter.to));
  params.set('metric', filter.metric);
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

/** OpenAPI/JSON Schema maxLength counts Unicode code points, not UTF-16 units. */
function boundedText(value: unknown, maximum: number): string {
  if (typeof value !== 'string') fail();
  const codePoints = [...value].length;
  if (codePoints === 0 || codePoints > maximum) fail();
  return value;
}

function sharePercent(value: unknown): string {
  if (typeof value !== 'string' || !SHARE_PERCENT.test(value)) fail();
  return value;
}

function parseDenominator(value: unknown): CategoryParticipationDenominator {
  if (!isRecord(value) || !exactKeys(value, ['unitsSold', 'totalCents'])) fail();
  return {
    unitsSold: exactInteger(value.unitsSold),
    totalCents: exactInteger(value.totalCents),
  };
}

function parseItem(value: unknown): CategoryParticipationItem {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      'categoryId',
      'name',
      'isActive',
      'unitsSold',
      'totalCents',
      'sharePercent',
    ])
  ) {
    fail();
  }
  if (typeof value.isActive !== 'boolean') fail();
  return {
    categoryId: positiveInteger(value.categoryId),
    name: boundedText(value.name, CATEGORY_NAME_MAX),
    isActive: value.isActive,
    unitsSold: positiveInteger(value.unitsSold),
    totalCents: exactInteger(value.totalCents),
    sharePercent: sharePercent(value.sharePercent),
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
  a: CategoryParticipationItem,
  b: CategoryParticipationItem,
  metric: CategoryParticipationMetric,
): number {
  const primary = metric === 'units' ? 'unitsSold' : 'totalCents';
  const metricOrder = compareExact(a[primary], b[primary]);
  if (metricOrder !== 0) return -metricOrder;
  const nameOrder = compareUtf8(a.name, b.name);
  if (nameOrder !== 0) return nameOrder;
  return compareExact(a.categoryId, b.categoryId);
}

/** Parses only the accepted closed DTO and rejects contradictory data. */
export function parseCategoryParticipation(
  value: unknown,
  expected?: CategoryParticipationFilter,
): DashboardCategoryParticipation {
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
      'denominator',
      'totalCategories',
      'items',
    ])
  ) {
    fail();
  }
  const data = value.data;
  const generatedAtMs = parseUtc(data.generatedAt, true);
  if (generatedAtMs === null || generatedAtMs < MIN_FROM_MS) fail();
  if (data.currency !== 'MXN') fail();
  if (!isMetric(data.metric)) fail();
  if (data.method !== null && !isMethod(data.method)) fail();
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
  if (expectedFilter !== null) {
    if (
      periodFrom !== expectedFilter.from ||
      periodTo !== expectedFilter.to ||
      data.metric !== expectedFilter.metric ||
      data.method !== expectedFilter.method
    ) {
      fail();
    }
  }
  const denominator = parseDenominator(data.denominator);
  const totalCategories = exactInteger(data.totalCategories);
  if (!Array.isArray(data.items)) fail();
  if (BigInt(totalCategories) !== BigInt(data.items.length)) fail();
  const items = data.items.map((item) => parseItem(item));

  const ids = new Set<string>();
  let unitsSum = 0n;
  let centsSum = 0n;
  for (const item of items) {
    if (ids.has(item.categoryId)) fail();
    ids.add(item.categoryId);
    unitsSum += BigInt(item.unitsSold);
    centsSum += BigInt(item.totalCents);
  }
  if (unitsSum !== BigInt(denominator.unitsSold)) fail();
  if (centsSum !== BigInt(denominator.totalCents)) fail();

  if (items.length === 0) {
    if (denominator.unitsSold !== '0' || denominator.totalCents !== '0') fail();
    if (totalCategories !== '0') fail();
  } else {
    if (BigInt(denominator.unitsSold) === 0n) fail();
    for (let index = 0; index < items.length - 1; index += 1) {
      if (compareItems(items[index], items[index + 1], data.metric) >= 0) fail();
    }
    const selectedBase =
      data.metric === 'units' ? BigInt(denominator.unitsSold) : BigInt(denominator.totalCents);
    if (selectedBase === 0n) {
      if (!items.every((item) => item.sharePercent === '0.00')) fail();
    }
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
    denominator,
    totalCategories,
    items,
  };
}

export async function getCategoryParticipation(
  filter: CategoryParticipationFilter,
  signal?: AbortSignal,
): Promise<DashboardCategoryParticipation> {
  const query = buildCategoryParticipationQuery(filter);
  try {
    const response = await apiFetch<unknown>(
      `/admin/dashboard/category-participation${query}`,
      { signal },
    );
    return parseCategoryParticipation(response, filter);
  } catch (error) {
    if (signal?.aborted) {
      throw new DOMException('La consulta de participación por categorías fue cancelada', 'AbortError');
    }
    throw error;
  }
}

export function formatCategoryParticipationError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'La consulta de participación por categorías fue cancelada.';
  }
  if (error instanceof UnverifiableCategoryParticipationError) {
    return 'La respuesta de participación por categorías no se puede verificar. No hay datos seguros para mostrar.';
  }
  if (error instanceof TypeError) return error.message;
  if (!(error instanceof ApiError)) {
    return 'No fue posible consultar la participación por categorías.';
  }
  if (error.status === 400) {
    return 'El periodo, la métrica o el método de participación no es válido.';
  }
  if (error.status === 401) return 'Tu sesión venció. Vuelve a acceder.';
  if (error.status === 403 && error.code === 'PIN_CHANGE_REQUIRED') {
    return 'Debes cambiar tu NIP antes de continuar.';
  }
  if (error.status === 403 && error.code === 'ORIGIN_NOT_ALLOWED') {
    return 'El origen de la solicitud no está permitido.';
  }
  if (error.status === 403) return 'Sólo administración puede consultar la participación por categorías.';
  if (error.status === 413) {
    return 'La solicitud de participación por categorías es demasiado grande.';
  }
  if (error.status === 429) return 'Demasiadas consultas. Inténtalo más tarde.';
  if (error.status === 0 || error.status === 503) {
    return 'La participación por categorías no está disponible en este momento. Inténtalo de nuevo.';
  }
  return 'No fue posible consultar la participación por categorías.';
}

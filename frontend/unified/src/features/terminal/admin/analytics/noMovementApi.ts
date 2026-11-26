import { ApiError, apiFetch } from '../../../../shared/api/client';
import type { DashboardMethod } from '../dashboard/summaryApi';

const MIN_FROM_MS = Date.parse('2000-01-01T08:00:00.000Z');
const UTC_INPUT_COMPONENTS =
  /^([2-9]\d{3})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d{1,3}))?Z$/;
const UTC_OUTPUT_COMPONENTS =
  /^([2-9]\d{3})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)\.(\d{3})Z$/;
const UTC_PRODUCT_COMPONENTS =
  /^([2-9]\d{3})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)\.(\d{6})Z$/;
const EXACT_NON_NEGATIVE_INTEGER = /^(0|[1-9][0-9]*)$/;
const EXACT_POSITIVE_INTEGER = /^[1-9][0-9]*$/;
const OPAQUE_CURSOR = /^[A-Za-z0-9_-]{1,2048}$/;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_RANGE_MS = 366 * DAY_MS;
const PAGE_LIMITS = ['10', '20', '50'] as const;
const UNIVERSE_DEFINITION =
  'product-not-deleted+category-active+category-not-deleted+created-before-asOf+availability-ignored+current-catalog-state';
const PRODUCT_NAME_MAX = 160;
const CATEGORY_NAME_MAX = 120;
const utf8 = new TextEncoder();

export const NO_MOVEMENT_UNIVERSE_DEFINITION = UNIVERSE_DEFINITION;
export type NoMovementPageLimit = (typeof PAGE_LIMITS)[number];
export type NoMovementMethod = DashboardMethod;
export type NoMovementFilter = {
  from: string;
  to: string;
  method?: NoMovementMethod | 'ALL';
  limit?: NoMovementPageLimit;
  cursor?: string;
};
export type NoMovementCategory = {
  id: string;
  name: string;
};
export type NoMovementItem = {
  productId: string;
  name: string;
  category: NoMovementCategory;
  isAvailable: boolean;
  createdAt: string;
};
export type NoMovementUniverse = {
  asOf: string;
  definition: typeof UNIVERSE_DEFINITION;
  includesUnavailable: true;
};
export type NoMovementPage = {
  limit: NoMovementPageLimit;
  nextCursor: string | null;
};
export type DashboardNoMovement = {
  generatedAt: string;
  currency: 'MXN';
  period: {
    from: string;
    to: string;
    timeZone: 'America/Tijuana';
  };
  method: NoMovementMethod | null;
  universe: NoMovementUniverse;
  totalNoMovementProducts: string;
  page: NoMovementPage;
  items: NoMovementItem[];
};

type NormalizedFilter = {
  from: number;
  to: number;
  method: NoMovementMethod | null;
  limit: NoMovementPageLimit;
  cursor: string | null;
};

export class UnverifiableNoMovementError extends Error {
  constructor() {
    super('La respuesta de la lista de productos sin movimiento no se puede verificar');
    this.name = 'UnverifiableNoMovementError';
  }
}

function fail(): never {
  throw new UnverifiableNoMovementError();
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
  return new TypeError('El periodo, el método, el límite o el cursor de la lista no es válido.');
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

function parseProductInstant(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = UTC_PRODUCT_COMPONENTS.exec(value);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const millisecond = Number(match[7].slice(0, 3));
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

function isPageLimit(value: unknown): value is NoMovementPageLimit {
  return value === '10' || value === '20' || value === '50';
}

function isMethod(value: unknown): value is NoMovementMethod {
  return value === 'CASH' || value === 'STRIPE';
}

function isCursor(value: unknown): value is string {
  return typeof value === 'string' && OPAQUE_CURSOR.test(value);
}

function normalizeFilter(input: unknown): NormalizedFilter {
  if (!isRecord(input)) throw invalid();
  if (
    Object.keys(input).some(
      (key) => !['from', 'to', 'method', 'limit', 'cursor'].includes(key),
    )
  ) {
    throw invalid();
  }
  const from = parseUtc(input.from, false);
  const to = parseUtc(input.to, false);
  if (from === null || to === null) throw invalid();
  if (from < MIN_FROM_MS || to <= from || to - from > MAX_RANGE_MS) throw invalid();
  let method: NoMovementMethod | null = null;
  if (input.method !== undefined) {
    if (input.method === 'ALL') {
      method = null;
    } else if (isMethod(input.method)) {
      method = input.method;
    } else {
      throw invalid();
    }
  }
  let limit: NoMovementPageLimit = '20';
  if (input.limit !== undefined) {
    if (!isPageLimit(input.limit)) throw invalid();
    limit = input.limit;
  }
  let cursor: string | null = null;
  if (input.cursor !== undefined) {
    if (!isCursor(input.cursor)) throw invalid();
    cursor = input.cursor;
  }
  return { from, to, method, limit, cursor };
}

function isoAt(ms: number): string {
  return new Date(ms).toISOString();
}

export function buildNoMovementQuery(input: NoMovementFilter): string {
  const filter = normalizeFilter(input);
  const params = new URLSearchParams();
  params.set('from', isoAt(filter.from));
  params.set('to', isoAt(filter.to));
  if (filter.method !== null) params.set('method', filter.method);
  params.set('limit', filter.limit);
  if (filter.cursor !== null) params.set('cursor', filter.cursor);
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

function boundedText(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum) fail();
  return value;
}

function parseCategory(value: unknown): NoMovementCategory {
  if (!isRecord(value) || !exactKeys(value, ['id', 'name'])) fail();
  return {
    id: positiveInteger(value.id),
    name: boundedText(value.name, CATEGORY_NAME_MAX),
  };
}

function parseItem(value: unknown, periodTo: number): NoMovementItem {
  if (
    !isRecord(value) ||
    !exactKeys(value, ['productId', 'name', 'category', 'isAvailable', 'createdAt'])
  ) {
    fail();
  }
  if (typeof value.isAvailable !== 'boolean') fail();
  const createdAtMs = parseProductInstant(value.createdAt);
  if (createdAtMs === null || createdAtMs >= periodTo) fail();
  return {
    productId: positiveInteger(value.productId),
    name: boundedText(value.name, PRODUCT_NAME_MAX),
    category: parseCategory(value.category),
    isAvailable: value.isAvailable,
    createdAt: value.createdAt as string,
  };
}

function parsePage(value: unknown): NoMovementPage {
  if (!isRecord(value) || !exactKeys(value, ['limit', 'nextCursor'])) fail();
  if (!isPageLimit(value.limit)) fail();
  if (value.nextCursor !== null && !isCursor(value.nextCursor)) fail();
  return {
    limit: value.limit,
    nextCursor: value.nextCursor as string | null,
  };
}

function parseUniverse(value: unknown, periodTo: string): NoMovementUniverse {
  if (!isRecord(value) || !exactKeys(value, ['asOf', 'definition', 'includesUnavailable'])) {
    fail();
  }
  const asOfMs = parseUtc(value.asOf, true);
  if (asOfMs === null || asOfMs < MIN_FROM_MS) fail();
  if (value.asOf !== periodTo) fail();
  if (value.definition !== UNIVERSE_DEFINITION) fail();
  if (value.includesUnavailable !== true) fail();
  return {
    asOf: value.asOf as string,
    definition: UNIVERSE_DEFINITION,
    includesUnavailable: true,
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

/** Parses only the accepted closed DTO and rejects contradictory data. */
export function parseDashboardNoMovement(
  value: unknown,
  expected?: NoMovementFilter,
): DashboardNoMovement {
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
      'universe',
      'totalNoMovementProducts',
      'page',
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
  if (data.method !== null && !isMethod(data.method)) fail();
  if (expectedFilter !== null) {
    if (
      periodFrom !== expectedFilter.from ||
      periodTo !== expectedFilter.to ||
      data.method !== expectedFilter.method
    ) {
      fail();
    }
  }
  const universe = parseUniverse(data.universe, data.period.to as string);
  const totalNoMovementProducts = exactInteger(data.totalNoMovementProducts);
  const page = parsePage(data.page);
  if (expectedFilter !== null && page.limit !== expectedFilter.limit) fail();
  if (!Array.isArray(data.items) || data.items.length > Number(page.limit)) fail();
  const items = data.items.map((item) => parseItem(item, periodTo));
  if (BigInt(totalNoMovementProducts) < BigInt(items.length)) fail();
  if (items.length === 0 && page.nextCursor !== null) fail();
  if (page.nextCursor !== null && items.length !== Number(page.limit)) fail();

  const ids = new Set<string>();
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (ids.has(item.productId)) fail();
    ids.add(item.productId);
    if (index > 0) {
      const previous = items[index - 1];
      const nameOrder = compareUtf8(previous.name, item.name);
      if (nameOrder > 0) fail();
      if (nameOrder === 0 && compareExact(previous.productId, item.productId) >= 0) fail();
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
    method: data.method as NoMovementMethod | null,
    universe,
    totalNoMovementProducts,
    page,
    items,
  };
}

export async function getDashboardNoMovement(
  filter: NoMovementFilter,
  signal?: AbortSignal,
): Promise<DashboardNoMovement> {
  const query = buildNoMovementQuery(filter);
  try {
    const response = await apiFetch<unknown>(`/admin/dashboard/no-movement-products${query}`, {
      signal,
    });
    return parseDashboardNoMovement(response, filter);
  } catch (error) {
    if (signal?.aborted) {
      throw new DOMException('La consulta de productos sin movimiento fue cancelada', 'AbortError');
    }
    throw error;
  }
}

export function formatNoMovementError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'La consulta de la lista fue cancelada.';
  }
  if (error instanceof UnverifiableNoMovementError) {
    return 'La respuesta de la lista no se puede verificar. No hay datos seguros para mostrar.';
  }
  if (error instanceof TypeError) return error.message;
  if (!(error instanceof ApiError)) return 'No fue posible consultar la lista de productos sin movimiento.';
  if (error.status === 400) {
    return 'El periodo, el método, el límite o el cursor de la lista no es válido.';
  }
  if (error.status === 401) return 'Tu sesión venció. Vuelve a acceder.';
  if (error.status === 403 && error.code === 'PIN_CHANGE_REQUIRED') {
    return 'Debes cambiar tu NIP antes de continuar.';
  }
  if (error.status === 403 && error.code === 'ORIGIN_NOT_ALLOWED') {
    return 'El origen de la solicitud no está permitido.';
  }
  if (error.status === 403) return 'Sólo administración puede consultar la lista.';
  if (error.status === 413) return 'La solicitud de la lista es demasiado grande.';
  if (error.status === 429) return 'Demasiadas consultas. Inténtalo más tarde.';
  if (error.status === 0 || error.status === 503) {
    return 'La lista de productos sin movimiento no está disponible en este momento. Inténtalo de nuevo.';
  }
  return 'No fue posible consultar la lista de productos sin movimiento.';
}

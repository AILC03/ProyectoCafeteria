import { z } from 'zod';
import { pageQuerySchema } from '../../shared/http/pagination.js';
import { invalidInput } from '../../shared/http/problem.js';
export const salesFilters = z
  .object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    method: z.enum(['CASH', 'STRIPE']).optional(),
  })
  .strict();
export const salesOrder = z.enum(['asc', 'desc']);
export const salesQuery = pageQuerySchema
  .extend(salesFilters.shape)
  .extend({ order: salesOrder.optional() })
  .refine((v) => !v.from || !v.to || new Date(v.from) < new Date(v.to));
export type SalesFilters = z.infer<typeof salesFilters>;
export type SalesOrder = z.infer<typeof salesOrder>;

const UTC_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;
export const MAX_DASHBOARD_RANGE_MS = 366 * 24 * 60 * 60 * 1000;

/** E2: dominio mínimo aceptado, 2000-01-01 00:00 America/Tijuana. */
export const SALES_SERIES_MIN_INSTANT_MS = Date.UTC(2000, 0, 1, 8, 0, 0, 0);
const SERIES_INSTANT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;
export const SALES_SERIES_MAX_HOUR_RANGE_MS = 31 * 24 * 60 * 60 * 1000;
export const SALES_SERIES_MAX_DAY_RANGE_MS = 366 * 24 * 60 * 60 * 1000;

/**
 * Entrada E2: solo milisegundos, fecha gregoriana real UTC terminada en Z y
 * años 2000–9999. Devuelve NaN para cualquier forma inválida (4–6 decimales,
 * offset, hora 24, segundo 60, fecha imposible…), sin normalizar ni truncar.
 */
export function parseSalesSeriesInstant(value: string): number {
  const match = SERIES_INSTANT_PATTERN.exec(value);
  if (!match) return Number.NaN;
  const year = Number(match[1]),
    month = Number(match[2]),
    day = Number(match[3]),
    hour = Number(match[4]),
    minute = Number(match[5]),
    second = Number(match[6]),
    millisecond = match[7] ? Number(match[7].padEnd(3, '0')) : 0;
  if (year < 2000 || year > 9999) return Number.NaN;
  const instant = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const check = new Date(instant);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute ||
    check.getUTCSeconds() !== second ||
    check.getUTCMilliseconds() !== millisecond
  )
    return Number.NaN;
  return instant;
}

const salesSeriesInstant = z
  .string()
  .refine((value) => Number.isFinite(parseSalesSeriesInstant(value)));
export const salesSeriesQuery = z
  .object({
    from: salesSeriesInstant,
    to: salesSeriesInstant,
    granularity: z.enum(['hour', 'day']),
    method: z.enum(['CASH', 'STRIPE']).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const from = parseSalesSeriesInstant(value.from),
      to = parseSalesSeriesInstant(value.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return;
    if (from < SALES_SERIES_MIN_INSTANT_MS)
      context.addIssue({
        code: 'custom',
        message: 'El inicio no puede ser anterior al dominio aceptado',
        path: ['from'],
      });
    if (!(from < to))
      context.addIssue({
        code: 'custom',
        message: 'El rango debe ser positivo y exclusivo al final',
        path: ['to'],
      });
    const limit =
      value.granularity === 'hour' ? SALES_SERIES_MAX_HOUR_RANGE_MS : SALES_SERIES_MAX_DAY_RANGE_MS;
    if (to - from > limit)
      context.addIssue({
        code: 'custom',
        message: 'El rango supera el límite de la granularidad',
        path: ['to'],
      });
  });
export type SalesSeriesQuery = z.infer<typeof salesSeriesQuery>;
const RANKING_TOP_VALUES = ['5', '10', '20'] as const;
/**
 * Entrada E2 de ranking: reutiliza la precisión y el dominio de series sin
 * cambiar su contrato. `top` es una forma léxica exacta (sin coerción) y el
 * default se materializa al parsear para poder hacer eco del valor efectivo.
 */
export const salesRankingQuery = z
  .object({
    from: salesSeriesInstant,
    to: salesSeriesInstant,
    metric: z.enum(['units', 'amount']),
    direction: z.enum(['top', 'bottom']),
    top: z.enum(RANKING_TOP_VALUES).optional().default('5'),
    method: z.enum(['CASH', 'STRIPE']).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const from = parseSalesSeriesInstant(value.from),
      to = parseSalesSeriesInstant(value.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return;
    if (from < SALES_SERIES_MIN_INSTANT_MS)
      context.addIssue({
        code: 'custom',
        message: 'El inicio no puede ser anterior al dominio aceptado',
        path: ['from'],
      });
    if (!(from < to))
      context.addIssue({
        code: 'custom',
        message: 'El rango debe ser positivo y exclusivo al final',
        path: ['to'],
      });
    if (to - from > SALES_SERIES_MAX_DAY_RANGE_MS)
      context.addIssue({
        code: 'custom',
        message: 'El rango supera el límite aceptado',
        path: ['to'],
      });
  });
export type SalesRankingQuery = z.infer<typeof salesRankingQuery>;
/**
 * Entrada E2-13 de participación por categorías: mismo dominio temporal y
 * precisión de milisegundos que las series/ranking E2, `metric` obligatoria y
 * sin default (no se materializa un valor que el contrato no acepta), `method`
 * opcional y sin filtro de categoría. Cualquier extra, repetido o array lo
 * rechaza `strict`.
 */
export const salesCategoryParticipationQuery = z
  .object({
    from: salesSeriesInstant,
    to: salesSeriesInstant,
    metric: z.enum(['units', 'amount']),
    method: z.enum(['CASH', 'STRIPE']).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const from = parseSalesSeriesInstant(value.from),
      to = parseSalesSeriesInstant(value.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return;
    if (from < SALES_SERIES_MIN_INSTANT_MS)
      context.addIssue({
        code: 'custom',
        message: 'El inicio no puede ser anterior al dominio aceptado',
        path: ['from'],
      });
    if (!(from < to))
      context.addIssue({
        code: 'custom',
        message: 'El rango debe ser positivo y exclusivo al final',
        path: ['to'],
      });
    if (to - from > SALES_SERIES_MAX_DAY_RANGE_MS)
      context.addIssue({
        code: 'custom',
        message: 'El rango supera el límite aceptado',
        path: ['to'],
      });
  });
export type SalesCategoryParticipationQuery = z.infer<typeof salesCategoryParticipationQuery>;

/** Rango obligatorio y acotado para evitar agregaciones sin límite. */
export const dashboardSummaryQuery = z
  .object({
    from: z.string().datetime().regex(UTC_DATE_TIME),
    to: z.string().datetime().regex(UTC_DATE_TIME),
    method: z.enum(['CASH', 'STRIPE']).optional(),
  })
  .strict()
  .refine((v) => {
    const duration = new Date(v.to).getTime() - new Date(v.from).getTime();
    return duration > 0 && duration <= MAX_DASHBOARD_RANGE_MS;
  });
export type DashboardSummaryQuery = z.infer<typeof dashboardSummaryQuery>;

/** E2-09: token cerrado de la definición actual del universo sin movimiento. */
export const NO_MOVEMENT_UNIVERSE_DEFINITION =
  'product-not-deleted+category-active+category-not-deleted+created-before-asOf+availability-ignored+current-catalog-state';
export const NO_MOVEMENT_SCOPE = 'dashboard-no-movement';
export const NO_MOVEMENT_PAGE_LIMITS = ['10', '20', '50'] as const;
export type NoMovementPageLimit = (typeof NO_MOVEMENT_PAGE_LIMITS)[number];
export const NO_MOVEMENT_MAX_CURSOR_LENGTH = 2048;
const NO_MOVEMENT_CURSOR_PATTERN = /^[A-Za-z0-9_-]+$/;
/**
 * R-1: el nombre viaja como parámetro `text` a PostgreSQL. NUL (0x00) no es
 * representable en `text` y los controles C0/DEL no son una clave de catálogo
 * legítima; rechazarlos en la entrada evita un 500 por un cursor manipulado.
 * No restringe UTF-8: acentos, emoji y espacios siguen admitidos.
 */
function hasIncompatibleNoMovementControl(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
}

/**
 * Entrada E2-09: mismo dominio y precisión que las series E2, más `limit` con
 * forma léxica exacta 10/20/50 y cursor propio. No reutiliza `pageQuerySchema`
 * (limit entero 1–100) ni el `decodeCursor` genérico.
 */
export const salesNoMovementQuery = z
  .object({
    from: salesSeriesInstant,
    to: salesSeriesInstant,
    method: z.enum(['CASH', 'STRIPE']).optional(),
    limit: z.enum(NO_MOVEMENT_PAGE_LIMITS).optional().default('20'),
    cursor: z
      .string()
      .min(1)
      .max(NO_MOVEMENT_MAX_CURSOR_LENGTH)
      .regex(NO_MOVEMENT_CURSOR_PATTERN)
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const from = parseSalesSeriesInstant(value.from),
      to = parseSalesSeriesInstant(value.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return;
    if (from < SALES_SERIES_MIN_INSTANT_MS)
      context.addIssue({
        code: 'custom',
        message: 'El inicio no puede ser anterior al dominio aceptado',
        path: ['from'],
      });
    if (!(from < to))
      context.addIssue({
        code: 'custom',
        message: 'El rango debe ser positivo y exclusivo al final',
        path: ['to'],
      });
    if (to - from > SALES_SERIES_MAX_DAY_RANGE_MS)
      context.addIssue({
        code: 'custom',
        message: 'El rango supera el límite aceptado',
        path: ['to'],
      });
  });
export type SalesNoMovementQuery = z.infer<typeof salesNoMovementQuery>;

const noMovementCursorInstant = z.string().refine((value) => {
  const instant = parseSalesSeriesInstant(value);
  return Number.isFinite(instant) && new Date(instant).toISOString() === value;
});
const noMovementCursorProductId = z
  .string()
  .regex(/^[1-9][0-9]*$/)
  .refine((value) => BigInt(value) <= 9223372036854775807n);
const noMovementCursorSchema = z
  .object({
    v: z.literal(1),
    scope: z.literal(NO_MOVEMENT_SCOPE),
    definition: z.literal(NO_MOVEMENT_UNIVERSE_DEFINITION),
    from: noMovementCursorInstant,
    to: noMovementCursorInstant,
    method: z.enum(['CASH', 'STRIPE']).nullable(),
    limit: z.enum(NO_MOVEMENT_PAGE_LIMITS),
    name: z
      .string()
      .min(1)
      .max(160)
      .refine((value) => !hasIncompatibleNoMovementControl(value)),
    productId: noMovementCursorProductId,
  })
  .strict();

export type NoMovementCursorFilters = {
  from: string;
  to: string;
  method: 'CASH' | 'STRIPE' | null;
  limit: NoMovementPageLimit;
};
export type NoMovementCursorKey = { name: string; productId: string };

/**
 * Codificador propio del cursor de esta capacidad. El sobre vincula alcance,
 * versión, definición, periodo normalizado, método, límite y última clave.
 */
export function encodeNoMovementCursor(
  filters: NoMovementCursorFilters,
  key: NoMovementCursorKey,
): string {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      scope: NO_MOVEMENT_SCOPE,
      definition: NO_MOVEMENT_UNIVERSE_DEFINITION,
      from: filters.from,
      to: filters.to,
      method: filters.method,
      limit: filters.limit,
      name: key.name,
      productId: key.productId,
    }),
  ).toString('base64url');
}

/**
 * Decodificador propio: valida forma base64url canónica, JSON estricto, versión,
 * alcance, definición, periodo normalizado, método, límite y última clave. Un
 * cursor de otro endpoint, manipulado o incompatible devuelve 400.
 */
export function decodeNoMovementCursor(
  token: string | undefined,
  filters: NoMovementCursorFilters,
): NoMovementCursorKey | undefined {
  if (!token) return undefined;
  try {
    if (token.length > NO_MOVEMENT_MAX_CURSOR_LENGTH || !NO_MOVEMENT_CURSOR_PATTERN.test(token))
      throw invalidInput();
    const bytes = Buffer.from(token, 'base64url');
    if (bytes.toString('base64url') !== token) throw invalidInput();
    const cursor = noMovementCursorSchema.parse(JSON.parse(bytes.toString('utf8')));
    if (
      cursor.from !== filters.from ||
      cursor.to !== filters.to ||
      cursor.method !== filters.method ||
      cursor.limit !== filters.limit
    )
      throw invalidInput();
    return { name: cursor.name, productId: cursor.productId };
  } catch {
    throw invalidInput();
  }
}

import { z } from 'zod';
import { pageQuerySchema } from '../../shared/http/pagination.js';
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

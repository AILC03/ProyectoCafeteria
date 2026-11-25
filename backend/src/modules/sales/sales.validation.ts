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

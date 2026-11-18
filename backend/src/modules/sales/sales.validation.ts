import { z } from 'zod';
import { pageQuerySchema } from '../../shared/http/pagination.js';
export const salesFilters = z
  .object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    method: z.enum(['CASH', 'STRIPE']).optional(),
  })
  .strict();
export const salesQuery = pageQuerySchema
  .extend(salesFilters.shape)
  .refine((v) => !v.from || !v.to || new Date(v.from) < new Date(v.to));
export type SalesFilters = z.infer<typeof salesFilters>;

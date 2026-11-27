import { z } from 'zod';
import { idSchema, pageQuerySchema } from '../../shared/http/pagination.js';
export { emptyInput, operationKey } from '../orders/orders.validation.js';
export const dbId = idSchema.transform(BigInt);

/** Tope de rango de la consulta administrativa: un año. */
export const ADMIN_CASH_MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000;
const instant = z.string().datetime();
/**
 * Filtros de solo lectura para Administración → Caja. `from`/`to` delimitan la
 * apertura de la sesión en UTC semiabierto; `difference` nunca expone sesiones
 * abiertas porque su diferencia es nula.
 */
export const adminCashQuery = pageQuerySchema
  .extend({
    from: instant,
    to: instant,
    status: z.enum(['OPEN', 'CLOSED']).optional(),
    difference: z.enum(['SHORTAGE', 'SURPLUS', 'NONE']).optional(),
    employeeId: idSchema.transform(BigInt).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const from = new Date(value.from).getTime(),
      to = new Date(value.to).getTime();
    if (!(from < to)) {
      context.addIssue({
        code: 'custom',
        message: 'El rango debe ser positivo y exclusivo al final',
        path: ['to'],
      });
    } else if (to - from > ADMIN_CASH_MAX_RANGE_MS) {
      context.addIssue({
        code: 'custom',
        message: 'El rango supera el límite de un año',
        path: ['to'],
      });
    }
    if (value.difference !== undefined && value.status === 'OPEN') {
      context.addIssue({
        code: 'custom',
        message: 'Una sesión abierta no tiene diferencia',
        path: ['difference'],
      });
    }
  });
export type AdminCashQuery = z.infer<typeof adminCashQuery>;
export type AdminCashFilters = Omit<AdminCashQuery, 'limit' | 'cursor'>;
export const cents = z
  .string()
  .regex(/^(0|[1-9]\d{0,18})$/)
  .pipe(z.string().refine((value) => BigInt(value) <= 9223372036854775807n))
  .transform(BigInt);
export const cashOpen = z.object({ openingAmountCents: cents }).strict();
export const cashClose = z
  .object({
    countedCashCents: cents,
    exceptionalCloseReason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();
export type CloseInput = z.infer<typeof cashClose>;

import { z } from 'zod';
import { idSchema } from '../../shared/http/pagination.js';
export { emptyInput, operationKey } from '../orders/orders.validation.js';
export const dbId = idSchema.transform(BigInt);
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

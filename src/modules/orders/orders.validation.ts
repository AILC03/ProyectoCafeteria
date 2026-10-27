import { z } from 'zod';
import { idSchema } from '../../shared/http/pagination.js';

export const emptyInput = z.object({}).strict();
export const operationKey = z
  .string()
  .uuid()
  .regex(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i)
  .transform((key) => key.toLowerCase());
export const customerIdentifier = z
  .string()
  .trim()
  .max(32)
  .transform((value) => {
    const normalized = value.toUpperCase();
    return /^\d{10}$/.test(normalized) ? `+52${normalized}` : normalized;
  })
  .pipe(z.string().regex(/^(C\d{1,19}|\+52\d{10})$/));
export const customerSearch = z.object({ identifier: customerIdentifier }).strict();
export const customerSelection = customerSearch.extend({
  confirmedName: z.string().trim().min(1).max(120),
});
export const orderLine = z
  .object({
    productId: idSchema,
    quantity: z.number().int().min(1).max(99),
    optionValueIds: z
      .array(idSchema)
      .max(5000)
      .default([])
      .refine((values) => new Set(values).size === values.length),
  })
  .strict();
export const mobileOrder = z
  .object({
    paymentMethod: z.enum(['CASH', 'STRIPE']),
    guestName: z.string().trim().min(1).max(120).optional(),
    items: z.array(orderLine).min(1).max(50),
  })
  .strict();
export const cashierOrder = mobileOrder
  .extend({
    paymentMethod: z.literal('CASH'),
    customer: customerSelection.optional(),
  })
  .refine((body) => !(body.customer && body.guestName));
export type OrderInput = z.infer<typeof mobileOrder> & {
  customer?: z.infer<typeof customerSelection>;
};
export type CustomerSelection = z.infer<typeof customerSelection>;

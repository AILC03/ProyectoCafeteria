import { z } from 'zod';
import { idSchema, pageQuerySchema } from '../../shared/http/pagination.js';

export const dbId = idSchema.transform(BigInt);
export const money = z
  .string()
  .regex(/^(0|[1-9]\d{0,7})$/)
  .pipe(z.string().refine((s) => BigInt(s) <= 9999900n))
  .transform(BigInt);
const name = (max: number) => z.string().trim().min(1).max(max);
const notEmpty = (object: object) => Object.keys(object).length > 0;
export const categoryCreate = z
  .object({ name: name(120), isActive: z.boolean().optional() })
  .strict();
export const categoryPatch = categoryCreate.partial().refine(notEmpty);
export const productCreate = z
  .object({
    name: name(160),
    categoryId: dbId,
    description: z.string().max(1500).nullable().optional(),
    basePriceCents: money,
    isAvailable: z.boolean().optional(),
  })
  .strict();
export const productPatch = productCreate.partial().refine(notEmpty);
export const groupCreate = z
  .object({ name: name(120), pricingScope: z.enum(['GLOBAL', 'PER_PRODUCT']) })
  .strict();
export const groupPatch = groupCreate.partial().refine(notEmpty);
export const valueCreate = z
  .object({
    name: name(120),
    globalSurchargeCents: money.nullable().optional(),
    isAvailable: z.boolean().optional(),
  })
  .strict();
export const valuePatch = valueCreate.partial().refine(notEmpty);
export const configuration = z
  .object({
    groups: z
      .array(
        z
          .object({
            groupId: dbId,
            minSelections: z.number().int().min(0).max(100),
            maxSelections: z.number().int().min(0).max(100),
            values: z
              .array(
                z
                  .object({ valueId: dbId, surchargeOverrideCents: money.nullable().optional() })
                  .strict(),
              )
              .max(100),
          })
          .strict(),
      )
      .max(50),
  })
  .strict();
export const adminList = pageQuerySchema.extend({
  includeDeleted: z
    .enum(['true', 'false'])
    .transform((s) => s === 'true')
    .default(false),
  groupId: idSchema.optional(),
});
export type Resource = 'categories' | 'products' | 'option-groups' | 'option-values';

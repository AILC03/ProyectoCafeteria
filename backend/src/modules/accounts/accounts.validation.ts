import { z } from 'zod';
import { pinSchema, normalizeMxPhone } from '../../shared/http/customer-input.js';
import { idSchema } from '../../shared/http/pagination.js';
export const name = z.string().trim().min(1).max(120);
export const phone = z
  .string()
  .transform(normalizeMxPhone)
  .pipe(z.string().regex(/^\+52\d{10}$/));
export const reason = z.string().trim().min(1).max(500);
export const role = z.enum(['CAJERO', 'PREPARACION', 'ADMINISTRADOR']);
export const ownProfile = z
  .object({ name: name.optional(), phone: phone.optional(), currentPin: pinSchema.optional() })
  .strict()
  .refine((v) => !!v.name || !!v.phone)
  .refine((v) => !v.phone || !!v.currentPin);
export const employeeCreate = z
  .object({
    name,
    username: z.string().regex(/^[A-Za-z0-9_]{3,24}$/),
    password: z.string().min(8).max(24),
    role,
  })
  .strict();
export const employeeUpdate = z
  .object({
    name: name.optional(),
    role: role.optional(),
    isActive: z.boolean().optional(),
    reason,
  })
  .strict()
  .refine((v) => v.name !== undefined || v.role !== undefined || v.isActive !== undefined);
export const customerUpdate = z
  .object({ name: name.optional(), phone: phone.optional(), reason })
  .strict()
  .refine((v) => !!v.name || !!v.phone);
export const pinReset = z
  .object({ temporaryPin: pinSchema, reason, verificationSummary: reason, recentSaleId: idSchema })
  .strict();
export const recoveryRequest = z
  .object({
    identifier: z
      .string()
      .trim()
      .min(1)
      .max(32)
      .transform((v) => normalizeMxPhone(v.toUpperCase())),
  })
  .strict();
export const secretToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const recoveryConfirm = z.object({ token: secretToken, newPin: pinSchema }).strict();
export const emailRequest = z
  .object({ email: z.string().trim().toLowerCase().email().max(254) })
  .strict();
export const emailConfirm = z.object({ token: secretToken }).strict();

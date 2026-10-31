import { z } from 'zod';

export function normalizeMxPhone(value: string) {
  const normalized = value.trim();
  return /^\d{10}$/.test(normalized) ? `+52${normalized}` : normalized;
}
export const pinSchema = z.string().regex(/^\d{4}$/);
export const phoneSchema = z
  .string()
  .trim()
  .max(32)
  .transform(normalizeMxPhone)
  .pipe(z.string().regex(/^\+52\d{10}$/));
export const customerNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((value) =>
    [...value].every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127),
  );

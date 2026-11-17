import { z } from 'zod';
import type { AuthConfig } from '../modules/auth/auth.types.js';

const schema = z
  .object({
    AUTH_JWT_SECRET: z.string().regex(/^[a-f0-9]{64,}$/),
    AUTH_CSRF_SECRET: z.string().regex(/^[a-f0-9]{64,}$/),
    AUTH_ISSUER: z.string().min(1).default('cafeteria-api'),
    AUTH_AUDIENCE: z.string().min(1).default('cafeteria-web'),
    AUTH_IP_LIMIT: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((value) => value.AUTH_JWT_SECRET !== value.AUTH_CSRF_SECRET);
export function authConfiguration(
  input: Record<string, string | undefined>,
  origin: string,
  production: boolean,
): AuthConfig | undefined {
  if (!input.AUTH_JWT_SECRET && !input.AUTH_CSRF_SECRET) return undefined;
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new Error('Configuración de autenticación inválida; revisar claves locales.');
  return {
    jwtSecret: parsed.data.AUTH_JWT_SECRET,
    csrfSecret: parsed.data.AUTH_CSRF_SECRET,
    issuer: parsed.data.AUTH_ISSUER,
    audience: parsed.data.AUTH_AUDIENCE,
    ipLimit: parsed.data.AUTH_IP_LIMIT,
    secure: production,
    origin,
  };
}

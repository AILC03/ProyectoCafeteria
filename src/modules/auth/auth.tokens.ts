import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { idSchema } from '../../shared/http/pagination.js';
import { HttpProblem } from '../../shared/http/problem.js';
import type { AuthConfig } from './auth.types.js';

export const unauthorized = () =>
  new HttpProblem(401, 'UNAUTHENTICATED', 'Autenticación requerida');
export const forbidden = () => new HttpProblem(403, 'FORBIDDEN', 'Acceso no permitido');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const opaque = () => randomBytes(32).toString('base64url');
const claimsSchema = z.object({
  sub: idSchema,
  sid: idSchema,
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive(),
});
const csrfSchema = z
  .object({
    nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    at: z.number().int(),
    binding: z.string(),
  })
  .strict();
export function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export class AuthTokens {
  constructor(
    readonly config: AuthConfig,
    private now: () => Date,
  ) {
    if (
      !/^[a-f0-9]{64,}$/.test(config.jwtSecret) ||
      !/^[a-f0-9]{64,}$/.test(config.csrfSecret) ||
      config.jwtSecret === config.csrfSecret
    )
      throw new Error('Claves de autenticación inválidas o repetidas.');
  }
  key(value: string) {
    return createHmac('sha256', this.config.csrfSecret).update(value).digest('hex');
  }
  access(userId: bigint, sessionId: bigint, absolute: Date) {
    const iat = Math.floor(this.now().getTime() / 1000);
    return jwt.sign(
      {
        sub: userId.toString(),
        sid: sessionId.toString(),
        iat,
        exp: Math.min(iat + 900, Math.floor(absolute.getTime() / 1000)),
      },
      this.config.jwtSecret,
      { algorithm: 'HS256', issuer: this.config.issuer, audience: this.config.audience },
    );
  }
  verifyAccess(token: string) {
    try {
      const now = Math.floor(this.now().getTime() / 1000);
      const result = claimsSchema.parse(
        jwt.verify(token, this.config.jwtSecret, {
          algorithms: ['HS256'],
          issuer: this.config.issuer,
          audience: this.config.audience,
          clockTimestamp: now,
        }),
      );
      if (result.iat > now || result.exp <= result.iat || result.exp - result.iat > 900)
        throw unauthorized();
      return result;
    } catch {
      throw unauthorized();
    }
  }
  csrf(binding: string) {
    const payload = Buffer.from(
      JSON.stringify({ nonce: opaque(), at: Math.floor(this.now().getTime() / 1000), binding }),
    ).toString('base64url');
    return `${payload}.${this.key(`csrf:${payload}`)}`;
  }
  verifyCsrf(cookie: string, header: string, binding: string) {
    try {
      if (cookie.length > 1024 || !equal(cookie, header)) throw forbidden();
      const parts = cookie.split('.');
      if (
        parts.length !== 2 ||
        !parts[0] ||
        !parts[1] ||
        !equal(parts[1], this.key(`csrf:${parts[0]}`))
      )
        throw forbidden();
      const value = csrfSchema.parse(
        JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')),
      );
      const age = Math.floor(this.now().getTime() / 1000) - value.at;
      if (value.binding !== binding || age < 0 || age > 3600) throw forbidden();
    } catch {
      throw new HttpProblem(403, 'CSRF_INVALID', 'Protección CSRF inválida');
    }
  }
}

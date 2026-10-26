import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { authConfiguration } from '../src/config/auth.js';
import { AuthTokens } from '../src/modules/auth/auth.tokens.js';
import type { AuthConfig } from '../src/modules/auth/auth.types.js';
import pino from 'pino';

const config: AuthConfig = {
  jwtSecret: 'a'.repeat(64),
  csrfSecret: 'b'.repeat(64),
  issuer: 'tests-api',
  audience: 'tests-web',
  secure: false,
  origin: 'http://localhost:5173',
  ipLimit: 100,
};
describe('seguridad de autenticación', () => {
  it('no hay registro abierto ni rutas antiguas', async () => {
    const app = createApp();
    expect((await request(app).post('/api/auth/register').send({})).status).toBe(404);
    expect((await request(app).post('/api/v1/auth/register').send({})).status).toBe(404);
  });
  it('sin secretos no hay clave de respaldo', () => {
    expect(authConfiguration({}, config.origin, false)).toBeUndefined();
    expect(() => authConfiguration({ AUTH_JWT_SECRET: 'short' }, config.origin, false)).toThrow();
    expect(
      () => new AuthTokens({ ...config, csrfSecret: config.jwtSecret }, () => new Date()),
    ).toThrow();
  });
  it('no altera BigInt.prototype', () => {
    expect('toJSON' in BigInt.prototype).toBe(false);
  });
  it('logs HTTP no incluyen cuerpos, cookies ni autorización', async () => {
    const lines: string[] = [];
    const logger = pino(
      { base: null, timestamp: false },
      {
        write(message: string) {
          lines.push(message);
        },
      },
    );
    await request(createApp({ logger }))
      .post('/api/v1/auth/login/staff?private=DO_NOT_LOG_QUERY')
      .set('Authorization', 'Bearer DO_NOT_LOG_TOKEN')
      .set('Cookie', 'caf_access=DO_NOT_LOG_COOKIE')
      .send({ username: 'example', password: 'DO_NOT_LOG_PASSWORD' });
    const logs = lines.join('\n');
    expect(logs).toContain('http_request');
    for (const value of [
      'DO_NOT_LOG_QUERY',
      'DO_NOT_LOG_TOKEN',
      'DO_NOT_LOG_COOKIE',
      'DO_NOT_LOG_PASSWORD',
    ])
      expect(logs).not.toContain(value);
  });
  it('JWT tiene sub/sid, audiencia, emisor y máximo 15 min', () => {
    const now = new Date(),
      tokens = new AuthTokens(config, () => now);
    const access = tokens.access(2n, 3n, new Date(now.getTime() + 8 * 3600000));
    const claims = tokens.verifyAccess(access);
    expect(claims.sub).toBe('2');
    expect(claims.sid).toBe('3');
    expect(claims.exp - claims.iat).toBe(900);
    const decoded = jwt.decode(access) as jwt.JwtPayload;
    expect(decoded.role).toBeUndefined();
    expect(decoded.iss).toBe(config.issuer);
  });
  it('rechaza algoritmo, emisor, audiencia y firmas ajenas', () => {
    const now = new Date(),
      tokens = new AuthTokens(config, () => now);
    for (const token of [
      jwt.sign({ sub: '1', sid: '1' }, 'other', {
        issuer: config.issuer,
        audience: config.audience,
        expiresIn: 900,
      }),
      jwt.sign({ sub: '1', sid: '1' }, config.jwtSecret, {
        issuer: 'bad',
        audience: config.audience,
        expiresIn: 900,
      }),
      jwt.sign({ sub: '1', sid: '1' }, config.jwtSecret, {
        issuer: config.issuer,
        audience: 'bad',
        expiresIn: 900,
      }),
      jwt.sign({ sub: '1', sid: '1' }, config.jwtSecret, {
        algorithm: 'HS512',
        issuer: config.issuer,
        audience: config.audience,
        expiresIn: 900,
      }),
    ])
      expect(() => tokens.verifyAccess(token)).toThrow();
  });
  it('exp nunca sobrepasa el límite absoluto', () => {
    const now = new Date(),
      tokens = new AuthTokens(config, () => now),
      absolute = new Date(now.getTime() + 5000);
    expect(tokens.verifyAccess(tokens.access(1n, 1n, absolute)).exp).toBe(
      Math.floor(absolute.getTime() / 1000),
    );
  });
  it('CSRF firmado depende del contexto y vence', () => {
    let time = Date.now();
    const tokens = new AuthTokens(config, () => new Date(time));
    const csrf = tokens.csrf('family-hmac');
    expect(() => tokens.verifyCsrf(csrf, csrf, 'family-hmac')).not.toThrow();
    expect(() => tokens.verifyCsrf(csrf, csrf, 'other')).toThrow();
    expect(() => tokens.verifyCsrf(csrf, csrf + 'x', 'family-hmac')).toThrow();
    time += 3601000;
    expect(() => tokens.verifyCsrf(csrf, csrf, 'family-hmac')).toThrow();
  });
});

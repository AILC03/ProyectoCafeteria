import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { AuthRepository } from '../src/modules/auth/auth.repository.js';
import { CustomerRegistrationService } from '../src/modules/customer-registration/customer-registration.service.js';
import { CustomerRegistrationRepository } from '../src/modules/customer-registration/customer-registration.repository.js';
import { ticketRegistrationSchema } from '../src/modules/customer-registration/customer-registration.schemas.js';
import { visibleNumber } from '../src/shared/database/visible-number.js';

const input = { token: 'A'.repeat(43), name: ' Ana López ', phone: '6641234567', pin: '0007' };
describe('AUTH-02: entrada y frontera HTTP', () => {
  it('normaliza sin perder ceros del NIP ni precisión del número visible', () => {
    expect(ticketRegistrationSchema.parse(input)).toEqual({
      ...input,
      name: 'Ana López',
      phone: '+526641234567',
    });
    expect(visibleNumber('C', 123n)).toBe('C000123');
    expect(visibleNumber('C', 9007199254740993n)).toBe('C9007199254740993');
  });
  it.each(['123', '12345', 'abcd', 1234, null, ' 1234', '１２３４'])('rechaza NIP %j', (pin) => {
    expect(ticketRegistrationSchema.safeParse({ ...input, pin }).success).toBe(false);
  });
  it.each([
    { token: undefined },
    { token: 'bad' },
    { name: ' ' },
    { name: 'Ana\u0000' },
    { phone: '+16641234567' },
    { role: 'ADMINISTRADOR' },
    { customerNumber: 'C000001' },
  ])('rechaza entrada %j', (extra) => {
    expect(ticketRegistrationSchema.safeParse({ ...input, ...extra }).success).toBe(false);
  });
  function fixture(limit = 20) {
    const auth = new AuthService(new AuthRepository({} as never), {
      jwtSecret: 'a'.repeat(64),
      csrfSecret: 'b'.repeat(64),
      issuer: 'registration-tests',
      audience: 'web',
      secure: false,
      origin: 'http://localhost:5173',
      ipLimit: 100,
    });
    const service = new CustomerRegistrationService(
      new CustomerRegistrationRepository({} as never),
    );
    const register = vi.spyOn(service, 'register').mockResolvedValue({
      customer: { customerNumber: 'C000123', name: 'Ana López', phone: '+526641234567' },
    });
    return {
      app: createApp({
        authService: auth,
        registrationService: service,
        registrationRateLimit: limit,
      }),
      auth,
      register,
    };
  }
  it('exige CSRF/Origin y rechaza cookies de sesión, sin invocar alta', async () => {
    const { app, auth, register } = fixture();
    expect(
      (await request(app).post('/api/v1/customer-registration/ticket').send(input)).status,
    ).toBe(403);
    const csrf = auth.tokens.csrf('pre');
    expect(
      (
        await request(app)
          .post('/api/v1/customer-registration/ticket')
          .set('Origin', 'http://localhost:5173')
          .set('Cookie', `caf_csrf=${csrf}; caf_access=invalid`)
          .set('X-CSRF-Token', csrf)
          .send(input)
      ).status,
    ).toBe(403);
    expect(register).not.toHaveBeenCalled();
  });
  it('DTO mínimo sin Set-Cookie; límite de registro no afecta health/CSRF', async () => {
    const { app, auth } = fixture(1);
    const csrf = auth.tokens.csrf('pre');
    const post = () =>
      request(app)
        .post('/api/v1/customer-registration/ticket')
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', `caf_csrf=${csrf}`)
        .set('X-CSRF-Token', csrf)
        .send(input);
    const result = await post();
    expect(result.status).toBe(201);
    expect(result.headers['set-cookie']).toBeUndefined();
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.body).toEqual({
      data: { customer: { customerNumber: 'C000123', name: 'Ana López', phone: '+526641234567' } },
    });
    expect((await post()).body.code).toBe('REGISTRATION_RATE_LIMITED');
    expect((await request(app).get('/api/v1/health')).status).toBe(200);
    expect((await request(app).get('/api/v1/auth/csrf')).status).toBe(200);
  });
});

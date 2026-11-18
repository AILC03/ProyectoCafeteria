import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { AuthRepository } from '../src/modules/auth/auth.repository.js';
import { unauthorized } from '../src/modules/auth/auth.tokens.js';
import type { Principal, RoleName } from '../src/modules/auth/auth.types.js';
import { CustomersService } from '../src/modules/customers/customers.service.js';
import { CustomersRepository } from '../src/modules/customers/customers.repository.js';

const path = '/api/v1/customers/me';
function fixture(role: RoleName = 'CLIENTE', limit = 120) {
  const auth = new AuthService(new AuthRepository({} as never), {
    jwtSecret: 'a'.repeat(64),
    csrfSecret: 'b'.repeat(64),
    issuer: 'customers-tests',
    audience: 'web',
    secure: false,
    origin: 'http://localhost:5173',
    ipLimit: 100,
  });
  const actor: Principal = {
    userId: 1n,
    sessionId: 1n,
    familyId: 'fixture',
    role,
    accountType: role === 'CLIENTE' ? 'CUSTOMER' : 'STAFF',
    mustChangePin: false,
  };
  vi.spyOn(auth, 'authenticate').mockImplementation(async (token) => {
    if (token !== 'fixture-access') throw unauthorized();
    return actor;
  });
  const service = new CustomersService(new CustomersRepository({} as never));
  const profile = vi.spyOn(service, 'profile').mockResolvedValue({
    data: {
      customerNumber: 'C000001',
      name: 'Ana',
      phone: '+526641234567',
      recoveryEmail: null,
      recoveryEmailVerifiedAt: null,
      createdAt: new Date('2026-11-09T12:00:00Z'),
    },
  });
  const history = vi
    .spyOn(service, 'history')
    .mockResolvedValue({ data: [], page: { limit: 20, nextCursor: null } });
  const app = createApp({ authService: auth, customersService: service, catalogRateLimit: limit });
  const get = (route = path) => request(app).get(route).set('Cookie', 'caf_access=fixture-access');
  return { app, actor, profile, history, get };
}
describe('CUS-01: frontera HTTP de lecturas propias', () => {
  it('perfil e historial sin CSRF, sin Set-Cookie y con privacidad', async () => {
    const { get, profile, history, actor } = fixture();
    const result = await get();
    expect(result.status).toBe(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers['referrer-policy']).toBe('no-referrer');
    expect(result.headers['set-cookie']).toBeUndefined();
    expect(profile).toHaveBeenCalledWith(actor);
    expect((await get(`${path}/orders`)).body).toEqual({
      data: [],
      page: { limit: 20, nextCursor: null },
    });
    expect(history).toHaveBeenCalledWith(actor, { limit: 20 });
  });
  it('sin sesión, QR/ticket/folio no sustituyen cookie de acceso', async () => {
    const { app, profile, history } = fixture();
    for (const route of [path, `${path}/orders`]) {
      expect((await request(app).get(route)).status).toBe(401);
      expect((await request(app).get(route).set('X-Ticket-Token', 'A'.repeat(43))).status).toBe(
        401,
      );
    }
    expect(profile).not.toHaveBeenCalled();
    expect(history).not.toHaveBeenCalled();
  });
  it.each(['CAJERO', 'PREPARACION', 'ADMINISTRADOR'] as const)(
    'niega %s incluso administrador',
    async (role) => {
      const { get, profile, history } = fixture(role);
      expect((await get()).status).toBe(403);
      expect((await get(`${path}/orders`)).status).toBe(403);
      expect(profile).not.toHaveBeenCalled();
      expect(history).not.toHaveBeenCalled();
    },
  );
  it('rechaza filtros/body/campos adicionales antes del servicio', async () => {
    const { get, profile, history } = fixture();
    expect((await get(`${path}?customerId=2`)).status).toBe(400);
    expect((await get().send({})).status).toBe(400);
    expect((await get(`${path}/orders`).send({ customerId: '2' })).status).toBe(400);
    for (const query of [
      'limit=0',
      'limit=101',
      'limit=1.5',
      'limit=2&limit=3',
      'customerId=2',
      'status=LISTO',
    ])
      expect((await get(`${path}/orders?${query}`)).status).toBe(400);
    expect(profile).not.toHaveBeenCalled();
    expect(history).not.toHaveBeenCalled();
  });
  it('Origin indebido y límite mantienen no-store sin exponer perfil', async () => {
    const { get } = fixture('CLIENTE', 1);
    const rejected = await get().set('Origin', 'https://otro.example');
    expect(rejected.status).toBe(403);
    expect(rejected.headers['cache-control']).toBe('no-store');
    expect((await get()).status).toBe(200);
    const limited = await get(`${path}/orders`);
    expect(limited.status).toBe(429);
    expect(limited.headers['cache-control']).toBe('no-store');
    expect(limited.headers['referrer-policy']).toBe('no-referrer');
  });
});

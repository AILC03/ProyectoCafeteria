import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { AuthRepository } from '../src/modules/auth/auth.repository.js';
import { CashRepository } from '../src/modules/cash/cash.repository.js';
import { TicketsService } from '../src/modules/tickets/tickets.service.js';
import { notFound } from '../src/shared/http/problem.js';

function fixture(limit = 120) {
  const auth = new AuthService(new AuthRepository({} as never), {
    jwtSecret: 'a'.repeat(64),
    csrfSecret: 'b'.repeat(64),
    issuer: 'tickets-tests',
    audience: 'web',
    secure: false,
    origin: 'http://localhost:5173',
    ipLimit: 100,
  });
  const service = new TicketsService(new CashRepository({} as never));
  const get = vi.spyOn(service, 'getGuest').mockRejectedValue(notFound());
  const issue = vi.spyOn(service, 'issueGuest');
  return {
    app: createApp({ authService: auth, ticketsService: service, catalogRateLimit: limit }),
    get,
    issue,
  };
}
describe('TKT-02: frontera HTTP', () => {
  it('solo acepta el permiso por cabecera, sin query, body o credenciales alternativas', async () => {
    const { app, get } = fixture();
    for (const attempt of [
      request(app).get('/api/v1/guest-ticket'),
      request(app)
        .get('/api/v1/guest-ticket')
        .set('Authorization', `Bearer ${'A'.repeat(43)}`),
      request(app)
        .get('/api/v1/guest-ticket')
        .set('Cookie', `caf_access=${'A'.repeat(43)}`),
    ])
      expect((await attempt).status).toBe(404);
    expect((await request(app).get('/api/v1/guest-ticket?token=secret')).status).toBe(400);
    expect((await request(app).get('/api/v1/guest-ticket').send({})).status).toBe(400);
    expect(
      (await request(app).get('/api/v1/guest-ticket').set('X-Ticket-Token', 'bad')).status,
    ).toBe(400);
    expect(get).not.toHaveBeenCalled();
    const result = await request(app)
      .get('/api/v1/guest-ticket')
      .set('X-Ticket-Token', 'A'.repeat(43));
    expect(result.status).toBe(404);
    expect(get).toHaveBeenCalledWith('A'.repeat(43));
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers['referrer-policy']).toBe('no-referrer');
    expect(JSON.stringify(result.body)).not.toContain('A'.repeat(43));
    expect(result.headers['set-cookie']).toBeUndefined();
  });
  it('la emisión exige sesión y el límite público también cubre lectura', async () => {
    const { app, issue } = fixture();
    expect((await request(app).post('/api/v1/sales/1/ticket-access').send({})).status).toBe(401);
    expect(issue).not.toHaveBeenCalled();
    const limited = fixture(1);
    await request(limited.app).get('/api/v1/guest-ticket');
    const rejected = await request(limited.app).get('/api/v1/guest-ticket');
    expect(rejected.status).toBe(429);
    expect(rejected.headers['cache-control']).toBe('no-store');
  });
});

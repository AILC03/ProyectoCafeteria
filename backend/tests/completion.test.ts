import { randomBytes } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import Stripe from 'stripe';
import { createApp } from '../src/app.js';
import { PayloadCipher } from '../src/worker/payload-cipher.js';
import { WorkerService } from '../src/worker/worker.service.js';
import type { WorkerRepository, Work } from '../src/worker/worker.repository.js';
import { StripeSdkProvider } from '../src/modules/payments/stripe.provider.js';
import { StripeService } from '../src/modules/payments/stripe.service.js';
import type { StripeRepository } from '../src/modules/payments/stripe.repository.js';
import {
  ownProfile,
  employeeCreate,
  employeeUpdate,
} from '../src/modules/accounts/accounts.validation.js';
import { salesQuery } from '../src/modules/sales/sales.validation.js';

describe('FIN-01: validación y proveedores sin red', () => {
  it('cifra por referencia y versión, rechaza corrupción y no expone el token', () => {
    const cipher = new PayloadCipher(randomBytes(32).toString('hex'));
    const value = { token: randomBytes(32).toString('base64url') };
    const sealed = cipher.seal(value, 'customer:1:request');
    expect(sealed).not.toContain(value.token);
    expect(cipher.open(sealed, 'customer:1:request', 'v1')).toEqual(value);
    expect(() => cipher.open(sealed, 'customer:2:request', 'v1')).toThrow();
    expect(() => cipher.open(sealed, 'customer:1:request', 'v2')).toThrow();
    expect(() => cipher.open(`${sealed}x`, 'customer:1:request', 'v1')).toThrow();
  });
  it('rechaza perfil sin cambios, teléfono sin NIP, escalamiento y campos extra', () => {
    for (const body of [
      {},
      { phone: '+526641234567' },
      { role: 'ADMINISTRADOR' },
      { name: 'Ana', customerId: '2' },
    ])
      expect(ownProfile.safeParse(body).success).toBe(false);
    expect(ownProfile.parse({ phone: '6641234567', currentPin: '0007' }).phone).toBe(
      '+526641234567',
    );
    expect(
      employeeCreate.safeParse({
        name: 'A',
        username: 'aaa',
        password: '12345678',
        role: 'CLIENTE',
      }).success,
    ).toBe(false);
    expect(employeeUpdate.safeParse({ reason: 'x', password: 'newpassword' }).success).toBe(false);
    expect(
      salesQuery.safeParse({ from: '2026-11-11T00:00:00Z', to: '2026-11-10T00:00:00Z' }).success,
    ).toBe(false);
    expect(salesQuery.safeParse({ limit: '101' }).success).toBe(false);
  });
  it('verifica firma Stripe sobre bytes raw, nunca usa parser JSON primero', async () => {
    const secret = `whsec_${randomBytes(32).toString('hex')}`;
    const provider = new StripeSdkProvider(
      'sk_test_fixture_no_network',
      secret,
      'http://localhost:5173',
    );
    const raw = JSON.stringify({
      id: 'evt_fixture',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_fixture' } },
    });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload: raw, secret });
    const db = {
      transaction: vi.fn(async (fn) =>
        fn({ paymentEvent: { createMany: vi.fn() }, job: { upsert: vi.fn() } }),
      ),
      schedule: vi.fn(),
    } as unknown as StripeRepository;
    const app = createApp({ stripeService: new StripeService(db, provider) });
    const response = await request(app)
      .post('/api/v1/stripe/webhook')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', signature)
      .send(raw);
    expect(response.status).toBe(200);
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(
      (
        await request(app)
          .post('/api/v1/stripe/webhook')
          .set('Content-Type', 'application/json')
          .set('Stripe-Signature', signature)
          .send(`${raw} `)
      ).status,
    ).toBe(400);
  });
  it('fallo de persistencia del webhook no responde éxito; proveedor ausente falla cerrado', async () => {
    const provider = {
      event: () => ({
        id: 'evt_fixture',
        type: 'checkout.session.completed',
        checkoutSessionId: 'cs_fixture',
      }),
    };
    const repository = {
      transaction: async () => {
        throw new Error('database failed');
      },
    };
    const app = createApp({
      stripeService: new StripeService(
        repository as unknown as StripeRepository,
        provider as never,
      ),
    });
    expect(
      (
        await request(app)
          .post('/api/v1/stripe/webhook')
          .set('Content-Type', 'application/json')
          .set('Stripe-Signature', 'fixture')
          .send('{}')
      ).status,
    ).toBeGreaterThanOrEqual(500);
    const closed = createApp({
      stripeService: new StripeService(repository as unknown as StripeRepository),
    });
    expect(
      (
        await request(closed)
          .post('/api/v1/stripe/webhook')
          .set('Content-Type', 'application/json')
          .set('Stripe-Signature', 'fixture')
          .send('{}')
      ).status,
    ).toBe(503);
  });
  it('worker sanea errores y reintenta sin guardar mensajes del proveedor', async () => {
    const work: Work = { id: 1n, type: 'TEST', reference: '1', attempts: 1, leaseToken: 'fixture' };
    const repo = {
      maintenance: vi.fn(),
      claim: vi.fn().mockResolvedValueOnce(work).mockResolvedValueOnce(undefined),
      finish: vi.fn(),
    };
    const worker = new WorkerService(repo as unknown as WorkerRepository, {
      TEST: async () => {
        throw new Error('secret-token-must-not-persist');
      },
    });
    await worker.tick();
    expect(repo.finish).toHaveBeenCalledWith(work, false, false, expect.any(Date));
    expect(
      JSON.stringify(repo.finish.mock.calls, (_key, value) =>
        typeof value === 'bigint' ? String(value) : value,
      ),
    ).not.toContain('secret-token');
  });
});

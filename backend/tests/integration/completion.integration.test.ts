import { randomBytes, randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { verify } from 'argon2';
import SwaggerParser from '@apidevtools/swagger-parser';
import { Ajv } from 'ajv';
import addFormats from 'ajv-formats';
import { createApp } from '../../src/app.js';
import { createDatabase } from '../../src/config/database.js';
import { seedDemo } from '../../scripts/lib/demo-data.js';
import { AuthRepository } from '../../src/modules/auth/auth.repository.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { hashCredential } from '../../src/modules/auth/auth.credentials.js';
import { digest } from '../../src/modules/auth/auth.tokens.js';
import type { Principal, RoleName } from '../../src/modules/auth/auth.types.js';
import { AccountsRepository } from '../../src/modules/accounts/accounts.repository.js';
import { AccountsService } from '../../src/modules/accounts/accounts.service.js';
import { OrdersRepository } from '../../src/modules/orders/orders.repository.js';
import { OrdersService } from '../../src/modules/orders/orders.service.js';
import { SalesRepository, SalesService } from '../../src/modules/sales/sales.service.js';
import { StripeRepository } from '../../src/modules/payments/stripe.repository.js';
import { StripeService } from '../../src/modules/payments/stripe.service.js';
import type { CheckoutState, StripeProvider } from '../../src/modules/payments/stripe.provider.js';
import { TicketCipher } from '../../src/modules/tickets/tickets.cipher.js';
import { TicketsService } from '../../src/modules/tickets/tickets.service.js';
import { CashRepository } from '../../src/modules/cash/cash.repository.js';
import { WorkerRepository } from '../../src/worker/worker.repository.js';
import { WorkerService } from '../../src/worker/worker.service.js';
import { PayloadCipher } from '../../src/worker/payload-cipher.js';

const target = process.env.CATALOG_TEST_DATABASE_URL,
  origin = 'http://localhost:5173';
type Identity = { principal: Principal; cookie: string; csrf: string };
class FakeStripe implements StripeProvider {
  sessions = new Map<string, CheckoutState>();
  keys = new Map<string, string>();
  refunds = new Map<string, { id: string; status: 'SUCCEEDED' }>();
  createCalls = 0;
  failAfterCreate = false;
  unavailable = false;
  async create(input: { orderId: string; amountCents: bigint; key: string; expiresAt: Date }) {
    this.createCalls++;
    let id = this.keys.get(input.key);
    if (!id) {
      id = `cs_${randomBytes(10).toString('hex')}`;
      this.keys.set(input.key, id);
      this.sessions.set(id, {
        id,
        orderId: input.orderId,
        amountCents: input.amountCents,
        currency: 'MXN',
        status: 'open',
        paid: false,
        paidAt: null,
        paymentIntentId: null,
        expiresAt: input.expiresAt,
        url: `https://checkout.stripe.test/${id}`,
      });
    }
    if (this.failAfterCreate) {
      this.failAfterCreate = false;
      throw new Error('timeout-after-side-effect');
    }
    return { ...this.sessions.get(id)! };
  }
  async retrieve(id: string) {
    if (this.unavailable) throw new Error('timeout');
    return { ...this.sessions.get(id)! };
  }
  async expire(id: string) {
    if (this.unavailable) throw new Error('timeout');
    const s = this.sessions.get(id)!;
    if (!s.paid) s.status = 'expired';
    return { ...s };
  }
  event(raw: Buffer, signature: string) {
    if (signature !== 'fixture-signature') throw new Error('signature');
    return JSON.parse(raw.toString()) as ReturnType<StripeProvider['event']>;
  }
  async refund(input: { key: string }) {
    const r = this.refunds.get(input.key) ?? {
      id: `re_${randomBytes(10).toString('hex')}`,
      status: 'SUCCEEDED' as const,
    };
    this.refunds.set(input.key, r);
    return r;
  }
  paid(id: string, now: Date) {
    const s = this.sessions.get(id)!;
    s.paid = true;
    s.status = 'complete';
    s.paidAt = now;
    s.paymentIntentId = `pi_${id.slice(3)}`;
  }
}
describe.skipIf(!target)('FIN-01: cierre con HTTP y PostgreSQL aislado', () => {
  let db: ReturnType<typeof createDatabase>,
    auth: AuthService,
    accounts: AccountsService,
    orders: OrdersService,
    stripe: StripeService,
    tickets: TicketsService,
    app: ReturnType<typeof createApp>;
  const fake = new FakeStripe(),
    cipher = new PayloadCipher(randomBytes(32).toString('hex'));
  let time = Date.now();
  const now = () => new Date(time);
  let admin: Identity,
    cashier: Identity,
    prep: Identity,
    alice: Identity,
    bob: Identity,
    water: string;
  let api: Awaited<ReturnType<typeof SwaggerParser.dereference>>;
  const ajv = new Ajv({ strict: false });
  addFormats.default(ajv);
  function conform(path: string, method: 'get' | 'post' | 'patch', status: string, body: unknown) {
    const result = api.paths![path]![method]!.responses![status];
    if (!result || !('content' in result)) throw new Error('Missing response schema');
    const validate = ajv.compile(result.content!['application/json']!.schema!);
    expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
  }
  async function session(userId: bigint, role: RoleName): Promise<Identity> {
    const familyId = randomUUID(),
      refresh = randomBytes(32).toString('base64url'),
      expires = new Date(time + 8 * 3600000);
    const stored = await db.authSession.create({
      data: { userId, familyId, refreshTokenHash: digest(refresh), absoluteExpiresAt: expires },
    });
    const csrf = auth.tokens.csrf(auth.tokens.key(`family:${familyId}`));
    return {
      principal: {
        userId,
        sessionId: stored.id,
        familyId,
        role,
        accountType: role === 'CLIENTE' ? 'CUSTOMER' : 'STAFF',
        mustChangePin: false,
      },
      csrf,
      cookie: `caf_access=${auth.tokens.access(userId, stored.id, expires)}; caf_refresh=${refresh}; caf_csrf=${csrf}`,
    };
  }
  async function identity(name: string, role: RoleName, phone?: string) {
    const r = await db.role.findUniqueOrThrow({ where: { name: role } });
    const user = await db.user.create({
      data: {
        name,
        roleId: r.id,
        accountType: role === 'CLIENTE' ? 'CUSTOMER' : 'STAFF',
        ...(role === 'CLIENTE'
          ? { phone, customerNumber: `C${phone!.slice(-6)}`, pinHash: await hashCredential('0007') }
          : { username: name, passwordHash: await hashCredential('fixture-password') }),
      },
    });
    return session(user.id, role);
  }
  const guest = () => {
    const csrf = auth.tokens.csrf('pre');
    return { csrf, cookie: `caf_csrf=${csrf}` };
  };
  function mutate(
    path: string,
    body: object,
    actor: Pick<Identity, 'csrf' | 'cookie'> = admin,
    method: 'post' | 'patch' = 'post',
  ) {
    const agent = request(app);
    return agent[method](path)
      .set('Origin', origin)
      .set('Cookie', actor.cookie)
      .set('X-CSRF-Token', actor.csrf)
      .set('Idempotency-Key', randomUUID())
      .send(body);
  }
  async function newOrder(
    customer: Identity | undefined = alice,
    method: 'CASH' | 'STRIPE' = 'STRIPE',
  ) {
    return (await orders.create(
      'MOBILE',
      customer?.principal,
      { paymentMethod: method, items: [{ productId: water, quantity: 1, optionValueIds: [] }] },
      randomUUID(),
    )) as unknown as { data: { id: string } };
  }
  async function checkout(customer = alice) {
    const o = await newOrder(customer);
    const result = await stripe.checkout(
      customer.principal,
      undefined,
      BigInt(o.data.id),
      randomUUID(),
    );
    return { orderId: BigInt(o.data.id), ...result.data };
  }
  async function mailToken(userId: bigint) {
    const message = await db.outboxMessage.findFirstOrThrow({
      where: {
        reference: { startsWith: `customer:${userId}:` },
        status: 'PENDING',
        encryptedPayload: { not: null },
      },
      orderBy: { id: 'desc' },
    });
    const value = cipher.open(
      message.encryptedPayload!,
      message.reference,
      message.keyVersion!,
    ) as { text: string };
    return { message, token: value.text.split('#token=')[1]! };
  }
  beforeAll(async () => {
    api = await SwaggerParser.dereference('docs/api/openapi.yaml');
    db = createDatabase(target!);
    await seedDemo(db);
    auth = new AuthService(
      new AuthRepository(db),
      {
        jwtSecret: randomBytes(32).toString('hex'),
        csrfSecret: randomBytes(32).toString('hex'),
        issuer: 'cafeteria-test',
        audience: 'cafeteria-test',
        origin,
        secure: false,
        ipLimit: 1000,
      },
      now,
    );
    accounts = new AccountsService(
      new AccountsRepository(db),
      auth,
      { cipher, frontendOrigin: origin },
      now,
    );
    const key = randomBytes(32).toString('hex'),
      ticketCipher = new TicketCipher(key);
    orders = new OrdersService(
      new OrdersRepository(db),
      now,
      undefined,
      new TicketCipher(key, 'v1', 'stripe-checkout'),
    );
    stripe = new StripeService(new StripeRepository(db), fake, ticketCipher, now);
    tickets = new TicketsService(new CashRepository(db), ticketCipher, now);
    app = createApp({
      authService: auth,
      ordersService: orders,
      accountsService: accounts,
      salesService: new SalesService(new SalesRepository(db)),
      stripeService: stripe,
      ticketsService: tickets,
      catalogRateLimit: 10000,
    });
    admin = await identity('admin-fin', 'ADMINISTRADOR');
    cashier = await identity('cashier-fin', 'CAJERO');
    prep = await identity('prep-fin', 'PREPARACION');
    alice = await identity('Alice', 'CLIENTE', '+526641110001');
    bob = await identity('Bob', 'CLIENTE', '+526641110002');
    water = (await db.product.findFirstOrThrow({ where: { name: 'Agua (demo)' } })).id.toString();
  });
  afterAll(async () => {
    await db?.$disconnect();
  });
  it('limita ventas/cuentas por rol y CSRF, no acepta body en lecturas', async () => {
    for (const path of ['/api/v1/sales', '/api/v1/sales/summary', '/api/v1/admin/employees']) {
      expect((await request(app).get(path)).status).toBe(401);
      expect((await request(app).get(path).set('Cookie', alice.cookie)).status).toBe(403);
    }
    expect(
      (
        await mutate(
          '/api/v1/admin/employees',
          { name: 'No', username: 'nope', password: '12345678', role: 'CAJERO' },
          cashier,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .patch('/api/v1/customers/me')
          .set('Cookie', alice.cookie)
          .set('Origin', origin)
          .send({ name: 'A' })
      ).status,
    ).toBe(403);
    expect(
      (await request(app).get('/api/v1/sales').set('Cookie', admin.cookie).send({})).status,
    ).toBe(400);
  });
  it('crea personal sin secretos; baja lógica revoca sesión y audita', async () => {
    const created = await mutate('/api/v1/admin/employees', {
      name: 'Staff nuevo',
      username: 'staff_fin',
      password: 'new-fixture-password',
      role: 'CAJERO',
    });
    expect(created.status).toBe(201);
    expect(Object.keys(created.body.data).sort()).toEqual([
      'id',
      'isActive',
      'name',
      'role',
      'username',
    ]);
    conform('/api/v1/admin/employees', 'post', '201', created.body);
    const id = BigInt(created.body.data.id),
      login = await session(id, 'CAJERO');
    const disabled = await mutate(
      `/api/v1/admin/employees/${id}`,
      { isActive: false, reason: 'Baja de prueba' },
      admin,
      'patch',
    );
    expect(disabled.status).toBe(200);
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', login.cookie)).status).toBe(
      401,
    );
    expect(await db.auditEvent.count({ where: { action: 'EMPLOYEE_UPDATED' } })).toBe(1);
    expect(
      (
        await mutate(
          `/api/v1/admin/employees/${admin.principal.userId}`,
          { isActive: false, reason: 'No' },
          admin,
          'patch',
        )
      ).status,
    ).toBe(409);
  });
  it('protege responsable de caja abierta y username único', async () => {
    const cash = await db.cashSession.create({
      data: { employeeId: cashier.principal.userId, openingAmountCents: 0n },
    });
    expect(
      (
        await mutate(
          `/api/v1/admin/employees/${cashier.principal.userId}`,
          { isActive: false, reason: 'No' },
          admin,
          'patch',
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await mutate('/api/v1/admin/employees', {
          name: 'Duplicado',
          username: 'staff_fin',
          password: 'new-fixture-password',
          role: 'CAJERO',
        })
      ).status,
    ).toBe(409);
    await db.cashSession.update({
      where: { id: cash.id },
      data: {
        closedAt: now(),
        closedByEmployeeId: cashier.principal.userId,
        expectedCashCents: 0n,
        countedCashCents: 0n,
        differenceCents: 0n,
      },
    });
  });
  it('edita perfil sin escalamiento; teléfono exige NIP, unicidad y revoca sesión', async () => {
    expect(
      (
        await mutate(
          '/api/v1/customers/me',
          { name: 'Alice nueva', role: 'ADMINISTRADOR' },
          alice,
          'patch',
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await mutate(
          '/api/v1/customers/me',
          { phone: '+526641110003', currentPin: '9999' },
          alice,
          'patch',
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await mutate(
          '/api/v1/customers/me',
          { phone: '+526641110002', currentPin: '0007' },
          alice,
          'patch',
        )
      ).status,
    ).toBe(409);
    const result = await mutate(
      '/api/v1/customers/me',
      { name: 'Alice nueva', phone: '+526641110003', currentPin: '0007' },
      alice,
      'patch',
    );
    expect(result.status).toBe(200);
    expect(result.body.data.phone).toBe('+526641110003');
    conform('/api/v1/customers/me', 'patch', '200', result.body);
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', alice.cookie)).status).toBe(
      401,
    );
    alice = await session(alice.principal.userId, 'CLIENTE');
  });
  it('conserva correo anterior; verifica una vez y no entrega token por HTTP', async () => {
    await db.user.update({
      where: { id: alice.principal.userId },
      data: { recoveryEmail: 'old@example.test', recoveryEmailVerifiedAt: now() },
    });
    const result = await mutate(
      '/api/v1/customers/me/recovery-email',
      { email: 'new@example.test' },
      alice,
    );
    expect(result.status).toBe(202);
    expect(result.body).toEqual({ data: { accepted: true } });
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: alice.principal.userId } })).recoveryEmail,
    ).toBe('old@example.test');
    const { token, message } = await mailToken(alice.principal.userId);
    expect(message.encryptedPayload).not.toContain(token);
    const results = await Promise.all(
      [accounts.confirm('email', token), accounts.confirm('email', token)].map((p) =>
        p.then(
          () => 'ok',
          () => 'rejected',
        ),
      ),
    );
    expect(results.sort()).toEqual(['ok', 'rejected']);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: alice.principal.userId } })).recoveryEmail,
    ).toBe('new@example.test');
  });
  it('recuperación genérica, solo correo verificado, NIP Argon2id, token único y revocación', async () => {
    const noAccount = await mutate(
      '/api/v1/auth/pin-recovery',
      { identifier: '+526649999999' },
      guest(),
    );
    const noEmail = await mutate(
      '/api/v1/auth/pin-recovery',
      { identifier: '+526641110002' },
      guest(),
    );
    const valid = await mutate(
      '/api/v1/auth/pin-recovery',
      { identifier: '+526641110003' },
      guest(),
    );
    expect([noAccount.status, noEmail.status, valid.status]).toEqual([202, 202, 202]);
    expect(noAccount.body).toEqual(valid.body);
    expect(noEmail.body).toEqual(valid.body);
    const { token } = await mailToken(alice.principal.userId);
    const result = await mutate(
      '/api/v1/auth/pin-recovery/confirm',
      { token, newPin: '0012' },
      guest(),
    );
    expect(result.status).toBe(204);
    expect(
      (await mutate('/api/v1/auth/pin-recovery/confirm', { token, newPin: '0013' }, guest()))
        .status,
    ).toBe(404);
    const user = await db.user.findUniqueOrThrow({ where: { id: alice.principal.userId } });
    expect(await verify(user.pinHash!, '0012')).toBe(true);
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', alice.cookie)).status).toBe(
      401,
    );
    alice = await session(user.id, 'CLIENTE');
  });
  it('rechaza token de correo expirado sin cambiar datos', async () => {
    await accounts.requestEmail(bob.principal, 'bob@example.test');
    const { token } = await mailToken(bob.principal.userId);
    await db.emailVerificationToken.update({
      where: { tokenHash: digest(token) },
      data: { expiresAt: new Date(time - 1) },
    });
    await expect(accounts.confirm('email', token)).rejects.toMatchObject({ status: 404 });
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: bob.principal.userId } })).recoveryEmail,
    ).toBeNull();
  });
  it('persiste Checkout y reintentos concurrentes no crean segundo intento', async () => {
    const o = await newOrder(),
      id = BigInt(o.data.id),
      key = randomUUID();
    const results = await Promise.all([
      stripe.checkout(alice.principal, undefined, id, key),
      stripe.checkout(alice.principal, undefined, id, key),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(await db.payment.count({ where: { orderId: id } })).toBe(1);
    expect(fake.keys.size).toBe(1);
    await expect(stripe.checkout(bob.principal, undefined, id, randomUUID())).rejects.toMatchObject(
      { status: 404 },
    );
    fake.paid(results[0]!.data.checkoutSessionId, now());
    await stripe.synchronize(id);
    expect(await stripe.checkout(alice.principal, undefined, id, key)).toEqual(results[0]);
  });
  it('timeout tras crear conserva clave/intento y permite reconciliar sin duplicar', async () => {
    const o = await newOrder(),
      id = BigInt(o.data.id),
      key = randomUUID();
    fake.failAfterCreate = true;
    await expect(stripe.checkout(alice.principal, undefined, id, key)).rejects.toThrow('timeout');
    const before = await db.payment.findFirstOrThrow({ where: { orderId: id } });
    const result = await stripe.checkout(alice.principal, undefined, id, key);
    expect(result.data.paymentId).toBe(before.id);
    expect(await db.payment.count({ where: { orderId: id } })).toBe(1);
    expect(
      (await db.payment.findUniqueOrThrow({ where: { id: before.id } })).stripeCreationKey,
    ).toBe(before.stripeCreationKey);
  });
  it('webhook durable y duplicado confirma una sola venta; LISTO verifica pago', async () => {
    const c = await checkout();
    fake.paid(c.checkoutSessionId, now());
    const event = {
      id: `evt_${randomBytes(8).toString('hex')}`,
      type: 'checkout.session.completed',
      checkoutSessionId: c.checkoutSessionId,
    };
    for (let n = 0; n < 2; n++)
      expect(
        (
          await request(app)
            .post('/api/v1/stripe/webhook')
            .set('Content-Type', 'application/json')
            .set('Stripe-Signature', 'fixture-signature')
            .send(JSON.stringify(event))
        ).status,
      ).toBe(200);
    await Promise.all([stripe.processEvent(event.id), stripe.processEvent(event.id)]);
    expect(await db.paymentEvent.count({ where: { providerEventId: event.id } })).toBe(1);
    expect(await db.sale.count({ where: { orderId: c.orderId } })).toBe(1);
    expect((await db.order.findUniqueOrThrow({ where: { id: c.orderId } })).status).toBe(
      'EN_PREPARACION',
    );
    const receipt = await request(app)
      .get(`/api/v1/customers/me/orders/${c.orderId}/ticket`)
      .set('Cookie', alice.cookie);
    expect(receipt.status).toBe(200);
    expect(receipt.body.data.registration).toBeNull();
    expect(receipt.body.data.cashReceivedCents).toBeNull();
    conform('/api/v1/customers/me/orders/{id}/ticket', 'get', '200', receipt.body);
    expect(
      (
        await request(app)
          .get(`/api/v1/customers/me/orders/${c.orderId}/ticket`)
          .set('Cookie', bob.cookie)
      ).status,
    ).toBe(404);
    await orders.ready(prep.principal, c.orderId);
    expect((await db.order.findUniqueOrThrow({ where: { id: c.orderId } })).status).toBe('LISTO');
  });
  it('importe o moneda alterados no producen venta ni pago exitoso', async () => {
    const c = await checkout();
    fake.paid(c.checkoutSessionId, now());
    fake.sessions.get(c.checkoutSessionId)!.currency = 'USD';
    await expect(stripe.synchronize(c.orderId)).rejects.toThrow('STRIPE_MISMATCH');
    expect(await db.sale.count({ where: { orderId: c.orderId } })).toBe(0);
    expect((await db.payment.findUniqueOrThrow({ where: { id: c.paymentId } })).status).toBe(
      'PENDING',
    );
    fake.sessions.get(c.checkoutSessionId)!.currency = 'MXN';
  });
  it('Stripe incierto no expira; pago oportuno avisado tarde se reconoce', async () => {
    const c = await checkout();
    fake.paid(c.checkoutSessionId, now());
    await db.order.update({
      where: { id: c.orderId },
      data: { paymentExpiresAt: new Date(time - 1) },
    });
    fake.unavailable = true;
    await expect(stripe.synchronize(c.orderId)).rejects.toThrow('timeout');
    fake.unavailable = false;
    expect((await db.order.findUniqueOrThrow({ where: { id: c.orderId } })).status).toBe(
      'PENDIENTE_PAGO',
    );
    await stripe.synchronize(c.orderId);
    expect((await db.order.findUniqueOrThrow({ where: { id: c.orderId } })).status).toBe(
      'EN_PREPARACION',
    );
  });
  it('expira Checkout abierto antes de expirar orden; pago excepcional genera refund sin venta', async () => {
    const c = await checkout();
    await db.order.update({
      where: { id: c.orderId },
      data: { paymentExpiresAt: new Date(time - 1) },
    });
    await stripe.synchronize(c.orderId);
    expect((await db.order.findUniqueOrThrow({ where: { id: c.orderId } })).status).toBe(
      'EXPIRADA',
    );
    fake.paid(c.checkoutSessionId, now());
    await stripe.synchronize(c.orderId);
    await stripe.synchronize(c.orderId);
    expect(await db.sale.count({ where: { orderId: c.orderId } })).toBe(0);
    expect(await db.paymentIncident.count({ where: { orderId: c.orderId } })).toBe(1);
    const refund = await db.refund.findFirstOrThrow({ where: { paymentId: c.paymentId } });
    await Promise.all([stripe.refund(refund.id), stripe.refund(refund.id)]);
    expect(fake.refunds.size).toBe(1);
    expect((await db.refund.findUniqueOrThrow({ where: { id: refund.id } })).status).toBe(
      'SUCCEEDED',
    );
  });
  it('invitado obtiene permiso checkout separado, replay cifrado y comprobante sin estado', async () => {
    const body = {
      paymentMethod: 'STRIPE',
      includeCheckoutToken: true,
      items: [{ productId: water, quantity: 1 }],
    };
    const g = guest(),
      key = randomUUID();
    const create = () => mutate('/api/v1/orders', body, g).set('Idempotency-Key', key);
    const first = await create(),
      replay = await create();
    expect(first.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    const id = BigInt(first.body.data.id),
      token = first.body.checkout.token;
    const saved = await db.order.findUniqueOrThrow({ where: { id } });
    expect(saved.checkoutTokenHash).toBe(digest(token));
    expect(saved.checkoutEncryptedPayload).not.toContain(token);
    const result = await mutate(`/api/v1/orders/${id}/checkout`, {}, g).set(
      'X-Checkout-Token',
      token,
    );
    expect(result.status).toBe(200);
    conform('/api/v1/orders/{id}/checkout', 'post', '200', result.body);
    expect(
      (await request(app).get(`/api/v1/orders/${id}`).set('X-Checkout-Token', token)).status,
    ).toBe(401);
    fake.paid(result.body.data.checkoutSessionId, now());
    await stripe.synchronize(id);
    const sale = await db.sale.findUniqueOrThrow({ where: { orderId: id } });
    const ticket = await tickets.get(cashier.principal, sale.id);
    expect(ticket.data.registration?.purpose).toBe('CUSTOMER_REGISTRATION');
    const permit = await tickets.issueGuest(cashier.principal, sale.id);
    const receipt = await tickets.getGuest(permit.data.token);
    expect(receipt.data.totalCents).toBe(sale.totalCents);
    expect(receipt.data).not.toHaveProperty('status');
    expect(receipt.data).not.toHaveProperty('registration');
  });
  it('ventas: filtros, resumen completo y cursor estable con microsegundos', async () => {
    const get = (path: string) => request(app).get(path).set('Cookie', cashier.cookie);
    const summary = await get('/api/v1/sales/summary?method=STRIPE');
    expect(summary.status).toBe(200);
    conform('/api/v1/sales/summary', 'get', '200', summary.body);
    const total = await db.sale.aggregate({
      _sum: { totalCents: true },
      _count: true,
      where: { payment: { method: 'STRIPE' } },
    });
    expect(summary.body.data.totalCents).toBe(total._sum.totalCents!.toString());
    expect(summary.body.data.count).toBe(total._count.toString());
    const first = await get('/api/v1/sales?method=STRIPE&limit=1');
    expect(first.status).toBe(200);
    expect(first.body.page.nextCursor).toBeTruthy();
    conform('/api/v1/sales', 'get', '200', first.body);
    const next = await get(
      `/api/v1/sales?method=STRIPE&limit=1&cursor=${first.body.page.nextCursor}`,
    );
    expect(next.body.data[0].id).not.toBe(first.body.data[0].id);
    expect(
      (await get(`/api/v1/sales?method=CASH&cursor=${first.body.page.nextCursor}`)).status,
    ).toBe(400);
    expect((await get('/api/v1/sales?customerId=1')).status).toBe(400);
  });
  it('reset presencial exige última compra asociada, audita sin NIP y fuerza cambio', async () => {
    const sale = await db.sale.findFirstOrThrow({
      where: { order: { customerId: alice.principal.userId } },
      orderBy: [{ soldAt: 'desc' }, { id: 'desc' }],
    });
    const body = {
      temporaryPin: '0073',
      reason: 'Identidad presencial',
      verificationSummary: 'Número, teléfono y última compra contrastados',
      recentSaleId: sale.id.toString(),
    };
    expect(
      (
        await mutate(`/api/v1/admin/customers/${alice.principal.userId}/pin-reset`, {
          ...body,
          recentSaleId: '999999',
        })
      ).status,
    ).toBe(409);
    expect(
      (await mutate(`/api/v1/admin/customers/${alice.principal.userId}/pin-reset`, body)).status,
    ).toBe(204);
    const user = await db.user.findUniqueOrThrow({ where: { id: alice.principal.userId } });
    expect(user.mustChangePin).toBe(true);
    expect(await verify(user.pinHash!, '0073')).toBe(true);
    const audit = await db.pinResetAudit.findFirstOrThrow({ where: { customerId: user.id } });
    expect(
      JSON.stringify(audit, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
    ).not.toContain('0073');
    alice = await session(user.id, 'CLIENTE');
    expect((await request(app).get('/api/v1/sales').set('Cookie', alice.cookie)).status).toBe(403);
  });
  it('worker: SKIP LOCKED, recuperación de lease y fencing de finalización', async () => {
    await db.job.updateMany({ data: { status: 'SUCCEEDED' } });
    const job = await db.job.create({
      data: {
        type: 'FIXTURE',
        reference: 'owned',
        dedupeKey: `fixture:${randomUUID()}`,
        availableAt: now(),
      },
    });
    const repo = new WorkerRepository(db);
    const claims = await Promise.all([repo.claim(false, now(), 10), repo.claim(false, now(), 10)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const first = claims.find(Boolean)!;
    expect(first.id).toBe(job.id);
    const second = await repo.claim(false, new Date(time + 11), 10);
    expect(second?.id).toBe(job.id);
    expect(second?.leaseToken).not.toBe(first.leaseToken);
    await repo.finish(first, false, true, now());
    expect((await db.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('PROCESSING');
    await repo.finish(second!, false, true, now());
    expect((await db.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('SUCCEEDED');
  });
  it('corrección administrativa revoca sesiones sin cambiar compras ni permitir cajero', async () => {
    const before = await db.order.findMany({
      where: { customerId: bob.principal.userId },
      select: { id: true, totalCents: true },
    });
    const path = `/api/v1/admin/customers/${bob.principal.userId}`;
    expect(
      (
        await mutate(
          path,
          { name: 'Bob corregido', reason: 'Corrección presencial' },
          cashier,
          'patch',
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await mutate(
          path,
          { name: 'Bob corregido', phone: '+526641110004', reason: 'Corrección presencial' },
          admin,
          'patch',
        )
      ).status,
    ).toBe(200);
    expect(
      await db.order.findMany({
        where: { customerId: bob.principal.userId },
        select: { id: true, totalCents: true },
      }),
    ).toEqual(before);
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', bob.cookie)).status).toBe(401);
    expect(
      await db.auditEvent.count({
        where: { customerId: bob.principal.userId, action: 'CUSTOMER_CORRECTED' },
      }),
    ).toBe(1);
    bob = await session(bob.principal.userId, 'CLIENTE');
  });
  it('limitación persistente de recuperación y enlaces anteriores invalidados', async () => {
    await accounts.requestEmail(bob.principal, 'bob-one@example.test');
    const old = await mailToken(bob.principal.userId);
    await accounts.requestEmail(bob.principal, 'bob-two@example.test');
    await expect(accounts.confirm('email', old.token)).rejects.toMatchObject({ status: 404 });
    expect(
      (await db.outboxMessage.findUniqueOrThrow({ where: { id: old.message.id } }))
        .encryptedPayload,
    ).toBeNull();
    for (let n = 0; n < 5; n++) await accounts.requestRecovery('C999999991', 'fixture-rate-ip');
    await expect(accounts.requestRecovery('C999999991', 'fixture-rate-ip')).rejects.toMatchObject({
      status: 429,
    });
  });
  it('worker marca lease agotado para revisión y elimina secretos expirados', async () => {
    const job = await db.job.create({
      data: {
        type: 'FIXTURE',
        reference: 'exhausted',
        status: 'PROCESSING',
        attempts: 8,
        lockedUntil: new Date(time - 1),
        leaseToken: randomUUID(),
      },
    });
    const reference = 'customer:fixture:expired';
    const mail = await db.outboxMessage.create({
      data: {
        type: 'EMAIL',
        reference,
        encryptedPayload: cipher.seal({ token: 'fixture' }, reference),
        keyVersion: cipher.version,
        expiresAt: new Date(time - 1),
      },
    });
    await new WorkerRepository(db).maintenance(now());
    expect((await db.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('FAILED');
    const cleaned = await db.outboxMessage.findUniqueOrThrow({ where: { id: mail.id } });
    expect(cleaned.encryptedPayload).toBeNull();
    expect(cleaned.status).toBe('FAILED');
  });
  it('worker: correo fallido reintenta, borra payload tras éxito y expira CASH sin venta', async () => {
    await db.outboxMessage.updateMany({
      data: { status: 'FAILED', encryptedPayload: null, keyVersion: null },
    });
    const reference = `customer:${bob.principal.userId}:fixture`,
      payload = {
        to: 'bob@example.test',
        subject: 'Prueba',
        text: 'enlace de pruebas no registrado',
      };
    const mail = await db.outboxMessage.create({
      data: {
        type: 'EMAIL',
        reference,
        encryptedPayload: cipher.seal(payload, reference),
        keyVersion: cipher.version,
        expiresAt: new Date(time + 60000),
        availableAt: now(),
      },
    });
    const cash = await newOrder(bob, 'CASH');
    await db.order.update({
      where: { id: BigInt(cash.data.id) },
      data: { paymentExpiresAt: new Date(time - 1) },
    });
    let attempts = 0;
    const worker = new WorkerService(
      new WorkerRepository(db),
      stripe.handlers(),
      {
        cipher,
        transport: {
          async send() {
            attempts++;
            if (attempts === 1) throw new Error('sensitive-provider-message');
          },
        },
      },
      now,
    );
    await worker.tick();
    const failed = await db.outboxMessage.findUniqueOrThrow({ where: { id: mail.id } });
    expect(failed.status).toBe('PENDING');
    expect(failed.encryptedPayload).toBeTruthy();
    expect((await db.order.findUniqueOrThrow({ where: { id: BigInt(cash.data.id) } })).status).toBe(
      'EXPIRADA',
    );
    time += 3000;
    await worker.tick();
    const sent = await db.outboxMessage.findUniqueOrThrow({ where: { id: mail.id } });
    expect(sent.status).toBe('SUCCEEDED');
    expect(sent.encryptedPayload).toBeNull();
    expect(attempts).toBe(2);
  });
});

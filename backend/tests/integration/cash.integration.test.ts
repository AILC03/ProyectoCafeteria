import { randomBytes, randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import pino from 'pino';
import SwaggerParser from '@apidevtools/swagger-parser';
import { Ajv } from 'ajv';
import addFormats from 'ajv-formats';
import { createApp } from '../../src/app.js';
import { createDatabase } from '../../src/config/database.js';
import { seedDemo } from '../../scripts/lib/demo-data.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { AuthRepository } from '../../src/modules/auth/auth.repository.js';
import { digest } from '../../src/modules/auth/auth.tokens.js';
import type { Principal, RoleName } from '../../src/modules/auth/auth.types.js';
import {
  OrdersRepository,
  purgeCashQrSecrets,
} from '../../src/modules/orders/orders.repository.js';
import { OrdersService } from '../../src/modules/orders/orders.service.js';
import { CashRepository, CashTransaction } from '../../src/modules/cash/cash.repository.js';
import { CashService } from '../../src/modules/cash/cash.service.js';
import { PaymentsService } from '../../src/modules/payments/payments.service.js';
import { TicketsService } from '../../src/modules/tickets/tickets.service.js';
import { TicketCipher } from '../../src/modules/tickets/tickets.cipher.js';
import { purgeTicketSecrets } from '../../src/modules/tickets/tickets.repository.js';
import { TicketsTransaction } from '../../src/modules/tickets/tickets.repository.js';
import { CustomerRegistrationService } from '../../src/modules/customer-registration/customer-registration.service.js';
import { CustomerRegistrationRepository } from '../../src/modules/customer-registration/customer-registration.repository.js';

const target = process.env.CATALOG_TEST_DATABASE_URL,
  origin = 'http://localhost:5173';
type Identity = { cookie: string; csrf: string; principal: Principal };
type CreatedOrder = { id: string; totalCents: string };
describe.skipIf(!target)('CASH-01/02: HTTP y PostgreSQL aislado', () => {
  let db: ReturnType<typeof createDatabase>,
    auth: AuthService,
    cash: CashService,
    payments: PaymentsService,
    orders: OrdersService,
    repo: CashRepository,
    tickets: TicketsService,
    app: ReturnType<typeof createApp>,
    cipher: TicketCipher,
    cashQrCipher: TicketCipher;
  const time = Date.now(),
    now = () => new Date(time),
    identities = new Map<string, Identity>(),
    logs: string[] = [];
  const who = (name: string) => identities.get(name)!;
  let water: string, api: Awaited<ReturnType<typeof SwaggerParser.dereference>>;
  const ajv = new Ajv({ strict: false });
  addFormats.default(ajv);
  const logger = pino(
    { base: null, timestamp: false },
    {
      write(line: string) {
        logs.push(line);
      },
    },
  );
  function conform(path: string, method: 'post' | 'get', status: number, body: unknown) {
    const response = api.paths![path]![method]!.responses![String(status)];
    if (!response || !('content' in response)) throw new Error('Missing contract response');
    const validate = ajv.compile(response.content!['application/json']!.schema!);
    expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
  }
  function post(
    path: string,
    actor: Identity,
    body: object,
    key: string = randomUUID(),
    targetApp = app,
  ) {
    return request(targetApp)
      .post(path)
      .set('Origin', origin)
      .set('Cookie', actor.cookie)
      .set('X-CSRF-Token', actor.csrf)
      .set('Idempotency-Key', key)
      .send(body);
  }
  function patch(path: string, actor: Identity, body: object) {
    return request(app)
      .patch(path)
      .set('Origin', origin)
      .set('Cookie', actor.cookie)
      .set('X-CSRF-Token', actor.csrf)
      .send(body);
  }
  const get = (path: string, actor = who('cashier')) =>
    request(app).get(path).set('Cookie', actor.cookie);
  async function identity(name: string, role: RoleName) {
    const r = await db.role.findUniqueOrThrow({ where: { name: role } });
    const customer = role === 'CLIENTE';
    const user = await db.user.create({
      data: {
        name,
        roleId: r.id,
        accountType: customer ? 'CUSTOMER' : 'STAFF',
        ...(customer
          ? {
              phone: '+526641234567',
              customerNumber: 'C000801',
              pinHash: 'fixture-only-not-for-login',
            }
          : { username: name, passwordHash: 'fixture-only-not-for-login' }),
      },
    });
    const familyId = randomUUID(),
      refresh = randomBytes(32).toString('base64url'),
      absoluteExpiresAt = new Date(time + 8 * 3600000);
    const session = await db.authSession.create({
      data: { userId: user.id, familyId, refreshTokenHash: digest(refresh), absoluteExpiresAt },
    });
    const csrf = auth.tokens.csrf(auth.tokens.key(`family:${familyId}`)),
      access = auth.tokens.access(user.id, session.id, absoluteExpiresAt);
    identities.set(name, {
      cookie: `caf_access=${access}; caf_refresh=${refresh}; caf_csrf=${csrf}`,
      csrf,
      principal: {
        userId: user.id,
        sessionId: session.id,
        familyId,
        role,
        accountType: user.accountType,
        mustChangePin: false,
      },
    });
  }
  async function newOrder(associated = false, paymentMethod = 'CASH'): Promise<CreatedOrder> {
    const csrf = auth.tokens.csrf('pre'),
      guest = { cookie: `caf_csrf=${csrf}`, csrf } as Identity;
    const result = await post('/api/v1/orders', associated ? who('client') : guest, {
      paymentMethod,
      items: [{ productId: water, quantity: 1 }],
    });
    expect(result.status).toBe(201);
    return result.body.data;
  }
  async function open(name = 'cashier', amount = '50000') {
    const result = await post('/api/v1/cash-sessions', who(name), { openingAmountCents: amount });
    expect(result.status).toBe(201);
    conform('/api/v1/cash-sessions', 'post', 201, result.body);
    return result.body.data as { id: string; employeeId: string };
  }
  const charge = (
    sessionId: string,
    order: CreatedOrder,
    name = 'cashier',
    key: string = randomUUID(),
    extra: object = {},
  ) =>
    post(
      '/api/v1/payments/cash',
      who(name),
      {
        cashSessionId: sessionId,
        orderId: order.id,
        cashReceivedCents: (BigInt(order.totalCents) + 1000n).toString(),
        ...extra,
      },
      key,
    );
  beforeAll(async () => {
    const url = new URL(target!);
    if (
      !/^\/cafeteria_catalog_[a-f0-9]{12}$/.test(url.pathname) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    )
      throw new Error('Destino inseguro');
    db = createDatabase(url.href);
    await seedDemo(db);
    auth = new AuthService(
      new AuthRepository(db),
      {
        jwtSecret: 'a'.repeat(64),
        csrfSecret: 'b'.repeat(64),
        issuer: 'cash-tests',
        audience: 'cash-web',
        secure: false,
        origin,
        ipLimit: 100,
      },
      now,
    );
    for (const [name, role] of [
      ['cashier', 'CAJERO'],
      ['other', 'CAJERO'],
      ['admin', 'ADMINISTRADOR'],
      ['prep', 'PREPARACION'],
      ['client', 'CLIENTE'],
    ] as const)
      await identity(name, role);
    const ticketKey = randomBytes(32).toString('hex');
    cipher = new TicketCipher(ticketKey);
    cashQrCipher = new TicketCipher(ticketKey, 'v1', 'cash-payment');
    repo = new CashRepository(db);
    cash = new CashService(repo, now);
    payments = new PaymentsService(repo, cipher, now);
    tickets = new TicketsService(repo, cipher, now);
    orders = new OrdersService(new OrdersRepository(db), now, cashQrCipher);
    app = createApp({
      authService: auth,
      ordersService: orders,
      cashService: cash,
      paymentsService: payments,
      ticketsService: tickets,
      catalogRateLimit: 10000,
      logger,
    });
    water = (await db.product.findFirstOrThrow({ where: { name: 'Agua (demo)' } })).id.toString();
    api = await SwaggerParser.dereference('docs/api/openapi.yaml');
  }, 30000);
  beforeEach(async () => {
    vi.restoreAllMocks();
    const active = await db.cashSession.findFirst({ where: { closedAt: null } });
    if (active)
      await cash.close(
        who('admin').principal,
        active.id,
        {
          countedCashCents: 0n,
          ...(active.employeeId !== who('admin').principal.userId
            ? { exceptionalCloseReason: 'Cierre de fixture entre pruebas' }
            : {}),
        },
        randomUUID(),
      );
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await db?.$disconnect();
  });

  function qrCreation(key = randomUUID(), actor?: Identity, targetApp = app) {
    const csrf = auth.tokens.csrf('pre');
    return post(
      '/api/v1/orders',
      actor ?? ({ cookie: `caf_csrf=${csrf}`, csrf } as Identity),
      { paymentMethod: 'CASH', includeCashQr: true, items: [{ productId: water, quantity: 1 }] },
      key,
      targetApp,
    );
  }
  const qrPath = (id: string) => `/api/v1/cashier/orders/${id}/cash-qr`;
  const scan = (token: string, actor = who('cashier')) =>
    post('/api/v1/cashier/orders/scan-cash-qr', actor, { token });
  it('CASH-03 crea QR invitado idempotente sin original en BD/logs; escaneo no tiene efectos', async () => {
    const key = randomUUID();
    const [first, second] = await Promise.all([qrCreation(key), qrCreation(key)]);
    expect(first.status).toBe(201);
    expect(second.body).toEqual(first.body);
    conform('/api/v1/orders', 'post', 201, first.body);
    const { data: order, cashQr } = first.body;
    expect(cashQr.qrPayload).toBe(`cafeteria:cash:${cashQr.token}`);
    expect(cashQr.expiresAt).toBe(order.paymentExpiresAt);
    const stored = await db.order.findUniqueOrThrow({ where: { id: BigInt(order.id) } });
    expect(stored.cashQrTokenHash).toBe(digest(cashQr.token));
    expect(stored.cashQrEncryptedPayload).not.toContain(cashQr.token);
    const record = await db.idempotencyRecord.findFirstOrThrow({
      where: { resourceType: 'order', resourceId: stored.id },
    });
    expect(JSON.stringify(record.responseJson)).not.toContain(cashQr.token);
    const before = [await db.payment.count(), await db.sale.count(), await db.job.count()];
    for (let i = 0; i < 2; i++) {
      const result = await scan(cashQr.token);
      expect(result.status).toBe(200);
      conform('/api/v1/cashier/orders/scan-cash-qr', 'post', 200, result.body);
      expect(Object.keys(result.body.data).sort()).toEqual(
        ['orderId', 'orderFolio', 'totalCents', 'paymentExpiresAt', 'items'].sort(),
      );
      expect(result.body.data.orderId).toBe(order.id);
      expect(result.body.data.totalCents).toBe(order.totalCents);
      expect(result.headers['cache-control']).toBe('no-store');
      expect(result.headers['referrer-policy']).toBe('no-referrer');
    }
    expect([await db.payment.count(), await db.sale.count(), await db.job.count()]).toEqual(before);
    expect((await db.order.findUniqueOrThrow({ where: { id: stored.id } })).status).toBe(
      'PENDIENTE_PAGO',
    );
    expect(logs.join('')).not.toContain(cashQr.token);
    expect(
      (await request(app).get(`/api/v1/orders/${order.id}`).set('X-Ticket-Token', cashQr.token))
        .status,
    ).toBe(401);
  });
  it('CASH-03 emisión concurrente de orden antigua devuelve mismo QR; caja/cliente pueden optar al crear', async () => {
    const order = await newOrder();
    const results = await Promise.all([
      post(qrPath(order.id), who('cashier'), {}),
      post(qrPath(order.id), who('admin'), {}),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(results[0]!.body).toEqual(results[1]!.body);
    conform('/api/v1/cashier/orders/{id}/cash-qr', 'post', 200, results[0]!.body);
    expect(
      await db.auditEvent.count({
        where: { action: 'ORDER_CASH_QR_ISSUED', reason: `Orden ${order.id}` },
      }),
    ).toBe(1);
    expect((await qrCreation(randomUUID(), who('client'))).status).toBe(201);
    const cashier = await post('/api/v1/cashier/orders', who('cashier'), {
      paymentMethod: 'CASH',
      includeCashQr: true,
      items: [{ productId: water, quantity: 1 }],
    });
    expect(cashier.status).toBe(201);
    conform('/api/v1/cashier/orders', 'post', 201, cashier.body);
    expect(cashier.body.cashQr.purpose).toBe('CASH_PAYMENT');
    const stripe = await newOrder(false, 'STRIPE');
    expect((await post(qrPath(stripe.id), who('cashier'), {})).status).toBe(409);
  });
  it('CASH-03 no permite escaneo/emisión a invitados/clientes/preparación ni acepta tokens ajenos', async () => {
    const result = await qrCreation(),
      { data: order, cashQr } = result.body;
    expect(
      (await request(app).post('/api/v1/cashier/orders/scan-cash-qr').send({ token: cashQr.token }))
        .status,
    ).toBe(401);
    for (const role of ['client', 'prep']) {
      expect((await scan(cashQr.token, who(role))).status).toBe(403);
      expect((await post(qrPath(order.id), who(role), {})).status).toBe(403);
    }
    expect(
      (
        await request(app)
          .post('/api/v1/cashier/orders/scan-cash-qr')
          .set('Cookie', who('cashier').cookie)
          .send({ token: cashQr.token })
      ).status,
    ).toBe(403);
    expect((await scan(`cafeteria:cash:${cashQr.token}`)).status).toBe(400);
    expect((await scan(randomBytes(32).toString('base64url'))).status).toBe(404);
    expect((await post(qrPath(order.id), who('cashier'), { totalCents: '1' })).status).toBe(400);
    expect((await post(`${qrPath(order.id)}?token=bad`, who('cashier'), {})).status).toBe(400);
    const session = await open();
    const paid = await charge(session.id, order);
    const ticket = await get(`/api/v1/sales/${paid.body.data.sale.id}/ticket`);
    expect((await scan(ticket.body.data.registration.token)).status).toBe(404);
    const digital = await post(
      `/api/v1/sales/${paid.body.data.sale.id}/ticket-access`,
      who('cashier'),
      {},
    );
    expect((await scan(digital.body.data.token)).status).toBe(404);
    expect(
      (await request(app).get('/api/v1/guest-ticket').set('X-Ticket-Token', cashQr.token)).status,
    ).toBe(404);
  });
  it('CASH-03 escaneo seguido de cobros concurrentes mantiene responsable, snapshots, idempotencia y un pago/venta', async () => {
    const key = randomUUID(),
      created = await qrCreation(key);
    const { data: order, cashQr } = created.body;
    const session = await open();
    expect((await charge(session.id, order, 'other')).status).toBe(403);
    const product = await db.product.findUniqueOrThrow({ where: { id: BigInt(water) } });
    try {
      await db.product.update({
        where: { id: product.id },
        data: {
          name: 'Cambio posterior al QR',
          basePriceCents: product.basePriceCents + 100n,
          isAvailable: false,
        },
      });
      const scanned = await scan(cashQr.token);
      expect(scanned.body.data.items[0].productName).toBe(product.name);
      expect(scanned.body.data.totalCents).toBe(order.totalCents);
      const paymentKey = randomUUID();
      const [payments, simultaneousScan] = await Promise.all([
        Promise.all([charge(session.id, order, 'cashier', paymentKey), charge(session.id, order)]),
        scan(cashQr.token),
      ]);
      expect([200, 409]).toContain(simultaneousScan.status);
      expect(payments.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(
        await db.payment.count({ where: { orderId: BigInt(order.id), status: 'SUCCEEDED' } }),
      ).toBe(1);
      expect(await db.sale.count({ where: { orderId: BigInt(order.id) } })).toBe(1);
      const winner = payments[0]!.status === 201 ? payments[0]! : payments[1]!;
      const scanAndCharge = await Promise.all([scan(cashQr.token), charge(session.id, order)]);
      expect(scanAndCharge.map((r) => r.status)).toEqual([409, 409]);
      expect((await post(qrPath(order.id), who('cashier'), {})).status).toBe(409);
      expect((await qrCreation(key)).body).toEqual(created.body);
      expect(winner.body.data.order.status).toBe('EN_PREPARACION');
    } finally {
      await db.product.update({
        where: { id: product.id },
        data: {
          name: product.name,
          basePriceCents: product.basePriceCents,
          isAvailable: product.isAvailable,
        },
      });
    }
  });
  it('CASH-03 falta/clave incorrecta causa rollback sin QR parcial; escaneo no necesita descifrado', async () => {
    const unavailableOrders = new OrdersService(new OrdersRepository(db), now);
    const noCipher = createApp({ authService: auth, ordersService: unavailableOrders });
    const before = [await db.order.count(), await db.idempotencyRecord.count()];
    expect((await qrCreation(randomUUID(), undefined, noCipher)).status).toBe(503);
    expect([await db.order.count(), await db.idempotencyRecord.count()]).toEqual(before);
    const legacy = await newOrder();
    await expect(
      unavailableOrders.issueCashQr(who('cashier').principal, BigInt(legacy.id)),
    ).rejects.toMatchObject({ status: 503 });
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: BigInt(legacy.id) } }))
        .cashQrEncryptedPayload,
    ).toBeNull();
    const created = await qrCreation(),
      { data: order, cashQr } = created.body;
    const wrong = new OrdersService(
      new OrdersRepository(db),
      now,
      new TicketCipher(randomBytes(32).toString('hex'), 'v1', 'cash-payment'),
    );
    await expect(
      wrong.issueCashQr(who('cashier').principal, BigInt(order.id)),
    ).rejects.toMatchObject({ status: 503 });
    await expect(
      unavailableOrders.scanCashQr(who('cashier').principal, cashQr.token),
    ).resolves.toHaveProperty('data.orderId', BigInt(order.id));
  });
  it('CASH-03 plazo exacto 30min no se prolonga al reimprimir; CHECK SQL y limpieza conservan hash', async () => {
    const { body } = await qrCreation(),
      { data: order, cashQr } = body;
    const id = BigInt(order.id);
    const later = new OrdersService(
      new OrdersRepository(db),
      () => new Date(time + 29 * 60000),
      cashQrCipher,
    );
    expect((await later.issueCashQr(who('cashier').principal, id)).data.token).toBe(cashQr.token);
    const expired = new OrdersService(
      new OrdersRepository(db),
      () => new Date(time + 30 * 60000),
      cashQrCipher,
    );
    await expect(expired.issueCashQr(who('cashier').principal, id)).rejects.toMatchObject({
      status: 409,
    });
    await expect(expired.scanCashQr(who('cashier').principal, cashQr.token)).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      db.order.update({ where: { id }, data: { cashQrKeyVersion: null } }),
    ).rejects.toThrow();
    const stripe = await newOrder(false, 'STRIPE');
    await expect(
      db.order.update({
        where: { id: BigInt(stripe.id) },
        data: { cashQrEncryptedPayload: 'invalid', cashQrKeyVersion: 'v1' },
      }),
    ).rejects.toThrow();
    expect((await purgeCashQrSecrets(db, new Date(time + 48 * 3600000 - 1))).count).toBe(0);
    expect((await purgeCashQrSecrets(db, new Date(time + 48 * 3600000))).count).toBeGreaterThan(0);
    const stored = await db.order.findUniqueOrThrow({ where: { id } });
    expect(stored.cashQrTokenHash).toBe(digest(cashQr.token));
    expect(stored.cashQrEncryptedPayload).toBeNull();
    expect(stored.cashQrKeyVersion).toBeNull();
  });
  async function paidGuest(associated = false) {
    const session = await open(),
      order = await newOrder(associated);
    const paid = await charge(session.id, order);
    expect(paid.status).toBe(201);
    return { saleId: paid.body.data.sale.id as string, orderId: order.id };
  }
  const accessPath = (id: string) => `/api/v1/sales/${id}/ticket-access`;
  const readTicket = (token: string) =>
    request(app).get('/api/v1/guest-ticket').set('X-Ticket-Token', token);
  it('TKT-02 emite hash, devuelve comprobante conforme sin estado/cuenta/registro y no consume', async () => {
    const { saleId, orderId } = await paidGuest();
    const issued = await post(accessPath(saleId), who('cashier'), {});
    expect(issued.status).toBe(201);
    conform('/api/v1/sales/{id}/ticket-access', 'post', 201, issued.body);
    const { token, expiresAt } = issued.body.data;
    expect(expiresAt).toBe(new Date(time + 24 * 3600000).toISOString());
    const record = await db.guestTicketToken.findUniqueOrThrow({
      where: { tokenHash: digest(token) },
    });
    expect(record.saleId.toString()).toBe(saleId);
    expect(
      JSON.stringify(record, (_k, v: unknown) => (typeof v === 'bigint' ? String(v) : v)),
    ).not.toContain(token);
    const first = await readTicket(token),
      again = await readTicket(token);
    expect(first.status).toBe(200);
    conform('/api/v1/guest-ticket', 'get', 200, first.body);
    expect(first.body).toEqual(again.body);
    expect(Object.keys(first.body.data).sort()).toEqual(
      [
        'saleId',
        'saleNumber',
        'orderFolio',
        'soldAt',
        'currency',
        'totalCents',
        'cashReceivedCents',
        'changeCents',
        'items',
      ].sort(),
    );
    expect(first.headers['cache-control']).toBe('no-store');
    expect(first.headers['referrer-policy']).toBe('no-referrer');
    expect(first.headers['set-cookie']).toBeUndefined();
    expect(
      (await db.guestTicketToken.findUniqueOrThrow({ where: { id: record.id } })).revokedAt,
    ).toBeNull();
    expect(logs.join('')).not.toContain(token);
    expect(
      (
        await db.auditEvent.findFirstOrThrow({
          where: { action: 'GUEST_TICKET_ISSUED', reason: `Venta ${saleId}` },
        })
      ).reason,
    ).not.toContain(token);
    const protectedTicket = await get(`/api/v1/sales/${saleId}/ticket`);
    expect((await readTicket(protectedTicket.body.data.registration.token)).status).toBe(404);
    expect(
      (await request(app).get(`/api/v1/orders/${orderId}`).set('X-Ticket-Token', token)).status,
    ).toBe(401);
    expect(
      (await request(app).get(`/api/v1/sales/${saleId}/ticket`).set('X-Ticket-Token', token))
        .status,
    ).toBe(401);
  });
  it('TKT-02 exige roles/CSRF/entrada estricta y rechaza ventas asociadas o inexistentes', async () => {
    const { saleId } = await paidGuest();
    for (const role of ['client', 'prep'])
      expect((await post(accessPath(saleId), who(role), {})).status).toBe(403);
    expect(
      (await request(app).post(accessPath(saleId)).set('Cookie', who('cashier').cookie).send({}))
        .status,
    ).toBe(403);
    expect(
      (await post(accessPath(saleId), who('cashier'), { expiresAt: new Date().toISOString() }))
        .status,
    ).toBe(400);
    expect((await post(`${accessPath(saleId)}?token=invalid`, who('cashier'), {})).status).toBe(
      400,
    );
    expect((await post(accessPath('9223372036854775807'), who('cashier'), {})).status).toBe(404);
    expect((await post(accessPath(saleId), who('admin'), {})).status).toBe(201);
    await db.order.update({
      where: { id: (await db.sale.findUniqueOrThrow({ where: { id: BigInt(saleId) } })).orderId },
      data: { customerId: who('client').principal.userId },
    });
    expect((await post(accessPath(saleId), who('cashier'), {})).status).toBe(404);
  });
  it('TKT-02 reemite sin ampliar plazo, vence exactamente a 24h y conserva acceso tras alta', async () => {
    const { saleId, orderId } = await paidGuest();
    const first = await tickets.issueGuest(who('cashier').principal, BigInt(saleId));
    const later = new TicketsService(repo, cipher, () => new Date(time + 3600000));
    const second = await later.issueGuest(who('admin').principal, BigInt(saleId));
    expect(second.data.expiresAt).toEqual(first.data.expiresAt);
    expect((await readTicket(first.data.token)).status).toBe(404);
    await db.order.update({
      where: { id: BigInt(orderId) },
      data: { customerId: who('client').principal.userId },
    });
    expect((await readTicket(second.data.token)).status).toBe(200);
    const before = new TicketsService(repo, cipher, () => new Date(time + 24 * 3600000 - 1));
    await expect(before.getGuest(second.data.token)).resolves.toHaveProperty('data.saleNumber');
    const expired = new TicketsService(repo, cipher, () => new Date(time + 24 * 3600000));
    await expect(expired.getGuest(second.data.token)).rejects.toMatchObject({ status: 404 });
  });
  it('TKT-02 reemisiones concurrentes dejan un único permiso activo y rollback no revoca el previo', async () => {
    const { saleId } = await paidGuest();
    const issued = await Promise.all([
      tickets.issueGuest(who('cashier').principal, BigInt(saleId)),
      tickets.issueGuest(who('admin').principal, BigInt(saleId)),
    ]);
    const reads = await Promise.all(issued.map(({ data }) => readTicket(data.token)));
    expect(reads.map((r) => r.status).sort()).toEqual([200, 404]);
    expect(
      await db.guestTicketToken.count({ where: { saleId: BigInt(saleId), revokedAt: null } }),
    ).toBe(1);
    const valid = issued[reads.findIndex((r) => r.status === 200)]!.data.token;
    vi.spyOn(TicketsTransaction.prototype, 'createGuest').mockRejectedValueOnce(
      new Error('fixture rollback'),
    );
    await expect(tickets.issueGuest(who('cashier').principal, BigInt(saleId))).rejects.toThrow(
      'fixture rollback',
    );
    expect((await readTicket(valid)).status).toBe(200);
    expect(await db.guestTicketToken.count({ where: { saleId: BigInt(saleId) } })).toBe(2);
  });
  it('TKT-02 serializa emisión con alta QR sin bloquearse ni ampliar permisos', async () => {
    const { saleId } = await paidGuest();
    const protectedTicket = await get(`/api/v1/sales/${saleId}/ticket`);
    const registration = new CustomerRegistrationService(
      new CustomerRegistrationRepository(db),
      now,
      async () => 'fixture-hash-not-login',
    );
    const results = await Promise.allSettled([
      tickets.issueGuest(who('cashier').principal, BigInt(saleId)),
      registration.register({
        token: protectedTicket.body.data.registration.token,
        name: 'Invitado digital',
        phone: '+526649999901',
        pin: '0007',
      }),
    ]);
    expect(results[1]!.status).toBe('fulfilled');
    const issue = results[0]!;
    if (issue.status === 'fulfilled') {
      const token = (issue.value as Awaited<ReturnType<TicketsService['issueGuest']>>).data.token;
      expect((await readTicket(token)).status).toBe(200);
    } else expect(issue.reason).toMatchObject({ status: 404 });
    expect((await post(accessPath(saleId), who('cashier'), {})).status).toBe(404);
  });
  it('TKT-02 no emite para pago futuro o vencido y el token no revive por un plazo manipulado', async () => {
    const { saleId, orderId } = await paidGuest();
    const issued = await tickets.issueGuest(who('cashier').principal, BigInt(saleId));
    const sale = await db.sale.findUniqueOrThrow({ where: { id: BigInt(saleId) } });
    const future = new Date(time + 60000);
    await db.order.update({ where: { id: BigInt(orderId) }, data: { paidAt: future } });
    await db.payment.update({ where: { id: sale.paymentId }, data: { confirmedAt: future } });
    expect((await readTicket(issued.data.token)).status).toBe(404);
    expect((await post(accessPath(saleId), who('cashier'), {})).status).toBe(404);
    const expired = new Date(time - 24 * 3600000);
    await db.order.update({ where: { id: BigInt(orderId) }, data: { paidAt: expired } });
    await db.payment.update({ where: { id: sale.paymentId }, data: { confirmedAt: expired } });
    await db.guestTicketToken.updateMany({
      where: { saleId: BigInt(saleId) },
      data: { expiresAt: future },
    });
    expect((await readTicket(issued.data.token)).status).toBe(404);
    expect((await post(accessPath(saleId), who('cashier'), {})).status).toBe(404);
  });
  it('dos aperturas concurrentes: una caja; índice SQL protege incluso fuera del servicio', async () => {
    const results = await Promise.all(
      ['cashier', 'other'].map((name) =>
        post('/api/v1/cash-sessions', who(name), { openingAmountCents: '10000' }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await db.cashSession.count({ where: { closedAt: null } })).toBe(1);
    await expect(
      db.cashSession.create({
        data: { employeeId: who('admin').principal.userId, openingAmountCents: 0n },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    const id = results.find((r) => r.status === 201)!.body.data.id;
    expect(
      await db.auditEvent.count({ where: { action: 'CASH_OPENED', reason: `Caja ${id}` } }),
    ).toBe(1);
  });
  it('apertura idempotente y caja activa/resumen sin caja', async () => {
    expect((await get('/api/v1/cash-sessions/current')).body).toEqual({ data: null });
    const key = randomUUID(),
      body = { openingAmountCents: '50000' };
    const first = await post('/api/v1/cash-sessions', who('cashier'), body, key),
      second = await post('/api/v1/cash-sessions', who('cashier'), body, key);
    expect(first.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(
      (await post('/api/v1/cash-sessions', who('cashier'), { openingAmountCents: '50001' }, key))
        .body.code,
    ).toBe('IDEMPOTENCY_CONFLICT');
    const active = await get('/api/v1/cash-sessions/current');
    conform('/api/v1/cash-sessions/current', 'get', 200, active.body);
    expect(active.body.data.computedExpectedCashCents).toBe('50000');
  });
  it('roles, CSRF, importes inválidos y campos calculados no crean caja', async () => {
    for (const name of ['prep', 'client'])
      expect(
        (await post('/api/v1/cash-sessions', who(name), { openingAmountCents: '0' })).status,
      ).toBe(403);
    expect(
      (await request(app).post('/api/v1/cash-sessions').send({ openingAmountCents: '0' })).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/v1/cash-sessions')
          .set('Cookie', who('cashier').cookie)
          .send({ openingAmountCents: '0' })
      ).status,
    ).toBe(403);
    for (const body of [
      { openingAmountCents: '-1' },
      { openingAmountCents: '1.5' },
      { openingAmountCents: 1 },
      { openingAmountCents: '0', employeeId: '1' },
      { openingAmountCents: '9223372036854775808' },
    ])
      expect((await post('/api/v1/cash-sessions', who('cashier'), body)).status).toBe(400);
    expect(await db.cashSession.count({ where: { closedAt: null } })).toBe(0);
  });
  it('responsable original y excepción admin: cobro ajeno prohibido, cierre exige motivo', async () => {
    const session = await open(),
      order = await newOrder();
    for (const name of ['other', 'admin']) {
      expect((await charge(session.id, order, name)).status).toBe(403);
      expect(
        (
          await post(`/api/v1/cash-sessions/${session.id}/close`, who(name), {
            countedCashCents: '50000',
          })
        ).status,
      ).toBe(name === 'admin' ? 409 : 403);
    }
    expect(
      (
        await post(`/api/v1/cash-sessions/${session.id}/close`, who('admin'), {
          countedCashCents: '50000',
          exceptionalCloseReason: '   ',
        })
      ).status,
    ).toBe(400);
    const closed = await post(`/api/v1/cash-sessions/${session.id}/close`, who('admin'), {
      countedCashCents: '49000',
      exceptionalCloseReason: 'Cierre excepcional autorizado'.padEnd(500, 'x'),
    });
    expect(closed.status).toBe(200);
    conform('/api/v1/cash-sessions/{id}/close', 'post', 200, closed.body);
    expect(closed.body.data.employeeId).toBe(who('cashier').principal.userId.toString());
    expect(closed.body.data.closedByEmployeeId).toBe(who('admin').principal.userId.toString());
    expect(closed.body.data.exceptionalCloseReason).toBe(
      'Cierre excepcional autorizado'.padEnd(500, 'x'),
    );
    expect(closed.body.data.differenceCents).toBe('-1000');
    expect(
      await db.auditEvent.count({
        where: {
          action: 'CASH_CLOSED_EXCEPTIONALLY',
          actorId: who('admin').principal.userId,
          reason: { contains: `Caja ${session.id}:` },
        },
      }),
    ).toBe(1);
  });
  it('cobro exitoso crea referencias separadas, resumen neto y LISTO; no reasocia', async () => {
    const session = await open(),
      order = await newOrder();
    const result = await charge(session.id, order);
    expect(result.status).toBe(201);
    conform('/api/v1/payments/cash', 'post', 201, result.body);
    const p = result.body.data.payment,
      s = result.body.data.sale;
    expect(p.orderId).toBe(order.id);
    expect(p.cashSessionId).toBe(session.id);
    expect(p.cashierId).toBe(who('cashier').principal.userId.toString());
    expect(s.paymentId).toBe(p.id);
    expect(s.orderId).toBe(order.id);
    expect(s.totalCents).toBe(order.totalCents);
    expect(p.changeCents).toBe('1000');
    expect(s.saleNumber).toBe(`V${s.id.padStart(6, '0')}`);
    expect(result.body.data.order.status).toBe('EN_PREPARACION');
    const summary = await get(`/api/v1/cash-sessions/${session.id}`);
    conform('/api/v1/cash-sessions/{id}', 'get', 200, summary.body);
    expect(summary.body.data.cashSalesCents).toBe(order.totalCents);
    expect(summary.body.data.computedExpectedCashCents).toBe(
      (50000n + BigInt(order.totalCents)).toString(),
    );
    expect(
      (
        await patch(`/api/v1/cashier/orders/${order.id}/customer`, who('cashier'), {
          identifier: 'C000801',
          confirmedName: 'client',
        })
      ).status,
    ).toBe(409);
    expect((await post(`/api/v1/orders/${order.id}/ready`, who('prep'), {})).status).toBe(200);
  });
  it('efectivo insuficiente, cambio incorrecto, extras y claves inválidas: sin efectos parciales', async () => {
    const session = await open(),
      order = await newOrder(),
      before = [
        await db.payment.count(),
        await db.sale.count(),
        await db.customerRegistrationToken.count(),
      ];
    expect(
      (await charge(session.id, order, 'cashier', randomUUID(), { cashReceivedCents: '0' })).status,
    ).toBe(409);
    expect(
      (await charge(session.id, order, 'cashier', randomUUID(), { changeCents: '999' })).status,
    ).toBe(409);
    for (const extra of [
      { cashReceivedCents: 10 },
      { cashReceivedCents: '-1' },
      { totalCents: '1' },
      { status: 'SUCCEEDED' },
      { changeCents: '-1' },
    ])
      expect((await charge(session.id, order, 'cashier', randomUUID(), extra)).status).toBe(400);
    expect((await charge(session.id, order, 'cashier', 'invalid')).status).toBe(400);
    expect([
      await db.payment.count(),
      await db.sale.count(),
      await db.customerRegistrationToken.count(),
    ]).toEqual(before);
    expect((await db.order.findUniqueOrThrow({ where: { id: BigInt(order.id) } })).status).toBe(
      'PENDIENTE_PAGO',
    );
  });
  it('pagada, vencida, expirada o STRIPE no se cobra ni se modifica parcialmente', async () => {
    const session = await open(),
      paid = await newOrder();
    expect((await charge(session.id, paid)).status).toBe(201);
    expect((await charge(session.id, paid)).status).toBe(409);
    const stripe = await newOrder(false, 'STRIPE');
    expect((await charge(session.id, stripe)).status).toBe(409);
    const expired = await newOrder();
    await db.order.update({
      where: { id: BigInt(expired.id) },
      data: { status: 'EXPIRADA', expiredAt: now() },
    });
    expect((await charge(session.id, expired)).status).toBe(409);
    const overdue = await newOrder();
    await db.order.update({
      where: { id: BigInt(overdue.id) },
      data: { paymentExpiresAt: new Date(time - 1) },
    });
    expect((await charge(session.id, overdue)).status).toBe(409);
    expect(
      await db.payment.count({
        where: { orderId: { in: [stripe, expired, overdue].map((o) => BigInt(o.id)) } },
      }),
    ).toBe(0);
  });
  it('doble clic concurrente con misma clave: un pago, una venta, un token y auditoría', async () => {
    const session = await open(),
      order = await newOrder(),
      key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => charge(session.id, order, 'cashier', key)),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(results.every((r) => JSON.stringify(r.body) === JSON.stringify(results[0]!.body))).toBe(
      true,
    );
    expect(
      await db.payment.count({ where: { orderId: BigInt(order.id), status: 'SUCCEEDED' } }),
    ).toBe(1);
    const sales = await db.sale.findMany({ where: { orderId: BigInt(order.id) } });
    expect(sales).toHaveLength(1);
    expect(await db.customerRegistrationToken.count({ where: { saleId: sales[0]!.id } })).toBe(1);
    expect(
      await db.auditEvent.count({
        where: { action: 'CASH_PAYMENT_SUCCEEDED', reason: { contains: `orden ${order.id};` } },
      }),
    ).toBe(1);
    expect(
      (await charge(session.id, order, 'cashier', key, { cashReceivedCents: '999999' })).body.code,
    ).toBe('IDEMPOTENCY_CONFLICT');
    await post(`/api/v1/cash-sessions/${session.id}/close`, who('cashier'), {
      countedCashCents: '50000',
    });
    expect((await charge(session.id, order, 'cashier', key)).body).toEqual(results[0]!.body);
  });
  it('claves distintas no duplican cobro; restricciones únicas permanecen tras 48h', async () => {
    const session = await open(),
      order = await newOrder();
    const results = await Promise.all([charge(session.id, order), charge(session.id, order)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const result = results.find((r) => r.status === 201)!;
    await expect(
      db.payment.create({
        data: {
          orderId: BigInt(order.id),
          method: 'CASH',
          status: 'SUCCEEDED',
          amountCents: BigInt(order.totalCents),
          cashierId: who('cashier').principal.userId,
          cashSessionId: BigInt(session.id),
          cashReceivedCents: BigInt(order.totalCents),
          changeCents: 0n,
          confirmedAt: now(),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      db.sale.create({
        data: {
          saleNumber: 'invalid-duplicate',
          orderId: BigInt(order.id),
          paymentId: BigInt(result.body.data.payment.id),
          totalCents: BigInt(order.totalCents),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    const key = randomUUID(),
      other = await newOrder();
    expect((await charge(session.id, other, 'cashier', key)).status).toBe(201);
    await db.idempotencyRecord.updateMany({
      where: { scope: 'payments:cash', keyHash: digest(key) },
      data: { expiresAt: new Date(time - 1) },
    });
    expect((await charge(session.id, other, 'cashier', key)).status).toBe(409);
    expect(await db.payment.count({ where: { orderId: BigInt(other.id) } })).toBe(1);
  });
  it('cobro primero excluye cierre y su esperado incluye la venta', async () => {
    const session = await open(),
      order = await newOrder();
    const original = CashTransaction.prototype.session;
    let signal!: () => void, release!: () => void;
    const locked = new Promise<void>((resolve) => {
        signal = resolve;
      }),
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
    vi.spyOn(CashTransaction.prototype, 'session').mockImplementationOnce(async function (
      this: CashTransaction,
      id: bigint,
    ) {
      const row = await original.call(this, id);
      signal();
      await gate;
      return row;
    });
    const pay = charge(session.id, order).then((r) => r);
    await locked;
    const close = post(`/api/v1/cash-sessions/${session.id}/close`, who('cashier'), {
      countedCashCents: '0',
    }).then((r) => r);
    release();
    const [payment, closed] = await Promise.all([pay, close]);
    expect(payment.status).toBe(201);
    expect(closed.status).toBe(200);
    expect(closed.body.data.expectedCashCents).toBe((50000n + BigInt(order.totalCents)).toString());
  });
  it('cierre primero excluye cobro: caja cerrada y ninguna venta', async () => {
    const session = await open(),
      order = await newOrder();
    const original = CashTransaction.prototype.session;
    let signal!: () => void, release!: () => void;
    const locked = new Promise<void>((resolve) => {
        signal = resolve;
      }),
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
    vi.spyOn(CashTransaction.prototype, 'session').mockImplementationOnce(async function (
      this: CashTransaction,
      id: bigint,
    ) {
      const row = await original.call(this, id);
      signal();
      await gate;
      return row;
    });
    const close = post(`/api/v1/cash-sessions/${session.id}/close`, who('cashier'), {
      countedCashCents: '50000',
    }).then((r) => r);
    await locked;
    const pay = charge(session.id, order).then((r) => r);
    release();
    expect((await close).status).toBe(200);
    expect((await pay).status).toBe(409);
    expect(await db.payment.count({ where: { orderId: BigInt(order.id) } })).toBe(0);
  });
  it('ticket invitado único y cifrado: reimpresión estable 24h, sin token en idempotencia/logs', async () => {
    const session = await open(),
      order = await newOrder(),
      paid = await charge(session.id, order);
    expect(paid.status).toBe(201);
    const saleId = paid.body.data.sale.id,
      path = paid.body.data.ticket.path;
    const ticket = await get(path);
    expect(ticket.status).toBe(200);
    conform('/api/v1/sales/{id}/ticket', 'get', 200, ticket.body);
    const registration = ticket.body.data.registration;
    expect(registration.purpose).toBe('CUSTOMER_REGISTRATION');
    expect(/^[A-Za-z0-9_-]{43}$/.test(registration.token)).toBe(true);
    expect(registration.qrPayload === `cafeteria:register:${registration.token}`).toBe(true);
    expect(
      Date.parse(registration.expiresAt) - Date.parse(paid.body.data.payment.confirmedAt),
    ).toBe(24 * 3600000);
    const stored = await db.customerRegistrationToken.findUniqueOrThrow({
      where: { saleId: BigInt(saleId) },
    });
    await expect(
      db.$executeRaw`UPDATE customer_registration_tokens SET key_version=NULL WHERE id=${stored.id}`,
    ).rejects.toMatchObject({ code: 'P2010' });
    expect(stored.tokenHash === digest(registration.token)).toBe(true);
    expect(stored.encryptedPayload!.includes(registration.token)).toBe(false);
    const replay = await get(path);
    expect(replay.body.data.registration.token === registration.token).toBe(true);
    const freshTickets = new TicketsService(new CashRepository(db), cipher, now);
    expect(
      (await freshTickets.get(who('cashier').principal, BigInt(saleId))).data.registration!
        .token === registration.token,
    ).toBe(true);
    const cached = await db.idempotencyRecord.findMany({
      where: { scope: 'payments:cash' },
      select: { responseJson: true },
    });
    expect(JSON.stringify(cached).includes(registration.token)).toBe(false);
    expect(logs.join('').includes(registration.token)).toBe(false);
    expect(ticket.headers['cache-control']).toBe('no-store');
    expect(ticket.headers['referrer-policy']).toBe('no-referrer');
    expect(await db.customerRegistrationToken.count({ where: { saleId: BigInt(saleId) } })).toBe(1);
  });
  it('cliente asociado: sin token ni QR; no recalcula históricos tras cambio de catálogo', async () => {
    const session = await open(),
      order = await newOrder(true);
    const original = await get(`/api/v1/orders/${order.id}`, who('client'));
    const p = await db.product.findUniqueOrThrow({ where: { id: BigInt(water) } });
    await db.product.update({
      where: { id: p.id },
      data: { name: 'Nombre posterior', basePriceCents: 1n, isAvailable: false, deletedAt: now() },
    });
    const paid = await charge(session.id, order);
    expect(paid.status).toBe(201);
    expect(paid.body.data.sale.totalCents).toBe(order.totalCents);
    const ticket = await get(paid.body.data.ticket.path);
    expect(ticket.body.data.registration).toBeNull();
    expect(ticket.body.data.items).toEqual(original.body.data.items);
    expect(
      await db.customerRegistrationToken.count({
        where: { saleId: BigInt(paid.body.data.sale.id) },
      }),
    ).toBe(0);
    await db.product.update({
      where: { id: p.id },
      data: {
        name: p.name,
        basePriceCents: p.basePriceCents,
        isAvailable: p.isAvailable,
        deletedAt: null,
      },
    });
  });
  it('token usado/vencido no se reimprime; limpieza borra solo cifrado y conserva hash', async () => {
    const session = await open();
    for (const used of [true, false]) {
      const order = await newOrder(),
        paid = await charge(session.id, order),
        id = BigInt(paid.body.data.sale.id);
      const before = await db.customerRegistrationToken.findUniqueOrThrow({
        where: { saleId: id },
      });
      await db.customerRegistrationToken.update({
        where: { saleId: id },
        data: used
          ? { usedAt: now(), usedByCustomerId: who('client').principal.userId }
          : { createdAt: new Date(time - 48 * 3600000), expiresAt: new Date(time - 1) },
      });
      const ticket = await get(paid.body.data.ticket.path);
      expect(ticket.status).toBe(200);
      expect(ticket.body.data.registration).toBeNull();
      await purgeTicketSecrets(db, now());
      const after = await db.customerRegistrationToken.findUniqueOrThrow({ where: { saleId: id } });
      expect(after.encryptedPayload).toBeNull();
      expect(after.keyVersion).toBeNull();
      expect(after.tokenHash === before.tokenHash).toBe(true);
    }
  });
  it('ticket conserva snapshots de opciones aunque cambien nombre, recargo y disponibilidad', async () => {
    const session = await open();
    const latte = await db.product.findFirstOrThrow({ where: { name: 'Latte (demo)' } });
    const size = await db.optionValue.findFirstOrThrow({ where: { name: 'Chico' } }),
      milk = await db.optionValue.findFirstOrThrow({ where: { name: 'Entera' } });
    const csrf = auth.tokens.csrf('pre');
    const created = await post('/api/v1/orders', { cookie: `caf_csrf=${csrf}`, csrf } as Identity, {
      paymentMethod: 'CASH',
      items: [
        {
          productId: latte.id.toString(),
          quantity: 2,
          optionValueIds: [size.id.toString(), milk.id.toString()],
        },
      ],
    });
    expect(created.status).toBe(201);
    await db.product.update({
      where: { id: latte.id },
      data: { name: 'Retirado después', basePriceCents: 1n, deletedAt: now() },
    });
    await db.optionValue.update({
      where: { id: milk.id },
      data: {
        name: 'Nombre posterior',
        globalSurchargeCents: 1n,
        isAvailable: false,
        deletedAt: now(),
      },
    });
    const paid = await charge(session.id, created.body.data);
    expect(paid.status).toBe(201);
    const ticket = await get(paid.body.data.ticket.path);
    expect(ticket.status).toBe(200);
    expect(ticket.body.data.items).toEqual(created.body.data.items);
    expect(ticket.body.data.totalCents).toBe(created.body.data.totalCents);
  });
  it('asociación compite con cobro sin emitir QR de registro para compra asociada', async () => {
    const session = await open(),
      order = await newOrder();
    const [paid, associated] = await Promise.all([
      charge(session.id, order),
      patch(`/api/v1/cashier/orders/${order.id}/customer`, who('cashier'), {
        identifier: 'C000801',
        confirmedName: 'client',
      }),
    ]);
    expect(paid.status).toBe(201);
    expect([200, 409]).toContain(associated.status);
    const stored = await db.order.findUniqueOrThrow({ where: { id: BigInt(order.id) } });
    expect(
      await db.customerRegistrationToken.count({
        where: { saleId: BigInt(paid.body.data.sale.id) },
      }),
    ).toBe(stored.customerId ? 0 : 1);
    expect(
      (
        await patch(`/api/v1/cashier/orders/${order.id}/customer`, who('cashier'), {
          identifier: 'C000801',
          confirmedName: 'client',
        })
      ).status,
    ).toBe(409);
  });
  it('administrador cobra solo su propia sesión y cierra con esperado backend', async () => {
    const session = await open('admin', '0'),
      order = await newOrder();
    const paid = await charge(session.id, order, 'admin');
    expect(paid.status).toBe(201);
    expect(paid.body.data.payment.cashierId).toBe(who('admin').principal.userId.toString());
    const closed = await post(`/api/v1/cash-sessions/${session.id}/close`, who('admin'), {
      countedCashCents: order.totalCents,
    });
    expect(closed.status).toBe(200);
    expect(closed.body.data.differenceCents).toBe('0');
    expect(closed.body.data.expectedCashCents).toBe(order.totalCents);
  });
  it('el token de registro no es credencial de orden/ticket/pago ni se acepta como consulta', async () => {
    const session = await open(),
      order = await newOrder(),
      paid = await charge(session.id, order),
      ticket = await get(paid.body.data.ticket.path),
      token = ticket.body.data.registration.token;
    for (const path of [`/api/v1/orders/${order.id}`, paid.body.data.ticket.path])
      expect((await request(app).get(path).set('Authorization', `Bearer ${token}`)).status).toBe(
        401,
      );
    for (const actor of [who('client'), who('prep')])
      expect((await get(paid.body.data.ticket.path, actor)).status).toBe(403);
    expect((await get(`${paid.body.data.ticket.path}?token=${token}`)).status).toBe(400);
    expect(
      (
        await request(app)
          .get(`/api/v1/payments/${paid.body.data.payment.id}`)
          .set('Authorization', `Bearer ${token}`)
      ).status,
    ).toBe(404);
    expect(logs.join('').includes(token)).toBe(false);
  });
  it('sin clave o fallo cifrando: rollback de pago/venta/preparación y del token', async () => {
    const session = await open(),
      order = await newOrder();
    const noKey = createApp({
      authService: auth,
      paymentsService: new PaymentsService(repo, undefined, now),
      ticketsService: new TicketsService(repo, undefined, now),
      catalogRateLimit: 10000,
    });
    const body = {
      cashSessionId: session.id,
      orderId: order.id,
      cashReceivedCents: order.totalCents,
    };
    expect(
      (await post('/api/v1/payments/cash', who('cashier'), body, randomUUID(), noKey)).status,
    ).toBe(503);
    vi.spyOn(cipher, 'seal').mockImplementationOnce(() => {
      throw new Error('Simulated encryption failure');
    });
    expect((await charge(session.id, order)).status).toBe(500);
    expect(await db.payment.count({ where: { orderId: BigInt(order.id) } })).toBe(0);
    expect(await db.sale.count({ where: { orderId: BigInt(order.id) } })).toBe(0);
    expect((await db.order.findUniqueOrThrow({ where: { id: BigInt(order.id) } })).status).toBe(
      'PENDIENTE_PAGO',
    );
    const associated = await newOrder(true);
    const success = await post(
      '/api/v1/payments/cash',
      who('cashier'),
      { ...body, orderId: associated.id, cashReceivedCents: associated.totalCents },
      randomUUID(),
      noKey,
    );
    expect(success.status).toBe(201);
    const ticket = await request(noKey)
      .get(success.body.data.ticket.path)
      .set('Cookie', who('cashier').cookie);
    expect(ticket.status).toBe(200);
    expect(ticket.body.data.registration).toBeNull();
  });
  it('paidAt falsificado sin pago/venta CASH no permite LISTO', async () => {
    const order = await newOrder();
    await db.order.update({
      where: { id: BigInt(order.id) },
      data: { status: 'EN_PREPARACION', paidAt: now() },
    });
    expect((await post(`/api/v1/orders/${order.id}/ready`, who('prep'), {})).status).toBe(409);
  });
  it('cierre propio idempotente calcula faltante y guarda todos los campos', async () => {
    const session = await open('admin', '9007199254740993'),
      key = randomUUID(),
      body = { countedCashCents: '9007199254740992' };
    const one = await post(`/api/v1/cash-sessions/${session.id}/close`, who('admin'), body, key),
      two = await post(`/api/v1/cash-sessions/${session.id}/close`, who('admin'), body, key);
    expect(one.status).toBe(200);
    expect(two.body).toEqual(one.body);
    expect(one.body.data.differenceCents).toBe('-1');
    expect(one.body.data.exceptionalCloseReason).toBeNull();
    expect(
      (await post(`/api/v1/cash-sessions/${session.id}/close`, who('admin'), body)).status,
    ).toBe(409);
  });
  it('no desborda saldo BIGINT al cobrar; sesión revocada/rol cambiado no opera', async () => {
    const session = await open('cashier', '9223372036854775807'),
      order = await newOrder();
    expect((await charge(session.id, order)).status).toBe(409);
    expect(await db.payment.count({ where: { orderId: BigInt(order.id) } })).toBe(0);
    await identity('revoked', 'CAJERO');
    const actor = who('revoked');
    await db.authSession.update({
      where: { id: actor.principal.sessionId },
      data: { revokedAt: now() },
    });
    expect((await post('/api/v1/cash-sessions', actor, { openingAmountCents: '0' })).status).toBe(
      401,
    );
    await expect(cash.open(actor.principal, 0n, randomUUID())).rejects.toMatchObject({
      status: 401,
    });
    await db.authSession.update({
      where: { id: actor.principal.sessionId },
      data: { revokedAt: null },
    });
    await db.user.update({ where: { id: actor.principal.userId }, data: { isActive: false } });
    expect((await post('/api/v1/cash-sessions', actor, { openingAmountCents: '0' })).status).toBe(
      401,
    );
    await db.user.update({
      where: { id: actor.principal.userId },
      data: {
        isActive: true,
        roleId: (await db.role.findUniqueOrThrow({ where: { name: 'PREPARACION' } })).id,
      },
    });
    await expect(cash.open(actor.principal, 0n, randomUUID())).rejects.toMatchObject({
      status: 403,
    });
  });
});

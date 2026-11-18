import { randomBytes, randomUUID } from 'node:crypto';
import { beforeAll, afterAll, afterEach, describe, it, expect, vi } from 'vitest';
import { verify } from 'argon2';
import request from 'supertest';
import pino from 'pino';
import { createApp } from '../../src/app.js';
import { createDatabase } from '../../src/config/database.js';
import { seedDemo } from '../../scripts/lib/demo-data.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { AuthRepository } from '../../src/modules/auth/auth.repository.js';
import { digest } from '../../src/modules/auth/auth.tokens.js';
import type { Principal } from '../../src/modules/auth/auth.types.js';
import { OrdersRepository } from '../../src/modules/orders/orders.repository.js';
import { OrdersService } from '../../src/modules/orders/orders.service.js';
import { CashRepository } from '../../src/modules/cash/cash.repository.js';
import { CashService } from '../../src/modules/cash/cash.service.js';
import { PaymentsService } from '../../src/modules/payments/payments.service.js';
import { TicketsService } from '../../src/modules/tickets/tickets.service.js';
import { TicketCipher } from '../../src/modules/tickets/tickets.cipher.js';
import {
  CustomerRegistrationRepository,
  CustomerRegistrationTransaction,
} from '../../src/modules/customer-registration/customer-registration.repository.js';
import { CustomerRegistrationService } from '../../src/modules/customer-registration/customer-registration.service.js';

const target = process.env.CATALOG_TEST_DATABASE_URL;
describe.skipIf(!target)('AUTH-02: CASH real, HTTP y PostgreSQL aislado', () => {
  let db: ReturnType<typeof createDatabase>,
    auth: AuthService,
    app: ReturnType<typeof createApp>,
    tickets: TicketsService,
    repo: CustomerRegistrationRepository;
  let actor: Principal,
    sessionId: bigint,
    orders: OrdersService,
    payments: PaymentsService,
    water: string;
  let latte: string, optionValueIds: string[];
  const origin = 'http://localhost:5173',
    time = Date.now(),
    now = () => new Date(time),
    logs: string[] = [];
  let serial = 1000000;
  const phone = () => `+52664${++serial}`;
  const body = (token: string, number = phone()) => ({
    token,
    name: 'Ana López',
    phone: number,
    pin: '0007',
  });
  function post(input: object, instance = app) {
    const csrf = auth.tokens.csrf('pre');
    return request(instance)
      .post('/api/v1/customer-registration/ticket')
      .set('Origin', origin)
      .set('Cookie', `caf_csrf=${csrf}`)
      .set('X-CSRF-Token', csrf)
      .send(input);
  }
  async function paid(withOptions = false) {
    const csrf = auth.tokens.csrf('pre');
    const result = await request(app)
      .post('/api/v1/orders')
      .set('Origin', origin)
      .set('Cookie', `caf_csrf=${csrf}`)
      .set('X-CSRF-Token', csrf)
      .set('Idempotency-Key', randomUUID())
      .send({
        paymentMethod: 'CASH',
        items: [
          {
            productId: withOptions ? latte : water,
            quantity: 1,
            ...(withOptions ? { optionValueIds } : {}),
          },
        ],
      });
    expect(result.status).toBe(201);
    const orderId = BigInt(result.body.data.id);
    const payment = await payments.charge(
      actor,
      { orderId, cashSessionId: sessionId, cashReceivedCents: BigInt(result.body.data.totalCents) },
      randomUUID(),
    );
    const sale = await db.sale.findUniqueOrThrow({ where: { orderId } });
    const ticket = await tickets.get(actor, sale.id);
    expect(payment).toBeDefined();
    return {
      orderId,
      saleId: sale.id,
      paymentId: sale.paymentId,
      token: ticket.data.registration!.token,
    };
  }
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
        issuer: 'registration-tests',
        audience: 'web',
        secure: false,
        origin,
        ipLimit: 100,
      },
      now,
    );
    const role = await db.role.findUniqueOrThrow({ where: { name: 'CAJERO' } });
    const user = await db.user.create({
      data: {
        accountType: 'STAFF',
        roleId: role.id,
        name: 'Registro caja',
        username: 'registration-cashier',
        passwordHash: 'fixture-only',
      },
    });
    const familyId = randomUUID();
    const session = await db.authSession.create({
      data: {
        userId: user.id,
        familyId,
        refreshTokenHash: digest(randomUUID()),
        absoluteExpiresAt: new Date(time + 8 * 3600000),
      },
    });
    actor = {
      userId: user.id,
      sessionId: session.id,
      familyId,
      role: 'CAJERO',
      accountType: 'STAFF',
      mustChangePin: false,
    };
    const cashRepo = new CashRepository(db),
      cipher = new TicketCipher(randomBytes(32).toString('hex'));
    const cash = new CashService(cashRepo, now);
    await cash.open(actor, 0n, randomUUID());
    sessionId = (
      await db.cashSession.findFirstOrThrow({ where: { employeeId: user.id, closedAt: null } })
    ).id;
    orders = new OrdersService(new OrdersRepository(db), now);
    payments = new PaymentsService(cashRepo, cipher, now);
    tickets = new TicketsService(cashRepo, cipher, now);
    repo = new CustomerRegistrationRepository(db);
    app = createApp({
      authService: auth,
      ordersService: orders,
      registrationService: new CustomerRegistrationService(repo, now),
      registrationRateLimit: 1000,
      catalogRateLimit: 10000,
      logger: pino(
        { base: null, timestamp: false },
        {
          write: (line: string) => {
            logs.push(line);
          },
        },
      ),
    });
    water = (await db.product.findFirstOrThrow({ where: { name: 'Agua (demo)' } })).id.toString();
    latte = (await db.product.findFirstOrThrow({ where: { name: 'Latte (demo)' } })).id.toString();
    optionValueIds = await Promise.all(
      ['Chico', 'Entera'].map(async (name) =>
        (await db.optionValue.findFirstOrThrow({ where: { name } })).id.toString(),
      ),
    );
  }, 30000);
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await db?.$disconnect();
  });
  it('crea CLIENTE/CUSTOMER, hash Argon2id, asociación exclusiva, consumo permanente y login normal', async () => {
    const purchase = await paid(true),
      other = await paid();
    const before = await db.order.findUniqueOrThrow({
      where: { id: purchase.orderId },
      include: { order_item_orderId: { include: { order_item_option_orderItemId: true } } },
    });
    const paymentBefore = await db.payment.findUniqueOrThrow({ where: { id: purchase.paymentId } });
    const saleBefore = await db.sale.findUniqueOrThrow({ where: { id: purchase.saleId } });
    const sessions = await db.authSession.count(),
      input = body(purchase.token);
    const response = await post({ ...input, phone: input.phone.slice(3) });
    expect(response.status).toBe(201);
    const customer = await db.user.findUniqueOrThrow({
      where: { phone: input.phone },
      include: { role: true },
    });
    expect(response.body).toEqual({
      data: {
        customer: { customerNumber: customer.customerNumber, name: input.name, phone: input.phone },
      },
    });
    expect(customer.customerNumber).toMatch(/^C\d{6,19}$/);
    expect(customer.accountType).toBe('CUSTOMER');
    expect(customer.role.name).toBe('CLIENTE');
    expect(customer.pinHash).toMatch(/^\$argon2id\$/);
    expect(await verify(customer.pinHash!, input.pin)).toBe(true);
    expect(customer.passwordHash).toBeNull();
    expect(customer.mustChangePin).toBe(false);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(await db.authSession.count()).toBe(sessions);
    const after = await db.order.findUniqueOrThrow({
      where: { id: purchase.orderId },
      include: { order_item_orderId: { include: { order_item_option_orderItemId: true } } },
    });
    expect(after).toEqual({ ...before, customerId: customer.id, updatedAt: after.updatedAt });
    expect(before.order_item_orderId[0]!.order_item_option_orderItemId).toHaveLength(2);
    expect(await db.payment.findUniqueOrThrow({ where: { id: purchase.paymentId } })).toEqual(
      paymentBefore,
    );
    expect(await db.sale.findUniqueOrThrow({ where: { id: purchase.saleId } })).toEqual(saleBefore);
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: other.orderId } })).customerId,
    ).toBeNull();
    const token = await db.customerRegistrationToken.findUniqueOrThrow({
      where: { saleId: purchase.saleId },
    });
    expect(token.usedAt).not.toBeNull();
    expect(token.usedByCustomerId).toBe(customer.id);
    expect(token.tokenHash).toBe(digest(purchase.token));
    expect(token.encryptedPayload).toBeNull();
    expect(token.keyVersion).toBeNull();
    expect((await tickets.get(actor, purchase.saleId)).data.registration).toBeNull();
    expect((await post(input)).body.code).toBe('REGISTRATION_TOKEN_USED');
    await expect(
      new CustomerRegistrationService(repo, () => new Date(time + 25 * 3600000)).register(input),
    ).rejects.toMatchObject({ code: 'REGISTRATION_TOKEN_USED' });
    expect(JSON.stringify(response.body)).not.toContain(purchase.token);
    expect(logs.join('')).not.toContain(purchase.token);
    expect(logs.join('')).not.toContain(customer.pinHash!);
    const login = await auth.login('customer', input.phone, input.pin, 'registration-test');
    expect(login.user.id).toBe(customer.id.toString());
  });
  it('token inexistente no permite alta', async () => {
    const count = await db.user.count();
    expect((await post(body(randomBytes(32).toString('base64url')))).body.code).toBe(
      'REGISTRATION_TOKEN_INVALID',
    );
    expect(await db.user.count()).toBe(count);
  });
  it.each([
    { token: undefined },
    { pin: '123' },
    { pin: '12345' },
    { pin: 1234 },
    { role: 'CLIENTE' },
  ])('HTTP rechaza entrada inválida sin alta: %j', async (extra) => {
    const count = await db.user.count();
    expect((await post({ ...body(randomBytes(32).toString('base64url')), ...extra })).status).toBe(
      400,
    );
    expect(await db.user.count()).toBe(count);
  });
  it('alta no requiere copia cifrada ni habilita consultas mediante QR', async () => {
    const p = await paid();
    await db.customerRegistrationToken.update({
      where: { saleId: p.saleId },
      data: { encryptedPayload: null, keyVersion: null },
    });
    expect(
      (await request(app).get(`/api/v1/orders/${p.orderId}`).set('X-Registration-Token', p.token))
        .status,
    ).toBe(401);
    expect((await post(body(p.token))).status).toBe(201);
  });
  it('vencido y límite real pago+24h aunque expiresAt sea posterior', async () => {
    const p = await paid();
    await db.customerRegistrationToken.update({
      where: { saleId: p.saleId },
      data: { expiresAt: new Date(time + 48 * 3600000) },
    });
    const late = createApp({
      authService: auth,
      registrationService: new CustomerRegistrationService(
        repo,
        () => new Date(time + 24 * 3600000),
      ),
    });
    expect((await post(body(p.token), late)).body.code).toBe('REGISTRATION_TOKEN_EXPIRED');
    await db.customerRegistrationToken.update({
      where: { saleId: p.saleId },
      data: { expiresAt: new Date(time + 1000) },
    });
    const expired = createApp({
      authService: auth,
      registrationService: new CustomerRegistrationService(repo, () => new Date(time + 1000)),
    });
    expect((await post(body(p.token), expired)).body.code).toBe('REGISTRATION_TOKEN_EXPIRED');
  });
  it.each(['unpaid', 'pending-payment', 'associated', 'wrong-total'])(
    'rechaza compra no apta: %s',
    async (kind) => {
      const p = await paid();
      const originalOrder = await db.order.findUniqueOrThrow({ where: { id: p.orderId } });
      const originalPayment = await db.payment.findUniqueOrThrow({ where: { id: p.paymentId } });
      const originalSale = await db.sale.findUniqueOrThrow({ where: { id: p.saleId } });
      if (kind === 'unpaid')
        await db.order.update({
          where: { id: p.orderId },
          data: { paidAt: null, status: 'PENDIENTE_PAGO' },
        });
      if (kind === 'pending-payment')
        await db.payment.update({
          where: { id: p.paymentId },
          data: { status: 'PENDING', confirmedAt: null },
        });
      if (kind === 'associated') {
        const r = await db.role.findUniqueOrThrow({ where: { name: 'CLIENTE' } });
        const u = await db.user.create({
          data: {
            accountType: 'CUSTOMER',
            roleId: r.id,
            name: 'Otra',
            phone: phone(),
            customerNumber: `C9${++serial}`,
            pinHash: 'fixture',
          },
        });
        await db.order.update({ where: { id: p.orderId }, data: { customerId: u.id } });
      }
      if (kind === 'wrong-total')
        await db.sale.update({ where: { id: p.saleId }, data: { totalCents: 1n } });
      const count = await db.user.count();
      expect((await post(body(p.token))).body.code).toBe('REGISTRATION_PURCHASE_INELIGIBLE');
      expect(await db.user.count()).toBe(count);
      expect(
        (await db.customerRegistrationToken.findUniqueOrThrow({ where: { saleId: p.saleId } }))
          .usedAt,
      ).toBeNull();
      // Restaurar solo la corrupción deliberada del fixture; caja valida sus totales
      // históricos antes de cada cobro y las pruebas siguientes deben partir coherentes.
      await db.order.update({
        where: { id: p.orderId },
        data: {
          paidAt: originalOrder.paidAt,
          status: originalOrder.status,
          customerId: originalOrder.customerId,
        },
      });
      await db.payment.update({
        where: { id: p.paymentId },
        data: {
          status: originalPayment.status,
          confirmedAt: originalPayment.confirmedAt,
          currency: originalPayment.currency,
        },
      });
      await db.sale.update({
        where: { id: p.saleId },
        data: { totalCents: originalSale.totalCents },
      });
    },
  );
  it('la restricción SQL impide moneda distinta a MXN sin desactivar integridad', async () => {
    const p = await paid();
    await expect(
      db.payment.update({ where: { id: p.paymentId }, data: { currency: 'USD' } }),
    ).rejects.toThrow('23514');
    expect((await db.payment.findUniqueOrThrow({ where: { id: p.paymentId } })).currency).toBe(
      'MXN',
    );
  });
  it('teléfono duplicado incluso inactivo no consume QR', async () => {
    const first = await paid(),
      second = await paid(),
      input = body(first.token);
    expect((await post(input)).status).toBe(201);
    await db.user.update({ where: { phone: input.phone }, data: { isActive: false } });
    expect((await post({ ...input, token: second.token })).body.code).toBe(
      'PHONE_ALREADY_REGISTERED',
    );
    expect(
      (await db.customerRegistrationToken.findUniqueOrThrow({ where: { saleId: second.saleId } }))
        .usedAt,
    ).toBeNull();
  });
  it('mismo QR concurrente: exactamente una alta', async () => {
    const p = await paid(),
      before = await db.user.count();
    const responses = await Promise.all([post(body(p.token)), post(body(p.token))]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(responses.find((r) => r.status === 409)!.body.code).toBe('REGISTRATION_TOKEN_USED');
    expect(await db.user.count()).toBe(before + 1);
  });
  it('dos QR concurrentes mismo teléfono normalizado: una alta, otro QR intacto', async () => {
    const a = await paid(),
      b = await paid(),
      input = body(a.token),
      before = await db.user.count();
    const responses = await Promise.all([
      post(input),
      post({ ...input, token: b.token, phone: input.phone.slice(3) }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(responses.find((r) => r.status === 409)!.body.code).toBe('PHONE_ALREADY_REGISTERED');
    expect(await db.user.count()).toBe(before + 1);
    expect(
      await db.customerRegistrationToken.count({
        where: { saleId: { in: [a.saleId, b.saleId] }, usedAt: null },
      }),
    ).toBe(1);
  });
  it('fallo posterior al consumo revierte cliente, asociación y token', async () => {
    const p = await paid(),
      before = await db.user.count();
    vi.spyOn(CustomerRegistrationTransaction.prototype, 'audit').mockRejectedValueOnce(
      new Error('forced-safe-test-failure'),
    );
    expect((await post(body(p.token))).status).toBe(500);
    expect(await db.user.count()).toBe(before);
    expect((await db.order.findUniqueOrThrow({ where: { id: p.orderId } })).customerId).toBeNull();
    const token = await db.customerRegistrationToken.findUniqueOrThrow({
      where: { saleId: p.saleId },
    });
    expect(token.usedAt).toBeNull();
    expect(token.encryptedPayload).not.toBeNull();
    expect((await post(body(p.token))).status).toBe(201);
  });
  it('vencimiento durante hash revierte sin insertar', async () => {
    const p = await paid();
    let clock = time;
    const service = new CustomerRegistrationService(
      repo,
      () => new Date(clock),
      async () => {
        clock += 24 * 3600000;
        return 'never-stored';
      },
    );
    const count = await db.user.count();
    await expect(service.register(body(p.token))).rejects.toMatchObject({
      code: 'REGISTRATION_TOKEN_EXPIRED',
    });
    expect(await db.user.count()).toBe(count);
    expect(
      (await db.customerRegistrationToken.findUniqueOrThrow({ where: { saleId: p.saleId } }))
        .usedAt,
    ).toBeNull();
  });
  it('vencimiento tras asociar también revierte el cliente ya insertado', async () => {
    const p = await paid();
    let clock = time;
    const original = CustomerRegistrationTransaction.prototype.associate;
    vi.spyOn(CustomerRegistrationTransaction.prototype, 'associate').mockImplementation(
      async function (this: CustomerRegistrationTransaction, ...args) {
        const result = await original.apply(this, args);
        clock += 24 * 3600000;
        return result;
      },
    );
    const count = await db.user.count();
    await expect(
      new CustomerRegistrationService(repo, () => new Date(clock)).register(body(p.token)),
    ).rejects.toMatchObject({ code: 'REGISTRATION_TOKEN_EXPIRED' });
    expect(await db.user.count()).toBe(count);
    expect((await db.order.findUniqueOrThrow({ where: { id: p.orderId } })).customerId).toBeNull();
    expect(
      (await db.customerRegistrationToken.findUniqueOrThrow({ where: { saleId: p.saleId } }))
        .usedAt,
    ).toBeNull();
  });
});

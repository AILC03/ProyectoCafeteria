import { randomBytes, randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
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
import { OrdersService } from '../../src/modules/orders/orders.service.js';
import { OrdersRepository } from '../../src/modules/orders/orders.repository.js';
import { CustomersService } from '../../src/modules/customers/customers.service.js';
import {
  CustomersRepository,
  type CustomersTransaction,
} from '../../src/modules/customers/customers.repository.js';
import { CashRepository } from '../../src/modules/cash/cash.repository.js';
import { CashService } from '../../src/modules/cash/cash.service.js';
import { PaymentsService } from '../../src/modules/payments/payments.service.js';
import { TicketsService } from '../../src/modules/tickets/tickets.service.js';
import { TicketCipher } from '../../src/modules/tickets/tickets.cipher.js';
import { CustomerRegistrationService } from '../../src/modules/customer-registration/customer-registration.service.js';
import { CustomerRegistrationRepository } from '../../src/modules/customer-registration/customer-registration.repository.js';

const target = process.env.CATALOG_TEST_DATABASE_URL,
  origin = 'http://localhost:5173';
const profilePath = '/api/v1/customers/me',
  historyPath = `${profilePath}/orders`;
type Identity = { cookie: string; csrf: string; principal: Principal };
describe.skipIf(!target)('CUS-01: perfil/historial con HTTP y PostgreSQL aislado', () => {
  let db: ReturnType<typeof createDatabase>,
    auth: AuthService,
    customers: CustomersService,
    app: ReturnType<typeof createApp>,
    tickets: TicketsService;
  const time = Date.now(),
    now = () => new Date(time),
    identities = new Map<string, Identity>(),
    logs: string[] = [];
  const who = (name: string) => identities.get(name)!;
  let water: string, latte: string, options: string[], cashSessionId: string;
  let api: Awaited<ReturnType<typeof SwaggerParser.dereference>>;
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
  function conform(path: string, body: unknown) {
    const result = api.paths![path]!.get!.responses!['200'];
    if (!result || !('content' in result)) throw new Error('Missing response schema');
    const validate = ajv.compile(result.content!['application/json']!.schema!);
    expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
  }
  async function session(userId: bigint, role: RoleName): Promise<Identity> {
    const familyId = randomUUID(),
      refresh = randomBytes(32).toString('base64url');
    const absoluteExpiresAt = new Date(time + 8 * 3600000);
    const stored = await db.authSession.create({
      data: { userId, familyId, refreshTokenHash: digest(refresh), absoluteExpiresAt },
    });
    const csrf = auth.tokens.csrf(auth.tokens.key(`family:${familyId}`));
    const access = auth.tokens.access(userId, stored.id, absoluteExpiresAt);
    return {
      cookie: `caf_access=${access}; caf_refresh=${refresh}; caf_csrf=${csrf}`,
      csrf,
      principal: {
        userId,
        sessionId: stored.id,
        familyId,
        role,
        accountType: role === 'CLIENTE' ? 'CUSTOMER' : 'STAFF',
        mustChangePin: false,
      },
    };
  }
  async function identity(name: string, role: RoleName, phoneSuffix?: string, id?: bigint) {
    const r = await db.role.findUniqueOrThrow({ where: { name: role } });
    const user = await db.user.create({
      data: {
        ...(id ? { id } : {}),
        name,
        roleId: r.id,
        accountType: role === 'CLIENTE' ? 'CUSTOMER' : 'STAFF',
        ...(role === 'CLIENTE'
          ? {
              customerNumber: id ? `C${id}` : `C${phoneSuffix}`,
              phone: `+52664111${phoneSuffix!.slice(-4)}`,
              pinHash: 'fixture-pin-hash-not-login',
            }
          : { username: name, passwordHash: 'fixture-password-hash-not-login' }),
      },
    });
    identities.set(name, await session(user.id, role));
  }
  function guest() {
    const csrf = auth.tokens.csrf('pre');
    return { cookie: `caf_csrf=${csrf}`, csrf };
  }
  function post(
    path: string,
    body: object,
    actor = who('cashier') as Pick<Identity, 'cookie' | 'csrf'>,
  ) {
    return request(app)
      .post(path)
      .set('Origin', origin)
      .set('Cookie', actor.cookie)
      .set('X-CSRF-Token', actor.csrf)
      .set('Idempotency-Key', randomUUID())
      .send(body);
  }
  const get = (path = historyPath, actor = who('alice')) =>
    request(app).get(path).set('Cookie', actor.cookie);
  async function newOrder(
    actor = who('alice') as Pick<Identity, 'cookie' | 'csrf'>,
    paymentMethod = 'CASH',
    withOptions = false,
  ) {
    const result = await post(
      '/api/v1/orders',
      {
        paymentMethod,
        items: [
          {
            productId: withOptions ? latte : water,
            quantity: 1,
            ...(withOptions ? { optionValueIds: options } : {}),
          },
        ],
      },
      actor,
    );
    expect(result.status).toBe(201);
    return result.body.data as { id: string; totalCents: string };
  }
  async function pay(order: { id: string; totalCents: string }) {
    const result = await post('/api/v1/payments/cash', {
      orderId: order.id,
      cashSessionId,
      cashReceivedCents: order.totalCents,
    });
    expect(result.status).toBe(201);
    return result.body.data;
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
        issuer: 'customers-integration',
        audience: 'web',
        secure: false,
        origin,
        ipLimit: 100,
      },
      now,
    );
    for (const [name, suffix] of [
      ['alice', '000901'],
      ['bob', '000902'],
      ['empty', '000903'],
      ['paging', '000904'],
      ['guard', '000905'],
    ] as const)
      await identity(name, 'CLIENTE', suffix);
    await identity('huge', 'CLIENTE', '000906', 9007199254740993n);
    for (const [name, role] of [
      ['cashier', 'CAJERO'],
      ['admin', 'ADMINISTRADOR'],
      ['prep', 'PREPARACION'],
    ] as const)
      await identity(name, role);
    const cashRepository = new CashRepository(db),
      cipher = new TicketCipher(randomBytes(32).toString('hex'));
    customers = new CustomersService(new CustomersRepository(db), now);
    tickets = new TicketsService(cashRepository, cipher, now);
    app = createApp({
      authService: auth,
      customersService: customers,
      ordersService: new OrdersService(new OrdersRepository(db), now),
      cashService: new CashService(cashRepository, now),
      paymentsService: new PaymentsService(cashRepository, cipher, now),
      ticketsService: tickets,
      registrationService: new CustomerRegistrationService(
        new CustomerRegistrationRepository(db),
        now,
      ),
      catalogRateLimit: 10000,
      logger,
    });
    water = (await db.product.findFirstOrThrow({ where: { name: 'Agua (demo)' } })).id.toString();
    latte = (await db.product.findFirstOrThrow({ where: { name: 'Latte (demo)' } })).id.toString();
    options = (
      await db.optionValue.findMany({
        where: { name: { in: ['Chico', 'Entera'] } },
        orderBy: { id: 'asc' },
      })
    ).map((option) => option.id.toString());
    const opened = await post('/api/v1/cash-sessions', { openingAmountCents: '0' });
    expect(opened.status).toBe(201);
    cashSessionId = opened.body.data.id;
    api = await SwaggerParser.dereference('docs/api/openapi.yaml');
  }, 30000);
  afterAll(async () => {
    await db?.$disconnect();
  });

  it('perfil propio mínimo con correo opcional y sin secretos/identificadores internos', async () => {
    const result = await get(profilePath);
    expect(result.status).toBe(200);
    conform(profilePath, result.body);
    expect(Object.keys(result.body.data).sort()).toEqual(
      [
        'customerNumber',
        'name',
        'phone',
        'recoveryEmail',
        'recoveryEmailVerifiedAt',
        'createdAt',
      ].sort(),
    );
    expect(result.body.data.customerNumber).toBe('C000901');
    expect(result.body.data.recoveryEmail).toBeNull();
    expect(result.body.data.recoveryEmailVerifiedAt).toBeNull();
    expect(JSON.stringify(result.body)).not.toContain('fixture-pin-hash-not-login');
    await db.user.update({
      where: { id: who('alice').principal.userId },
      data: { recoveryEmail: 'alice@example.test', recoveryEmailVerifiedAt: now() },
    });
    const verified = await get(profilePath);
    expect(verified.body.data.recoveryEmail).toBe('alice@example.test');
    expect(verified.body.data.recoveryEmailVerifiedAt).toBe(now().toISOString());
    conform(profilePath, verified.body);
    expect((await get(profilePath, who('bob'))).body.data.customerNumber).toBe('C000902');
  });
  it('sin órdenes devuelve data vacía, limit 20 y nextCursor null', async () => {
    const result = await get(historyPath, who('empty'));
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ data: [], page: { limit: 20, nextCursor: null } });
    conform(historyPath, result.body);
  });
  it('lista solo órdenes propias en estados reales y CASH/STRIPE sin simular expiración', async () => {
    const cash = await newOrder(),
      stripe = await newOrder(who('alice'), 'STRIPE');
    const expired = await newOrder();
    await db.order.update({
      where: { id: BigInt(expired.id) },
      data: { status: 'EXPIRADA', expiredAt: now() },
    });
    const overdue = await newOrder();
    await db.order.update({
      where: { id: BigInt(overdue.id) },
      data: { paymentExpiresAt: new Date(time - 1) },
    });
    const bob = await newOrder(who('bob')),
      anonymous = await newOrder(guest());
    await pay(cash);
    let result = await get();
    expect(result.body.data.find((order: { id: string }) => order.id === cash.id).status).toBe(
      'EN_PREPARACION',
    );
    expect((await post(`/api/v1/orders/${cash.id}/ready`, {}, who('prep'))).status).toBe(200);
    result = await get();
    conform(historyPath, result.body);
    const ids = result.body.data.map((order: { id: string }) => order.id);
    expect(ids).toEqual([cash.id, stripe.id, expired.id, overdue.id]);
    expect(ids).not.toContain(bob.id);
    expect(ids).not.toContain(anonymous.id);
    expect(result.body.data.find((order: { id: string }) => order.id === cash.id).status).toBe(
      'LISTO',
    );
    expect(result.body.data.find((order: { id: string }) => order.id === overdue.id).status).toBe(
      'PENDIENTE_PAGO',
    );
    expect(
      result.body.data.find((order: { id: string }) => order.id === stripe.id).paymentMethod,
    ).toBe('STRIPE');
    expect(Object.keys(result.body.data[0]).sort()).toEqual(
      [
        'id',
        'folio',
        'status',
        'paymentMethod',
        'totalCents',
        'createdAt',
        'paymentExpiresAt',
        'paidAt',
        'readyAt',
      ].sort(),
    );
    expect((await get(`/api/v1/orders/${bob.id}`)).status).toBe(404);
    expect((await get(`/api/v1/orders/${anonymous.id}`)).status).toBe(404);
  });
  it('paginación conserva microsegundos y desempata por ID sin omisiones/repeticiones', async () => {
    const rows = await Promise.all(Array.from({ length: 5 }, () => newOrder(who('paging'))));
    rows.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
    const ordered = [rows[1]!, rows[0]!, rows[2]!, rows[4]!, rows[3]!];
    const base = new Date(time - 3600000).toISOString().slice(0, 19);
    const fractions = ['123001', '123002', '123002', '123003', '123003'];
    for (const [index, order] of ordered.entries())
      await db.$executeRaw`UPDATE orders SET created_at=${`${base}.${fractions[index]}Z`}::timestamptz WHERE id=${BigInt(order.id)}`;
    // En el último empate el menor ID precede al mayor.
    const expected = [rows[1]!.id, rows[0]!.id, rows[2]!.id, rows[3]!.id, rows[4]!.id];
    const ids: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 5; page++) {
      const result = await get(
        `${historyPath}?limit=1${cursor ? `&cursor=${cursor}` : ''}`,
        who('paging'),
      );
      expect(result.status).toBe(200);
      conform(historyPath, result.body);
      ids.push(result.body.data[0].id);
      cursor = result.body.page.nextCursor;
      if (page === 0)
        expect(JSON.parse(Buffer.from(cursor!, 'base64url').toString()).createdAt).toBe(
          `${base}.123001Z`,
        );
    }
    expect(ids).toEqual(expected);
    expect(new Set(ids).size).toBe(5);
    expect(cursor).toBeNull();
  });
  it('cursor ligado al cliente/recurso; falsificar posición nunca elimina WHERE propietario', async () => {
    const first = await get(`${historyPath}?limit=1`, who('paging'));
    const cursor = first.body.page.nextCursor;
    expect(typeof cursor).toBe('string');
    expect((await get(`${historyPath}?cursor=${cursor}`, who('bob'))).status).toBe(400);
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    expect(
      (
        await get(
          `${historyPath}?cursor=${encode({ ...parsed, scope: 'products' })}`,
          who('paging'),
        )
      ).status,
    ).toBe(400);
    const forged = encode({
      ...parsed,
      filters: digest(`customer-history:${who('bob').principal.userId}`),
      id: '1',
      createdAt: '2000-01-01T00:00:00.000001Z',
    });
    const result = await get(`${historyPath}?cursor=${forged}`, who('bob'));
    expect(result.status).toBe(200);
    const own = await db.order.findMany({ where: { customerId: who('bob').principal.userId } });
    expect(result.body.data.map((order: { id: string }) => order.id)).toEqual(
      own.map((order) => order.id.toString()),
    );
  });
  it('serializa IDs mayores que Number.MAX_SAFE_INTEGER e importes como cadenas exactas', async () => {
    const id = 9007199254740995n;
    await db.order.create({
      data: {
        id,
        folio: `A${id}`,
        customerId: who('huge').principal.userId,
        source: 'MOBILE',
        paymentMethod: 'STRIPE',
        totalCents: 9999900n,
        paymentExpiresAt: new Date(time + 30 * 60000),
        createdAt: now(),
        order_item_orderId: {
          create: {
            productId: BigInt(water),
            productNameSnapshot: 'Snapshot de precisión',
            basePriceCentsSnapshot: 9999900n,
            unitPriceCents: 9999900n,
            quantity: 1,
            lineTotalCents: 9999900n,
          },
        },
      },
    });
    const result = await get(historyPath, who('huge'));
    conform(historyPath, result.body);
    expect(result.body.data[0].id).toBe('9007199254740995');
    expect(result.body.data[0].totalCents).toBe('9999900');
    const detail = await get(`/api/v1/orders/${id}`, who('huge'));
    expect(detail.status).toBe(200);
    expect(detail.body.data.id).toBe(id.toString());
  });
  it('detalle histórico conserva producto/opciones retirados sin recotizar ni filtrar catálogo', async () => {
    const created = await newOrder(who('bob'), 'CASH', true);
    const before = await get(`/api/v1/orders/${created.id}`, who('bob'));
    const product = await db.product.findUniqueOrThrow({ where: { id: BigInt(latte) } });
    const option = await db.optionValue.findUniqueOrThrow({ where: { id: BigInt(options[0]!) } });
    try {
      await db.product.update({
        where: { id: product.id },
        data: {
          name: 'Retirado después',
          basePriceCents: product.basePriceCents + 100n,
          deletedAt: now(),
        },
      });
      await db.optionValue.update({
        where: { id: option.id },
        data: { name: 'Opción retirada', deletedAt: now() },
      });
      const result = await get(historyPath, who('bob'));
      expect(
        result.body.data.find((order: { id: string }) => order.id === created.id).totalCents,
      ).toBe(created.totalCents);
      expect((await get(`/api/v1/orders/${created.id}`, who('bob'))).body).toEqual(before.body);
    } finally {
      await db.product.update({
        where: { id: product.id },
        data: {
          name: product.name,
          basePriceCents: product.basePriceCents,
          deletedAt: product.deletedAt,
        },
      });
      await db.optionValue.update({
        where: { id: option.id },
        data: { name: option.name, deletedAt: option.deletedAt },
      });
    }
  });
  it('alta QR y login reales incorporan únicamente la compra del token al historial', async () => {
    const first = await newOrder(guest()),
      second = await newOrder(guest());
    const paid = await pay(first);
    await pay(second);
    const ticket = await tickets.get(who('cashier').principal, BigInt(paid.sale.id));
    const registered = await post(
      '/api/v1/customer-registration/ticket',
      {
        token: ticket.data.registration!.token,
        name: 'Cliente del ticket',
        phone: '+526641119999',
        pin: '0007',
      },
      guest(),
    );
    expect(registered.status).toBe(201);
    const login = await post(
      '/api/v1/auth/login/customer',
      { identifier: '+526641119999', pin: '0007' },
      guest(),
    );
    expect(login.status).toBe(200);
    const cookies = login.headers['set-cookie'] as unknown as string[];
    const cookie = cookies.map((value) => value.split(';')[0]).join('; ');
    const result = await request(app).get(historyPath).set('Cookie', cookie);
    expect(result.status).toBe(200);
    expect(result.body.data.map((order: { id: string }) => order.id)).toEqual([first.id]);
    const profile = await request(app).get(profilePath).set('Cookie', cookie);
    expect(profile.body.data.customerNumber).toBe(registered.body.data.customer.customerNumber);
    expect(
      (await request(app).get(`/api/v1/orders/${second.id}`).set('Cookie', cookie)).status,
    ).toBe(404);
    expect(
      (await request(app).get(historyPath).set('X-Ticket-Token', ticket.data.registration!.token))
        .status,
    ).toBe(401);
    expect(logs.join('')).not.toContain(ticket.data.registration!.token);
    expect(logs.join('')).not.toContain('+526641119999');
  });
  it('rechaza invitados, empleados, body/filtros no permitidos y cursor inválido', async () => {
    for (const path of [profilePath, historyPath]) {
      expect((await request(app).get(path)).status).toBe(401);
      for (const role of ['cashier', 'prep', 'admin'])
        expect((await get(path, who(role))).status).toBe(403);
      expect((await get(path).send({})).status).toBe(400);
    }
    expect((await get(`${profilePath}?customerId=${who('bob').principal.userId}`)).status).toBe(
      400,
    );
    for (const query of [
      'limit=0',
      'limit=101',
      'limit=-1',
      'limit=1.5',
      'limit=2&limit=3',
      'cursor=',
      'cursor=bad',
      'status=LISTO',
      'customerId=2',
    ])
      expect((await get(`${historyPath}?${query}`)).status).toBe(400);
    expect((await get(`${historyPath}?limit=100`)).status).toBe(200);
  });
  it('revalida revocación/baja/cambio de rol/NIP obligatorio también sin middleware', async () => {
    const actor = who('guard').principal;
    await db.authSession.update({ where: { id: actor.sessionId }, data: { revokedAt: now() } });
    expect((await get(profilePath, who('guard'))).status).toBe(401);
    await expect(customers.profile(actor)).rejects.toMatchObject({ status: 401 });
    await db.authSession.update({ where: { id: actor.sessionId }, data: { revokedAt: null } });
    await db.authSession.update({
      where: { id: actor.sessionId },
      data: {
        createdAt: new Date(time - 60000),
        absoluteExpiresAt: new Date(time - 1),
      },
    });
    expect((await get(historyPath, who('guard'))).status).toBe(401);
    await expect(customers.history(actor, { limit: 20 })).rejects.toMatchObject({ status: 401 });
    await db.authSession.update({
      where: { id: actor.sessionId },
      data: {
        createdAt: now(),
        absoluteExpiresAt: new Date(time + 8 * 3600000),
      },
    });
    try {
      await db.user.update({ where: { id: actor.userId }, data: { isActive: false } });
      expect((await get(historyPath, who('guard'))).status).toBe(401);
      await expect(customers.history(actor, { limit: 20 })).rejects.toMatchObject({ status: 401 });
      await db.user.update({
        where: { id: actor.userId },
        data: { isActive: true, mustChangePin: true },
      });
      expect((await get(profilePath, who('guard'))).body.code).toBe('PIN_CHANGE_REQUIRED');
      await expect(customers.profile(actor)).rejects.toMatchObject({ status: 403 });
    } finally {
      await db.user.update({
        where: { id: actor.userId },
        data: { isActive: true, mustChangePin: false },
      });
    }
    const clientRole = await db.role.findUniqueOrThrow({ where: { name: 'CLIENTE' } });
    const cashierRole = await db.role.findUniqueOrThrow({ where: { name: 'CAJERO' } });
    try {
      // Mutación de fixture atómica/coherente: el JWT anterior no conserva privilegios de cliente.
      await db.user.update({
        where: { id: actor.userId },
        data: {
          accountType: 'STAFF',
          roleId: cashierRole.id,
          customerNumber: null,
          phone: null,
          pinHash: null,
          username: 'guard-as-staff',
          passwordHash: 'fixture-promoted-hash-not-login',
        },
      });
      expect((await get(profilePath, who('guard'))).status).toBe(403);
      await expect(customers.profile(actor)).rejects.toMatchObject({ status: 403 });
      await expect(customers.history(actor, { limit: 20 })).rejects.toMatchObject({ status: 403 });
    } finally {
      await db.user.update({
        where: { id: actor.userId },
        data: {
          accountType: 'CUSTOMER',
          roleId: clientRole.id,
          customerNumber: 'C000905',
          phone: '+526641110905',
          pinHash: 'fixture-pin-hash-not-login',
          username: null,
          passwordHash: null,
        },
      });
    }
    const staff = who('cashier').principal;
    await expect(customers.profile(staff)).rejects.toMatchObject({ status: 403 });
    await expect(customers.history(staff, { limit: 20 })).rejects.toMatchObject({ status: 403 });
  });
  it('lecturas sin efectos/Set-Cookie ni filtración de datos en logs', async () => {
    const counts = async () => [
      await db.order.count(),
      await db.payment.count(),
      await db.sale.count(),
      await db.job.count(),
      await db.auditEvent.count(),
      await db.authSession.count(),
    ];
    const before = await counts();
    for (const path of [profilePath, historyPath]) {
      const result = await get(path);
      expect(result.status).toBe(200);
      expect(result.headers['set-cookie']).toBeUndefined();
      expect(result.headers['cache-control']).toBe('no-store');
      expect(result.headers['referrer-policy']).toBe('no-referrer');
    }
    expect(await counts()).toEqual(before);
    expect(logs.join('')).not.toContain('alice@example.test');
    expect(logs.join('')).not.toContain('fixture-pin-hash-not-login');
  });
  const favoritesPath = `${profilePath}/favorites`;
  const favoritePath = (id: string) => `${favoritesPath}/${id}`;
  function favoriteMutation(
    method: 'put' | 'delete',
    id: string,
    actor = who('alice'),
    body: object | undefined = {},
  ) {
    const client = request(app);
    return client[method](favoritePath(id))
      .set('Origin', origin)
      .set('Cookie', actor.cookie)
      .set('X-CSRF-Token', actor.csrf)
      .send(body);
  }
  const preview = (id: string, actor = who('alice')) =>
    post(`${historyPath}/${id}/repeat-preview`, {}, actor);
  function favoriteConform(body: unknown) {
    conform(favoritesPath, body);
  }
  function previewConform(body: unknown) {
    const response =
      api.paths!['/api/v1/customers/me/orders/{id}/repeat-preview']!.post!.responses!['200'];
    if (!response || !('content' in response)) throw new Error('Missing preview schema');
    const validate = ajv.compile(response.content!['application/json']!.schema!);
    expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
  }
  it('FAV-01 PUT concurrente/repetido conserva una fila y fecha; DELETE solo afecta propietario', async () => {
    const responses = await Promise.all([
      favoriteMutation('put', water),
      favoriteMutation('put', water),
    ]);
    expect(responses.map((result) => result.status)).toEqual([204, 204]);
    const where = { customerId: who('alice').principal.userId, productId: BigInt(water) };
    expect(await db.favorite.count({ where })).toBe(1);
    const original = await db.favorite.findUniqueOrThrow({
      where: { customerId_productId: where },
    });
    const later = new CustomersService(new CustomersRepository(db), () => new Date(time + 3600000));
    await later.addFavorite(who('alice').principal, BigInt(water));
    expect(
      (await db.favorite.findUniqueOrThrow({ where: { customerId_productId: where } })).createdAt,
    ).toEqual(original.createdAt);
    expect((await favoriteMutation('put', water, who('bob'))).status).toBe(204);
    const list = await get(favoritesPath);
    expect(list.status).toBe(200);
    favoriteConform(list.body);
    expect(list.body.data.map((item: { productId: string }) => item.productId)).toEqual([water]);
    expect(Object.keys(list.body.data[0]).sort()).toEqual(
      [
        'productId',
        'categoryId',
        'name',
        'description',
        'basePriceCents',
        'imageUrl',
        'isAvailable',
        'favoritedAt',
      ].sort(),
    );
    expect((await favoriteMutation('delete', water)).status).toBe(204);
    expect((await favoriteMutation('delete', water)).status).toBe(204);
    expect(await db.favorite.count({ where })).toBe(0);
    expect(
      await db.favorite.count({ where: { ...where, customerId: who('bob').principal.userId } }),
    ).toBe(1);
    expect((await favoriteMutation('delete', '9223372036854775807')).status).toBe(204);
    expect((await get(favoritesPath)).body.data).toEqual([]);
  });
  it('FAV-01 respeta catálogo visible: agotados sí; retirados/categoría oculta conservan fila sin aparecer', async () => {
    const products = await db.product.findMany({ orderBy: { id: 'asc' } });
    for (const product of products)
      expect((await favoriteMutation('put', product.id.toString(), who('paging'))).status).toBe(
        204,
      );
    const waterProduct = await db.product.findUniqueOrThrow({ where: { id: BigInt(water) } });
    const latteProduct = await db.product.findUniqueOrThrow({ where: { id: BigInt(latte) } });
    const category = await db.category.findUniqueOrThrow({
      where: { id: waterProduct.categoryId },
    });
    try {
      await db.product.update({ where: { id: waterProduct.id }, data: { isAvailable: false } });
      expect((await favoriteMutation('put', water, who('bob'))).status).toBe(204);
      expect(
        (await get(favoritesPath, who('paging'))).body.data.find(
          (item: { productId: string }) => item.productId === water,
        ).isAvailable,
      ).toBe(false);
      await db.product.update({ where: { id: latteProduct.id }, data: { deletedAt: now() } });
      expect((await favoriteMutation('put', latte)).status).toBe(404);
      expect(
        (await get(favoritesPath, who('paging'))).body.data.some(
          (item: { productId: string }) => item.productId === latte,
        ),
      ).toBe(false);
      expect(
        await db.favorite.count({ where: { customerId: who('paging').principal.userId } }),
      ).toBe(products.length);
      expect((await favoriteMutation('delete', latte, who('paging'))).status).toBe(204);
      await db.category.update({ where: { id: category.id }, data: { isActive: false } });
      expect((await favoriteMutation('put', water)).status).toBe(404);
      expect(
        (await get(favoritesPath, who('paging'))).body.data.some(
          (item: { categoryId: string }) => item.categoryId === category.id.toString(),
        ),
      ).toBe(false);
    } finally {
      await db.product.update({
        where: { id: waterProduct.id },
        data: { isAvailable: waterProduct.isAvailable },
      });
      await db.product.update({
        where: { id: latteProduct.id },
        data: { deletedAt: latteProduct.deletedAt },
      });
      await db.category.update({
        where: { id: category.id },
        data: { isActive: category.isActive },
      });
    }
  });
  it('FAV-01 cursor de favoritos conserva microsegundos/BIGINT y no autoriza cliente/recurso ajeno', async () => {
    const baseProducts = await db.product.findMany({ orderBy: { id: 'asc' } });
    const hugeId = 9007199254740997n;
    await db.product.create({
      data: {
        id: hugeId,
        categoryId: baseProducts[0]!.categoryId,
        name: 'Favorito BIGINT',
        basePriceCents: 9999900n,
      },
    });
    const ids = [hugeId.toString(), ...baseProducts.map((product) => product.id.toString())];
    const base = new Date(time - 3600000).toISOString().slice(0, 19);
    for (const [index, id] of ids.entries()) {
      expect((await favoriteMutation('put', id, who('empty'))).status).toBe(204);
      const fraction = index === 0 ? '123001' : index <= 2 ? '123002' : '123003';
      await db.$executeRaw`UPDATE favorites SET created_at=${`${base}.${fraction}Z`}::timestamptz WHERE customer_id=${who('empty').principal.userId} AND product_id=${BigInt(id)}`;
    }
    let cursor: string | null = null,
      firstCursor = '';
    const seen: string[] = [];
    for (let page = 0; page < ids.length; page++) {
      const result = await get(
        `${favoritesPath}?limit=1${cursor ? `&cursor=${cursor}` : ''}`,
        who('empty'),
      );
      expect(result.status).toBe(200);
      favoriteConform(result.body);
      seen.push(result.body.data[0].productId);
      cursor = result.body.page.nextCursor;
      if (page === 0) {
        firstCursor = cursor!;
        expect(JSON.parse(Buffer.from(firstCursor, 'base64url').toString()).createdAt).toBe(
          `${base}.123001Z`,
        );
        expect(result.body.data[0].basePriceCents).toBe('9999900');
      }
    }
    expect(seen).toEqual(ids);
    expect(cursor).toBeNull();
    expect((await get(`${favoritesPath}?cursor=${firstCursor}`, who('bob'))).status).toBe(400);
    expect((await get(`${historyPath}?cursor=${firstCursor}`, who('empty'))).status).toBe(400);
    const forged = JSON.parse(Buffer.from(firstCursor, 'base64url').toString());
    forged.filters = digest(`customer-favorites:${who('bob').principal.userId}`);
    forged.createdAt = '2000-01-01T00:00:00.000001Z';
    forged.id = '1';
    const token = Buffer.from(JSON.stringify(forged)).toString('base64url');
    const result = await get(`${favoritesPath}?cursor=${token}`, who('bob'));
    expect(result.status).toBe(200);
    expect(result.body.data.map((item: { productId: string }) => item.productId)).toEqual([water]);
  });
  it('FAV-01 aplica rol/CSRF/validación y revalida revocación/NIP en todas las operaciones nuevas', async () => {
    expect((await request(app).get(favoritesPath)).status).toBe(401);
    for (const role of ['cashier', 'admin', 'prep']) {
      expect((await get(favoritesPath, who(role))).status).toBe(403);
      expect((await favoriteMutation('put', water, who(role))).status).toBe(403);
      expect((await favoriteMutation('delete', water, who(role))).status).toBe(403);
      expect((await preview('1', who(role))).status).toBe(403);
    }
    expect(
      (await request(app).put(favoritePath(water)).set('Cookie', who('alice').cookie).send({}))
        .status,
    ).toBe(403);
    expect(
      (await favoriteMutation('put', water).set('Origin', 'https://otro.example')).status,
    ).toBe(403);
    expect(
      (await favoriteMutation('put', water, who('alice'), { optionValueIds: ['1'] })).status,
    ).toBe(400);
    expect((await favoriteMutation('put', '9223372036854775808')).status).toBe(400);
    expect(
      (await favoriteMutation('delete', water, who('alice'), { customerId: '2' })).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .put(favoritePath(water))
          .set('Cookie', who('alice').cookie)
          .set('Origin', origin)
          .set('X-CSRF-Token', who('alice').csrf)
          .type('text/plain')
          .send('unexpected')
      ).status,
    ).toBe(400);
    expect((await get(`${favoritesPath}?customerId=2`)).status).toBe(400);
    expect((await get(`${favoritesPath}?limit=101`)).status).toBe(400);
    expect((await get(`${favoritesPath}?cursor=bad`)).status).toBe(400);
    expect(
      (await post(`${historyPath}/1/repeat-preview`, { totalCents: '1' }, who('alice'))).status,
    ).toBe(400);
    const actor = who('guard').principal;
    try {
      await db.authSession.update({ where: { id: actor.sessionId }, data: { revokedAt: now() } });
      await expect(customers.favorites(actor, { limit: 20 })).rejects.toMatchObject({
        status: 401,
      });
      await expect(customers.addFavorite(actor, BigInt(water))).rejects.toMatchObject({
        status: 401,
      });
      await expect(customers.removeFavorite(actor, BigInt(water))).rejects.toMatchObject({
        status: 401,
      });
      await expect(customers.repeatPreview(actor, 1n)).rejects.toMatchObject({ status: 401 });
      await db.authSession.update({ where: { id: actor.sessionId }, data: { revokedAt: null } });
      await db.user.update({ where: { id: actor.userId }, data: { mustChangePin: true } });
      expect((await favoriteMutation('put', water, who('guard'))).body.code).toBe(
        'PIN_CHANGE_REQUIRED',
      );
      await expect(customers.repeatPreview(actor, 1n)).rejects.toMatchObject({ status: 403 });
    } finally {
      await db.authSession.update({ where: { id: actor.sessionId }, data: { revokedAt: null } });
      await db.user.update({ where: { id: actor.userId }, data: { mustChangePin: false } });
    }
  });
  it('FAV-01 preview avisa cambios actuales sin efectos; confirmación crea orden nueva y conserva original', async () => {
    const old = await newOrder(who('alice'), 'CASH', true);
    const before = await get(`/api/v1/orders/${old.id}`);
    const product = await db.product.findUniqueOrThrow({ where: { id: BigInt(latte) } });
    const option = await db.optionValue.findUniqueOrThrow({ where: { id: BigInt(options[0]!) } });
    const counts = async () => [
      await db.order.count(),
      await db.payment.count(),
      await db.sale.count(),
      await db.job.count(),
      await db.idempotencyRecord.count(),
    ];
    try {
      await db.product.update({
        where: { id: product.id },
        data: { name: 'Nombre vigente repetición', basePriceCents: product.basePriceCents + 100n },
      });
      await db.optionValue.update({
        where: { id: option.id },
        data: { name: 'Etiqueta vigente repetición' },
      });
      const initial = await counts();
      const result = await preview(old.id);
      expect(result.status).toBe(200);
      previewConform(result.body);
      expect(result.body.data.canCreateOrder).toBe(true);
      expect(result.body.data.totalCents).toBe((BigInt(old.totalCents) + 100n).toString());
      expect(
        result.body.data.warnings.map((warning: { code: string }) => warning.code).sort(),
      ).toEqual(['OPTION_CHANGED', 'PRICE_CHANGED', 'PRODUCT_CHANGED']);
      expect(result.body.data.items[0].optionValueIds).toEqual(
        before.body.data.items[0].options.map(
          (value: { optionValueId: string }) => value.optionValueId,
        ),
      );
      expect((await preview(old.id)).body).toEqual(result.body);
      expect(await counts()).toEqual(initial);
      const items = result.body.data.items.map(
        (item: { productId: string; quantity: number; optionValueIds: string[] }) => ({
          productId: item.productId,
          quantity: item.quantity,
          optionValueIds: item.optionValueIds,
        }),
      );
      const confirmed = await post(
        '/api/v1/orders',
        { paymentMethod: 'CASH', items },
        who('alice'),
      );
      expect(confirmed.status).toBe(201);
      expect(confirmed.body.data.id).not.toBe(old.id);
      expect(confirmed.body.data.totalCents).toBe(result.body.data.totalCents);
      expect(confirmed.body.data.items[0].productName).toBe('Nombre vigente repetición');
      expect(confirmed.body.data.status).toBe('PENDIENTE_PAGO');
      expect((await get(`/api/v1/orders/${old.id}`)).body).toEqual(before.body);
      expect((await preview(old.id, who('bob'))).status).toBe(404);
      expect(
        (
          await request(app)
            .post(`${historyPath}/${old.id}/repeat-preview`)
            .set('X-Ticket-Token', 'A'.repeat(43))
            .send({})
        ).status,
      ).toBe(401);
      expect(result.headers['cache-control']).toBe('no-store');
      expect(result.headers['referrer-policy']).toBe('no-referrer');
      expect(result.headers['set-cookie']).toBeUndefined();
    } finally {
      await db.product.update({
        where: { id: product.id },
        data: { name: product.name, basePriceCents: product.basePriceCents },
      });
      await db.optionValue.update({ where: { id: option.id }, data: { name: option.name } });
    }
  });
  it('FAV-01 opción retirada y producto agotado bloquean sin sustituir/eliminar IDs ni alterar snapshots', async () => {
    const old = await newOrder(who('alice'), 'CASH', true);
    const before = await get(`/api/v1/orders/${old.id}`);
    const product = await db.product.findUniqueOrThrow({ where: { id: BigInt(latte) } });
    const option = await db.optionValue.findUniqueOrThrow({ where: { id: BigInt(options[0]!) } });
    try {
      await db.optionValue.update({ where: { id: option.id }, data: { deletedAt: now() } });
      let result = await preview(old.id);
      expect(result.status).toBe(200);
      previewConform(result.body);
      expect(result.body.data.canCreateOrder).toBe(false);
      expect(result.body.data.totalCents).toBeNull();
      expect(result.body.data.items[0].optionValueIds).toContain(option.id.toString());
      expect(result.body.data.warnings).toContainEqual({
        line: 1,
        code: 'OPTION_UNAVAILABLE',
        blocking: true,
        optionValueId: option.id.toString(),
      });
      expect(
        (
          await post(
            '/api/v1/orders',
            {
              paymentMethod: 'CASH',
              items: [{ productId: latte, quantity: 1, optionValueIds: options }],
            },
            who('alice'),
          )
        ).status,
      ).toBe(409);
      await db.product.update({ where: { id: product.id }, data: { isAvailable: false } });
      result = await preview(old.id);
      expect(result.body.data.warnings[0].code).toBe('PRODUCT_UNAVAILABLE');
      expect(result.body.data.items).toHaveLength(1);
      expect((await get(`/api/v1/orders/${old.id}`)).body).toEqual(before.body);
    } finally {
      await db.product.update({
        where: { id: product.id },
        data: { isAvailable: product.isAvailable },
      });
      await db.optionValue.update({
        where: { id: option.id },
        data: { deletedAt: option.deletedAt },
      });
    }
  });
  it('FAV-01 nuevos mínimos de opciones bloquean selección anterior, sin elegir valores automáticamente', async () => {
    const old = await newOrder();
    const assignment = await db.productOptionGroup.findFirstOrThrow({
      where: { productId: BigInt(latte), minSelections: { gte: 1 } },
      include: { product_option_value_productOptionGroupId: true },
    });
    const added = await db.productOptionGroup.create({
      data: {
        productId: BigInt(water),
        optionGroupId: assignment.optionGroupId,
        minSelections: 1,
        maxSelections: 1,
      },
    });
    try {
      const value = assignment.product_option_value_productOptionGroupId[0]!;
      await db.productOptionValue.create({
        data: {
          productOptionGroupId: added.id,
          optionValueId: value.optionValueId,
          surchargeOverrideCents: value.surchargeOverrideCents,
        },
      });
      const result = await preview(old.id);
      previewConform(result.body);
      expect(result.body.data.canCreateOrder).toBe(false);
      expect(result.body.data.totalCents).toBeNull();
      expect(result.body.data.items[0].optionValueIds).toEqual([]);
      expect(
        result.body.data.warnings.some(
          (warning: { code: string }) => warning.code === 'SELECTION_INVALID',
        ),
      ).toBe(true);
    } finally {
      await db.productOptionValue.deleteMany({ where: { productOptionGroupId: added.id } });
      await db.productOptionGroup.delete({ where: { id: added.id } });
    }
  });
  it('FAV-01 total actual acumulado excesivo no produce una cotización parcial ni orden', async () => {
    const response = await post(
      '/api/v1/orders',
      {
        paymentMethod: 'CASH',
        items: [
          { productId: water, quantity: 1 },
          { productId: latte, quantity: 1, optionValueIds: options },
        ],
      },
      who('alice'),
    );
    expect(response.status).toBe(201);
    const waterProduct = await db.product.findUniqueOrThrow({ where: { id: BigInt(water) } });
    const latteProduct = await db.product.findUniqueOrThrow({ where: { id: BigInt(latte) } });
    const count = await db.order.count();
    try {
      await db.product.update({
        where: { id: waterProduct.id },
        data: { basePriceCents: 6000000n },
      });
      await db.product.update({
        where: { id: latteProduct.id },
        data: { basePriceCents: 6000000n },
      });
      const result = await preview(response.body.data.id);
      previewConform(result.body);
      expect(result.body.data.canCreateOrder).toBe(false);
      expect(result.body.data.totalCents).toBeNull();
      expect(result.body.data.warnings).toContainEqual({
        line: null,
        code: 'TOTAL_LIMIT_EXCEEDED',
        blocking: true,
        optionValueId: null,
      });
      expect(await db.order.count()).toBe(count);
    } finally {
      await db.product.update({
        where: { id: waterProduct.id },
        data: { basePriceCents: waterProduct.basePriceCents },
      });
      await db.product.update({
        where: { id: latteProduct.id },
        data: { basePriceCents: latteProduct.basePriceCents },
      });
    }
  });
  it('FAV-01 fallo tras insertar favorito hace rollback y no filtra detalle interno', async () => {
    const original = customers.repository.transaction.bind(customers.repository);
    const spy = vi
      .spyOn(customers.repository, 'transaction')
      .mockImplementationOnce(<T>(fn: (tx: CustomersTransaction) => Promise<T>): Promise<T> =>
        original(async (tx) => {
          await fn(tx);
          throw new Error('fixture-favorite-rollback');
        }),
      );
    try {
      const result = await favoriteMutation('put', water, who('guard'));
      expect(result.status).toBe(500);
      expect(JSON.stringify(result.body)).not.toContain('fixture-favorite-rollback');
      expect(
        await db.favorite.count({
          where: { customerId: who('guard').principal.userId, productId: BigInt(water) },
        }),
      ).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });
});

import { randomBytes, randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import SwaggerParser from '@apidevtools/swagger-parser';
import { Ajv } from 'ajv';
import addFormats from 'ajv-formats';
import { createDatabase } from '../../src/config/database.js';
import { createApp } from '../../src/app.js';
import { seedDemo } from '../../scripts/lib/demo-data.js';
import { AuthRepository } from '../../src/modules/auth/auth.repository.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { digest } from '../../src/modules/auth/auth.tokens.js';
import type { AuthConfig, Principal, RoleName } from '../../src/modules/auth/auth.types.js';
import { AdminService } from '../../src/modules/catalog/admin.service.js';
import { AdminRepository } from '../../src/modules/catalog/admin.repository.js';
import { OrdersService } from '../../src/modules/orders/orders.service.js';
import { OrdersRepository } from '../../src/modules/orders/orders.repository.js';
import { decodeCursor } from '../../src/shared/http/pagination.js';

const target = process.env.CATALOG_TEST_DATABASE_URL;
const origin = 'http://localhost:5173';
type Identity = { cookie: string; csrf: string };
describe.skipIf(!target)('orders con PostgreSQL real aislado', () => {
  let db: ReturnType<typeof createDatabase>,
    auth: AuthService,
    service: OrdersService,
    admin: AdminService,
    app: ReturnType<typeof createApp>;
  const clock = Date.now();
  const now = () => new Date(clock);
  const config: AuthConfig = {
    jwtSecret: 'c'.repeat(64),
    csrfSecret: 'd'.repeat(64),
    issuer: 'orders-test',
    audience: 'orders-web',
    secure: false,
    origin,
    ipLimit: 100,
  };
  const identities = new Map<string, Identity & { principal: Principal }>();
  let water: string, latte: string, size: string, milk: string, categoryId: bigint;
  let api: Awaited<ReturnType<typeof SwaggerParser.dereference>>;
  const ajv = new Ajv({ strict: false });
  addFormats.default(ajv);
  function conform(path: string, method: string, status: number, body: unknown) {
    const schema = api.paths![path]![method as 'get']!.responses![String(status)];
    if (!schema || !('content' in schema)) throw new Error('Schema missing');
    const validate = ajv.compile(schema.content!['application/json']!.schema!);
    expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
  }
  async function identity(name: string, role: RoleName, customerNumber?: string, phone?: string) {
    const found = await db.role.findUniqueOrThrow({ where: { name: role } });
    const user = await db.user.create({
      data: {
        name,
        roleId: found.id,
        accountType: role === 'CLIENTE' ? 'CUSTOMER' : 'STAFF',
        ...(role === 'CLIENTE'
          ? { customerNumber, phone, pinHash: 'fixture-not-for-login' }
          : { username: name, passwordHash: 'fixture-not-for-login' }),
      },
    });
    const familyId = randomUUID(),
      refresh = randomBytes(32).toString('base64url'),
      expires = new Date(clock + 8 * 3600000);
    const session = await db.authSession.create({
      data: {
        userId: user.id,
        familyId,
        refreshTokenHash: digest(refresh),
        absoluteExpiresAt: expires,
      },
    });
    const csrf = auth.tokens.csrf(auth.tokens.key(`family:${familyId}`));
    const token = auth.tokens.access(user.id, session.id, expires);
    identities.set(name, {
      principal: {
        userId: user.id,
        sessionId: session.id,
        familyId,
        role,
        accountType: user.accountType,
        mustChangePin: false,
      },
      cookie: `caf_access=${token}; caf_refresh=${refresh}; caf_csrf=${csrf}`,
      csrf,
    });
  }
  const who = (name: string) => identities.get(name)!;
  function guest(): Identity {
    const csrf = auth.tokens.csrf('pre');
    return { cookie: `caf_csrf=${csrf}`, csrf };
  }
  const input = (productId = water, quantity = 1, optionValueIds: string[] = []) => ({
    paymentMethod: 'CASH',
    items: [{ productId, quantity, optionValueIds }],
  });
  function mutation(
    method: 'post' | 'patch',
    path: string,
    actor: Identity,
    body: object,
    key: string = randomUUID(),
  ) {
    const client = request(app);
    return client[method](path)
      .set('Origin', origin)
      .set('Cookie', actor.cookie)
      .set('X-CSRF-Token', actor.csrf)
      .set('Idempotency-Key', key)
      .send(body);
  }
  const create = (
    actor: Identity,
    body: object = input(),
    key: string = randomUUID(),
    path = '/api/v1/orders',
  ) => mutation('post', path, actor, body, key);
  const get = (id: string, actor: Identity) =>
    request(app).get(`/api/v1/orders/${id}`).set('Cookie', actor.cookie);
  beforeAll(async () => {
    const url = new URL(target!);
    if (
      !/^\/cafeteria_catalog_[a-f0-9]{12}$/.test(url.pathname) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    )
      throw new Error('Destino inseguro');
    db = createDatabase(url.href);
    await seedDemo(db);
    auth = new AuthService(new AuthRepository(db), config, now);
    service = new OrdersService(new OrdersRepository(db), now);
    admin = new AdminService(new AdminRepository(db), now);
    app = createApp({ authService: auth, ordersService: service, catalogRateLimit: 10000 });
    await identity('client-one', 'CLIENTE', 'C000501', '+526641111501');
    await identity('client-two', 'CLIENTE', 'C000502', '+526641111502');
    await identity('cashier', 'CAJERO');
    await identity('prep', 'PREPARACION');
    await identity('admin', 'ADMINISTRADOR');
    const products = await db.product.findMany();
    water = products.find((p) => p.name === 'Agua (demo)')!.id.toString();
    latte = products.find((p) => p.name === 'Latte (demo)')!.id.toString();
    categoryId = products.find((p) => p.id.toString() === water)!.categoryId;
    size = (await db.optionValue.findFirstOrThrow({ where: { name: 'Chico' } })).id.toString();
    milk = (await db.optionValue.findFirstOrThrow({ where: { name: 'Entera' } })).id.toString();
    api = await SwaggerParser.dereference('docs/api/openapi.yaml');
  }, 30000);
  afterAll(async () => {
    await db?.$disconnect();
  });

  it('crea invitado CASH y STRIPE pendientes, folio y plazo; no paga ni encola', async () => {
    const counts = [await db.payment.count(), await db.sale.count(), await db.job.count()];
    for (const paymentMethod of ['CASH', 'STRIPE']) {
      const response = await create(guest(), { ...input(), paymentMethod });
      expect(response.status).toBe(201);
      conform('/api/v1/orders', 'post', 201, response.body);
      const order = response.body.data;
      expect(order.status).toBe('PENDIENTE_PAGO');
      expect(order.paymentMethod).toBe(paymentMethod);
      expect(order.folio).toBe(`A${order.id.padStart(6, '0')}`);
      expect(Date.parse(order.paymentExpiresAt) - Date.parse(order.createdAt)).toBe(30 * 60000);
      expect(order.customerId).toBeNull();
      expect(order.paidAt).toBeNull();
      expect(response.headers['cache-control']).toBe('no-store');
      expect(Object.keys(order)).not.toContain('cashQrTokenHash');
    }
    expect([await db.payment.count(), await db.sale.count(), await db.job.count()]).toEqual(counts);
  });
  it('cliente se asocia desde sesión; cajero/admin por su canal', async () => {
    const own = await create(who('client-one'));
    expect(own.status).toBe(201);
    expect(own.body.data.customerId).toBe(who('client-one').principal.userId.toString());
    expect((await get(own.body.data.id, who('client-one'))).status).toBe(200);
    expect((await get(own.body.data.id, who('client-two'))).status).toBe(404);
    for (const name of ['cashier', 'admin']) {
      const response = await create(who(name), input(), randomUUID(), '/api/v1/cashier/orders');
      expect(response.status).toBe(201);
      expect(response.body.data.source).toBe('CASHIER');
      conform('/api/v1/cashier/orders', 'post', 201, response.body);
      const stored = await db.order.findUniqueOrThrow({
        where: { id: BigInt(response.body.data.id) },
      });
      expect(stored.createdByEmployeeId).toBe(who(name).principal.userId);
    }
  });
  it('roles, invitado sin consulta y no degradar acceso inválido', async () => {
    for (const name of ['cashier', 'admin', 'prep'])
      expect((await create(who(name))).status).toBe(403);
    expect((await create(guest(), input(), randomUUID(), '/api/v1/cashier/orders')).status).toBe(
      401,
    );
    for (const name of ['client-one', 'prep'])
      expect(
        (await create(who(name), input(), randomUUID(), '/api/v1/cashier/orders')).status,
      ).toBe(403);
    const created = await create(guest());
    const id = created.body.data.id;
    expect((await get(id, guest())).status).toBe(401);
    expect((await request(app).get(`/api/v1/orders/${created.body.data.folio}`)).status).toBe(401);
    expect((await get(id, who('prep'))).status).toBe(404);
    const invalid = guest();
    invalid.cookie += '; caf_access=invalid';
    expect((await create(invalid)).status).toBe(401);
    const forced = who('client-two');
    await db.user.update({ where: { id: forced.principal.userId }, data: { mustChangePin: true } });
    expect((await create(forced)).status).toBe(403);
    await db.user.update({
      where: { id: forced.principal.userId },
      data: { mustChangePin: false },
    });
  });
  it('CSRF, Origin, clave e inputs manipulados no crean recursos', async () => {
    const before = await db.order.count();
    expect((await request(app).post('/api/v1/orders').send(input())).status).toBe(403);
    const actor = guest();
    expect(
      (
        await request(app)
          .post('/api/v1/orders')
          .set('Cookie', actor.cookie)
          .set('X-CSRF-Token', actor.csrf)
          .set('Origin', 'https://evil.example')
          .send(input())
      ).status,
    ).toBe(403);
    for (const body of [
      { ...input(), totalCents: '1' },
      { ...input(), customerId: '1' },
      { ...input(), source: 'CASHIER' },
      { ...input(), paidAt: new Date().toISOString() },
      { ...input(), items: [{ ...input().items[0], unitPriceCents: '1' }] },
      { ...input(), items: [{ ...input().items[0], quantity: 0 }] },
      { ...input(), items: [{ ...input().items[0], quantity: 100 }] },
      { ...input(), items: Array.from({ length: 51 }, () => input().items[0]) },
    ])
      expect((await create(actor, body)).status).toBe(400);
    expect((await create(actor, input(), 'predictable')).status).toBe(400);
    expect(
      (
        await request(app)
          .post('/api/v1/orders')
          .set('Origin', origin)
          .set('Cookie', actor.cookie)
          .set('X-CSRF-Token', actor.csrf)
          .send(input())
      ).status,
    ).toBe(400);
    expect(await db.order.count()).toBe(before);
  });
  it('backend calcula GLOBAL/PER_PRODUCT y rechaza duplicados, ajenas y mínimos', async () => {
    const good = input(latte, 2, [size, milk]);
    const response = await create(guest(), good);
    expect(response.status).toBe(201);
    const p = await db.product.findUniqueOrThrow({ where: { id: BigInt(latte) } });
    const group = await db.productOptionValue.findFirstOrThrow({
      where: { optionValueId: BigInt(size), productOptionGroup: { productId: p.id } },
    });
    const v = await db.optionValue.findUniqueOrThrow({ where: { id: BigInt(milk) } });
    expect(response.body.data.totalCents).toBe(
      (
        (p.basePriceCents + group.surchargeOverrideCents! + v.globalSurchargeCents!) *
        2n
      ).toString(),
    );
    expect(response.body.data.items[0].options).toHaveLength(2);
    const medium = (
      await db.optionValue.findFirstOrThrow({ where: { name: 'Mediano' } })
    ).id.toString();
    for (const ids of [[], [size], [milk], [size, milk, '999999'], [size, medium, milk]])
      expect((await create(guest(), input(latte, 1, ids))).status).toBe(409);
    expect((await create(guest(), input(latte, 1, [size, size, milk]))).status).toBe(400);
    expect((await create(guest(), input(water, 1, [milk]))).status).toBe(409);
  });
  it('agotado, retirado, categoría inactiva y opción agotada no dejan escrituras parciales', async () => {
    const before = await db.order.count();
    const p = await db.product.create({
      data: { categoryId, name: 'No disponible', basePriceCents: 100n, isAvailable: false },
    });
    expect((await create(guest(), input(p.id.toString()))).status).toBe(409);
    await db.product.update({ where: { id: p.id }, data: { isAvailable: true, deletedAt: now() } });
    expect((await create(guest(), input(p.id.toString()))).status).toBe(409);
    const cat = await db.category.create({
      data: { name: 'Inactiva para orden', isActive: false },
    });
    const hidden = await db.product.create({
      data: { categoryId: cat.id, name: 'Invisible', basePriceCents: 100n },
    });
    expect((await create(guest(), input(hidden.id.toString()))).status).toBe(409);
    await db.optionValue.update({ where: { id: BigInt(milk) }, data: { isAvailable: false } });
    expect((await create(guest(), input(latte, 1, [size, milk]))).status).toBe(409);
    await db.optionValue.update({ where: { id: BigInt(milk) }, data: { isAvailable: true } });
    await db.optionValue.update({ where: { id: BigInt(milk) }, data: { deletedAt: now() } });
    expect((await create(guest(), input(latte, 1, [size, milk]))).status).toBe(409);
    await db.optionValue.update({ where: { id: BigInt(milk) }, data: { deletedAt: null } });
    const response = await create(guest(), {
      paymentMethod: 'CASH',
      items: [...input().items, ...input(p.id.toString()).items],
    });
    expect(response.status).toBe(409);
    expect(await db.order.count()).toBe(before);
  });
  it('máximos válidos, total exacto y exceso, BIGINT amplio', async () => {
    const p = await db.product.create({
      data: { id: 9007199254740993n, categoryId, name: 'Amplio', basePriceCents: 1n },
    });
    const lines = Array.from({ length: 50 }, () => ({ productId: p.id.toString(), quantity: 99 }));
    const response = await create(guest(), { paymentMethod: 'STRIPE', items: lines });
    expect(response.status).toBe(201);
    expect(response.body.data.totalCents).toBe('4950');
    expect(response.body.data.items[0].productId).toBe('9007199254740993');
    await db.product.update({ where: { id: p.id }, data: { basePriceCents: 9999900n } });
    expect((await create(guest(), input(p.id.toString()))).body.data.totalCents).toBe('9999900');
    expect((await create(guest(), input(p.id.toString(), 2))).status).toBe(409);
  });
  it('idempotencia concurrente: una orden, misma respuesta, distinto cuerpo 409', async () => {
    const actor = who('client-one'),
      key = randomUUID(),
      before = await db.order.count();
    const responses = await Promise.all(
      Array.from({ length: 12 }, () => create(actor, input(), key)),
    );
    expect(responses.every((r) => r.status === 201)).toBe(true);
    expect(new Set(responses.map((r) => JSON.stringify(r.body))).size).toBe(1);
    expect(await db.order.count()).toBe(before + 1);
    expect((await create(actor, input(water, 2), key)).body.code).toBe('IDEMPOTENCY_CONFLICT');
    const replay = await create(actor, input(), key);
    expect(replay.body).toEqual(responses[0]!.body);
    const id = responses[0]!.body.data.id;
    await db.order.update({
      where: { id: BigInt(id) },
      data: { status: 'EXPIRADA', expiredAt: now() },
    });
    expect((await create(actor, input(), key)).body).toEqual(responses[0]!.body);
    const records = await db.idempotencyRecord.findMany({ where: { resourceId: BigInt(id) } });
    expect(records).toHaveLength(1);
    expect(records[0]!.expiresAt.getTime() - records[0]!.createdAt.getTime()).toBe(48 * 3600000);
    await db.idempotencyRecord.update({
      where: { id: records[0]!.id },
      data: { expiresAt: new Date(clock - 1) },
    });
    const next = await create(actor, input(), key);
    expect(next.status).toBe(201);
    expect(next.body.data.id).not.toBe(id);
  });
  it('clave ligada a actor/canal; carrera distinta entrada solo acepta un ganador', async () => {
    const key = randomUUID();
    const one = await create(who('client-one'), input(), key),
      two = await create(who('client-two'), input(), key);
    expect(one.body.data.id).not.toBe(two.body.data.id);
    const race = randomUUID();
    const results = await Promise.all([
      create(guest(), input(), race),
      create(guest(), input(water, 2), race),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });
  it('folios únicos en 50 creaciones concurrentes y catálogo coherente bajo lock', async () => {
    const responses = await Promise.all(Array.from({ length: 50 }, () => create(guest())));
    expect(responses.every((r) => r.status === 201)).toBe(true);
    expect(new Set(responses.map((r) => r.body.data.folio)).size).toBe(50);
    const p = await db.product.create({
      data: { categoryId, name: 'Antes', basePriceCents: 100n },
    });
    const result = await Promise.all([
      create(guest(), input(p.id.toString())),
      admin.updateProduct(who('admin').principal, p.id, { name: 'Después', basePriceCents: 200n }),
    ]);
    const snapshot = result[0].body.data.items[0];
    expect([
      ['Antes', '100'],
      ['Después', '200'],
    ]).toContainEqual([snapshot.productName, snapshot.basePriceCents]);
  }, 30000);
  it('snapshots y replay no cambian al editar/retirar producto y opciones', async () => {
    const actor = who('client-one'),
      key = randomUUID(),
      body = input(latte, 2, [size, milk]);
    const created = await create(actor, body, key);
    expect(created.status).toBe(201);
    const snapshot = structuredClone(created.body.data.items);
    const p = await db.product.findUniqueOrThrow({ where: { id: BigInt(latte) } });
    const v = await db.optionValue.findUniqueOrThrow({ where: { id: BigInt(milk) } });
    await admin.updateProduct(who('admin').principal, p.id, {
      name: 'Cambiado',
      basePriceCents: 1n,
    });
    await admin.updateValue(who('admin').principal, v.id, {
      name: 'Nombre nuevo',
      globalSurchargeCents: 1n,
    });
    await admin.deleteProduct(who('admin').principal, p.id);
    await admin.deleteValue(who('admin').principal, v.id);
    expect((await get(created.body.data.id, actor)).body.data.items).toEqual(snapshot);
    expect((await create(actor, body, key)).body).toEqual(created.body);
    expect((await create(actor, body)).status).toBe(409);
  });
  it('búsqueda mínima exacta y creación de caja con confirmación de nombre', async () => {
    for (const identifier of ['C000501', '6641111501', '+526641111501']) {
      const response = await mutation('post', '/api/v1/cashier/customers/search', who('cashier'), {
        identifier,
      });
      expect(response.status).toBe(200);
      conform('/api/v1/cashier/customers/search', 'post', 200, response.body);
      expect(Object.keys(response.body.data).sort()).toEqual(['customerNumber', 'id', 'name']);
    }
    expect(
      (
        await mutation('post', '/api/v1/cashier/customers/search', who('cashier'), {
          identifier: 'client',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await mutation('post', '/api/v1/cashier/customers/search', who('client-one'), {
          identifier: 'C000501',
        })
      ).status,
    ).toBe(403);
    const body = { ...input(), customer: { identifier: 'C000501', confirmedName: 'client-one' } };
    const response = await mutation('post', '/api/v1/cashier/orders', who('cashier'), body);
    expect(response.status).toBe(201);
    expect(response.body.data.customerId).toBe(who('client-one').principal.userId.toString());
    expect(
      (
        await mutation('post', '/api/v1/cashier/orders', who('cashier'), {
          ...body,
          customer: { ...body.customer, confirmedName: 'Incorrecto' },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await mutation('post', '/api/v1/cashier/orders', who('cashier'), {
          ...body,
          guestName: 'Invitado',
        })
      ).status,
    ).toBe(400);
  });
  it('asociación antes de pago, sin reasociar pagada/vencida ni exponer historial', async () => {
    const created = await create(guest(), { ...input(), guestName: 'Invitado' });
    const id = created.body.data.id,
      path = `/api/v1/cashier/orders/${id}/customer`;
    const selection = { identifier: 'C000501', confirmedName: 'client-one' };
    const associated = await mutation('patch', path, who('cashier'), selection);
    expect(associated.status).toBe(200);
    expect(associated.body.data.guestName).toBeNull();
    conform('/api/v1/cashier/orders/{id}/customer', 'patch', 200, associated.body);
    expect((await get(id, who('client-one'))).status).toBe(200);
    expect((await mutation('patch', path, who('prep'), selection)).status).toBe(403);
    await db.order.update({ where: { id: BigInt(id) }, data: { paidAt: now() } });
    expect(
      (
        await mutation('patch', path, who('cashier'), {
          identifier: 'C000502',
          confirmedName: 'client-two',
        })
      ).status,
    ).toBe(409);
    await db.order.update({
      where: { id: BigInt(id) },
      data: { paidAt: null, paymentExpiresAt: new Date(clock - 1) },
    });
    expect((await mutation('patch', path, who('admin'), selection)).status).toBe(409);
    expect((await get(id, who('client-one'))).body.data.customerId).toBe(
      who('client-one').principal.userId.toString(),
    );
  });
  it('asociación concurrente a pago revalida paidAt después de adquirir lock', async () => {
    const created = await create(guest()),
      id = BigInt(created.body.data.id);
    let unlock!: () => void, signalLocked!: () => void;
    const locked = new Promise<void>((resolve) => {
      signalLocked = resolve;
    });
    const release = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const paymentFixture = db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id=${id} FOR UPDATE`;
      signalLocked();
      await release;
      await tx.order.update({ where: { id }, data: { status: 'EN_PREPARACION', paidAt: now() } });
    });
    await locked;
    const association = mutation('patch', `/api/v1/cashier/orders/${id}/customer`, who('cashier'), {
      identifier: 'C000501',
      confirmedName: 'client-one',
    }).then((result) => result);
    // Simular pago primero mientras la asociación compite por el mismo lock.
    unlock();
    await paymentFixture;
    expect((await association).status).toBe(409);
    expect((await db.order.findUniqueOrThrow({ where: { id } })).customerId).toBeNull();
  });
  async function preparing() {
    const created = await create(guest());
    expect(created.status).toBe(201);
    const id = BigInt(created.body.data.id);
    // Fixture coherente con CASH-02: paidAt aislado ya no demuestra pago exitoso.
    await db.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({ where: { id } });
      const owner = who('cashier').principal.userId;
      const session =
        (await tx.cashSession.findFirst({ where: { closedAt: null } })) ??
        (await tx.cashSession.create({ data: { employeeId: owner, openingAmountCents: 0n } }));
      const payment = await tx.payment.create({
        data: {
          orderId: id,
          method: 'CASH',
          status: 'SUCCEEDED',
          amountCents: order.totalCents,
          currency: 'MXN',
          cashierId: owner,
          cashSessionId: session.id,
          cashReceivedCents: order.totalCents,
          changeCents: 0n,
          confirmedAt: now(),
        },
      });
      const [reserved] = await tx.$queryRaw<
        { id: bigint }[]
      >`SELECT nextval(pg_get_serial_sequence('sales','id')) AS id`;
      await tx.sale.create({
        data: {
          id: reserved!.id,
          saleNumber: `V${reserved!.id.toString().padStart(6, '0')}`,
          orderId: id,
          paymentId: payment.id,
          totalCents: order.totalCents,
          soldAt: now(),
        },
      });
      await tx.order.update({ where: { id }, data: { status: 'EN_PREPARACION', paidAt: now() } });
    });
    return id;
  }
  it('solo EN_PREPARACION se lista; cada rol operativo marca LISTO con actor/fecha', async () => {
    for (const name of ['prep', 'cashier', 'admin']) {
      const id = await preparing();
      expect((await get(id.toString(), who('prep'))).status).toBe(200);
      const list = await request(app)
        .get('/api/v1/preparation/orders')
        .set('Cookie', who(name).cookie);
      expect(list.status).toBe(200);
      conform('/api/v1/preparation/orders', 'get', 200, list.body);
      expect(list.body.data.every((o: { status: string }) => o.status === 'EN_PREPARACION')).toBe(
        true,
      );
      const ready = await mutation('post', `/api/v1/orders/${id}/ready`, who(name), {});
      expect(ready.status).toBe(200);
      conform('/api/v1/orders/{id}/ready', 'post', 200, ready.body);
      expect(ready.body.data.readyByEmployeeId).toBe(who(name).principal.userId.toString());
      expect(ready.body.data.readyAt).toBe(now().toISOString());
      expect((await get(id.toString(), who('prep'))).status).toBe(404);
      expect((await get(id.toString(), who('cashier'))).body.data.status).toBe('LISTO');
      const after = await request(app)
        .get('/api/v1/preparation/orders')
        .set('Cookie', who(name).cookie);
      expect(after.body.data.some((o: { id: string }) => o.id === id.toString())).toBe(false);
    }
    expect(
      (await request(app).get('/api/v1/preparation/orders').set('Cookie', who('client-one').cookie))
        .status,
    ).toBe(403);
  });
  it('LISTO concurrente: un ganador, 409 sin sobrescribir actor/fecha; pendientes/expiradas rechazadas', async () => {
    const id = await preparing();
    const results = await Promise.all(
      ['prep', 'cashier'].map((name) =>
        mutation('post', `/api/v1/orders/${id}/ready`, who(name), {}),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const winner = results.find((r) => r.status === 200)!;
    expect((await get(id.toString(), who('admin'))).body).toEqual(winner.body);
    expect(
      await db.auditEvent.count({ where: { action: 'ORDER_READY', reason: `Orden ${id}` } }),
    ).toBe(1);
    const pending = await create(guest());
    const path = `/api/v1/orders/${pending.body.data.id}/ready`;
    expect((await mutation('post', path, who('client-one'), {})).status).toBe(403);
    expect((await mutation('post', path, who('prep'), {})).status).toBe(409);
    await db.order.update({
      where: { id: BigInt(pending.body.data.id) },
      data: { status: 'EXPIRADA', expiredAt: now() },
    });
    expect((await mutation('post', path, who('prep'), {})).status).toBe(409);
    expect(
      (await mutation('post', `/api/v1/orders/${id}/ready`, who('admin'), { status: 'LISTO' }))
        .status,
    ).toBe(400);
    const corrupt = await create(guest());
    await db.order.update({
      where: { id: BigInt(corrupt.body.data.id) },
      data: { status: 'EN_PREPARACION' },
    });
    expect(
      (await mutation('post', `/api/v1/orders/${corrupt.body.data.id}/ready`, who('prep'), {}))
        .status,
    ).toBe(409);
  });
  it('paginación conserva microsegundos y rechaza cursores de otro alcance', async () => {
    const first = await preparing(),
      second = await preparing();
    await db.$executeRaw`UPDATE orders SET created_at='2026-01-01T00:00:00.123456Z'::timestamptz WHERE id=${first}`;
    await db.$executeRaw`UPDATE orders SET created_at='2026-01-01T00:00:00.123457Z'::timestamptz WHERE id=${second}`;
    const list = await request(app)
      .get('/api/v1/preparation/orders?limit=1')
      .set('Cookie', who('prep').cookie);
    expect(list.body.data[0].id).toBe(first.toString());
    const cursor = list.body.page.nextCursor;
    expect(decodeCursor(cursor, 'preparation-orders', 'EN_PREPARACION')!.createdAt).toBe(
      '2026-01-01T00:00:00.123456Z',
    );
    const next = await request(app)
      .get(`/api/v1/preparation/orders?limit=1&cursor=${cursor}`)
      .set('Cookie', who('prep').cookie);
    expect(next.body.data[0].id).toBe(second.toString());
    const foreign = Buffer.from(
      JSON.stringify({
        version: 1,
        scope: 'products',
        filters: 'EN_PREPARACION',
        id: '1',
        createdAt: '2026-01-01T00:00:00.123456Z',
      }),
    ).toString('base64url');
    for (const query of ['limit=101', 'status=LISTO', 'cursor=***', `cursor=${foreign}`])
      expect(
        (
          await request(app)
            .get(`/api/v1/preparation/orders?${query}`)
            .set('Cookie', who('prep').cookie)
        ).status,
      ).toBe(400);
  });
  it('sesión revocada/inactiva y permisos vigentes se revalidan antes de mutar', async () => {
    await identity('revoked', 'CAJERO');
    const actor = who('revoked');
    await db.authSession.update({
      where: { id: actor.principal.sessionId },
      data: { revokedAt: now() },
    });
    expect((await create(actor, input(), randomUUID(), '/api/v1/cashier/orders')).status).toBe(401);
    await expect(
      service.create(
        'CASHIER',
        actor.principal,
        { paymentMethod: 'CASH', items: [{ productId: water, quantity: 1, optionValueIds: [] }] },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 401 });
    await db.authSession.update({
      where: { id: actor.principal.sessionId },
      data: { revokedAt: null },
    });
    await db.user.update({ where: { id: actor.principal.userId }, data: { isActive: false } });
    expect((await create(actor, input(), randomUUID(), '/api/v1/cashier/orders')).status).toBe(401);
    await db.user.update({
      where: { id: actor.principal.userId },
      data: {
        isActive: true,
        roleId: (await db.role.findUniqueOrThrow({ where: { name: 'PREPARACION' } })).id,
      },
    });
    await expect(
      service.create(
        'CASHIER',
        actor.principal,
        { paymentMethod: 'CASH', items: [{ productId: water, quantity: 1, optionValueIds: [] }] },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});

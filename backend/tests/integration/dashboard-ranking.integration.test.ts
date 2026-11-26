import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
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
import { SalesRepository, SalesService } from '../../src/modules/sales/sales.service.js';

const target = process.env.CATALOG_TEST_DATABASE_URL,
  origin = 'http://localhost:5173',
  OPTION_SURCHARGE_CENTS = 500n;
type Identity = { principal: Principal; cookie: string; csrf: string };
type Method = 'CASH' | 'STRIPE';
type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED';
type Line = {
  productId: bigint;
  name: string;
  unitPriceCents: bigint;
  basePriceCents?: bigint;
  quantity: number;
  option?: boolean;
};
type SaleOptions = {
  method: Method;
  soldAt: Date;
  lines: Line[];
  paymentStatus?: PaymentStatus;
  extraPendingPayment?: boolean;
  createSale?: boolean;
};
type RankingItem = {
  position?: string;
  productId: string;
  name: string;
  nameSource?: 'current' | 'snapshot';
  unitsSold: string;
  totalCents: string;
};
type RankingResponse = {
  data: {
    generatedAt: string;
    currency: string;
    period: { from: string; to: string; timeZone: string };
    method: Method | null;
    metric: 'units' | 'amount';
    direction: 'top' | 'bottom';
    top: string;
    matchedProductCount: string;
    matchedTotals: { unitsSold: string; totalCents: string };
    truncated: boolean;
    items: RankingItem[];
  };
};

describe.skipIf(!target)('DA-001 E2: ranking con HTTP y PostgreSQL aislado', () => {
  const coreFrom = '2027-06-01T08:00:00.000Z',
    coreTo = '2027-06-02T08:00:00.000Z',
    boundaryFrom = '2027-07-01T08:00:00.000Z',
    boundaryTo = '2027-07-01T11:00:00.000Z',
    zeroFrom = '2027-12-01T08:00:00.000Z',
    zeroTo = '2027-12-02T08:00:00.000Z',
    d11From = '2027-08-01T08:00:00.000Z',
    d11To = '2027-08-01T09:00:00.000Z',
    largeFrom = '2027-09-01T08:00:00.000Z',
    largeTo = '2027-09-01T09:00:00.000Z',
    volumeFrom = '2028-02-01T08:00:00.000Z',
    volumeTo = '2028-02-02T08:00:00.000Z',
    concurrentFrom = '2029-03-01T08:00:00.000Z',
    concurrentTo = '2029-03-01T11:00:00.000Z',
    tieFrom = '2027-10-01T08:00:00.000Z',
    tieTo = '2027-10-01T09:00:00.000Z';
  let db: ReturnType<typeof createDatabase>,
    auth: AuthService,
    app: ReturnType<typeof createApp>,
    categoryId: bigint,
    optionValueId: bigint,
    cashSessionId: bigint;
  const time = Date.UTC(2026, 10, 24, 18, 30, 0, 0),
    now = () => new Date(time);
  let admin: Identity,
    cashier: Identity,
    prep: Identity,
    customer: Identity,
    manager: Identity,
    pinChange: Identity;
  let api: Awaited<ReturnType<typeof SwaggerParser.dereference>>;
  const ajv = new Ajv({ strict: false });
  addFormats.default(ajv);
  const ids: Record<string, bigint> = {};
  function conform(path: string, method: 'get', status: string, body: unknown) {
    const result = api.paths![path]![method]!.responses![status];
    if (!result || !('content' in result)) throw new Error('Missing response schema');
    const validate = ajv.compile(result.content!['application/json']!.schema!);
    expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
  }
  async function session(userId: bigint, role: RoleName): Promise<Identity> {
    const familyId = randomUUID(),
      refresh = randomBytes(32).toString('base64url'),
      expires = new Date(Date.now() + 8 * 3600000);
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
    const roleRow = await db.role.findUniqueOrThrow({ where: { name: role } });
    const user = await db.user.create({
      data: {
        name,
        roleId: roleRow.id,
        accountType: role === 'CLIENTE' ? 'CUSTOMER' : 'STAFF',
        ...(role === 'CLIENTE'
          ? { phone, customerNumber: `C${phone!.slice(-6)}`, pinHash: await hashCredential('0007') }
          : { username: name, passwordHash: await hashCredential('fixture-password') }),
      },
    });
    return session(user.id, role);
  }
  async function makeProduct(
    name: string,
    extra: { deletedAt?: Date | null; isAvailable?: boolean; id?: bigint } = {},
  ) {
    return db.product.create({
      data: {
        name,
        categoryId,
        basePriceCents: 100n,
        isAvailable: extra.isAvailable ?? true,
        deletedAt: extra.deletedAt ?? null,
        ...(extra.id === undefined ? {} : { id: extra.id }),
      },
    });
  }
  async function createSale(options: SaleOptions) {
    // El recargo ya está incluido en el precio unitario y en el histórico de la
    // línea; la fila de OrderItemOption solo documenta la selección.
    const lineTotals = options.lines.map((line) => line.unitPriceCents * BigInt(line.quantity));
    const totalCents = lineTotals.reduce((total, lineTotal) => total + lineTotal, 0n);
    if (totalCents > 9_999_900n) throw new Error('Fixture fuera del límite de orden');
    const order = await db.order.create({
      data: {
        folio: `RNK-${randomUUID().slice(0, 8)}`,
        source: 'CASHIER',
        status: 'EN_PREPARACION',
        paymentMethod: options.method,
        totalCents,
        cashQrTokenHash: options.method === 'CASH' ? randomBytes(32).toString('hex') : null,
        paymentExpiresAt: new Date(options.soldAt.getTime() + 3600000),
        paidAt: options.paymentStatus === 'SUCCEEDED' ? options.soldAt : null,
      },
    });
    for (const [index, line] of options.lines.entries()) {
      const item = await db.orderItem.create({
        data: {
          orderId: order.id,
          productId: line.productId,
          productNameSnapshot: line.name,
          basePriceCentsSnapshot: line.basePriceCents ?? line.unitPriceCents,
          unitPriceCents: line.unitPriceCents,
          quantity: line.quantity,
          lineTotalCents: lineTotals[index]!,
        },
      });
      if (line.option)
        await db.orderItemOption.create({
          data: {
            orderItemId: item.id,
            optionValueId,
            groupNameSnapshot: 'Leche (demo)',
            optionNameSnapshot: 'Almendra',
            surchargeCentsSnapshot: OPTION_SURCHARGE_CENTS,
          },
        });
    }
    const status = options.paymentStatus ?? 'SUCCEEDED';
    const payment = await db.payment.create({
      data: {
        orderId: order.id,
        method: options.method,
        status,
        amountCents: totalCents,
        ...(options.method === 'CASH'
          ? {
              cashierId: cashier.principal.userId,
              cashSessionId,
              cashReceivedCents: totalCents,
              changeCents: 0n,
            }
          : {}),
        confirmedAt: status === 'SUCCEEDED' ? options.soldAt : null,
      },
    });
    if (options.extraPendingPayment)
      await db.payment.create({
        data: {
          orderId: order.id,
          method: options.method,
          status: 'PENDING',
          amountCents: totalCents,
          ...(options.method === 'CASH'
            ? {
                cashierId: cashier.principal.userId,
                cashSessionId,
                cashReceivedCents: totalCents,
                changeCents: 0n,
              }
            : {}),
        },
      });
    if (options.createSale === false) return { order, payment, sale: null };
    const sale = await db.sale.create({
      data: {
        saleNumber: `RNK-${randomUUID().slice(0, 8)}`,
        orderId: order.id,
        paymentId: payment.id,
        totalCents,
        soldAt: options.soldAt,
      },
    });
    return { order, payment, sale };
  }
  async function setSoldAt(saleId: bigint, instant: string) {
    await db.$executeRaw`UPDATE sales SET sold_at = ${instant}::timestamptz WHERE id = ${saleId}`;
  }
  async function one(name: string, units: number, unitPriceCents: bigint, soldAt: Date) {
    return createSale({
      method: 'STRIPE',
      soldAt,
      lines: [{ productId: ids[name]!, name, unitPriceCents, quantity: units }],
    });
  }
  const ranking = (query: string, actor: Identity = admin) =>
    request(app)
      .get(`/api/v1/admin/dashboard/product-ranking?${query}`)
      .set('Cookie', actor.cookie);
  const baseQuery = (from: string, to: string, extra = '') =>
    `from=${from}&to=${to}&metric=units&direction=top${extra}`;
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
    app = createApp({
      authService: auth,
      salesService: new SalesService(new SalesRepository(db)),
      catalogRateLimit: 10000,
    });
    admin = await identity('admin-ranking', 'ADMINISTRADOR');
    cashier = await identity('cashier-ranking', 'CAJERO');
    prep = await identity('prep-ranking', 'PREPARACION');
    customer = await identity('Customer ranking', 'CLIENTE', '+520000000002');
    manager = await identity('manager-ranking', 'GERENTE');
    const pinRole = await db.role.findUniqueOrThrow({ where: { name: 'ADMINISTRADOR' } });
    const pinUser = await db.user.create({
      data: {
        name: 'pin-change-ranking',
        roleId: pinRole.id,
        accountType: 'STAFF',
        username: 'pin-change-ranking',
        passwordHash: 'fixture-not-used',
        mustChangePin: true,
      },
    });
    pinChange = await session(pinUser.id, 'ADMINISTRADOR');
    categoryId = (await db.category.findFirstOrThrow()).id;
    optionValueId = (await db.optionValue.findFirstOrThrow({ where: { name: 'Almendra' } })).id;
    cashSessionId = (
      await db.cashSession.create({
        data: { employeeId: cashier.principal.userId, openingAmountCents: 0n },
      })
    ).id;

    // Dataset principal: nombres iguales, empates, baja con snapshots, renombrado,
    // opción, producto no disponible y producto gratuito.
    for (const [key, name, extra] of [
      ['alpha', 'Mismo Nombre', {}],
      ['beta', 'Mismo Nombre', {}],
      ['gamma', 'Americano', {}],
      ['free', 'Gratis', {}],
      ['renamed', 'Renombrado actual', {}],
      [
        'deleted',
        'Descontinuado actual',
        { deletedAt: new Date('2027-06-03T00:00:00.000Z'), isAvailable: false },
      ],
      ['option', 'Con opción', {}],
      ['inactive', 'No disponible actual', { isAvailable: false }],
      ['noSale', 'Sin venta', {}],
      ['orphan', 'Intento sin venta', {}],
    ] as const) {
      ids[key] = (await makeProduct(name, extra)).id;
    }
    const coreAt = (hour: number, minute = 0) => new Date(Date.UTC(2027, 5, 1, hour, minute, 0, 0));
    await createSale({
      method: 'CASH',
      soldAt: coreAt(10),
      lines: [{ productId: ids.alpha!, name: 'Mismo Nombre', unitPriceCents: 3500n, quantity: 6 }],
      extraPendingPayment: true,
    });
    await createSale({
      method: 'STRIPE',
      soldAt: coreAt(10, 5),
      lines: [{ productId: ids.beta!, name: 'Mismo Nombre', unitPriceCents: 2500n, quantity: 3 }],
    });
    await createSale({
      method: 'CASH',
      soldAt: coreAt(10, 10),
      lines: [{ productId: ids.gamma!, name: 'Americano', unitPriceCents: 1500n, quantity: 3 }],
    });
    await createSale({
      method: 'CASH',
      soldAt: coreAt(10, 15),
      lines: [{ productId: ids.free!, name: 'Gratis', unitPriceCents: 0n, quantity: 1 }],
    });
    await createSale({
      method: 'CASH',
      soldAt: coreAt(10, 20),
      lines: [
        {
          productId: ids.renamed!,
          name: 'Nombre anterior',
          unitPriceCents: 3500n,
          quantity: 2,
        },
      ],
    });
    await createSale({
      method: 'CASH',
      soldAt: coreAt(8, 30),
      lines: [
        { productId: ids.deleted!, name: 'Nombre viejo', unitPriceCents: 1000n, quantity: 1 },
      ],
    });
    await createSale({
      method: 'CASH',
      soldAt: coreAt(9, 30),
      lines: [
        { productId: ids.deleted!, name: 'Nombre reciente', unitPriceCents: 1000n, quantity: 3 },
      ],
    });
    await createSale({
      method: 'STRIPE',
      soldAt: coreAt(10, 25),
      lines: [
        {
          productId: ids.option!,
          name: 'Con opción',
          unitPriceCents: 4000n,
          basePriceCents: 3500n,
          quantity: 1,
          option: true,
        },
      ],
    });
    await createSale({
      method: 'CASH',
      soldAt: coreAt(10, 30),
      lines: [
        {
          productId: ids.inactive!,
          name: 'No disponible actual',
          unitPriceCents: 1000n,
          quantity: 1,
        },
      ],
    });
    // Órdenes con items y pagos PENDING/FAILED/EXPIRED pero sin Sale: no cuentan.
    for (const [index, status, method] of [
      [0, 'PENDING', 'CASH'],
      [1, 'FAILED', 'STRIPE'],
      [2, 'EXPIRED', 'CASH'],
    ] as const)
      await createSale({
        method,
        soldAt: coreAt(9, 40 + index),
        lines: [
          { productId: ids.orphan!, name: 'Intento sin venta', unitPriceCents: 1000n, quantity: 1 },
        ],
        paymentStatus: status,
        createSale: false,
      });

    // Fronteras exactas con microsegundos de sold_at.
    ids.boundary = (await makeProduct('Frontera')).id;
    const boundaryAt = (hour: number, minute = 0, second = 0) =>
      new Date(Date.UTC(2027, 6, 1, hour, minute, second, 0));
    await one('boundary', 1, 100n, boundaryAt(8));
    const beforeRange = await one('boundary', 1, 100n, boundaryAt(7, 59, 59));
    await setSoldAt(beforeRange.sale!.id, '2027-07-01T07:59:59.999999Z');
    const lastMicrosecond = await one('boundary', 1, 100n, boundaryAt(10, 59, 59));
    await setSoldAt(lastMicrosecond.sale!.id, '2027-07-01T10:59:59.999999Z');
    await one('boundary', 1, 100n, boundaryAt(11));

    // D11: una Sale inconsistente con pago no SUCCEEDED se incluye por defecto.
    ids.inconsistent = (await makeProduct('Inconsistente D11')).id;
    await createSale({
      method: 'CASH',
      soldAt: new Date('2027-08-01T08:30:00.000Z'),
      lines: [
        {
          productId: ids.inconsistent!,
          name: 'Inconsistente D11',
          unitPriceCents: 1000n,
          quantity: 1,
        },
      ],
      paymentStatus: 'FAILED',
    });

    // ID mayor que Number.MAX_SAFE_INTEGER, sin convertir a Number.
    ids.large = (await makeProduct('ID grande', { id: 9007199254740993n })).id;
    await createSale({
      method: 'STRIPE',
      soldAt: new Date('2027-09-01T08:30:00.000Z'),
      lines: [{ productId: ids.large!, name: 'ID grande', unitPriceCents: 1500n, quantity: 2 }],
    });

    // Volumen: 22 productos y 110 ventas, más que top y que una página de /sales.
    for (let i = 1; i <= 22; i++) {
      const name = `Volumen ${String(i).padStart(2, '0')}`;
      ids[name] = (await makeProduct(name)).id;
      for (let j = 0; j < 5; j++)
        await one(name, 1, BigInt(100 + i), new Date(Date.UTC(2028, 1, 1, 7 + i, j, 0, 0)));
    }

    // Concurrencia acotada: cuatro productos en un periodo propio.
    for (const name of ['Concurrente A', 'Concurrente B', 'Concurrente C', 'Concurrente D'])
      ids[name] = (await makeProduct(name)).id;

    // Empates exactos de métrica primaria y secundaria: el nombre se compara
    // byte a byte (COLLATE "C") y, si coincide, el productId numérico decide.
    // Los IDs 1 000 000 y 999 999 demuestran que no se ordena como texto ni por
    // orden de inserción.
    ids.tieA = (await makeProduct('A')).id;
    ids.tieB = (await makeProduct('B')).id;
    ids.tieLower = (await makeProduct('a')).id;
    ids.tieSameHigh = (await makeProduct('Mismo Nombre', { id: 1_000_000n })).id;
    ids.tieSameLow = (await makeProduct('Mismo Nombre', { id: 999_999n })).id;
    for (const [index, key, name] of [
      [0, 'tieA', 'A'],
      [1, 'tieB', 'B'],
      [2, 'tieLower', 'a'],
      [3, 'tieSameHigh', 'Mismo Nombre'],
      [4, 'tieSameLow', 'Mismo Nombre'],
    ] as const)
      await createSale({
        method: index % 2 === 0 ? 'CASH' : 'STRIPE',
        soldAt: new Date(Date.UTC(2027, 9, 1, 8, index, 0, 0)),
        lines: [{ productId: ids[key]!, name, unitPriceCents: 100n, quantity: 1 }],
      });
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  it('exige sesión ADMINISTRADOR y responde 401/403/200 con cabeceras privadas', async () => {
    const query = baseQuery(coreFrom, coreTo);
    const unauthenticated = await request(app).get(
      `/api/v1/admin/dashboard/product-ranking?${query}`,
    );
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers['cache-control']).toBe('no-store');
    expect(unauthenticated.headers['referrer-policy']).toBe('no-referrer');
    for (const actor of [customer, cashier, prep, manager]) {
      const denied = await ranking(query, actor);
      expect(denied.status).toBe(403);
      expect(denied.body).toMatchObject({ code: 'FORBIDDEN', status: 403 });
      expect(denied.headers['cache-control']).toBe('no-store');
      expect(denied.headers['referrer-policy']).toBe('no-referrer');
    }
    const pinRequired = await ranking(query, pinChange);
    expect(pinRequired.status).toBe(403);
    expect(pinRequired.body).toMatchObject({ code: 'PIN_CHANGE_REQUIRED', status: 403 });
    expect(pinRequired.headers['cache-control']).toBe('no-store');
    expect(pinRequired.headers['referrer-policy']).toBe('no-referrer');
    const allowed = await ranking(query);
    expect(allowed.status).toBe(200);
    expect(allowed.headers['cache-control']).toBe('no-store');
    expect(allowed.headers['referrer-policy']).toBe('no-referrer');
    conform('/api/v1/admin/dashboard/product-ranking', 'get', '200', allowed.body);
  });

  it('rechaza entrada estricta, límites y body sin consultar', async () => {
    const valid = baseQuery(coreFrom, coreTo);
    for (const query of [
      '',
      `to=${coreTo}&metric=units&direction=top`,
      `from=${coreFrom}&metric=units&direction=top`,
      `from=${coreFrom}&to=${coreTo}&direction=top`,
      `from=${coreFrom}&to=${coreTo}&metric=units`,
      `from=${coreFrom}&to=${coreTo}&metric=totalCents&direction=top`,
      `from=${coreFrom}&to=${coreTo}&metric=units&direction=asc`,
      `${valid}&top=05`,
      `${valid}&top=+5`,
      `${valid}&top=5.0`,
      `${valid}&top=4`,
      `${valid}&top=0`,
      `${valid}&top=21`,
      `${valid}&category=1`,
      `${valid}&cursor=abc`,
      `${valid}&limit=20`,
      `${valid}&timeZone=UTC`,
      `${valid}&order=desc`,
      `${valid}&sort=units`,
      `${valid}&includeZeroSales=true`,
      `${valid}&method=`,
      `${valid}&method=null`,
      `from=${coreFrom}&from=${coreFrom}&to=${coreTo}&metric=units&direction=top`,
      `from[]=${coreFrom}&to=${coreTo}&metric=units&direction=top`,
      `from=${coreFrom}&to=${coreTo}&metric=units&direction=top&method[]=CASH`,
      `from=${coreFrom}&to=${coreTo}&metric=units&direction=top&top=5&top=5`,
      `from=2027-06-01T08:00:00.0000Z&to=${coreTo}&metric=units&direction=top`,
      `from=2027-06-01T08:00:00.000000Z&to=${coreTo}&metric=units&direction=top`,
      `from=2027-02-30T08:00:00.000Z&to=${coreTo}&metric=units&direction=top`,
      `from=2027-13-01T08:00:00.000Z&to=${coreTo}&metric=units&direction=top`,
      `from=2027-06-01T24:00:00.000Z&to=${coreTo}&metric=units&direction=top`,
      `from=2027-06-01T08:00:60.000Z&to=${coreTo}&metric=units&direction=top`,
      `from=2027-06-01T08:00:00+01:00&to=${coreTo}&metric=units&direction=top`,
      `from=${coreTo}&to=${coreFrom}&metric=units&direction=top`,
      `from=2000-01-01T07:59:59.999Z&to=${coreTo}&metric=units&direction=top`,
      `from=2000-01-01T00:00:00.000Z&to=${coreTo}&metric=units&direction=top`,
      `from=2024-01-01T08:00:00.000Z&to=2025-01-01T08:00:00.001Z&metric=units&direction=top`,
    ]) {
      const response = await ranking(query);
      expect(response.status, query).toBe(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
      expect(response.headers['cache-control'], query).toBe('no-store');
      expect(response.headers['referrer-policy'], query).toBe('no-referrer');
    }
    const bodyRejected = await ranking(valid).send({});
    expect(bodyRejected.status).toBe(400);
    expect(bodyRejected.headers['cache-control']).toBe('no-store');
    expect(bodyRejected.headers['referrer-policy']).toBe('no-referrer');
    const minimum = await ranking(
      baseQuery('2000-01-01T08:00:00.000Z', '2000-01-02T08:00:00.000Z'),
    );
    expect(minimum.status).toBe(200);
    expect(minimum.body.data.matchedProductCount).toBe('0');
    const maximum = await ranking(
      baseQuery('2024-01-01T08:00:00.000Z', '2025-01-01T08:00:00.000Z'),
    );
    expect(maximum.status).toBe(200);
  });

  it('agrega units/top por defecto, metadatos completos y empates estables', async () => {
    // El precio actual no sustituye el importe histórico de las líneas.
    await db.product.update({ where: { id: ids.renamed! }, data: { basePriceCents: 999_999n } });
    const response = await ranking(baseQuery(coreFrom, coreTo));
    expect(response.status).toBe(200);
    conform('/api/v1/admin/dashboard/product-ranking', 'get', '200', response.body);
    const data = response.body.data as RankingResponse['data'];
    expect(data.period).toEqual({
      from: coreFrom,
      to: coreTo,
      timeZone: 'America/Tijuana',
    });
    expect(data).toMatchObject({
      currency: 'MXN',
      method: null,
      metric: 'units',
      direction: 'top',
      top: '5',
      matchedProductCount: '8',
      matchedTotals: { unitsSold: '21', totalCents: '49000' },
      truncated: true,
    });
    expect(data.generatedAt).toMatch(/^[2-9]\d{3}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(data.items.map((item) => item.productId)).toEqual([
      ids.alpha!.toString(),
      ids.deleted!.toString(),
      ids.beta!.toString(),
      ids.gamma!.toString(),
      ids.renamed!.toString(),
    ]);
    expect(data.items.map((item) => item.unitsSold)).toEqual(['6', '4', '3', '3', '2']);
    expect(data.items.map((item) => item.position)).toEqual(['1', '2', '3', '4', '5']);
    // Nombres iguales se separan por ID, nunca por nombre.
    expect(data.items[0]).toMatchObject({
      name: 'Mismo Nombre',
      nameSource: 'current',
      totalCents: '21000',
    });
    expect(data.items[2]).toMatchObject({
      name: 'Mismo Nombre',
      nameSource: 'current',
      totalCents: '7500',
    });
    // Baja: snapshot más reciente por soldAt DESC, item_id DESC.
    expect(data.items[1]).toMatchObject({
      name: 'Nombre reciente',
      nameSource: 'snapshot',
      totalCents: '4000',
    });
    // Renombrado: nombre actual, importe histórico.
    expect(data.items[4]).toMatchObject({
      name: 'Renombrado actual',
      nameSource: 'current',
      totalCents: '7000',
    });
    for (const item of data.items) {
      expect(item.productId).toMatch(/^[1-9][0-9]*$/);
      expect(item.unitsSold).toMatch(/^(0|[1-9][0-9]*)$/);
      expect(item.totalCents).toMatch(/^(0|[1-9][0-9]*)$/);
    }
  });

  it('ordena amount/top y ambas direcciones bottom con desempate secundario', async () => {
    const amountTop = await ranking(
      baseQuery(coreFrom, coreTo).replace('metric=units', 'metric=amount'),
    );
    expect(amountTop.status).toBe(200);
    conform('/api/v1/admin/dashboard/product-ranking', 'get', '200', amountTop.body);
    expect(amountTop.body.data.metric).toBe('amount');
    expect(amountTop.body.data.matchedTotals).toEqual({
      unitsSold: '21',
      totalCents: '49000',
    });
    expect(amountTop.body.data.items.map((item: RankingItem) => item.productId)).toEqual([
      ids.alpha!.toString(),
      ids.beta!.toString(),
      ids.renamed!.toString(),
      ids.gamma!.toString(),
      ids.deleted!.toString(),
    ]);

    const unitsBottom = await ranking(
      `${baseQuery(coreFrom, coreTo).replace('direction=top', 'direction=bottom')}`,
    );
    expect(unitsBottom.status).toBe(200);
    expect(unitsBottom.body.data.direction).toBe('bottom');
    expect(unitsBottom.body.data.items.map((item: RankingItem) => item.productId)).toEqual([
      ids.free!.toString(),
      ids.inactive!.toString(),
      ids.option!.toString(),
      ids.renamed!.toString(),
      ids.gamma!.toString(),
    ]);
    // El producto gratuito tuvo movimiento: importe 0 no lo excluye de bottom.
    expect(unitsBottom.body.data.items[0]).toMatchObject({ unitsSold: '1', totalCents: '0' });
    // Nunca aparecen productos sin movimiento.
    expect(unitsBottom.body.data.items.map((item: RankingItem) => item.productId)).not.toContain(
      ids.noSale!.toString(),
    );

    const amountBottom = await ranking(
      baseQuery(coreFrom, coreTo)
        .replace('direction=top', 'direction=bottom')
        .replace('metric=units', 'metric=amount'),
    );
    expect(amountBottom.status).toBe(200);
    expect(amountBottom.body.data.items.map((item: RankingItem) => item.productId)).toEqual([
      ids.free!.toString(),
      ids.inactive!.toString(),
      ids.option!.toString(),
      ids.deleted!.toString(),
      ids.gamma!.toString(),
    ]);
    // Empate de importe 4000: unidades ascendentes en bottom ponen la opción antes.
    expect(amountBottom.body.data.items[2]).toMatchObject({ unitsSold: '1', totalCents: '4000' });
    expect(amountBottom.body.data.items[3]).toMatchObject({ unitsSold: '4', totalCents: '4000' });
  });

  it('desempata por nombre COLLATE "C" y productId numérico de forma repetible', async () => {
    const expected = [
      ids.tieA!.toString(),
      ids.tieB!.toString(),
      ids.tieSameLow!.toString(),
      ids.tieSameHigh!.toString(),
      ids.tieLower!.toString(),
    ];
    for (const query of [
      `${baseQuery(tieFrom, tieTo)}&top=20`,
      `${baseQuery(tieFrom, tieTo).replace('metric=units', 'metric=amount')}&top=20`,
      `${baseQuery(tieFrom, tieTo).replace('direction=top', 'direction=bottom')}&top=20`,
    ]) {
      const first = await ranking(query);
      expect(first.status, query).toBe(200);
      conform('/api/v1/admin/dashboard/product-ranking', 'get', '200', first.body);
      const repeated = await ranking(query);
      expect(repeated.status, query).toBe(200);
      expect(first.body.data.items.map((item: RankingItem) => item.productId)).toEqual(expected);
      expect(first.body.data.matchedProductCount).toBe('5');
      // Mismo resultado y orden en una segunda lectura, incluso con empate total.
      expect(repeated.body.data.items).toEqual(first.body.data.items);
    }
  });

  it('respeta top 5/10/20 y filtra por método sin mezclar subconjuntos', async () => {
    const top10 = await ranking(`${baseQuery(coreFrom, coreTo)}&top=10`);
    expect(top10.status).toBe(200);
    expect(top10.body.data.top).toBe('10');
    expect(top10.body.data.items).toHaveLength(8);
    expect(top10.body.data.truncated).toBe(false);
    expect(top10.body.data.matchedProductCount).toBe('8');
    expect(top10.body.data.matchedTotals).toEqual({
      unitsSold: '21',
      totalCents: '49000',
    });
    const top20 = await ranking(
      baseQuery(coreFrom, coreTo).replace('metric=units', 'metric=amount').concat('&top=20'),
    );
    expect(top20.status).toBe(200);
    expect(top20.body.data.top).toBe('20');
    expect(top20.body.data.items).toHaveLength(8);
    expect(top20.body.data.truncated).toBe(false);

    const cash = await ranking(`${baseQuery(coreFrom, coreTo)}&top=10&method=CASH`);
    expect(cash.status).toBe(200);
    expect(cash.body.data.method).toBe('CASH');
    expect(cash.body.data.matchedProductCount).toBe('6');
    expect(cash.body.data.matchedTotals).toEqual({
      unitsSold: '17',
      totalCents: '37500',
    });
    expect(cash.body.data.items.map((item: RankingItem) => item.productId)).not.toContain(
      ids.beta!.toString(),
    );
    expect(cash.body.data.items.map((item: RankingItem) => item.productId)).not.toContain(
      ids.option!.toString(),
    );
    const stripe = await ranking(`${baseQuery(coreFrom, coreTo)}&top=10&method=STRIPE`);
    expect(stripe.status).toBe(200);
    expect(stripe.body.data.method).toBe('STRIPE');
    expect(stripe.body.data.matchedProductCount).toBe('2');
    expect(stripe.body.data.matchedTotals).toEqual({
      unitsSold: '4',
      totalCents: '11500',
    });
    expect(stripe.body.data.items.map((item: RankingItem) => item.productId)).toEqual([
      ids.beta!.toString(),
      ids.option!.toString(),
    ]);
  });

  it('no multiplica opciones ni descuenta reembolsos', async () => {
    const before = await ranking(`${baseQuery(coreFrom, coreTo)}&top=10`);
    const option = before.body.data.items.find(
      (item: RankingItem) => item.productId === ids.option!.toString(),
    );
    expect(option).toMatchObject({ unitsSold: '1', totalCents: '4000' });
    const optionSale = await db.sale.findFirstOrThrow({
      where: {
        order: { order_item_orderId: { some: { productId: ids.option! } } },
        soldAt: { gte: new Date(coreFrom), lt: new Date(coreTo) },
      },
    });
    const optionItem = await db.orderItem.findFirstOrThrow({
      where: { orderId: optionSale.orderId, productId: ids.option! },
    });
    // Base 3500 + recargo 500 = 4000 ya están dentro del precio y del total de
    // la línea; la opción no se suma otra vez ni se multiplica por sus filas.
    expect(optionItem.basePriceCentsSnapshot).toBe(3500n);
    expect(optionItem.unitPriceCents).toBe(4000n);
    expect(optionItem.lineTotalCents).toBe(4000n);
    expect(await db.orderItemOption.count({ where: { orderItemId: optionItem.id } })).toBe(1);
    const alphaSale = await db.sale.findFirstOrThrow({
      where: {
        order: { order_item_orderId: { some: { productId: ids.alpha! } } },
        soldAt: { gte: new Date(coreFrom), lt: new Date(coreTo) },
      },
    });
    await db.refund.create({
      data: {
        paymentId: alphaSale.paymentId,
        amountCents: 1000n,
        reason: 'Fixture de reembolso; el bruto no se reduce',
        status: 'SUCCEEDED',
      },
    });
    const after = await ranking(`${baseQuery(coreFrom, coreTo)}&top=10`);
    expect(after.body.data.matchedTotals).toEqual(before.body.data.matchedTotals);
    expect(after.body.data.items).toEqual(before.body.data.items);
  });

  it('excluye órdenes/pagos sin Sale y conserva la Sale inconsistente (D11)', async () => {
    const core = await ranking(`${baseQuery(coreFrom, coreTo)}&top=20`);
    expect(core.status).toBe(200);
    expect(core.body.data.items.map((item: RankingItem) => item.productId)).not.toContain(
      ids.orphan!.toString(),
    );
    expect(core.body.data.matchedProductCount).toBe('8');
    const orphanSales = await db.sale.count({
      where: { order: { order_item_orderId: { some: { productId: ids.orphan! } } } },
    });
    expect(orphanSales).toBe(0);

    const d11 = await ranking(baseQuery(d11From, d11To));
    expect(d11.status).toBe(200);
    expect(d11.body.data.matchedProductCount).toBe('1');
    expect(d11.body.data.items).toEqual([
      expect.objectContaining({
        productId: ids.inconsistent!.toString(),
        unitsSold: '1',
        totalCents: '1000',
      }),
    ]);
    // La misma fila inconsistente también cuenta en el resumen y en /sales/summary.
    const summary = await request(app)
      .get(`/api/v1/admin/dashboard/summary?from=${d11From}&to=${d11To}`)
      .set('Cookie', admin.cookie);
    expect(summary.status).toBe(200);
    expect(summary.body.data.totalCents).toBe('1000');
    expect(summary.body.data.unitsSold).toBe('1');
    const salesSummary = await request(app)
      .get(`/api/v1/sales/summary?from=${d11From}&to=${d11To}`)
      .set('Cookie', admin.cookie);
    expect(salesSummary.status).toBe(200);
    expect(salesSummary.body.data.totalCents).toBe('1000');
  });

  it('incluye from y to−1 µs y excluye justo antes de from y to', async () => {
    const response = await ranking(baseQuery(boundaryFrom, boundaryTo));
    expect(response.status).toBe(200);
    expect(response.body.data.matchedProductCount).toBe('1');
    expect(response.body.data.matchedTotals).toEqual({
      unitsSold: '2',
      totalCents: '200',
    });
    expect(response.body.data.items).toEqual([
      expect.objectContaining({ productId: ids.boundary!.toString(), unitsSold: '2' }),
    ]);
  });

  it('devuelve cero resultados y método sin ventas sin 404 ni ceros ficticios', async () => {
    for (const query of [
      baseQuery(zeroFrom, zeroTo),
      baseQuery(zeroFrom, zeroTo).replace('direction=top', 'direction=bottom'),
      baseQuery(zeroFrom, zeroTo).replace('metric=units', 'metric=amount'),
      `${baseQuery(zeroFrom, zeroTo)}&method=STRIPE`,
    ]) {
      const response = await ranking(query);
      expect(response.status, query).toBe(200);
      conform('/api/v1/admin/dashboard/product-ranking', 'get', '200', response.body);
      expect(response.body.data).toMatchObject({
        matchedProductCount: '0',
        matchedTotals: { unitsSold: '0', totalCents: '0' },
        truncated: false,
        items: [],
      });
    }
  });

  it('conserva IDs mayores que Number.MAX_SAFE_INTEGER como strings exactos', async () => {
    const response = await ranking(baseQuery(largeFrom, largeTo));
    expect(response.status).toBe(200);
    expect(response.body.data.items).toEqual([
      expect.objectContaining({
        productId: '9007199254740993',
        unitsSold: '2',
        totalCents: '3000',
      }),
    ]);
  });

  it('agrega más de 20 productos y 100 ventas antes del corte', async () => {
    const response = await ranking(`${baseQuery(volumeFrom, volumeTo)}&top=20`);
    expect(response.status).toBe(200);
    conform('/api/v1/admin/dashboard/product-ranking', 'get', '200', response.body);
    expect(response.body.data.matchedProductCount).toBe('22');
    expect(response.body.data.items).toHaveLength(20);
    expect(response.body.data.truncated).toBe(true);
    expect(response.body.data.matchedTotals).toEqual({
      unitsSold: '110',
      totalCents: '12265',
    });
    const [expected] = await db.$queryRaw<
      { products: string; units: string; cents: string }[]
    >`SELECT count(DISTINCT oi.product_id)::text AS products,
        coalesce(sum(oi.quantity),0)::text AS units,
        coalesce(sum(oi.line_total_cents),0)::text AS cents
      FROM sales s JOIN order_items oi ON oi.order_id=s.order_id
      WHERE s.sold_at >= ${new Date(volumeFrom)} AND s.sold_at < ${new Date(volumeTo)}`;
    expect(response.body.data.matchedProductCount).toBe(expected!.products);
    expect(response.body.data.matchedTotals).toEqual({
      unitsSold: expected!.units,
      totalCents: expected!.cents,
    });
    // El orden por métrica primaria y secundaria expone los 20 mayores importes.
    const amounts = response.body.data.items.map((item: RankingItem) => BigInt(item.totalCents));
    expect(amounts).toEqual([...amounts].sort((left, right) => (left > right ? -1 : 1)));
  });

  it('concilia con resumen administrativo y /sales/summary por método', async () => {
    for (const methodQuery of ['', '&method=CASH', '&method=STRIPE']) {
      const rankingResponse = await ranking(`${baseQuery(coreFrom, coreTo)}&top=20${methodQuery}`);
      expect(rankingResponse.status).toBe(200);
      const summary = await request(app)
        .get(`/api/v1/admin/dashboard/summary?from=${coreFrom}&to=${coreTo}${methodQuery}`)
        .set('Cookie', admin.cookie);
      expect(summary.status).toBe(200);
      const salesSummary = await request(app)
        .get(`/api/v1/sales/summary?from=${coreFrom}&to=${coreTo}${methodQuery}`)
        .set('Cookie', admin.cookie);
      expect(salesSummary.status).toBe(200);
      expect(rankingResponse.body.data.matchedTotals.totalCents).toBe(summary.body.data.totalCents);
      expect(rankingResponse.body.data.matchedTotals.unitsSold).toBe(summary.body.data.unitsSold);
      expect(rankingResponse.body.data.matchedTotals.totalCents).toBe(
        salesSummary.body.data.totalCents,
      );
    }
  });

  it('mantiene coherencia interna con ventas concurrentes', async () => {
    const names = ['Concurrente A', 'Concurrente B', 'Concurrente C', 'Concurrente D'];
    const coherent = (data: RankingResponse['data']) => {
      expect(data.truncated).toBe(false);
      expect(data.matchedProductCount).toBe(String(data.items.length));
      const totals = data.items.reduce(
        (sum, item) => ({
          units: sum.units + BigInt(item.unitsSold),
          cents: sum.cents + BigInt(item.totalCents),
        }),
        { units: 0n, cents: 0n },
      );
      expect(totals).toEqual({
        units: BigInt(data.matchedTotals.unitsSold),
        cents: BigInt(data.matchedTotals.totalCents),
      });
    };
    const inserts = Array.from({ length: 12 }, (_, index) => {
      const name = names[index % names.length]!;
      return one(
        name,
        1 + (index % 3),
        BigInt(500 + index),
        new Date(Date.UTC(2029, 2, 1, 8, index, 0, 0)),
      );
    });
    const reads = Array.from({ length: 6 }, async () => {
      const response = await ranking(`${baseQuery(concurrentFrom, concurrentTo)}&top=20`);
      expect(response.status).toBe(200);
      coherent(response.body.data);
      return response.body.data.matchedTotals;
    });
    const results = await Promise.all([...inserts, ...reads]);
    expect(results.slice(inserts.length)).toHaveLength(6);
    const final = await ranking(`${baseQuery(concurrentFrom, concurrentTo)}&top=20`);
    expect(final.status).toBe(200);
    coherent(final.body.data);
    const [expected] = await db.$queryRaw<{ units: string; cents: string }[]>`
      SELECT coalesce(sum(oi.quantity),0)::text AS units,
             coalesce(sum(oi.line_total_cents),0)::text AS cents
      FROM sales s JOIN order_items oi ON oi.order_id=s.order_id
      WHERE s.sold_at >= ${new Date(concurrentFrom)} AND s.sold_at < ${new Date(concurrentTo)}`;
    expect(final.body.data.matchedTotals).toEqual({
      unitsSold: expected!.units,
      totalCents: expected!.cents,
    });
  });

  it('sanea 503 de dependencia, 500 interno y 429 sin filtrar detalles', async () => {
    const query = baseQuery(coreFrom, coreTo);
    const path = `/api/v1/admin/dashboard/product-ranking?${query}`;
    const dependency = createApp({
      authService: auth,
      salesService: {
        async productRanking() {
          throw Object.assign(new Error('secret-db-detail'), { code: 'P1001' });
        },
      } as never,
      catalogRateLimit: 10000,
    });
    const unavailable = await request(dependency).get(path).set('Cookie', admin.cookie);
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers['content-type']).toContain('application/problem+json');
    expect(unavailable.headers['cache-control']).toBe('no-store');
    expect(unavailable.headers['referrer-policy']).toBe('no-referrer');
    expect(unavailable.body).toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE', status: 503 });
    expect(JSON.stringify(unavailable.body)).not.toContain('secret-db-detail');

    const internal = createApp({
      authService: auth,
      salesService: {
        async productRanking() {
          throw new Error('secret-internal-detail');
        },
      } as never,
      catalogRateLimit: 10000,
    });
    const unexpected = await request(internal).get(path).set('Cookie', admin.cookie);
    expect(unexpected.status).toBe(500);
    expect(unexpected.headers['cache-control']).toBe('no-store');
    expect(unexpected.headers['referrer-policy']).toBe('no-referrer');
    expect(unexpected.body).toMatchObject({ code: 'INTERNAL_ERROR', status: 500 });
    expect(JSON.stringify(unexpected.body)).not.toContain('secret-internal-detail');

    const limited = createApp({
      authService: auth,
      salesService: {
        async productRanking() {
          return { data: {} };
        },
      } as never,
      catalogRateLimit: 1,
    });
    expect((await request(limited).get(path).set('Cookie', admin.cookie)).status).toBe(200);
    const throttled = await request(limited).get(path).set('Cookie', admin.cookie);
    expect(throttled.status).toBe(429);
    expect(throttled.headers['cache-control']).toBe('no-store');
    expect(throttled.headers['referrer-policy']).toBe('no-referrer');
    expect(throttled.body).toMatchObject({ code: 'RATE_LIMITED', status: 429 });

    const oversized = await request(app)
      .get(path)
      .set('Cookie', admin.cookie)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ payload: 'a'.repeat(300_000) }));
    expect(oversized.status).toBe(413);
    expect(oversized.body).toMatchObject({ code: 'PAYLOAD_TOO_LARGE', status: 413 });
    expect(oversized.headers['cache-control']).toBe('no-store');
    expect(oversized.headers['referrer-policy']).toBe('no-referrer');

    const badOrigin = await request(app)
      .get(path)
      .set('Cookie', admin.cookie)
      .set('Origin', 'https://evil.test');
    expect(badOrigin.status).toBe(403);
    expect(badOrigin.body).toMatchObject({ code: 'ORIGIN_NOT_ALLOWED', status: 403 });
    expect(badOrigin.headers['cache-control']).toBe('no-store');
    expect(badOrigin.headers['referrer-policy']).toBe('no-referrer');
  });
});

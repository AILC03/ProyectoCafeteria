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
import { AdminRepository } from '../../src/modules/catalog/admin.repository.js';
import { AdminService } from '../../src/modules/catalog/admin.service.js';
import { SalesRepository, SalesService } from '../../src/modules/sales/sales.service.js';

const target = process.env.CATALOG_TEST_DATABASE_URL,
  origin = 'http://localhost:5173';
type Identity = { principal: Principal; cookie: string; csrf: string };
type SaleOptions = {
  method: 'CASH' | 'STRIPE';
  soldAt: Date;
  totalCents: bigint;
  quantities: number[];
  option?: boolean;
  pendingPayment?: boolean;
};

describe.skipIf(!target)('DA-001 E2: series con HTTP y PostgreSQL aislado', () => {
  let db: ReturnType<typeof createDatabase>,
    auth: AuthService,
    app: ReturnType<typeof createApp>,
    water: string,
    optionValue: string,
    cashSessionId: bigint;
  const time = Date.UTC(2026, 10, 24, 18, 30, 0, 0),
    now = () => new Date(time);
  let admin: Identity, cashier: Identity, prep: Identity, customer: Identity, pinChange: Identity;
  let api: Awaited<ReturnType<typeof SwaggerParser.dereference>>;
  const ajv = new Ajv({ strict: false });
  addFormats.default(ajv);
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
  async function createSale(options: SaleOptions) {
    const order = await db.order.create({
      data: {
        folio: `SER-${randomUUID().slice(0, 8)}`,
        source: 'CASHIER',
        status: 'EN_PREPARACION',
        paymentMethod: options.method,
        totalCents: options.totalCents,
        cashQrTokenHash: options.method === 'CASH' ? randomBytes(32).toString('hex') : null,
        paymentExpiresAt: new Date(options.soldAt.getTime() + 3600000),
        paidAt: options.soldAt,
      },
    });
    const items = [];
    for (const quantity of options.quantities) {
      items.push(
        await db.orderItem.create({
          data: {
            orderId: order.id,
            productId: BigInt(water),
            productNameSnapshot: 'Agua (demo)',
            basePriceCentsSnapshot: 1000n,
            unitPriceCents: 1000n,
            quantity,
            lineTotalCents: 1000n * BigInt(quantity),
          },
        }),
      );
    }
    const first = items[0];
    if (options.option && first)
      await db.orderItemOption.create({
        data: {
          orderItemId: first.id,
          optionValueId: BigInt(optionValue),
          groupNameSnapshot: 'Leche (demo)',
          optionNameSnapshot: 'Entera',
          surchargeCentsSnapshot: 0n,
        },
      });
    const payment = await db.payment.create({
      data: {
        orderId: order.id,
        method: options.method,
        status: 'SUCCEEDED',
        amountCents: options.totalCents,
        ...(options.method === 'CASH'
          ? {
              cashierId: cashier.principal.userId,
              cashSessionId,
              cashReceivedCents: options.totalCents,
              changeCents: 0n,
            }
          : {}),
        confirmedAt: options.soldAt,
      },
    });
    if (options.pendingPayment)
      await db.payment.create({
        data: {
          orderId: order.id,
          method: options.method,
          status: 'PENDING',
          amountCents: options.totalCents,
          ...(options.method === 'CASH'
            ? {
                cashierId: cashier.principal.userId,
                cashSessionId,
                cashReceivedCents: options.totalCents,
                changeCents: 0n,
              }
            : {}),
        },
      });
    return db.sale.create({
      data: {
        saleNumber: `SER-${randomUUID().slice(0, 8)}`,
        orderId: order.id,
        paymentId: payment.id,
        totalCents: options.totalCents,
        soldAt: options.soldAt,
      },
    });
  }
  async function setSoldAt(saleId: bigint, instant: string) {
    await db.$executeRaw`UPDATE sales SET sold_at = ${instant}::timestamptz WHERE id = ${saleId}`;
  }
  const series = (query: string, actor: Identity = admin) =>
    request(app).get(`/api/v1/admin/dashboard/sales-series?${query}`).set('Cookie', actor.cookie);
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
      adminService: new AdminService(new AdminRepository(db)),
      salesService: new SalesService(new SalesRepository(db)),
      catalogRateLimit: 10000,
    });
    admin = await identity('admin-series', 'ADMINISTRADOR');
    cashier = await identity('cashier-series', 'CAJERO');
    prep = await identity('prep-series', 'PREPARACION');
    customer = await identity('Customer series', 'CLIENTE', '+520000000001');
    const pinRole = await db.role.findUniqueOrThrow({ where: { name: 'ADMINISTRADOR' } });
    const pinUser = await db.user.create({
      data: {
        name: 'pin-change-series',
        roleId: pinRole.id,
        accountType: 'STAFF',
        username: 'pin-change-series',
        passwordHash: 'fixture-not-used',
        mustChangePin: true,
      },
    });
    pinChange = await session(pinUser.id, 'ADMINISTRADOR');
    water = (await db.product.findFirstOrThrow({ where: { name: 'Agua (demo)' } })).id.toString();
    optionValue = (
      await db.optionValue.findFirstOrThrow({ where: { name: 'Entera' } })
    ).id.toString();
    cashSessionId = (
      await db.cashSession.create({
        data: { employeeId: cashier.principal.userId, openingAmountCents: 0n },
      })
    ).id;

    const at = (hour: number, minute = 0, second = 0) =>
      new Date(Date.UTC(2026, 10, 24, hour, minute, second, 0));
    // Frontera from incluida, varias líneas, opción y pago pendiente sin multiplicar.
    await createSale({
      method: 'CASH',
      soldAt: at(8),
      totalCents: 4000n,
      quantities: [2, 1],
      option: true,
      pendingPayment: true,
    });
    await createSale({ method: 'STRIPE', soldAt: at(9), totalCents: 4500n, quantities: [1] });
    await createSale({ method: 'STRIPE', soldAt: at(10, 30), totalCents: 500n, quantities: [2] });
    // Justo antes de from, en to-1 µs y en to exacto.
    const before = await createSale({
      method: 'CASH',
      soldAt: at(7, 59, 59),
      totalCents: 999n,
      quantities: [9],
    });
    await setSoldAt(before.id, '2026-11-24T07:59:59.999999Z');
    const lastMicrosecond = await createSale({
      method: 'CASH',
      soldAt: at(10, 59, 59),
      totalCents: 100n,
      quantities: [1],
    });
    await setSoldAt(lastMicrosecond.id, '2026-11-24T10:59:59.999999Z');
    await createSale({ method: 'CASH', soldAt: at(11), totalCents: 777n, quantities: [1] });

    // Otoño: misma hora local repetida con dos instantes UTC distintos.
    await createSale({
      method: 'STRIPE',
      soldAt: new Date('2026-11-01T08:30:00.000Z'),
      totalCents: 100n,
      quantities: [1],
    });
    await createSale({
      method: 'CASH',
      soldAt: new Date('2026-11-01T09:30:00.000Z'),
      totalCents: 200n,
      quantities: [1],
    });

    // S03 exacto del contrato: parciales CASH/STRIPE con método omitido.
    await createSale({
      method: 'CASH',
      soldAt: new Date('2026-11-25T08:30:00.000Z'),
      totalCents: 4000n,
      quantities: [2],
    });
    await createSale({
      method: 'STRIPE',
      soldAt: new Date('2026-11-25T09:05:00.000Z'),
      totalCents: 4500n,
      quantities: [1],
    });
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  it('exige sesión ADMINISTRADOR y responde 401/403/200 con cabeceras privadas', async () => {
    const query = 'from=2026-11-24T08:00:00.000Z&to=2026-11-24T09:00:00.000Z&granularity=hour';
    const unauthenticated = await request(app).get(`/api/v1/admin/dashboard/sales-series?${query}`);
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers['cache-control']).toBe('no-store');
    expect(unauthenticated.headers['referrer-policy']).toBe('no-referrer');
    for (const actor of [customer, cashier, prep]) {
      const denied = await series(query, actor);
      expect(denied.status).toBe(403);
      expect(denied.body).toMatchObject({ code: 'FORBIDDEN', status: 403 });
      expect(denied.headers['cache-control']).toBe('no-store');
      expect(denied.headers['referrer-policy']).toBe('no-referrer');
    }
    const pinRequired = await series(query, pinChange);
    expect(pinRequired.status).toBe(403);
    expect(pinRequired.body).toMatchObject({ code: 'PIN_CHANGE_REQUIRED', status: 403 });
    expect(pinRequired.headers['cache-control']).toBe('no-store');
    expect(pinRequired.headers['referrer-policy']).toBe('no-referrer');
    const allowed = await series(query);
    expect(allowed.status).toBe(200);
    expect(allowed.headers['cache-control']).toBe('no-store');
    expect(allowed.headers['referrer-policy']).toBe('no-referrer');
    conform('/api/v1/admin/dashboard/sales-series', 'get', '200', allowed.body);
  });

  it('rechaza entradas estrictas, imposibles, límites y body sin consultar', async () => {
    const valid = 'from=2026-11-24T08:00:00.000Z&to=2026-11-24T09:00:00.000Z';
    for (const query of [
      '',
      `to=2026-11-24T09:00:00.000Z&granularity=hour`,
      `from=2026-11-24T08:00:00.000Z&granularity=hour`,
      `${valid}`,
      `${valid}&granularity=week`,
      `${valid}&granularity=hour&metric=totalCents`,
      `${valid}&granularity=hour&category=1`,
      `${valid}&granularity=hour&cursor=abc`,
      `${valid}&granularity=hour&limit=20`,
      `${valid}&granularity=hour&timeZone=UTC`,
      `${valid}&granularity=hour&method=`,
      `${valid}&granularity=hour&method=null`,
      `from=2026-11-24T08:00:00.000Z&from=2026-11-24T08:00:00.000Z&to=2026-11-24T09:00:00.000Z&granularity=hour`,
      `from=2026-11-24T08:00:00.0000Z&to=2026-11-24T09:00:00.000Z&granularity=hour`,
      `from=2026-11-24T08:00:00.000000Z&to=2026-11-24T09:00:00.000Z&granularity=hour`,
      `from=2026-02-30T08:00:00.000Z&to=2026-03-01T08:00:00.000Z&granularity=hour`,
      `from=2026-13-01T08:00:00.000Z&to=2026-13-02T08:00:00.000Z&granularity=hour`,
      `from=2026-11-24T24:00:00.000Z&to=2026-11-25T08:00:00.000Z&granularity=hour`,
      `from=2026-11-24T08:00:60.000Z&to=2026-11-25T08:00:00.000Z&granularity=hour`,
      `from=2026-11-24T08:00:00+01:00&to=2026-11-24T09:00:00.000Z&granularity=hour`,
      `from=2026-11-25T08:00:00.000Z&to=2026-11-24T08:00:00.000Z&granularity=hour`,
      `from=2000-01-01T07:59:59.999Z&to=2026-11-24T09:00:00.000Z&granularity=hour`,
      `from=2000-01-01T00:00:00.000Z&to=2026-11-24T09:00:00.000Z&granularity=hour`,
      `from=2026-01-01T00:00:00.000Z&to=2026-02-01T00:00:00.001Z&granularity=hour`,
      `from=2024-01-01T08:00:00.000Z&to=2025-01-01T08:00:00.001Z&granularity=day`,
      `from=9999-12-31T08:00:00.000Z&to=9999-12-31T20:00:00.000Z&granularity=day`,
      `from[]=2026-11-24T08:00:00.000Z&to=2026-11-24T09:00:00.000Z&granularity=hour`,
      `from=2026-11-24T08:00:00.000Z&to=2026-11-24T09:00:00.000Z&granularity=hour&method[]=CASH`,
    ]) {
      const response = await series(query);
      expect(response.status, query).toBe(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
      // El middleware privado de ruta cubre también los 400 de validación.
      expect(response.headers['cache-control'], query).toBe('no-store');
      expect(response.headers['referrer-policy'], query).toBe('no-referrer');
    }
    expect(
      (
        await request(app)
          .get(`/api/v1/admin/dashboard/sales-series?${valid}&granularity=hour`)
          .set('Cookie', admin.cookie)
      ).status,
    ).toBe(200);
    const bodyRejected = await series(`${valid}&granularity=hour`).send({});
    expect(bodyRejected.status).toBe(400);
    expect(bodyRejected.headers['cache-control']).toBe('no-store');
    expect(bodyRejected.headers['referrer-policy']).toBe('no-referrer');
    expect(
      (await series('from=2000-01-01T08:00:00.000Z&to=2000-01-02T08:00:00.000Z&granularity=day'))
        .status,
    ).toBe(200);
    expect(
      (await series('from=2026-01-01T00:00:00.000Z&to=2026-02-01T00:00:00.000Z&granularity=hour'))
        .body.data.bucketCount,
    ).toBe('744');
    expect(
      (await series('from=2026-01-01T00:30:00.000Z&to=2026-02-01T00:30:00.000Z&granularity=hour'))
        .body.data.bucketCount,
    ).toBe('745');
    expect(
      (await series('from=2024-01-01T08:00:00.000Z&to=2025-01-01T08:00:00.000Z&granularity=day'))
        .body.data.bucketCount,
    ).toBe('366');
  });

  it('agrega buckets, fronteras microsegundo, unidades y concilia con resumen', async () => {
    const query = 'from=2026-11-24T08:00:00.000Z&to=2026-11-24T11:00:00.000Z&granularity=hour';
    const response = await series(query);
    expect(response.status).toBe(200);
    conform('/api/v1/admin/dashboard/sales-series', 'get', '200', response.body);
    const { data } = response.body;
    expect(data.period).toEqual({
      from: '2026-11-24T08:00:00.000Z',
      to: '2026-11-24T11:00:00.000Z',
      timeZone: 'America/Tijuana',
    });
    expect(data.method).toBeNull();
    expect(data.granularity).toBe('hour');
    expect(data.bucketCount).toBe('3');
    expect(data.totals).toEqual({ totalCents: '9100', ticketCount: '4', unitsSold: '7' });
    expect(data.buckets).toHaveLength(3);
    expect(data.buckets.map((bucket: { totalCents: string }) => bucket.totalCents)).toEqual([
      '4000',
      '4500',
      '600',
    ]);
    expect(data.buckets.map((bucket: { ticketCount: string }) => bucket.ticketCount)).toEqual([
      '1',
      '1',
      '2',
    ]);
    expect(data.buckets.map((bucket: { unitsSold: string }) => bucket.unitsSold)).toEqual([
      '3',
      '1',
      '3',
    ]);
    // La venta en to-1 µs se incluye; las de justo antes de from y en to no.
    expect(data.buckets[2].totalCents).toBe('600');
    for (const bucket of data.buckets) {
      expect(bucket.localStart).toMatch(
        /^[2-9]\d{3}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):00:00-0[78]:00$/,
      );
      for (const key of ['totalCents', 'ticketCount', 'unitsSold'])
        expect(bucket[key]).toMatch(/^(0|[1-9][0-9]*)$/);
    }
    expect(data.buckets[0]).toMatchObject({
      start: '2026-11-24T08:00:00.000Z',
      end: '2026-11-24T09:00:00.000Z',
      localStart: '2026-11-24T00:00:00-08:00',
      effectiveFrom: '2026-11-24T08:00:00.000Z',
      effectiveTo: '2026-11-24T09:00:00.000Z',
      partial: false,
    });

    // Reembolso: el importe bruto histórico no se reduce.
    const sale = await db.sale.findFirstOrThrow({
      where: {
        soldAt: {
          gte: new Date('2026-11-24T08:00:00.000Z'),
          lt: new Date('2026-11-24T09:00:00.000Z'),
        },
      },
    });
    await db.refund.create({
      data: {
        paymentId: sale.paymentId,
        amountCents: 1n,
        reason: 'Fixture de reembolso; el bruto no se reduce',
        status: 'SUCCEEDED',
      },
    });
    const afterRefund = await series(query);
    expect(afterRefund.body.data.totals).toEqual(data.totals);

    // Conciliación exacta con resumen completo E1 por método y sin método.
    for (const [methodQuery, expected] of [
      ['', { totalCents: '9100', ticketCount: '4', unitsSold: '7' }],
      ['&method=CASH', { totalCents: '4100', ticketCount: '2', unitsSold: '4' }],
      ['&method=STRIPE', { totalCents: '5000', ticketCount: '2', unitsSold: '3' }],
    ] as const) {
      const seriesResponse = await series(`${query}${methodQuery}`);
      expect(seriesResponse.status).toBe(200);
      expect(seriesResponse.body.data.totals).toEqual(expected);
      const summary = await request(app)
        .get(
          `/api/v1/admin/dashboard/summary?from=2026-11-24T08:00:00.000Z&to=2026-11-24T11:00:00.000Z${methodQuery}`,
        )
        .set('Cookie', admin.cookie);
      expect(summary.status).toBe(200);
      expect(seriesResponse.body.data.totals.totalCents).toBe(summary.body.data.totalCents);
      expect(seriesResponse.body.data.totals.ticketCount).toBe(summary.body.data.ticketCount);
      expect(seriesResponse.body.data.totals.unitsSold).toBe(summary.body.data.unitsSold);
      const salesSummary = await request(app)
        .get(
          `/api/v1/sales/summary?from=2026-11-24T08:00:00.000Z&to=2026-11-24T11:00:00.000Z${methodQuery}`,
        )
        .set('Cookie', admin.cookie);
      expect(salesSummary.status).toBe(200);
      expect(seriesResponse.body.data.totals.totalCents).toBe(salesSummary.body.data.totalCents);
      expect(seriesResponse.body.data.totals.ticketCount).toBe(salesSummary.body.data.count);
    }
  });

  it('incluye buckets vacíos y parciales por recorte de rango', async () => {
    const response = await series(
      'from=2026-11-24T08:15:00.000Z&to=2026-11-24T09:15:00.000Z&granularity=hour',
    );
    expect(response.status).toBe(200);
    const { data } = response.body;
    expect(data.bucketCount).toBe('2');
    expect(data.buckets[0]).toMatchObject({
      start: '2026-11-24T08:00:00.000Z',
      end: '2026-11-24T09:00:00.000Z',
      effectiveFrom: '2026-11-24T08:15:00.000Z',
      effectiveTo: '2026-11-24T09:00:00.000Z',
      partial: true,
      totalCents: '0',
      ticketCount: '0',
      unitsSold: '0',
    });
    expect(data.buckets[1]).toMatchObject({
      effectiveFrom: '2026-11-24T09:00:00.000Z',
      effectiveTo: '2026-11-24T09:15:00.000Z',
      partial: true,
      totalCents: '4500',
      ticketCount: '1',
      unitsSold: '1',
    });
    expect(data.totals).toEqual({ totalCents: '4500', ticketCount: '1', unitsSold: '1' });
  });

  it('reproduce el ejemplo parcial CASH/STRIPE exacto del contrato (S03)', async () => {
    const query = 'from=2026-11-25T08:15:00.000Z&to=2026-11-25T09:15:00.000Z&granularity=hour';
    const mixed = await series(query);
    expect(mixed.status).toBe(200);
    expect(mixed.body.data.method).toBeNull();
    expect(mixed.body.data.bucketCount).toBe('2');
    expect(mixed.body.data.buckets).toEqual([
      expect.objectContaining({
        start: '2026-11-25T08:00:00.000Z',
        end: '2026-11-25T09:00:00.000Z',
        effectiveFrom: '2026-11-25T08:15:00.000Z',
        effectiveTo: '2026-11-25T09:00:00.000Z',
        partial: true,
        totalCents: '4000',
        ticketCount: '1',
        unitsSold: '2',
      }),
      expect.objectContaining({
        start: '2026-11-25T09:00:00.000Z',
        end: '2026-11-25T10:00:00.000Z',
        effectiveFrom: '2026-11-25T09:00:00.000Z',
        effectiveTo: '2026-11-25T09:15:00.000Z',
        partial: true,
        totalCents: '4500',
        ticketCount: '1',
        unitsSold: '1',
      }),
    ]);
    expect(mixed.body.data.totals).toEqual({
      totalCents: '8500',
      ticketCount: '2',
      unitsSold: '3',
    });

    const cash = await series(`${query}&method=CASH`);
    expect(
      cash.body.data.buckets.map((bucket: { totalCents: string }) => bucket.totalCents),
    ).toEqual(['4000', '0']);
    expect(cash.body.data.totals).toEqual({
      totalCents: '4000',
      ticketCount: '1',
      unitsSold: '2',
    });
    const stripe = await series(`${query}&method=STRIPE`);
    expect(
      stripe.body.data.buckets.map((bucket: { totalCents: string }) => bucket.totalCents),
    ).toEqual(['0', '4500']);
    expect(stripe.body.data.totals).toEqual({
      totalCents: '4500',
      ticketCount: '1',
      unitsSold: '1',
    });
  });

  it('respeta DST de primavera y otoño y la hora local repetida', async () => {
    const springHour = await series(
      'from=2026-03-08T08:00:00.000Z&to=2026-03-09T07:00:00.000Z&granularity=hour',
    );
    expect(springHour.status).toBe(200);
    conform('/api/v1/admin/dashboard/sales-series', 'get', '200', springHour.body);
    expect(springHour.body.data.bucketCount).toBe('23');
    expect(
      springHour.body.data.buckets.map((bucket: { localStart: string }) => bucket.localStart),
    ).toContain('2026-03-08T01:00:00-08:00');
    expect(
      springHour.body.data.buckets.map((bucket: { localStart: string }) => bucket.localStart),
    ).toContain('2026-03-08T03:00:00-07:00');
    expect(
      springHour.body.data.buckets.some((bucket: { localStart: string }) =>
        bucket.localStart.startsWith('2026-03-08T02:'),
      ),
    ).toBe(false);
    const springDay = await series(
      'from=2026-03-08T08:00:00.000Z&to=2026-03-09T07:00:00.000Z&granularity=day',
    );
    expect(springDay.body.data.bucketCount).toBe('1');
    expect(
      new Date(springDay.body.data.buckets[0].end).getTime() -
        new Date(springDay.body.data.buckets[0].start).getTime(),
    ).toBe(23 * 3600000);

    const autumn = await series(
      'from=2026-11-01T08:00:00.000Z&to=2026-11-01T10:00:00.000Z&granularity=hour',
    );
    expect(autumn.status).toBe(200);
    expect(autumn.body.data.bucketCount).toBe('2');
    expect(autumn.body.data.totals).toEqual({
      totalCents: '300',
      ticketCount: '2',
      unitsSold: '2',
    });
    expect(autumn.body.data.buckets).toEqual([
      expect.objectContaining({
        start: '2026-11-01T08:00:00.000Z',
        localStart: '2026-11-01T01:00:00-07:00',
        totalCents: '100',
        ticketCount: '1',
        unitsSold: '1',
      }),
      expect.objectContaining({
        start: '2026-11-01T09:00:00.000Z',
        localStart: '2026-11-01T01:00:00-08:00',
        totalCents: '200',
        ticketCount: '1',
        unitsSold: '1',
      }),
    ]);
    const autumnDay = await series(
      'from=2026-11-01T07:00:00.000Z&to=2026-11-02T08:00:00.000Z&granularity=day',
    );
    expect(autumnDay.body.data.bucketCount).toBe('1');
    expect(
      new Date(autumnDay.body.data.buckets[0].end).getTime() -
        new Date(autumnDay.body.data.buckets[0].start).getTime(),
    ).toBe(25 * 3600000);
    expect(autumnDay.body.data.totals).toEqual({
      totalCents: '300',
      ticketCount: '2',
      unitsSold: '2',
    });
  });

  it('mantiene el DTO canónico sin Number en agregados vacíos y grandes', async () => {
    const response = await series(
      'from=2000-01-01T08:00:00.000Z&to=2000-01-02T08:00:00.000Z&granularity=day',
    );
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      currency: 'MXN',
      bucketCount: '1',
      totals: { totalCents: '0', ticketCount: '0', unitsSold: '0' },
      buckets: [
        {
          start: '2000-01-01T08:00:00.000Z',
          end: '2000-01-02T08:00:00.000Z',
          localStart: '2000-01-01T00:00:00-08:00',
          effectiveFrom: '2000-01-01T08:00:00.000Z',
          effectiveTo: '2000-01-02T08:00:00.000Z',
          partial: false,
          totalCents: '0',
          ticketCount: '0',
          unitsSold: '0',
        },
      ],
    });
    expect(response.body.data.generatedAt).toMatch(
      /^[2-9]\d{3}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });

  it('mantiene coherencia interna con ventas concurrentes (S14)', async () => {
    const from = '2030-02-01T08:00:00.000Z',
      to = '2030-02-01T11:00:00.000Z',
      query = `from=${from}&to=${to}&granularity=hour`;
    const coherent = (data: {
      bucketCount: string;
      totals: { totalCents: string; ticketCount: string; unitsSold: string };
      buckets: { totalCents: string; ticketCount: string; unitsSold: string }[];
    }) => {
      expect(data.bucketCount).toBe(String(data.buckets.length));
      expect(data.buckets.length).toBe(3);
      const sums = { totalCents: 0n, ticketCount: 0n, unitsSold: 0n };
      for (const bucket of data.buckets) {
        sums.totalCents += BigInt(bucket.totalCents);
        sums.ticketCount += BigInt(bucket.ticketCount);
        sums.unitsSold += BigInt(bucket.unitsSold);
      }
      expect(sums).toEqual({
        totalCents: BigInt(data.totals.totalCents),
        ticketCount: BigInt(data.totals.ticketCount),
        unitsSold: BigInt(data.totals.unitsSold),
      });
      expect(BigInt(data.totals.ticketCount)).toBeLessThanOrEqual(12n);
    };
    const inserts = Array.from({ length: 12 }, (_, index) =>
      createSale({
        method: 'STRIPE',
        soldAt: new Date(Date.UTC(2030, 1, 1, 8, index * 2, 0, 0)),
        totalCents: 1000n + BigInt(index),
        quantities: [1 + (index % 3)],
      }),
    );
    const reads = Array.from({ length: 8 }, async () => {
      const response = await series(query);
      expect(response.status).toBe(200);
      coherent(response.body.data);
      return response.body.data.totals;
    });
    const results = await Promise.all([...inserts, ...reads]);
    const snapshots = results.slice(inserts.length);
    expect(snapshots).toHaveLength(8);

    const final = await series(query);
    expect(final.status).toBe(200);
    coherent(final.body.data);
    const [expected] = await db.$queryRaw<
      { tickets: string; total: string; units: string }[]
    >`SELECT count(*)::text AS tickets,
        coalesce(sum(s.total_cents),0)::text AS total,
        coalesce(sum(oi.quantity),0)::text AS units
      FROM sales s JOIN order_items oi ON oi.order_id=s.order_id
      WHERE s.sold_at >= ${new Date(from)} AND s.sold_at < ${new Date(to)}`;
    expect(final.body.data.totals).toEqual({
      totalCents: expected!.total,
      ticketCount: expected!.tickets,
      unitsSold: expected!.units,
    });
    expect(final.body.data.totals.ticketCount).toBe('12');
  });

  it('sanea 503 de dependencia, 500 interno y 429 sin filtrar detalles', async () => {
    const query = 'from=2026-11-24T08:00:00.000Z&to=2026-11-24T09:00:00.000Z&granularity=hour';
    const path = `/api/v1/admin/dashboard/sales-series?${query}`;
    const dependency = createApp({
      authService: auth,
      salesService: {
        async salesSeries() {
          throw Object.assign(new Error('secret-db-detail'), { code: 'P1001' });
        },
      } as never,
      catalogRateLimit: 10000,
    });
    const unavailable = await request(dependency).get(path).set('Cookie', admin.cookie);
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers['content-type']).toContain('application/problem+json');
    expect(unavailable.body).toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE', status: 503 });
    expect(JSON.stringify(unavailable.body)).not.toContain('secret-db-detail');

    const internal = createApp({
      authService: auth,
      salesService: {
        async salesSeries() {
          throw new Error('secret-internal-detail');
        },
      } as never,
      catalogRateLimit: 10000,
    });
    const unexpected = await request(internal).get(path).set('Cookie', admin.cookie);
    expect(unexpected.status).toBe(500);
    expect(unexpected.body).toMatchObject({ code: 'INTERNAL_ERROR', status: 500 });
    expect(JSON.stringify(unexpected.body)).not.toContain('secret-internal-detail');

    const limited = createApp({
      authService: auth,
      salesService: {
        async salesSeries() {
          return { data: {} };
        },
      } as never,
      catalogRateLimit: 1,
    });
    expect((await request(limited).get(path).set('Cookie', admin.cookie)).status).toBe(200);
    const throttled = await request(limited).get(path).set('Cookie', admin.cookie);
    expect(throttled.status).toBe(429);
    expect(throttled.body).toMatchObject({ code: 'RATE_LIMITED', status: 429 });
  });
});

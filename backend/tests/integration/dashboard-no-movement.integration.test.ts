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
import {
  encodeNoMovementCursor,
  NO_MOVEMENT_UNIVERSE_DEFINITION,
} from '../../src/modules/sales/sales.validation.js';

const target = process.env.CATALOG_TEST_DATABASE_URL,
  origin = 'http://localhost:5173',
  PATH = '/api/v1/admin/dashboard/no-movement-products';
type Identity = { principal: Principal; cookie: string; csrf: string };
type Method = 'CASH' | 'STRIPE';
type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED';
type Line = {
  productId: bigint;
  name: string;
  unitPriceCents?: bigint;
  quantity?: number;
  option?: boolean;
};
type SaleOptions = {
  method: Method;
  soldAt: Date;
  lines: Line[];
  paymentStatus?: PaymentStatus;
  createSale?: boolean;
  refundCents?: bigint;
};
type ProductExtra = {
  categoryId?: bigint;
  isAvailable?: boolean;
  deletedAt?: Date | null;
  createdAt?: Date;
  id?: bigint;
};
type NoMovementItem = {
  productId: string;
  name: string;
  category: { id: string; name: string };
  isAvailable: boolean;
  createdAt: string;
};
type NoMovementResponse = {
  data: {
    generatedAt: string;
    currency: string;
    period: { from: string; to: string; timeZone: string };
    method: Method | null;
    universe: { asOf: string; definition: string; includesUnavailable: boolean };
    totalNoMovementProducts: string;
    page: { limit: string; nextCursor: string | null };
    items: NoMovementItem[];
  };
};

describe.skipIf(!target)(
  'DA-001 E2-09: activos sin movimiento con HTTP y PostgreSQL aislado',
  () => {
    const coreFrom = '2031-06-01T08:00:00.000Z',
      coreTo = '2031-06-02T08:00:00.000Z',
      zeroFrom = '2033-01-01T08:00:00.000Z',
      zeroTo = '2033-01-02T08:00:00.000Z';
    let db: ReturnType<typeof createDatabase>,
      auth: AuthService,
      app: ReturnType<typeof createApp>,
      categoryId: bigint,
      optionValueId: bigint,
      cashSessionId: bigint;
    const time = Date.UTC(2026, 10, 25, 18, 30, 0, 0),
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
    const includedKeys = [
      'includeA',
      'includeLower',
      'includeB',
      'includeAccent',
      'sameHigh',
      'sameLow',
      'unavailable',
      'createdWithin',
      'createdBefore',
      'createdToMinus',
      'noSale',
      'renamedProduct',
      'renamedCategoryProduct',
      'soldBefore',
      'soldAtTo',
      'saleAfter',
      'orphan',
    ] as const;
    const excludedKeys = [
      'deleted',
      'inactiveCategoryProduct',
      'deletedCategoryProduct',
      'createdTo',
      'createdAfter',
      'soldCash',
      'soldStripe',
      'refunded',
      'zeroPrice',
      'optionSale',
      'inconsistent',
      'boundaryFrom',
      'boundaryToMinus',
    ] as const;
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
            ? {
                phone,
                customerNumber: `C${phone!.slice(-6)}`,
                pinHash: await hashCredential('0007'),
              }
            : { username: name, passwordHash: await hashCredential('fixture-password') }),
        },
      });
      return session(user.id, role);
    }
    async function makeProduct(name: string, extra: ProductExtra = {}) {
      return db.product.create({
        data: {
          name,
          categoryId: extra.categoryId ?? categoryId,
          basePriceCents: 100n,
          isAvailable: extra.isAvailable ?? true,
          deletedAt: extra.deletedAt ?? null,
          ...(extra.createdAt === undefined ? {} : { createdAt: extra.createdAt }),
          ...(extra.id === undefined ? {} : { id: extra.id }),
        },
      });
    }
    async function setCreatedAt(productId: bigint, instant: string) {
      await db.$executeRaw`UPDATE products SET created_at = ${instant}::timestamptz WHERE id = ${productId}`;
    }
    async function createSale(options: SaleOptions) {
      const lineTotals = options.lines.map(
        (line) => (line.unitPriceCents ?? 100n) * BigInt(line.quantity ?? 1),
      );
      const totalCents = lineTotals.reduce((total, lineTotal) => total + lineTotal, 0n);
      const order = await db.order.create({
        data: {
          folio: `NMV-${randomUUID().slice(0, 8)}`,
          source: 'CASHIER',
          status: 'EN_PREPARACION',
          paymentMethod: options.method,
          totalCents,
          cashQrTokenHash: options.method === 'CASH' ? randomBytes(32).toString('hex') : null,
          paymentExpiresAt: new Date(options.soldAt.getTime() + 3600000),
          paidAt: options.paymentStatus === 'SUCCEEDED' ? options.soldAt : null,
        },
      });
      for (const [index, line] of options.lines.entries())
        await db.orderItem.create({
          data: {
            orderId: order.id,
            productId: line.productId,
            productNameSnapshot: line.name,
            basePriceCentsSnapshot: line.unitPriceCents ?? 100n,
            unitPriceCents: line.unitPriceCents ?? 100n,
            quantity: line.quantity ?? 1,
            lineTotalCents: lineTotals[index]!,
          },
        });
      if (options.lines.some((line) => line.option)) {
        const items = await db.orderItem.findMany({ where: { orderId: order.id } });
        for (const [index, line] of options.lines.entries())
          if (line.option)
            await db.orderItemOption.create({
              data: {
                orderItemId: items[index]!.id,
                optionValueId,
                groupNameSnapshot: 'Leche (demo)',
                optionNameSnapshot: 'Almendra',
                surchargeCentsSnapshot: 100n,
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
      if (options.refundCents !== undefined)
        await db.refund.create({
          data: {
            paymentId: payment.id,
            amountCents: options.refundCents,
            reason: 'Fixture de reembolso; el movimiento no se borra',
            status: 'SUCCEEDED',
          },
        });
      if (options.createSale === false) return { order, payment, sale: null };
      const sale = await db.sale.create({
        data: {
          saleNumber: `NMV-${randomUUID().slice(0, 8)}`,
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
    async function oneSale(
      key: string,
      method: Method,
      soldAt: Date,
      extra: Partial<SaleOptions> = {},
    ) {
      return createSale({
        method,
        soldAt,
        lines: [{ productId: ids[key]!, name: key }],
        ...extra,
      });
    }
    async function referenceNoMovement(from: string, to: string, method?: Method) {
      const rows = method
        ? await db.$queryRaw<{ id: string }[]>`
          SELECT p.id::text AS id
          FROM products p JOIN categories c ON c.id = p.category_id
          WHERE p.deleted_at IS NULL
            AND p.created_at < ${new Date(to)}::timestamptz
            AND c.is_active = TRUE AND c.deleted_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM order_items oi
              JOIN sales s ON s.order_id = oi.order_id
              JOIN payments pm ON pm.id = s.payment_id
              WHERE oi.product_id = p.id
                AND s.sold_at >= ${new Date(from)}::timestamptz
                AND s.sold_at < ${new Date(to)}::timestamptz
                AND pm.method::text = ${method}
            )
          ORDER BY p.id`
        : await db.$queryRaw<{ id: string }[]>`
          SELECT p.id::text AS id
          FROM products p JOIN categories c ON c.id = p.category_id
          WHERE p.deleted_at IS NULL
            AND p.created_at < ${new Date(to)}::timestamptz
            AND c.is_active = TRUE AND c.deleted_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM order_items oi
              JOIN sales s ON s.order_id = oi.order_id
              WHERE oi.product_id = p.id
                AND s.sold_at >= ${new Date(from)}::timestamptz
                AND s.sold_at < ${new Date(to)}::timestamptz
            )
          ORDER BY p.id`;
      return rows.map((row) => row.id);
    }
    const noMovement = (query: string, actor: Identity = admin) =>
      request(app).get(`${PATH}?${query}`).set('Cookie', actor.cookie);
    const query = (extra = '') => `from=${coreFrom}&to=${coreTo}${extra}`;
    const idsOf = (data: NoMovementResponse['data']) => data.items.map((item) => item.productId);
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
        salesService: new SalesService(new SalesRepository(db), now),
        catalogRateLimit: 10000,
      });
      admin = await identity('admin-no-movement', 'ADMINISTRADOR');
      cashier = await identity('cashier-no-movement', 'CAJERO');
      prep = await identity('prep-no-movement', 'PREPARACION');
      customer = await identity('Customer no movement', 'CLIENTE', '+520000000009');
      manager = await identity('manager-no-movement', 'GERENTE');
      const pinRole = await db.role.findUniqueOrThrow({ where: { name: 'ADMINISTRADOR' } });
      const pinUser = await db.user.create({
        data: {
          name: 'pin-change-no-movement',
          roleId: pinRole.id,
          accountType: 'STAFF',
          username: 'pin-change-no-movement',
          passwordHash: 'fixture-not-used',
          mustChangePin: true,
        },
      });
      pinChange = await session(pinUser.id, 'ADMINISTRADOR');
      categoryId = (await db.category.create({ data: { name: 'Activa E2-09' } })).id;
      optionValueId = (await db.optionValue.findFirstOrThrow({ where: { name: 'Almendra' } })).id;
      cashSessionId = (
        await db.cashSession.create({
          data: { employeeId: cashier.principal.userId, openingAmountCents: 0n },
        })
      ).id;

      const inactiveCategory = await db.category.create({
        data: { name: 'Inactiva E2-09', isActive: false },
      });
      const deletedCategory = await db.category.create({
        data: { name: 'Borrada E2-09', isActive: false, deletedAt: new Date(time) },
      });
      const renameCategory = await db.category.create({
        data: { name: 'Nombre anterior categoría' },
      });

      ids.noSale = (await makeProduct('Sin venta')).id;
      ids.unavailable = (await makeProduct('Agotado actual', { isAvailable: false })).id;
      ids.createdWithin = (
        await makeProduct('Alta dentro', { createdAt: new Date('2031-06-01T10:00:00.000Z') })
      ).id;
      ids.createdBefore = (
        await makeProduct('Alta antes', { createdAt: new Date('2030-01-01T00:00:00.000Z') })
      ).id;
      ids.createdToMinus = (
        await makeProduct('Corte microsegundo', {
          createdAt: new Date('2031-06-02T07:59:59.999Z'),
        })
      ).id;
      await setCreatedAt(ids.createdToMinus!, '2031-06-02T07:59:59.999999Z');
      ids.renamedProduct = (await makeProduct('Nombre anterior producto')).id;
      ids.renamedCategoryProduct = (
        await makeProduct('Categoría renombrada', { categoryId: renameCategory.id })
      ).id;
      await db.product.update({
        where: { id: ids.renamedProduct! },
        data: { name: 'Renombrado actual' },
      });
      await db.category.update({
        where: { id: renameCategory.id },
        data: { name: 'Categoría renombrada actual' },
      });

      ids.deleted = (
        await makeProduct('Producto borrado', { deletedAt: new Date(time), isAvailable: false })
      ).id;
      ids.inactiveCategoryProduct = (
        await makeProduct('Categoría inactiva', { categoryId: inactiveCategory.id })
      ).id;
      ids.deletedCategoryProduct = (
        await makeProduct('Categoría borrada', { categoryId: deletedCategory.id })
      ).id;
      ids.createdTo = (await makeProduct('Alta en to', { createdAt: new Date(coreTo) })).id;
      ids.createdAfter = (
        await makeProduct('Alta después', { createdAt: new Date('2031-06-02T08:00:00.001Z') })
      ).id;

      ids.soldCash = (await makeProduct('Venta efectivo')).id;
      ids.soldStripe = (await makeProduct('Venta stripe')).id;
      ids.soldBefore = (await makeProduct('Venta antes del rango')).id;
      ids.soldAtTo = (await makeProduct('Venta en to')).id;
      ids.saleAfter = (await makeProduct('Venta después del rango')).id;
      ids.refunded = (await makeProduct('Venta reembolsada')).id;
      ids.zeroPrice = (await makeProduct('Venta precio cero')).id;
      ids.optionSale = (await makeProduct('Venta con opción')).id;
      ids.orphan = (await makeProduct('Orden sin venta')).id;
      ids.inconsistent = (await makeProduct('Venta inconsistente D11')).id;
      ids.boundaryFrom = (await makeProduct('Venta en from')).id;
      ids.boundaryToMinus = (await makeProduct('Venta en to menos un microsegundo')).id;

      await oneSale('soldCash', 'CASH', new Date('2031-06-01T10:00:00.000Z'));
      await oneSale('soldStripe', 'STRIPE', new Date('2031-06-01T10:05:00.000Z'));
      await oneSale('soldBefore', 'CASH', new Date('2031-06-01T07:59:59.999Z'));
      await oneSale('soldAtTo', 'CASH', new Date(coreTo));
      await oneSale('saleAfter', 'STRIPE', new Date('2031-06-02T09:00:00.000Z'));
      await oneSale('refunded', 'CASH', new Date('2031-06-01T10:10:00.000Z'), {
        refundCents: 100n,
      });
      await oneSale('zeroPrice', 'CASH', new Date('2031-06-01T10:20:00.000Z'), {
        lines: [
          {
            productId: ids.zeroPrice!,
            name: 'Venta precio cero',
            unitPriceCents: 0n,
            quantity: 1,
          },
        ],
      });
      await oneSale('optionSale', 'STRIPE', new Date('2031-06-01T10:22:00.000Z'), {
        lines: [
          {
            productId: ids.optionSale!,
            name: 'Venta con opción',
            unitPriceCents: 200n,
            quantity: 2,
            option: true,
          },
        ],
      });
      await oneSale('orphan', 'CASH', new Date('2031-06-01T10:25:00.000Z'), {
        paymentStatus: 'PENDING',
        createSale: false,
      });
      await oneSale('inconsistent', 'CASH', new Date('2031-06-01T10:30:00.000Z'), {
        paymentStatus: 'FAILED',
      });
      await oneSale('boundaryFrom', 'CASH', new Date(coreFrom));
      const boundaryToMinus = await oneSale(
        'boundaryToMinus',
        'CASH',
        new Date('2031-06-02T07:59:59.999Z'),
      );
      await setSoldAt(boundaryToMinus.sale!.id, '2031-06-02T07:59:59.999999Z');

      // IDs mayores que Number.MAX_SAFE_INTEGER y desempate numérico de nombre igual.
      ids.includeA = (await makeProduct('A')).id;
      ids.includeLower = (await makeProduct('a')).id;
      ids.includeB = (await makeProduct('B')).id;
      ids.includeAccent = (await makeProduct('Á')).id;
      ids.sameHigh = (await makeProduct('Mismo Nombre', { id: 1_000_000n })).id;
      ids.sameLow = (await makeProduct('Mismo Nombre', { id: 999_999n })).id;

      // Periodo de universo vacío: todos los productos del universo tienen una
      // venta CASH en 2033; con method=STRIPE tampoco hay ventas.
      const zeroProducts = await db.product.findMany({
        where: { deletedAt: null, category: { isActive: true, deletedAt: null } },
        orderBy: { id: 'asc' },
      });
      let zeroOffset = 0;
      for (const product of zeroProducts) {
        for (const method of ['CASH', 'STRIPE'] as const)
          await createSale({
            method,
            soldAt: new Date(Date.UTC(2033, 0, 1, 8, 0, zeroOffset++)),
            lines: [{ productId: product.id, name: product.name }],
          });
      }
    });
    afterAll(async () => {
      await db?.$disconnect();
    });

    it('exige ADMINISTRADOR, cabeceras privadas y rechaza body (R19/S01–S04)', async () => {
      const unauthenticated = await request(app).get(`${PATH}?${query()}`);
      expect(unauthenticated.status).toBe(401);
      expect(unauthenticated.body).toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
      expect(unauthenticated.headers['cache-control']).toBe('no-store');
      expect(unauthenticated.headers['referrer-policy']).toBe('no-referrer');
      for (const actor of [customer, cashier, prep, manager]) {
        const denied = await noMovement(query(), actor);
        expect(denied.status).toBe(403);
        expect(denied.body).toMatchObject({ code: 'FORBIDDEN', status: 403 });
        expect(denied.headers['cache-control']).toBe('no-store');
        expect(denied.headers['referrer-policy']).toBe('no-referrer');
      }
      const pinRequired = await noMovement(query(), pinChange);
      expect(pinRequired.status).toBe(403);
      expect(pinRequired.body).toMatchObject({ code: 'PIN_CHANGE_REQUIRED', status: 403 });
      expect(pinRequired.headers['cache-control']).toBe('no-store');
      expect(pinRequired.headers['referrer-policy']).toBe('no-referrer');
      const allowed = await noMovement(query());
      expect(allowed.status).toBe(200);
      expect(allowed.headers['cache-control']).toBe('no-store');
      expect(allowed.headers['referrer-policy']).toBe('no-referrer');
      conform(PATH, 'get', '200', allowed.body);
      const bodyRejected = await noMovement(query()).send({});
      expect(bodyRejected.status).toBe(400);
      expect(bodyRejected.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
      const badOrigin = await request(app)
        .get(`${PATH}?${query()}`)
        .set('Cookie', admin.cookie)
        .set('Origin', 'https://evil.test');
      expect(badOrigin.status).toBe(403);
      expect(badOrigin.body).toMatchObject({ code: 'ORIGIN_NOT_ALLOWED', status: 403 });
      expect(badOrigin.headers['cache-control']).toBe('no-store');
      expect(badOrigin.headers['referrer-policy']).toBe('no-referrer');
    });

    it('rechaza entrada estricta, extras, repetidos, cursor inválido y límites (T01–T10/E01)', async () => {
      const valid = query();
      for (const bad of [
        '',
        `to=${coreTo}`,
        `from=${coreFrom}`,
        `${valid}&category=1`,
        `${valid}&top=5`,
        `${valid}&metric=units`,
        `${valid}&direction=top`,
        `${valid}&timeZone=UTC`,
        `${valid}&order=asc`,
        `${valid}&sort=name`,
        `${valid}&includeUnavailable=true`,
        `${valid}&includeZeroSales=true`,
        `${valid}&offset=0`,
        `${valid}&page=1`,
        `${valid}&limit=010`,
        `${valid}&limit=+20`,
        `${valid}&limit=20.0`,
        `${valid}&limit=5`,
        `${valid}&limit=100`,
        `${valid}&limit=`,
        `${valid}&method=`,
        `${valid}&method=null`,
        `${valid}&method=cash`,
        `from=${coreFrom}&from=${coreFrom}&to=${coreTo}`,
        `from[]=${coreFrom}&to=${coreTo}`,
        `${valid}&method[]=CASH`,
        `${valid}&limit=20&limit=20`,
        `from=2031-06-01T08:00:00.0000Z&to=${coreTo}`,
        `from=2031-06-01T08:00:00.000000Z&to=${coreTo}`,
        `from=2031-02-30T08:00:00.000Z&to=${coreTo}`,
        `from=2031-13-01T08:00:00.000Z&to=${coreTo}`,
        `from=2031-06-01T24:00:00.000Z&to=${coreTo}`,
        `from=2031-06-01T08:60:00.000Z&to=${coreTo}`,
        `from=2031-06-01T08:00:00+01:00&to=${coreTo}`,
        `from=${coreTo}&to=${coreFrom}`,
        `from=${coreFrom}&to=${coreFrom}`,
        `from=2000-01-01T07:59:59.999Z&to=${coreTo}`,
        `from=2024-01-01T08:00:00.000Z&to=2025-01-01T08:00:00.001Z`,
        `${valid}&cursor=abc=`,
        `${valid}&cursor=${'x'.repeat(2049)}`,
        `${valid}&cursor=${Buffer.from('no-json').toString('base64url')}`,
        `${valid}&cursor=${Buffer.from(
          JSON.stringify({
            v: 1,
            scope: 'dashboard-no-movement',
            definition: NO_MOVEMENT_UNIVERSE_DEFINITION,
            from: coreFrom,
            to: coreTo,
            method: null,
            limit: '20',
            name: 'Producto\u0000nulo',
            productId: '1',
          }),
        ).toString('base64url')}`,
        `${valid}&cursor=${Buffer.from(
          JSON.stringify({
            v: 1,
            scope: 'dashboard-no-movement',
            definition: NO_MOVEMENT_UNIVERSE_DEFINITION,
            from: coreFrom,
            to: coreTo,
            method: null,
            limit: '20',
            name: 'Producto\u007F',
            productId: '1',
          }),
        ).toString('base64url')}`,
      ]) {
        const response = await noMovement(bad);
        expect(response.status, bad).toBe(400);
        expect(response.body, bad).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
        expect(response.headers['cache-control'], bad).toBe('no-store');
        expect(response.headers['referrer-policy'], bad).toBe('no-referrer');
      }
      for (const limit of ['10', '20', '50']) {
        const response = await noMovement(query(`&limit=${limit}`));
        expect(response.status, limit).toBe(200);
        expect(response.body.data.page.limit).toBe(limit);
        conform(PATH, 'get', '200', response.body);
      }
    });

    it('incluye el universo activo y excluye bajas/categorías/altas fuera de cohorte (R01–R05)', async () => {
      const response = await noMovement(query('&limit=50'));
      expect(response.status).toBe(200);
      conform(PATH, 'get', '200', response.body);
      const data = response.body.data as NoMovementResponse['data'];
      expect(data).toMatchObject({
        currency: 'MXN',
        period: { from: coreFrom, to: coreTo, timeZone: 'America/Tijuana' },
        method: null,
        universe: {
          asOf: coreTo,
          definition: NO_MOVEMENT_UNIVERSE_DEFINITION,
          includesUnavailable: true,
        },
        page: { limit: '50' },
      });
      expect(data.generatedAt).toMatch(/^[2-9]\d{3}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(Object.keys(data).sort()).toEqual(
        [
          'currency',
          'generatedAt',
          'items',
          'method',
          'page',
          'period',
          'totalNoMovementProducts',
          'universe',
        ].sort(),
      );
      const returned = idsOf(data);
      for (const key of includedKeys) expect(returned, key).toContain(ids[key]!.toString());
      for (const key of excludedKeys) expect(returned, key).not.toContain(ids[key]!.toString());
      const unavailable = data.items.find((item) => item.productId === ids.unavailable!.toString());
      expect(unavailable).toMatchObject({
        name: 'Agotado actual',
        isAvailable: false,
        category: { id: categoryId.toString(), name: 'Activa E2-09' },
      });
      const microsecond = data.items.find(
        (item) => item.productId === ids.createdToMinus!.toString(),
      );
      expect(microsecond?.createdAt).toBe('2031-06-02T07:59:59.999999Z');
      expect(
        data.items.find((item) => item.productId === ids.renamedProduct!.toString())?.name,
      ).toBe('Renombrado actual');
      expect(
        data.items.find((item) => item.productId === ids.renamedCategoryProduct!.toString())
          ?.category.name,
      ).toBe('Categoría renombrada actual');
      for (const item of data.items) {
        expect(Object.keys(item).sort()).toEqual(
          ['category', 'createdAt', 'isAvailable', 'name', 'productId'].sort(),
        );
        expect(Object.keys(item.category).sort()).toEqual(['id', 'name']);
        expect(item.productId).toMatch(/^[1-9][0-9]*$/);
        expect(item.createdAt).toMatch(/^[2-9]\d{3}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
      }
    });

    it('mide la ausencia por rango y método sin contar reembolsos/órdenes sin Sale (R06–R12)', async () => {
      const all = (await noMovement(query('&limit=50'))).body.data as NoMovementResponse['data'];
      const allIds = idsOf(all);
      for (const key of [
        'soldCash',
        'soldStripe',
        'refunded',
        'zeroPrice',
        'optionSale',
        'inconsistent',
      ])
        expect(allIds, key).not.toContain(ids[key]!.toString());
      for (const key of ['soldBefore', 'soldAtTo', 'saleAfter', 'orphan'])
        expect(allIds, key).toContain(ids[key]!.toString());
      expect(allIds).not.toContain(ids.boundaryFrom!.toString());
      expect(allIds).not.toContain(ids.boundaryToMinus!.toString());

      const cash = (await noMovement(query('&limit=50&method=CASH'))).body
        .data as NoMovementResponse['data'];
      expect(cash.method).toBe('CASH');
      expect(idsOf(cash)).not.toContain(ids.soldCash!.toString());
      expect(idsOf(cash)).not.toContain(ids.refunded!.toString());
      expect(idsOf(cash)).not.toContain(ids.zeroPrice!.toString());
      expect(idsOf(cash)).not.toContain(ids.boundaryFrom!.toString());
      expect(idsOf(cash)).not.toContain(ids.boundaryToMinus!.toString());
      expect(idsOf(cash)).toContain(ids.soldStripe!.toString());
      expect(idsOf(cash)).toContain(ids.optionSale!.toString());
      expect(idsOf(cash)).toContain(ids.orphan!.toString());

      const stripe = (await noMovement(query('&limit=50&method=STRIPE'))).body
        .data as NoMovementResponse['data'];
      expect(stripe.method).toBe('STRIPE');
      expect(idsOf(stripe)).not.toContain(ids.soldStripe!.toString());
      expect(idsOf(stripe)).not.toContain(ids.optionSale!.toString());
      expect(idsOf(stripe)).toContain(ids.soldCash!.toString());
      expect(idsOf(stripe)).toContain(ids.refunded!.toString());
      expect(idsOf(stripe)).toContain(ids.boundaryFrom!.toString());
      expect(idsOf(stripe)).toContain(ids.boundaryToMinus!.toString());

      for (const method of [undefined, 'CASH', 'STRIPE'] as const) {
        const expected = await referenceNoMovement(coreFrom, coreTo, method);
        const response = await noMovement(query(`&limit=50${method ? `&method=${method}` : ''}`));
        const data = response.body.data as NoMovementResponse['data'];
        expect(data.totalNoMovementProducts, method).toBe(String(expected.length));
        expect(idsOf(data).sort(), method).toEqual([...expected].sort());
      }
    });

    it('ordena por name COLLATE "C" y productId numérico, sin reordenar (R15)', async () => {
      const response = await noMovement(query('&limit=50'));
      expect(response.status).toBe(200);
      const data = response.body.data as NoMovementResponse['data'];
      const idsInOrder = idsOf(data);
      const at = (key: string) => idsInOrder.indexOf(ids[key]!.toString());
      expect(at('includeA')).toBeLessThan(at('includeB'));
      expect(at('includeB')).toBeLessThan(at('includeLower'));
      expect(at('includeLower')).toBeLessThan(at('includeAccent'));
      expect(at('sameLow')).toBeLessThan(at('sameHigh'));
      const repeated = await noMovement(query('&limit=50'));
      expect(idsOf(repeated.body.data)).toEqual(idsInOrder);

      const firstPage = await noMovement(query('&limit=10'));
      expect(
        (firstPage.body.data as NoMovementResponse['data']).items.map((item) => item.name),
      ).toEqual(data.items.slice(0, 10).map((item) => item.name));
    });

    it('pagina con keyset limit+1, concilia el total y termina con nextCursor null (R13/R14)', async () => {
      const expected = await referenceNoMovement(coreFrom, coreTo);
      const first = await noMovement(query('&limit=10'));
      expect(first.status).toBe(200);
      conform(PATH, 'get', '200', first.body);
      const firstData = first.body.data as NoMovementResponse['data'];
      expect(firstData.items).toHaveLength(10);
      expect(firstData.totalNoMovementProducts).toBe(String(expected.length));
      expect(Number(firstData.totalNoMovementProducts)).toBeGreaterThan(firstData.items.length);
      expect(firstData.page.nextCursor).toMatch(/^[A-Za-z0-9_-]{1,2048}$/);

      const collected: string[] = [];
      let cursor: string | null = firstData.page.nextCursor;
      const total = firstData.totalNoMovementProducts;
      let pages = 1;
      while (cursor) {
        const page = await noMovement(query(`&limit=10&cursor=${cursor}`));
        expect(page.status).toBe(200);
        conform(PATH, 'get', '200', page.body);
        const data = page.body.data as NoMovementResponse['data'];
        expect(data.totalNoMovementProducts).toBe(total);
        collected.push(...idsOf(data));
        cursor = data.page.nextCursor;
        pages++;
        expect(pages).toBeLessThan(20);
      }
      const union = [...idsOf(firstData), ...collected];
      expect(new Set(union).size).toBe(union.length);
      expect(union.sort()).toEqual([...expected].sort());
      expect(pages).toBe(Math.ceil(expected.length / 10));

      // El cursor vincula el periodo normalizado: una forma sin fracción y el
      // límite omitido son compatibles con el mismo cursor.
      const semanticFirst = await noMovement(
        `from=${coreFrom.replace('.000Z', 'Z')}&to=${coreTo.replace('.000Z', 'Z')}`,
      );
      expect(semanticFirst.status).toBe(200);
      const semanticData = semanticFirst.body.data as NoMovementResponse['data'];
      expect(semanticData.page.limit).toBe('20');
      const compatible = await noMovement(
        `${query('&limit=20')}&cursor=${semanticData.page.nextCursor}`,
      );
      expect(compatible.status).toBe(200);
      conform(PATH, 'get', '200', compatible.body);
      for (const incompatible of [
        `${query('&limit=10&method=CASH')}&cursor=${semanticData.page.nextCursor}`,
        `${query('&limit=10')}&cursor=${semanticData.page.nextCursor}`,
        `from=2031-06-01T09:00:00.000Z&to=${coreTo}&limit=20&cursor=${semanticData.page.nextCursor}`,
      ]) {
        const rejected = await noMovement(incompatible);
        expect(rejected.status).toBe(400);
        expect(rejected.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
      }
      // Cursor de otro endpoint con forma válida: 400, sin mezclar páginas.
      const foreign = encodeNoMovementCursor(
        { from: coreFrom, to: coreTo, method: null, limit: '20' },
        { name: 'Otro', productId: '1' },
      );
      const foreignPayload = JSON.parse(Buffer.from(foreign, 'base64url').toString('utf8'));
      foreignPayload.scope = 'sales';
      const foreignToken = Buffer.from(JSON.stringify(foreignPayload)).toString('base64url');
      const foreignResponse = await noMovement(`${query()}&cursor=${foreignToken}`);
      expect(foreignResponse.status).toBe(400);
    });

    it('respeta el dominio temporal y la precisión de entrada (R17)', async () => {
      const minimum = await noMovement('from=2000-01-01T08:00:00.000Z&to=2001-01-01T08:00:00.000Z');
      expect(minimum.status).toBe(200);
      expect((minimum.body.data as NoMovementResponse['data']).totalNoMovementProducts).toBe('0');
      const maximum = await noMovement('from=2028-01-01T08:00:00.000Z&to=2029-01-01T08:00:00.000Z');
      expect(maximum.status).toBe(200);
      for (const [from, to] of [
        ['2031-06-01T08:00:00Z', '2031-06-01T09:00:00Z'],
        ['2031-06-01T08:00:00.1Z', '2031-06-01T09:00:00.12Z'],
        ['2031-06-01T08:00:00.123Z', '2031-06-01T09:00:00.123Z'],
      ] as const) {
        const accepted = await noMovement(`from=${from}&to=${to}`);
        expect(accepted.status, `${from} → ${to}`).toBe(200);
        const data = accepted.body.data as NoMovementResponse['data'];
        expect(data.period.from).toBe(new Date(from).toISOString());
        expect(data.period.to).toBe(new Date(to).toISOString());
      }
      for (const [from, to] of [
        ['2000-01-01T07:59:59.999Z', coreTo],
        ['2031-06-01T08:00:00.0000Z', coreTo],
        ['2031-06-01T08:00:00.000000Z', coreTo],
        [coreFrom, coreFrom],
        [coreTo, coreFrom],
        ['2028-01-01T08:00:00.000Z', '2029-01-01T08:00:00.001Z'],
      ] as const) {
        const rejected = await noMovement(`from=${from}&to=${to}`);
        expect(rejected.status, `${from} → ${to}`).toBe(400);
        expect(rejected.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
      }
    });

    it('devuelve cero resultados sin 404 ni ceros ficticios (R18)', async () => {
      for (const extra of ['', '&method=STRIPE']) {
        const response = await noMovement(`from=${zeroFrom}&to=${zeroTo}${extra}&limit=20`);
        expect(response.status, extra).toBe(200);
        conform(PATH, 'get', '200', response.body);
        expect(response.body.data as NoMovementResponse['data']).toMatchObject({
          totalNoMovementProducts: '0',
          page: { limit: '20', nextCursor: null },
          items: [],
        });
      }
      const emptyNext = await noMovement(
        `from=${zeroFrom}&to=${zeroTo}&limit=10&cursor=${Buffer.from(
          JSON.stringify({
            v: 1,
            scope: 'dashboard-no-movement',
            definition: NO_MOVEMENT_UNIVERSE_DEFINITION,
            from: zeroFrom,
            to: zeroTo,
            method: null,
            limit: '10',
            name: 'Algún producto',
            productId: '1',
          }),
        ).toString('base64url')}`,
      );
      expect(emptyNext.status).toBe(200);
      expect((emptyNext.body.data as NoMovementResponse['data']).items).toEqual([]);
      expect((emptyNext.body.data as NoMovementResponse['data']).page.nextCursor).toBeNull();
    });

    it('sanea 413/429/500/503 y mantiene el middleware privado (R20)', async () => {
      const path = `${PATH}?${query()}`;
      const dependency = createApp({
        authService: auth,
        salesService: {
          async noMovementProducts() {
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
          async noMovementProducts() {
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
          async noMovementProducts() {
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
    });
  },
);

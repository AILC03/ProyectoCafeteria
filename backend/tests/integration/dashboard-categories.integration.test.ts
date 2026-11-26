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
import { Prisma } from '../../src/generated/prisma/client.js';

const target = process.env.CATALOG_TEST_DATABASE_URL,
  origin = 'http://localhost:5173',
  PATH = '/api/v1/admin/dashboard/category-participation';
type Identity = { principal: Principal; cookie: string; csrf: string };
type Method = 'CASH' | 'STRIPE';
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
  refundCents?: bigint;
};
type ProductExtra = { categoryId?: bigint };
type CategoryItem = {
  categoryId: string;
  name: string;
  isActive: boolean;
  unitsSold: string;
  totalCents: string;
  sharePercent: string;
};
type ReferenceCategoryItem = Omit<CategoryItem, 'sharePercent'>;
type ParticipationResponse = {
  data: {
    generatedAt: string;
    currency: string;
    period: { from: string; to: string; timeZone: string };
    method: Method | null;
    metric: 'units' | 'amount';
    denominator: { unitsSold: string; totalCents: string };
    totalCategories: string;
    items: CategoryItem[];
  };
};

describe.skipIf(!target)(
  'DA-001 E2-13: participación por categorías con HTTP y PostgreSQL aislado',
  () => {
    const coreFrom = '2031-06-01T08:00:00.000Z',
      coreTo = '2031-06-02T08:00:00.000Z',
      zeroFrom = '2033-01-01T08:00:00.000Z',
      zeroTo = '2033-01-02T08:00:00.000Z',
      zeroBaseFrom = '2033-02-01T08:00:00.000Z',
      zeroBaseTo = '2033-02-02T08:00:00.000Z',
      reclassFrom = '2032-03-01T08:00:00.000Z',
      reclassTo = '2032-03-02T08:00:00.000Z',
      priceFrom = '2032-04-01T08:00:00.000Z',
      priceTo = '2032-04-02T08:00:00.000Z',
      precisionFrom = '2034-01-01T08:00:00.000Z',
      precisionTo = '2034-01-02T08:00:00.000Z',
      largeFrom = '2035-01-01T08:00:00.000Z',
      largeTo = '2035-01-02T08:00:00.000Z',
      tiesFrom = '2036-01-01T08:00:00.000Z',
      tiesTo = '2036-01-02T08:00:00.000Z',
      sixthsFrom = '2037-01-01T08:00:00.000Z',
      sixthsTo = '2037-01-02T08:00:00.000Z',
      eighthsFrom = '2038-01-01T08:00:00.000Z',
      eighthsTo = '2038-01-02T08:00:00.000Z',
      deletedFrom = '2040-01-01T08:00:00.000Z',
      deletedTo = '2040-01-02T08:00:00.000Z',
      inactiveProductFrom = '2039-01-01T08:00:00.000Z',
      inactiveProductTo = '2039-01-02T08:00:00.000Z';
    let db: ReturnType<typeof createDatabase>,
      auth: AuthService,
      app: ReturnType<typeof createApp>,
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
    const categoryIds: Record<string, bigint> = {};
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
    async function category(
      name: string,
      extra: { isActive?: boolean; deletedAt?: Date; id?: bigint } = {},
    ) {
      return db.category.create({
        data: {
          name,
          isActive: extra.isActive ?? true,
          ...(extra.id === undefined ? {} : { id: extra.id }),
          ...(extra.deletedAt === undefined ? {} : { deletedAt: extra.deletedAt }),
        },
      });
    }
    async function makeProduct(name: string, categoryId: bigint, extra: ProductExtra = {}) {
      return db.product.create({
        data: {
          name,
          categoryId: extra.categoryId ?? categoryId,
          basePriceCents: 100n,
        },
      });
    }
    async function createSale(options: SaleOptions) {
      const lineTotals = options.lines.map(
        (line) => (line.unitPriceCents ?? 100n) * BigInt(line.quantity ?? 1),
      );
      const totalCents = lineTotals.reduce((total, lineTotal) => total + lineTotal, 0n);
      const order = await db.order.create({
        data: {
          folio: `CAT-${randomUUID().slice(0, 8)}`,
          source: 'CASHIER',
          status: 'EN_PREPARACION',
          paymentMethod: options.method,
          totalCents,
          cashQrTokenHash: options.method === 'CASH' ? randomBytes(32).toString('hex') : null,
          paymentExpiresAt: new Date(options.soldAt.getTime() + 3600000),
          paidAt: options.soldAt,
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
                surchargeCentsSnapshot: 500n,
              },
            });
      }
      const payment = await db.payment.create({
        data: {
          orderId: order.id,
          method: options.method,
          status: 'SUCCEEDED',
          amountCents: totalCents,
          ...(options.method === 'CASH'
            ? {
                cashierId: cashier.principal.userId,
                cashSessionId,
                cashReceivedCents: totalCents,
                changeCents: 0n,
              }
            : {}),
          confirmedAt: options.soldAt,
        },
      });
      if (options.refundCents !== undefined)
        await db.refund.create({
          data: {
            paymentId: payment.id,
            amountCents: options.refundCents,
            reason: 'Fixture de reembolso; la venta no se borra',
            status: 'SUCCEEDED',
          },
        });
      const sale = await db.sale.create({
        data: {
          saleNumber: `CAT-${randomUUID().slice(0, 8)}`,
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
    async function referenceTotals(
      from: string,
      to: string,
      metric: 'units' | 'amount',
      method?: Method,
    ) {
      // Oráculo SQL independiente del endpoint; el orden se aplica en JS para
      // comparar la misma semántica (métrica DESC, nombre byte a byte, ID).
      const methodFilter = method ? Prisma.sql`AND p.method::text = ${method}` : Prisma.empty;
      const rows = await db.$queryRaw<ReferenceCategoryItem[]>`
        SELECT c.id::text AS "categoryId", c.name, c.is_active AS "isActive",
               sum(oi.quantity)::text AS "unitsSold",
               sum(oi.line_total_cents)::text AS "totalCents"
        FROM sales s
        JOIN payments p ON p.id = s.payment_id
        JOIN order_items oi ON oi.order_id = s.order_id
        JOIN products pr ON pr.id = oi.product_id
        JOIN categories c ON c.id = pr.category_id
        WHERE s.sold_at >= ${new Date(from)}::timestamptz
          AND s.sold_at < ${new Date(to)}::timestamptz ${methodFilter}
        GROUP BY c.id, c.name, c.is_active`;
      const ordered = [...rows].sort((left, right) => {
        const leftMetric = BigInt(metric === 'units' ? left.unitsSold : left.totalCents);
        const rightMetric = BigInt(metric === 'units' ? right.unitsSold : right.totalCents);
        if (leftMetric !== rightMetric) return leftMetric > rightMetric ? -1 : 1;
        const byName = Buffer.compare(
          Buffer.from(left.name, 'utf8'),
          Buffer.from(right.name, 'utf8'),
        );
        if (byName !== 0) return byName;
        const leftId = BigInt(left.categoryId);
        const rightId = BigInt(right.categoryId);
        return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
      });
      const [denominator] = await db.$queryRaw<
        { unitsSold: string; totalCents: string }[]
      >`SELECT coalesce(sum(oi.quantity),0)::text AS "unitsSold",
               coalesce(sum(oi.line_total_cents),0)::text AS "totalCents"
        FROM sales s
        JOIN payments p ON p.id = s.payment_id
        JOIN order_items oi ON oi.order_id = s.order_id
        WHERE s.sold_at >= ${new Date(from)}::timestamptz
          AND s.sold_at < ${new Date(to)}::timestamptz ${methodFilter}`;
      return {
        items: ordered.map((row) => ({
          categoryId: row.categoryId,
          name: row.name,
          isActive: row.isActive,
          unitsSold: row.unitsSold,
          totalCents: row.totalCents,
        })),
        denominator: denominator!,
      };
    }
    const participation = (query: string, actor: Identity = admin) =>
      request(app).get(`${PATH}?${query}`).set('Cookie', actor.cookie);
    const query = (from: string, to: string, metric = 'units', extra = '') =>
      `from=${from}&to=${to}&metric=${metric}${extra}`;
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
      admin = await identity('admin-categories', 'ADMINISTRADOR');
      cashier = await identity('cashier-categories', 'CAJERO');
      prep = await identity('prep-categories', 'PREPARACION');
      customer = await identity('Customer categories', 'CLIENTE', '+520000000010');
      manager = await identity('manager-categories', 'GERENTE');
      const pinRole = await db.role.findUniqueOrThrow({ where: { name: 'ADMINISTRADOR' } });
      const pinUser = await db.user.create({
        data: {
          name: 'pin-change-categories',
          roleId: pinRole.id,
          accountType: 'STAFF',
          username: 'pin-change-categories',
          passwordHash: 'fixture-not-used',
          mustChangePin: true,
        },
      });
      pinChange = await session(pinUser.id, 'ADMINISTRADOR');
      optionValueId = (await db.optionValue.findFirstOrThrow({ where: { name: 'Almendra' } })).id;
      cashSessionId = (
        await db.cashSession.create({
          data: { employeeId: cashier.principal.userId, openingAmountCents: 0n },
        })
      ).id;

      // Core: categoría activa, inactiva, opciones, reembolso y precio cero.
      const coreCategory = await category('Cafés E2-13');
      const inactiveCategory = await category('Panadería E2-13', { isActive: false });
      categoryIds.core = coreCategory.id;
      categoryIds.inactive = inactiveCategory.id;
      ids.main = (await makeProduct('Café con opción', coreCategory.id)).id;
      ids.second = (await makeProduct('Café simple', coreCategory.id)).id;
      ids.inactive = (await makeProduct('Pan inactivo', inactiveCategory.id)).id;
      ids.refunded = (await makeProduct('Reembolsado', coreCategory.id)).id;
      ids.free = (await makeProduct('Cortesía', coreCategory.id)).id;
      await oneSale('main', 'CASH', new Date('2031-06-01T09:00:00.000Z'), {
        lines: [
          {
            productId: ids.main!,
            name: 'Café con opción',
            unitPriceCents: 4500n,
            quantity: 2,
            option: true,
          },
        ],
      });
      await oneSale('second', 'STRIPE', new Date('2031-06-01T09:05:00.000Z'), {
        lines: [
          { productId: ids.second!, name: 'Café simple', unitPriceCents: 6500n, quantity: 1 },
        ],
      });
      await oneSale('inactive', 'CASH', new Date('2031-06-01T09:10:00.000Z'), {
        lines: [
          { productId: ids.inactive!, name: 'Pan inactivo', unitPriceCents: 1000n, quantity: 3 },
        ],
      });
      await oneSale('refunded', 'CASH', new Date('2031-06-01T09:15:00.000Z'), {
        lines: [
          { productId: ids.refunded!, name: 'Reembolsado', unitPriceCents: 2000n, quantity: 1 },
        ],
        refundCents: 1000n,
      });
      await oneSale('free', 'CASH', new Date('2031-06-01T09:20:00.000Z'), {
        lines: [{ productId: ids.free!, name: 'Cortesía', unitPriceCents: 0n, quantity: 1 }],
      });
      // Cambio de precio actual no altera el histórico de la línea.
      const priceCategory = await category('Precio E2-13');
      categoryIds.price = priceCategory.id;
      ids.price = (await makeProduct('Precio histórico', priceCategory.id)).id;
      await oneSale('price', 'CASH', new Date('2032-04-01T10:00:00.000Z'), {
        lines: [
          { productId: ids.price!, name: 'Precio histórico', unitPriceCents: 4500n, quantity: 2 },
        ],
      });
      await db.product.update({ where: { id: ids.price! }, data: { basePriceCents: 5200n } });
      // Reclasificación posterior: todo el historial pasa a la categoría actual.
      const oldCategory = await category('Categoría anterior E2-13');
      const newCategory = await category('Categoría actual E2-13');
      categoryIds.reclassOld = oldCategory.id;
      categoryIds.reclassNew = newCategory.id;
      ids.reclass = (await makeProduct('Reclasificado', oldCategory.id)).id;
      await oneSale('reclass', 'CASH', new Date('2032-03-01T10:00:00.000Z'), {
        lines: [
          { productId: ids.reclass!, name: 'Reclasificado', unitPriceCents: 4500n, quantity: 2 },
        ],
      });
      await db.product.update({
        where: { id: ids.reclass! },
        data: { categoryId: newCategory.id },
      });
      // Base cero con líneas (solo posible con metric=amount e importe 0).
      const freeCategory = await category('Gratis E2-13');
      categoryIds.zeroBase = freeCategory.id;
      ids.zeroBase = (await makeProduct('Gratis E2-13', freeCategory.id)).id;
      await oneSale('zeroBase', 'CASH', new Date('2033-02-01T10:00:00.000Z'), {
        lines: [
          { productId: ids.zeroBase!, name: 'Gratis E2-13', unitPriceCents: 0n, quantity: 3 },
        ],
      });
      // Precisión: from exacto, to−1 µs y to.
      const precisionCategory = await category('Precisión E2-13');
      categoryIds.precision = precisionCategory.id;
      ids.precisionFrom = (await makeProduct('En from', precisionCategory.id)).id;
      ids.precisionNear = (await makeProduct('En to menos 1µs', precisionCategory.id)).id;
      ids.precisionAt = (await makeProduct('En to', precisionCategory.id)).id;
      await oneSale('precisionFrom', 'CASH', new Date(precisionFrom), {
        lines: [{ productId: ids.precisionFrom!, name: 'En from', unitPriceCents: 1000n }],
      });
      const near = await oneSale('precisionNear', 'CASH', new Date('2034-01-02T07:59:59.999Z'), {
        lines: [
          {
            productId: ids.precisionNear!,
            name: 'En to menos 1µs',
            unitPriceCents: 2000n,
            quantity: 2,
          },
        ],
      });
      await setSoldAt(near.sale.id, '2034-01-02T07:59:59.999999Z');
      await oneSale('precisionAt', 'CASH', new Date(precisionTo), {
        lines: [{ productId: ids.precisionAt!, name: 'En to', unitPriceCents: 4000n, quantity: 4 }],
      });
      // IDs de categoría > Number.MAX_SAFE_INTEGER con serialización exacta.
      const largeA = await category('Grande A E2-13', { id: 9007199254740993n });
      const largeB = await category('Grande B E2-13', { id: 9007199254740994n });
      categoryIds.largeA = largeA.id;
      categoryIds.largeB = largeB.id;
      ids.largeA = (await makeProduct('Grande A', largeA.id)).id;
      ids.largeB = (await makeProduct('Grande B', largeB.id)).id;
      await createSale({
        method: 'CASH',
        soldAt: new Date('2035-01-01T10:00:00.000Z'),
        lines: [
          {
            productId: ids.largeA!,
            name: 'Grande A',
            unitPriceCents: 6000n,
            quantity: 1,
          },
          {
            productId: ids.largeB!,
            name: 'Grande B',
            unitPriceCents: 3000n,
            quantity: 1,
          },
        ],
      });
      // Empates y orden COLLATE "C" con nombres iguales.
      const tieCategories: { key: string; name: string }[] = [
        { key: 'tiesMismoLow', name: 'Mismo' },
        { key: 'tiesMismoHigh', name: 'Mismo' },
        { key: 'tiesA', name: 'A' },
        { key: 'tiesLower', name: 'a' },
        { key: 'tiesAccent', name: 'Á' },
      ];
      for (const tie of tieCategories) {
        const tieCategory = await category(tie.name);
        categoryIds[tie.key] = tieCategory.id;
        const product = await makeProduct(`${tie.name} producto`, tieCategory.id);
        ids[tie.key] = product.id;
        await createSale({
          method: 'CASH',
          soldAt: new Date('2036-01-01T10:00:00.000Z'),
          lines: [{ productId: product.id, name: tie.name, unitPriceCents: 1000n }],
        });
      }
      // 1/6 y 5/6.
      const sixthA = await category('Sexto A E2-13');
      const sixthB = await category('Sexto B E2-13');
      categoryIds.sixthA = sixthA.id;
      categoryIds.sixthB = sixthB.id;
      const sixthProductA = await makeProduct('Sexto A', sixthA.id);
      const sixthProductB = await makeProduct('Sexto B', sixthB.id);
      await createSale({
        method: 'CASH',
        soldAt: new Date('2037-01-01T10:00:00.000Z'),
        lines: [
          { productId: sixthProductA.id, name: 'Sexto A', unitPriceCents: 1000n, quantity: 1 },
          { productId: sixthProductB.id, name: 'Sexto B', unitPriceCents: 1000n, quantity: 5 },
        ],
      });
      // 1/8 y 7/8.
      const eighthA = await category('Octavo A E2-13');
      const eighthB = await category('Octavo B E2-13');
      categoryIds.eighthA = eighthA.id;
      categoryIds.eighthB = eighthB.id;
      const eighthProductA = await makeProduct('Octavo A', eighthA.id);
      const eighthProductB = await makeProduct('Octavo B', eighthB.id);
      await createSale({
        method: 'CASH',
        soldAt: new Date('2038-01-01T10:00:00.000Z'),
        lines: [
          { productId: eighthProductA.id, name: 'Octavo A', unitPriceCents: 1000n, quantity: 1 },
          { productId: eighthProductB.id, name: 'Octavo B', unitPriceCents: 1000n, quantity: 7 },
        ],
      });
      // Categoría borrada con movimiento: integridad no resoluble → 500 saneado.
      const deletedCategory = await category('Borrada E2-13', {
        isActive: false,
        deletedAt: new Date(time),
      });
      categoryIds.deleted = deletedCategory.id;
      ids.deletedCategory = (
        await makeProduct('Producto de categoría borrada', deletedCategory.id)
      ).id;
      await oneSale('deletedCategory', 'CASH', new Date('2040-01-01T10:00:00.000Z'), {
        lines: [
          {
            productId: ids.deletedCategory!,
            name: 'Producto de categoría borrada',
            unitPriceCents: 1000n,
          },
        ],
      });
      // Baja lógica y no disponibilidad: las líneas siguen participando por la
      // Product.categoryId actual; no se filtran por deletedAt ni isAvailable.
      const previousCategory = await category('Categoría previa baja E2-13');
      const currentCategory = await category('Categoría actual baja E2-13');
      categoryIds.inactiveProductPrevious = previousCategory.id;
      categoryIds.inactiveProductCurrent = currentCategory.id;
      ids.inactiveProductDeleted = (await makeProduct('Baja lógica E2-13', previousCategory.id)).id;
      ids.inactiveProductUnavailable = (
        await makeProduct('No disponible E2-13', currentCategory.id)
      ).id;
      await createSale({
        method: 'CASH',
        soldAt: new Date('2039-01-01T10:00:00.000Z'),
        lines: [
          {
            productId: ids.inactiveProductDeleted!,
            name: 'Baja lógica E2-13',
            unitPriceCents: 1000n,
            quantity: 2,
          },
          {
            productId: ids.inactiveProductUnavailable!,
            name: 'No disponible E2-13',
            unitPriceCents: 3000n,
            quantity: 1,
          },
        ],
      });
      // La baja/no disponibilidad se aplica tras la venta, sin tocar la línea.
      await db.product.update({
        where: { id: ids.inactiveProductDeleted! },
        data: {
          categoryId: currentCategory.id,
          deletedAt: new Date(time),
          isAvailable: false,
        },
      });
      await db.product.update({
        where: { id: ids.inactiveProductUnavailable! },
        data: { isAvailable: false },
      });
    });
    afterAll(async () => {
      await db?.$disconnect();
    });

    it('exige ADMINISTRADOR, cabeceras privadas y rechaza body (R17)', async () => {
      const unauthenticated = await request(app).get(`${PATH}?${query(coreFrom, coreTo)}`);
      expect(unauthenticated.status).toBe(401);
      expect(unauthenticated.body).toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
      expect(unauthenticated.headers['cache-control']).toBe('no-store');
      expect(unauthenticated.headers['referrer-policy']).toBe('no-referrer');
      for (const actor of [customer, cashier, prep, manager]) {
        const denied = await participation(query(coreFrom, coreTo), actor);
        expect(denied.status).toBe(403);
        expect(denied.body).toMatchObject({ code: 'FORBIDDEN', status: 403 });
        expect(denied.headers['cache-control']).toBe('no-store');
        expect(denied.headers['referrer-policy']).toBe('no-referrer');
      }
      const pinRequired = await participation(query(coreFrom, coreTo), pinChange);
      expect(pinRequired.status).toBe(403);
      expect(pinRequired.body).toMatchObject({ code: 'PIN_CHANGE_REQUIRED', status: 403 });
      expect(pinRequired.headers['cache-control']).toBe('no-store');
      expect(pinRequired.headers['referrer-policy']).toBe('no-referrer');
      const allowed = await participation(query(coreFrom, coreTo));
      expect(allowed.status).toBe(200);
      expect(allowed.headers['cache-control']).toBe('no-store');
      expect(allowed.headers['referrer-policy']).toBe('no-referrer');
      conform(PATH, 'get', '200', allowed.body);
      const bodyRejected = await participation(query(coreFrom, coreTo)).send({});
      expect(bodyRejected.status).toBe(400);
      expect(bodyRejected.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
      expect(bodyRejected.headers['cache-control']).toBe('no-store');
      expect(bodyRejected.headers['referrer-policy']).toBe('no-referrer');
      const badOrigin = await request(app)
        .get(`${PATH}?${query(coreFrom, coreTo)}`)
        .set('Cookie', admin.cookie)
        .set('Origin', 'https://evil.test');
      expect(badOrigin.status).toBe(403);
      expect(badOrigin.body).toMatchObject({ code: 'ORIGIN_NOT_ALLOWED', status: 403 });
      expect(badOrigin.headers['cache-control']).toBe('no-store');
      expect(badOrigin.headers['referrer-policy']).toBe('no-referrer');
    });

    it('rechaza entrada estricta, extras, arrays, vacíos y cursor inexistente (R02–R04)', async () => {
      const valid = query(coreFrom, coreTo);
      for (const bad of [
        '',
        `to=${coreTo}&metric=units`,
        `from=${coreFrom}&metric=units`,
        `from=${coreFrom}&to=${coreTo}`,
        `${valid.replace('metric=units', 'metric=both')}`,
        `${valid.replace('metric=units', 'metric=')}`,
        `${valid.replace('metric=units', 'metric')}`,
        `${valid}&category=1`,
        `${valid}&categoryId=1`,
        `${valid}&top=5`,
        `${valid}&direction=top`,
        `${valid}&limit=20`,
        `${valid}&cursor=${Buffer.from('inexistente').toString('base64url')}`,
        `${valid}&granularity=day`,
        `${valid}&timeZone=UTC`,
        `${valid}&order=asc`,
        `${valid}&sort=name`,
        `${valid}&includeZeroSales=true`,
        `${valid}&includeInactive=true`,
        `${valid}&offset=0`,
        `${valid}&method=`,
        `${valid}&method=null`,
        `${valid}&method=cash`,
        `from=${coreFrom}&from=${coreFrom}&to=${coreTo}&metric=units`,
        `from[]=${coreFrom}&to=${coreTo}&metric=units`,
        `from=${coreFrom}&to=${coreTo}&metric=units&method[]=CASH`,
        `from=${coreFrom}&to=${coreTo}&metric=units&metric=amount`,
        `from=2031-06-01T08:00:00.0000Z&to=${coreTo}&metric=units`,
        `from=2031-06-01T08:00:00.000000Z&to=${coreTo}&metric=units`,
        `from=2031-02-30T08:00:00.000Z&to=${coreTo}&metric=units`,
        `from=2031-13-01T08:00:00.000Z&to=${coreTo}&metric=units`,
        `from=2031-06-01T24:00:00.000Z&to=${coreTo}&metric=units`,
        `from=2031-06-01T08:60:00.000Z&to=${coreTo}&metric=units`,
        `from=2031-06-01T08:00:00+01:00&to=${coreTo}&metric=units`,
        `from=${coreTo}&to=${coreFrom}&metric=units`,
        `from=${coreFrom}&to=${coreFrom}&metric=units`,
        `from=2000-01-01T07:59:59.999Z&to=${coreTo}&metric=units`,
        `from=2024-01-01T08:00:00.000Z&to=2025-01-01T08:00:00.001Z&metric=units`,
      ]) {
        const response = await participation(bad);
        expect(response.status, bad).toBe(400);
        expect(response.body, bad).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
        expect(response.headers['cache-control'], bad).toBe('no-store');
        expect(response.headers['referrer-policy'], bad).toBe('no-referrer');
      }
    });

    it('agrupa por categoría actual, incluye inactivas y concilia denominadores (R01/R05/R07/R09/R10)', async () => {
      const response = await participation(query(coreFrom, coreTo));
      expect(response.status).toBe(200);
      conform(PATH, 'get', '200', response.body);
      const data = response.body.data as ParticipationResponse['data'];
      expect(data.currency).toBe('MXN');
      expect(data.period).toEqual({
        from: coreFrom,
        to: coreTo,
        timeZone: 'America/Tijuana',
      });
      expect(data.method).toBeNull();
      expect(data.metric).toBe('units');
      expect(data.generatedAt).toMatch(/^[2-9]\d{3}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(Object.keys(data).sort()).toEqual(
        [
          'currency',
          'denominator',
          'generatedAt',
          'items',
          'method',
          'metric',
          'period',
          'totalCategories',
        ].sort(),
      );
      expect(data.denominator).toEqual({ unitsSold: '8', totalCents: '20500' });
      expect(data.totalCategories).toBe('2');
      expect(data.items.map((item) => item.categoryId)).toEqual([
        categoryIds.core!.toString(),
        categoryIds.inactive!.toString(),
      ]);
      const [core, inactive] = data.items;
      // Opciones no multiplican: 2 unidades y 9000 centavos de la línea.
      expect(core).toEqual({
        categoryId: categoryIds.core!.toString(),
        name: 'Cafés E2-13',
        isActive: true,
        unitsSold: '5',
        totalCents: '17500',
        sharePercent: '62.50',
      });
      // Inactiva incluida; reembolso no resta.
      expect(inactive).toEqual({
        categoryId: categoryIds.inactive!.toString(),
        name: 'Panadería E2-13',
        isActive: false,
        unitsSold: '3',
        totalCents: '3000',
        sharePercent: '37.50',
      });
      const units = data.items.reduce((total, item) => total + BigInt(item.unitsSold), 0n);
      const cents = data.items.reduce((total, item) => total + BigInt(item.totalCents), 0n);
      expect(units).toBe(BigInt(data.denominator.unitsSold));
      expect(cents).toBe(BigInt(data.denominator.totalCents));

      const amount = (await participation(query(coreFrom, coreTo, 'amount'))).body
        .data as ParticipationResponse['data'];
      expect(amount.items.map((item) => item.sharePercent)).toEqual(['85.37', '14.63']);

      for (const method of ['CASH', 'STRIPE'] as const) {
        const subset = (await participation(query(coreFrom, coreTo, 'units', `&method=${method}`)))
          .body.data as ParticipationResponse['data'];
        expect(subset.method).toBe(method);
        const reference = await referenceTotals(coreFrom, coreTo, 'units', method);
        expect(subset.denominator).toEqual(reference.denominator);
        expect(
          subset.items.map(({ categoryId, name, isActive, unitsSold, totalCents }) => ({
            categoryId,
            name,
            isActive,
            unitsSold,
            totalCents,
          })),
        ).toEqual(reference.items);
      }
      // Conciliación con el resumen administrativo del mismo rango/método.
      for (const method of [undefined, 'CASH', 'STRIPE'] as const) {
        const summary = await request(app)
          .get(
            `/api/v1/admin/dashboard/summary?from=${coreFrom}&to=${coreTo}${method ? `&method=${method}` : ''}`,
          )
          .set('Cookie', admin.cookie);
        expect(summary.status).toBe(200);
        const subset = (
          await participation(query(coreFrom, coreTo, 'units', method ? `&method=${method}` : ''))
        ).body.data as ParticipationResponse['data'];
        expect(subset.denominator.unitsSold, method).toBe(summary.body.data.unitsSold);
        expect(subset.denominator.totalCents, method).toBe(summary.body.data.totalCents);
        // `/sales/summary` (CAJERO/GERENTE) comparte el importe bruto del conjunto.
        const salesSummary = await request(app)
          .get(
            `/api/v1/sales/summary?from=${coreFrom}&to=${coreTo}${method ? `&method=${method}` : ''}`,
          )
          .set('Cookie', cashier.cookie);
        expect(salesSummary.status).toBe(200);
        expect(subset.denominator.totalCents, method).toBe(salesSummary.body.data.totalCents);
      }
    });

    it('reclasifica sin cambiar el total y respeta el precio histórico (R05/R06)', async () => {
      const reclass = (await participation(query(reclassFrom, reclassTo, 'amount'))).body
        .data as ParticipationResponse['data'];
      expect(reclass.totalCategories).toBe('1');
      expect(reclass.denominator).toEqual({ unitsSold: '2', totalCents: '9000' });
      expect(reclass.items).toEqual([
        {
          categoryId: categoryIds.reclassNew!.toString(),
          name: 'Categoría actual E2-13',
          isActive: true,
          unitsSold: '2',
          totalCents: '9000',
          sharePercent: '100.00',
        },
      ]);
      expect(
        reclass.items.some((item) => item.categoryId === categoryIds.reclassOld!.toString()),
      ).toBe(false);

      const price = (await participation(query(priceFrom, priceTo, 'amount'))).body
        .data as ParticipationResponse['data'];
      expect(price.items[0]).toMatchObject({
        categoryId: categoryIds.price!.toString(),
        unitsSold: '2',
        totalCents: '9000',
        sharePercent: '100.00',
      });
    });

    it('incluye líneas de producto con deletedAt e isAvailable=false por su categoría actual (R05/R13)', async () => {
      const response = await participation(query(inactiveProductFrom, inactiveProductTo, 'units'));
      expect(response.status).toBe(200);
      conform(PATH, 'get', '200', response.body);
      const data = response.body.data as ParticipationResponse['data'];
      expect(data.denominator).toEqual({ unitsSold: '3', totalCents: '5000' });
      expect(data.totalCategories).toBe('1');
      expect(data.items).toEqual([
        {
          categoryId: categoryIds.inactiveProductCurrent!.toString(),
          name: 'Categoría actual baja E2-13',
          isActive: true,
          unitsSold: '3',
          totalCents: '5000',
          sharePercent: '100.00',
        },
      ]);
      expect(
        data.items.some(
          (item) => item.categoryId === categoryIds.inactiveProductPrevious!.toString(),
        ),
      ).toBe(false);
    });

    it('respeta from inclusivo, to exclusivo y microsegundos (R03)', async () => {
      const response = await participation(query(precisionFrom, precisionTo));
      expect(response.status).toBe(200);
      const data = response.body.data as ParticipationResponse['data'];
      expect(data.period).toEqual({
        from: precisionFrom,
        to: precisionTo,
        timeZone: 'America/Tijuana',
      });
      expect(data.denominator).toEqual({ unitsSold: '3', totalCents: '5000' });
      expect(data.items).toHaveLength(1);
      expect(data.items[0]!.unitsSold).toBe('3');
      expect(data.items[0]!.sharePercent).toBe('100.00');
      // La venta exactamente en `to` no se incluye: 4 unidades y 4000 centavos
      // habrían cambiado el denominador.
      expect(data.denominator.unitsSold).not.toBe('7');
      const accepted = await participation(
        'from=2034-01-01T08:00:00Z&to=2034-01-02T08:00:00.123Z&metric=units',
      );
      expect(accepted.status).toBe(200);
      expect((accepted.body.data as ParticipationResponse['data']).period).toEqual({
        from: precisionFrom,
        to: '2034-01-02T08:00:00.123Z',
        timeZone: 'America/Tijuana',
      });
    });

    it('serie vacía, base cero con ítems y porcentajes half-up (R11–R13)', async () => {
      const zero = await participation(query(zeroFrom, zeroTo, 'amount'));
      expect(zero.status).toBe(200);
      conform(PATH, 'get', '200', zero.body);
      expect(zero.body.data as ParticipationResponse['data']).toMatchObject({
        denominator: { unitsSold: '0', totalCents: '0' },
        totalCategories: '0',
        items: [],
      });

      const zeroBase = (await participation(query(zeroBaseFrom, zeroBaseTo, 'amount'))).body
        .data as ParticipationResponse['data'];
      expect(zeroBase.denominator).toEqual({ unitsSold: '3', totalCents: '0' });
      expect(zeroBase.totalCategories).toBe('1');
      expect(zeroBase.items).toEqual([
        {
          categoryId: categoryIds.zeroBase!.toString(),
          name: 'Gratis E2-13',
          isActive: true,
          unitsSold: '3',
          totalCents: '0',
          sharePercent: '0.00',
        },
      ]);
      const zeroBaseUnits = (await participation(query(zeroBaseFrom, zeroBaseTo, 'units'))).body
        .data as ParticipationResponse['data'];
      expect(zeroBaseUnits.items[0]!.sharePercent).toBe('100.00');

      const sixths = (await participation(query(sixthsFrom, sixthsTo, 'units'))).body
        .data as ParticipationResponse['data'];
      expect(sixths.items.map((item) => item.sharePercent)).toEqual(['83.33', '16.67']);
      const eighths = (await participation(query(eighthsFrom, eighthsTo, 'units'))).body
        .data as ParticipationResponse['data'];
      expect(eighths.items.map((item) => item.sharePercent)).toEqual(['87.50', '12.50']);
    });

    it('ordena por métrica DESC, nombre COLLATE "C" y categoryId numérico (R15)', async () => {
      const response = await participation(query(tiesFrom, tiesTo, 'units'));
      expect(response.status).toBe(200);
      const data = response.body.data as ParticipationResponse['data'];
      expect(data.denominator.unitsSold).toBe('5');
      expect(data.items.map((item) => item.name)).toEqual(['A', 'Mismo', 'Mismo', 'a', 'Á']);
      const mismo = data.items.filter((item) => item.name === 'Mismo');
      expect(mismo).toHaveLength(2);
      expect(BigInt(mismo[0]!.categoryId)).toBeLessThan(BigInt(mismo[1]!.categoryId));
      const repeated = await participation(query(tiesFrom, tiesTo, 'units'));
      expect((repeated.body.data as ParticipationResponse['data']).items).toEqual(data.items);
    });

    it('mantiene strings exactos con IDs por encima de 2^53 (R16)', async () => {
      const amount = await participation(query(largeFrom, largeTo, 'amount'));
      expect(amount.status).toBe(200);
      conform(PATH, 'get', '200', amount.body);
      const data = amount.body.data as ParticipationResponse['data'];
      expect(data.denominator).toEqual({
        unitsSold: '2',
        totalCents: '9000',
      });
      expect(data.items).toEqual([
        {
          categoryId: '9007199254740993',
          name: 'Grande A E2-13',
          isActive: true,
          unitsSold: '1',
          totalCents: '6000',
          sharePercent: '66.67',
        },
        {
          categoryId: '9007199254740994',
          name: 'Grande B E2-13',
          isActive: true,
          unitsSold: '1',
          totalCents: '3000',
          sharePercent: '33.33',
        },
      ]);
      const units = (await participation(query(largeFrom, largeTo, 'units'))).body
        .data as ParticipationResponse['data'];
      expect(units.items.map((item) => item.sharePercent)).toEqual(['50.00', '50.00']);
      expect(JSON.stringify(amount.body)).toContain('"9007199254740993"');
    });

    it('falla 500 saneado si una categoría borrada conserva movimiento (R14)', async () => {
      const response = await participation(query(deletedFrom, deletedTo, 'amount'));
      expect(response.status).toBe(500);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['referrer-policy']).toBe('no-referrer');
      expect(response.body).toMatchObject({ code: 'INTERNAL_ERROR', status: 500 });
      expect(JSON.stringify(response.body)).not.toContain('Integridad de categorías');
      expect(JSON.stringify(response.body)).not.toContain('SELECT');
    });

    it('sanea 413/429/500/503 y conserva las cabeceras privadas (R18a)', async () => {
      const path = `${PATH}?${query(coreFrom, coreTo)}`;
      const dependency = createApp({
        authService: auth,
        salesService: {
          async categoryParticipation() {
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
          async categoryParticipation() {
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
          async categoryParticipation() {
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

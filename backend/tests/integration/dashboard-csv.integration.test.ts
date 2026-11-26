import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request, { type Response as SupertestResponse } from 'supertest';
import { createApp } from '../../src/app.js';
import { createDatabase } from '../../src/config/database.js';
import { seedDemo } from '../../scripts/lib/demo-data.js';
import { AuthRepository } from '../../src/modules/auth/auth.repository.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { hashCredential } from '../../src/modules/auth/auth.credentials.js';
import { digest } from '../../src/modules/auth/auth.tokens.js';
import type { Principal, RoleName } from '../../src/modules/auth/auth.types.js';
import { exportLimitExceeded } from '../../src/shared/http/problem.js';
import { SalesRepository, SalesService } from '../../src/modules/sales/sales.service.js';

const target = process.env.CATALOG_TEST_DATABASE_URL,
  origin = 'http://localhost:5173';
type Identity = { principal: Principal; cookie: string; csrf: string };
type Method = 'CASH' | 'STRIPE';
type Line = {
  productId: bigint;
  name: string;
  unitPriceCents: bigint;
  quantity: number;
  option?: boolean;
};
type SaleOptions = {
  method: Method;
  soldAt: Date;
  lines: Line[];
  guestName?: string;
  saleNumber?: string;
};

type Export = {
  meta: Map<string, string>;
  header: string[];
  rows: Record<string, string>[];
  raw: string;
};

function parseCsv(raw: string): string[][] {
  const source = raw.replace(/^\uFEFF/, '');
  const records: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < source.length; index++) {
    const character = source[index]!;
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index++;
        } else quoted = false;
      } else cell += character;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\r' && source[index + 1] === '\n') {
      row.push(cell);
      records.push(row);
      row = [];
      cell = '';
      index++;
    } else cell += character;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    records.push(row);
  }
  return records;
}

function parseExport(raw: string): Export {
  const records = parseCsv(raw);
  const meta = new Map<string, string>();
  let index = 0;
  for (; index < records.length; index++) {
    const record = records[index]!;
    if (record[0] !== '#meta') break;
    meta.set(record[1]!, record[2]!);
  }
  const header = records[index] ?? [];
  const rows = records
    .slice(index + 1)
    .map((record) =>
      Object.fromEntries(header.map((key, position) => [key, record[position] ?? ''])),
    );
  return { meta, header, rows, raw };
}

describe.skipIf(!target)('DA-001 E2 CSV: exportaciones con HTTP y PostgreSQL aislado', () => {
  const coreFrom = '2027-06-01T08:00:00.000Z',
    coreTo = '2027-06-02T08:00:00.000Z',
    volumeFrom = '2027-07-01T08:00:00.000Z',
    volumeTo = '2027-07-02T08:00:00.000Z',
    movementFrom = '2027-08-01T08:00:00.000Z',
    movementTo = '2027-08-02T08:00:00.000Z',
    categoryFrom = '2027-09-01T08:00:00.000Z',
    categoryTo = '2027-09-01T10:00:00.000Z',
    reclassFrom = '2027-09-02T08:00:00.000Z',
    reclassTo = '2027-09-02T09:00:00.000Z',
    residueFrom = '2027-09-03T08:00:00.000Z',
    residueTo = '2027-09-03T09:00:00.000Z',
    formulaFrom = '2027-08-10T08:00:00.000Z',
    formulaTo = '2027-08-11T08:00:00.000Z',
    deletedFrom = '2027-09-04T08:00:00.000Z',
    deletedTo = '2027-09-04T09:00:00.000Z',
    concurrentFrom = '2027-10-01T08:00:00.000Z',
    concurrentTo = '2027-10-01T09:00:00.000Z',
    largeFrom = '2027-11-01T08:00:00.000Z',
    largeTo = '2027-11-01T09:00:00.000Z',
    zeroFrom = '2027-12-01T08:00:00.000Z',
    zeroTo = '2027-12-02T08:00:00.000Z',
    emptyFrom = '2000-01-01T08:00:00.000Z',
    emptyTo = '2000-01-02T08:00:00.000Z',
    limitProductsFrom = '2030-02-01T08:00:00.000Z',
    limitProductsTo = '2030-02-02T08:00:00.000Z';
  let db: ReturnType<typeof createDatabase>,
    auth: AuthService,
    app: ReturnType<typeof createApp>,
    cashSessionId: bigint,
    mainCategoryId: bigint,
    optionValueId: bigint;
  const time = Date.UTC(2026, 10, 24, 18, 30, 0, 0),
    now = () => new Date(time);
  let admin: Identity,
    cashier: Identity,
    prep: Identity,
    customer: Identity,
    manager: Identity,
    pinChange: Identity;
  const ids: Record<string, bigint> = {};
  const categoryIds: Record<string, bigint> = {};
  const formulaSales: { value: string; saleId: bigint; totalCents: bigint }[] = [];

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
    extra: {
      categoryId?: bigint;
      deletedAt?: Date | null;
      isAvailable?: boolean;
      createdAt?: Date;
      id?: bigint;
    } = {},
  ) {
    return db.product.create({
      data: {
        name,
        categoryId: extra.categoryId ?? mainCategoryId,
        basePriceCents: 100n,
        isAvailable: extra.isAvailable ?? true,
        deletedAt: extra.deletedAt ?? null,
        ...(extra.createdAt ? { createdAt: extra.createdAt } : {}),
        ...(extra.id === undefined ? {} : { id: extra.id }),
      },
    });
  }

  async function makeCategory(name: string, isActive = true) {
    return db.category.create({ data: { name, isActive } });
  }

  async function createSale(options: SaleOptions) {
    const lineTotals = options.lines.map((line) => line.unitPriceCents * BigInt(line.quantity));
    const totalCents = lineTotals.reduce((total, lineTotal) => total + lineTotal, 0n);
    const order = await db.order.create({
      data: {
        folio: `CSV-${randomUUID().slice(0, 8)}`,
        source: 'CASHIER',
        status: 'EN_PREPARACION',
        paymentMethod: options.method,
        totalCents,
        guestName: options.guestName,
        cashQrTokenHash: options.method === 'CASH' ? randomBytes(32).toString('hex') : null,
        paymentExpiresAt: new Date(options.soldAt.getTime() + 3600000),
        paidAt: options.soldAt,
      },
    });
    for (const [index, line] of options.lines.entries()) {
      const item = await db.orderItem.create({
        data: {
          orderId: order.id,
          productId: line.productId,
          productNameSnapshot: line.name,
          basePriceCentsSnapshot: line.unitPriceCents,
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
    const sale = await db.sale.create({
      data: {
        saleNumber: options.saleNumber ?? `CSV-${randomUUID().slice(0, 12)}`,
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

  function csv(path: string, actor: Identity = admin) {
    return request(app).get(path).set('Cookie', actor.cookie);
  }

  const salesPath = (from: string, to: string, extra = '') =>
    `/api/v1/admin/dashboard/sales-export.csv?from=${from}&to=${to}${extra}`;
  const seriesPath = (from: string, to: string, extra = '') =>
    `/api/v1/admin/dashboard/sales-series-export.csv?from=${from}&to=${to}${extra}`;
  const rankingPath = (from: string, to: string, extra = '') =>
    `/api/v1/admin/dashboard/product-ranking-export.csv?from=${from}&to=${to}${extra}`;
  const movementPath = (from: string, to: string, extra = '') =>
    `/api/v1/admin/dashboard/no-movement-products-export.csv?from=${from}&to=${to}${extra}`;
  const categoryPath = (from: string, to: string, extra = '') =>
    `/api/v1/admin/dashboard/category-participation-export.csv?from=${from}&to=${to}${extra}`;

  async function exportRows(path: string, actor: Identity = admin) {
    const response = await csv(path, actor);
    expect(response.status, response.text.slice(0, 300)).toBe(200);
    return parseExport(response.text);
  }

  beforeAll(async () => {
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
    admin = await identity('admin-csv', 'ADMINISTRADOR');
    cashier = await identity('cashier-csv', 'CAJERO');
    prep = await identity('prep-csv', 'PREPARACION');
    customer = await identity('Customer csv', 'CLIENTE', '+520000000099');
    manager = await identity('manager-csv', 'GERENTE');
    const pinRole = await db.role.findUniqueOrThrow({ where: { name: 'ADMINISTRADOR' } });
    const pinUser = await db.user.create({
      data: {
        name: 'pin-change-csv',
        roleId: pinRole.id,
        accountType: 'STAFF',
        username: 'pin-change-csv',
        passwordHash: 'fixture-not-used',
        mustChangePin: true,
      },
    });
    pinChange = await session(pinUser.id, 'ADMINISTRADOR');
    mainCategoryId = (await db.category.findFirstOrThrow({ where: { name: 'Café (demo)' } })).id;
    optionValueId = (await db.optionValue.findFirstOrThrow({ where: { name: 'Almendra' } })).id;
    cashSessionId = (
      await db.cashSession.create({
        data: { employeeId: cashier.principal.userId, openingAmountCents: 0n },
      })
    ).id;

    for (const [key, name, extra] of [
      ['coreA', 'Americano CSV', {}],
      ['coreB', 'Latte CSV', {}],
      ['coreC', 'Moka CSV', {}],
      ['special', 'Café "La Especial", S.A.', {}],
      ['formula', '=1+1', {}],
      ['dash', '-Moka', {}],
      ['multi', 'Combo CSV', {}],
      ['free', 'Gratis CSV', {}],
    ] as const)
      ids[key] = (await makeProduct(name, extra)).id;

    const at = (hour: number, minute = 0, second = 0) =>
      new Date(Date.UTC(2027, 5, 1, hour, minute, second, 0));

    // Venta multilínea con opción, reembolso y estado actual LISTO.
    const multiSale = await createSale({
      method: 'CASH',
      soldAt: at(8, 5),
      guestName: 'Cliente Secreto',
      lines: [
        {
          productId: ids.multi!,
          name: 'Combo CSV',
          unitPriceCents: 3500n,
          quantity: 2,
          option: true,
        },
        { productId: ids.coreA!, name: 'Americano CSV', unitPriceCents: 2500n, quantity: 1 },
      ],
    });
    await db.refund.create({
      data: {
        paymentId: multiSale.payment.id,
        amountCents: 1000n,
        reason: 'Fixture bruto sin descontar',
        status: 'SUCCEEDED',
      },
    });
    await db.order.update({
      where: { id: multiSale.order.id },
      data: {
        status: 'LISTO',
        readyAt: new Date('2027-06-01T08:10:00.000Z'),
        readyByEmployeeId: cashier.principal.userId,
      },
    });
    // Venta con microsegundos reales en sold_at.
    const micro = await createSale({
      method: 'STRIPE',
      soldAt: at(9),
      lines: [
        {
          productId: ids.special!,
          name: 'Café "La Especial", S.A.',
          unitPriceCents: 4000n,
          quantity: 1,
        },
      ],
    });
    await setSoldAt(micro.sale.id, '2027-06-01T09:00:00.123456Z');
    await createSale({
      method: 'CASH',
      soldAt: at(9, 10),
      lines: [{ productId: ids.formula!, name: '=1+1', unitPriceCents: 1000n, quantity: 3 }],
    });
    await createSale({
      method: 'STRIPE',
      soldAt: at(9, 20),
      lines: [{ productId: ids.dash!, name: '-Moka', unitPriceCents: 1500n, quantity: 2 }],
    });
    await createSale({
      method: 'CASH',
      soldAt: at(9, 30),
      lines: [{ productId: ids.free!, name: 'Gratis CSV', unitPriceCents: 0n, quantity: 1 }],
    });
    // Empate exacto de sold_at para el desempate por saleId.
    const tieA = await createSale({
      method: 'CASH',
      soldAt: at(12),
      lines: [{ productId: ids.coreA!, name: 'Americano CSV', unitPriceCents: 1000n, quantity: 1 }],
    });
    const tieB = await createSale({
      method: 'STRIPE',
      soldAt: at(12),
      lines: [{ productId: ids.coreB!, name: 'Latte CSV', unitPriceCents: 1000n, quantity: 1 }],
    });
    await setSoldAt(tieA.sale.id, '2027-06-01T12:00:00.654321Z');
    await setSoldAt(tieB.sale.id, '2027-06-01T12:00:00.654321Z');
    // Resto hasta superar una página visible (20) del listado /sales.
    for (let index = 0; index < 18; index++) {
      const key = ['coreA', 'coreB', 'coreC'][index % 3]!;
      await createSale({
        method: index % 2 === 0 ? 'CASH' : 'STRIPE',
        soldAt: at(13, index),
        lines: [
          {
            productId: ids[key]!,
            name: `${key} CSV`,
            unitPriceCents: 800n + BigInt(index),
            quantity: 1,
          },
        ],
      });
    }
    // Bordes: justo antes de from y exactamente en to no entran.
    const before = await createSale({
      method: 'CASH',
      soldAt: new Date(coreFrom),
      lines: [{ productId: ids.coreA!, name: 'Americano CSV', unitPriceCents: 1n, quantity: 1 }],
    });
    await setSoldAt(before.sale.id, '2027-06-01T07:59:59.999999Z');
    const atTo = await createSale({
      method: 'CASH',
      soldAt: new Date(coreTo),
      lines: [{ productId: ids.coreA!, name: 'Americano CSV', unitPriceCents: 1n, quantity: 1 }],
    });
    await setSoldAt(atTo.sale.id, coreTo.replace('000Z', '000000Z'));
    // Último microsegundo incluido.
    const last = await createSale({
      method: 'CASH',
      soldAt: at(23),
      lines: [{ productId: ids.coreB!, name: 'Latte CSV', unitPriceCents: 500n, quantity: 1 }],
    });
    await setSoldAt(last.sale.id, '2027-06-02T07:59:59.999999Z');

    // Volumen para ranking top 5/10/20 y bottom.
    for (let index = 1; index <= 25; index++) {
      const name = `Volumen CSV ${String(index).padStart(2, '0')}`;
      ids[name] = (await makeProduct(name)).id;
      await createSale({
        method: index % 2 === 0 ? 'CASH' : 'STRIPE',
        soldAt: new Date(Date.UTC(2027, 6, 1, 8, index, 0, 0)),
        lines: [{ productId: ids[name]!, name, unitPriceCents: BigInt(100 + index), quantity: 1 }],
      });
    }

    // Identidad mayor que Number.MAX_SAFE_INTEGER sin convertir a Number.
    ids.large = (await makeProduct('ID grande CSV', { id: 9007199254740993n })).id;
    await createSale({
      method: 'STRIPE',
      soldAt: new Date('2027-11-01T08:05:00.000Z'),
      lines: [{ productId: ids.large!, name: 'ID grande CSV', unitPriceCents: 1200n, quantity: 2 }],
    });

    // Universo sin movimiento con más de una página del endpoint.
    const movementCategory = await makeCategory('Sin movimiento CSV');
    await db.product.createMany({
      data: Array.from({ length: 60 }, (_, index) => ({
        name: `SinMov CSV ${String(index + 1).padStart(2, '0')}`,
        categoryId: movementCategory.id,
        basePriceCents: 100n,
        createdAt: new Date('2024-01-10T08:00:00.000Z'),
      })),
    });
    ids.nmMoved = (
      await makeProduct('SinMov vendido', {
        categoryId: movementCategory.id,
        createdAt: new Date('2024-01-10T08:00:00.000Z'),
      })
    ).id;
    ids.nmOther = (
      await makeProduct('SinMov otro método', {
        categoryId: movementCategory.id,
        createdAt: new Date('2024-01-10T08:00:00.000Z'),
      })
    ).id;
    ids.nmUnavailable = (
      await makeProduct('SinMov no disponible', {
        categoryId: movementCategory.id,
        isAvailable: false,
        createdAt: new Date('2024-01-10T08:00:00.000Z'),
      })
    ).id;
    ids.nmDeleted = (
      await makeProduct('SinMov borrado', {
        categoryId: movementCategory.id,
        deletedAt: new Date('2025-01-01T00:00:00.000Z'),
        createdAt: new Date('2024-01-10T08:00:00.000Z'),
      })
    ).id;
    ids.nmAtTo = (
      await makeProduct('SinMov alta en to', {
        categoryId: movementCategory.id,
        createdAt: new Date(movementTo),
      })
    ).id;
    const inactiveCategory = await makeCategory('Categoría inactiva CSV', false);
    await makeProduct('SinMov categoría inactiva', {
      categoryId: inactiveCategory.id,
      createdAt: new Date('2024-01-10T08:00:00.000Z'),
    });
    await createSale({
      method: 'CASH',
      soldAt: new Date('2027-08-01T08:30:00.000Z'),
      lines: [
        { productId: ids.nmMoved!, name: 'SinMov vendido', unitPriceCents: 1000n, quantity: 1 },
      ],
    });
    await createSale({
      method: 'STRIPE',
      soldAt: new Date('2027-08-01T08:40:00.000Z'),
      lines: [
        { productId: ids.nmOther!, name: 'SinMov otro método', unitPriceCents: 1000n, quantity: 1 },
      ],
    });

    // Categorías: activa, inactiva, base cero, reclasificación y residuo 99.99.
    categoryIds.a = (await makeCategory('Categorías CSV A')).id;
    categoryIds.inactive = (await makeCategory('Categorías CSV Inactiva', false)).id;
    categoryIds.zero = (await makeCategory('Categorías CSV Cero')).id;
    categoryIds.d = (await makeCategory('Categorías CSV D')).id;
    categoryIds.r1 = (await makeCategory('Residuo CSV 1')).id;
    categoryIds.r2 = (await makeCategory('Residuo CSV 2')).id;
    categoryIds.r3 = (await makeCategory('Residuo CSV 3')).id;
    categoryIds.deleted = (await makeCategory('Categorías CSV Borrada')).id;

    ids.catA = (await makeProduct('Cat A CSV', { categoryId: categoryIds.a })).id;
    ids.catInactive = (
      await makeProduct('Cat inactiva CSV', { categoryId: categoryIds.inactive })
    ).id;
    ids.catZero = (await makeProduct('Cat cero CSV', { categoryId: categoryIds.zero })).id;
    ids.catReclass = (await makeProduct('Cat reclasificada CSV', { categoryId: categoryIds.a })).id;
    ids.catR1 = (await makeProduct('Residuo producto 1', { categoryId: categoryIds.r1 })).id;
    ids.catR2 = (await makeProduct('Residuo producto 2', { categoryId: categoryIds.r2 })).id;
    ids.catR3 = (await makeProduct('Residuo producto 3', { categoryId: categoryIds.r3 })).id;
    ids.catDeleted = (await makeProduct('Cat borrada CSV', { categoryId: categoryIds.deleted })).id;

    await createSale({
      method: 'CASH',
      soldAt: new Date('2027-09-01T08:05:00.000Z'),
      lines: [
        { productId: ids.catA!, name: 'Cat A CSV', unitPriceCents: 3500n, quantity: 2 },
        { productId: ids.catZero!, name: 'Cat cero CSV', unitPriceCents: 0n, quantity: 3 },
      ],
    });
    await createSale({
      method: 'STRIPE',
      soldAt: new Date('2027-09-01T08:10:00.000Z'),
      lines: [
        {
          productId: ids.catInactive!,
          name: 'Cat inactiva CSV',
          unitPriceCents: 2000n,
          quantity: 1,
        },
      ],
    });
    await createSale({
      method: 'CASH',
      soldAt: new Date('2027-09-02T08:05:00.000Z'),
      lines: [
        {
          productId: ids.catReclass!,
          name: 'Cat reclasificada CSV',
          unitPriceCents: 1500n,
          quantity: 2,
        },
      ],
    });
    await db.product.update({
      where: { id: ids.catReclass! },
      data: { categoryId: categoryIds.d },
    });
    await createSale({
      method: 'CASH',
      soldAt: new Date('2027-09-03T08:05:00.000Z'),
      lines: [
        { productId: ids.catR1!, name: 'Residuo producto 1', unitPriceCents: 1n, quantity: 1 },
        { productId: ids.catR2!, name: 'Residuo producto 2', unitPriceCents: 1n, quantity: 1 },
        { productId: ids.catR3!, name: 'Residuo producto 3', unitPriceCents: 1n, quantity: 1 },
      ],
    });
    await createSale({
      method: 'CASH',
      soldAt: new Date('2027-09-04T08:05:00.000Z'),
      lines: [
        { productId: ids.catDeleted!, name: 'Cat borrada CSV', unitPriceCents: 1000n, quantity: 1 },
      ],
    });
    await db.category.update({
      where: { id: categoryIds.deleted },
      data: { deletedAt: new Date('2027-09-04T08:30:00.000Z') },
    });

    // Antifórmulas en el campo de texto saleNumber, sin tocar importes ni IDs.
    const formulaValues = ['=1+1', '+cmd', '-Moka', '@SUM(A1)', '\tcmd', '\rcmd', '\ncmd', '  =1'];
    for (const [index, value] of formulaValues.entries()) {
      const totalCents = 100n + BigInt(index);
      const seeded = await createSale({
        method: index % 2 === 0 ? 'CASH' : 'STRIPE',
        soldAt: new Date(Date.UTC(2027, 7, 10, 8, index, 0, 0)),
        saleNumber: value,
        lines: [
          { productId: ids.coreA!, name: 'Americano CSV', unitPriceCents: totalCents, quantity: 1 },
        ],
      });
      formulaSales.push({ value, saleId: seeded.sale.id, totalCents });
    }

    // Volumen que excede el tope real de 2 000 productos sin movimiento.
    const limitCategory = await makeCategory('Límite CSV');
    await db.product.createMany({
      data: Array.from({ length: 2001 }, (_, index) => ({
        name: `Límite CSV ${String(index + 1).padStart(4, '0')}`,
        categoryId: limitCategory.id,
        basePriceCents: 100n,
        createdAt: new Date('2030-01-01T08:00:00.000Z'),
      })),
    });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  it('solo ADMINISTRADOR obtiene 200 y emite cabeceras CSV privadas', async () => {
    const routes = [
      salesPath(coreFrom, coreTo),
      seriesPath(coreFrom, coreTo, '&granularity=hour'),
      rankingPath(coreFrom, coreTo, '&metric=units&direction=top&top=5'),
      movementPath(movementFrom, movementTo),
      categoryPath(categoryFrom, categoryTo, '&metric=units'),
    ];
    const unauthenticated = await request(app).get(routes[0]!);
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers['cache-control']).toBe('no-store');
    expect(unauthenticated.headers['referrer-policy']).toBe('no-referrer');
    for (const actor of [customer, cashier, prep, manager])
      for (const route of routes) {
        const denied = await csv(route, actor);
        expect(denied.status, `${actor.principal.role} ${route}`).toBe(403);
        expect(denied.body).toMatchObject({ code: 'FORBIDDEN', status: 403 });
        expect(denied.headers['cache-control']).toBe('no-store');
        expect(denied.headers['referrer-policy']).toBe('no-referrer');
      }
    for (const route of routes) {
      const pin = await csv(route, pinChange);
      expect(pin.status).toBe(403);
      expect(pin.body).toMatchObject({ code: 'PIN_CHANGE_REQUIRED', status: 403 });
    }
    for (const route of routes) {
      const allowed = await csv(route);
      expect(allowed.status, route).toBe(200);
      expect(allowed.headers['content-type']).toContain('text/csv; charset=utf-8');
      expect(allowed.headers['content-disposition']).toMatch(
        /^attachment; filename="[A-Za-z0-9.-]+\.csv"$/,
      );
      expect(allowed.headers['cache-control']).toBe('no-store');
      expect(allowed.headers['referrer-policy']).toBe('no-referrer');
      expect(allowed.headers['x-content-type-options']).toBe('nosniff');
      expect(allowed.text.startsWith('\uFEFF')).toBe(true);
      expect(allowed.text.endsWith('\r\n')).toBe(true);
    }
  });

  it('rechaza extras, tokens, cursor, paginación, arrays, vacíos y body en las cinco rutas', async () => {
    const bases = [
      [salesPath(coreFrom, coreTo), '&'],
      [seriesPath(coreFrom, coreTo, '&granularity=hour'), '&'],
      [rankingPath(coreFrom, coreTo, '&metric=units&direction=top'), '&'],
      [movementPath(movementFrom, movementTo), '&'],
      [categoryPath(categoryFrom, categoryTo, '&metric=units'), '&'],
    ] as const;
    const extras = [
      'token=abc',
      'access_token=abc',
      'jwt=abc',
      'cursor=abc',
      'limit=20',
      'page=1',
      'offset=0',
      'sort=units',
      'timeZone=UTC',
      'foo=bar',
      'method=',
      'from[]=2027-06-01T08:00:00.000Z',
      'category=1',
    ];
    for (const [route, separator] of bases)
      for (const extra of extras) {
        const response = await csv(`${route}${separator}${extra}`);
        expect(response.status, `${route} ${extra}`).toBe(400);
        expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
        expect(response.headers['content-type']).toContain('application/problem+json');
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.text).not.toContain('#meta');
      }
    for (const [route] of bases) {
      const repeated = await csv(`${route}&from=2027-06-01T08:00:00.000Z`);
      expect(repeated.status).toBe(400);
      const body = await csv(route).send({});
      expect(body.status).toBe(400);
      expect(body.text).not.toContain('#meta');
    }
  });

  it('precedencia: autenticación y rol se evalúan antes que la query con token', async () => {
    const routes = [
      salesPath(coreFrom, coreTo),
      seriesPath(coreFrom, coreTo, '&granularity=hour'),
      rankingPath(coreFrom, coreTo, '&metric=units&direction=top'),
      movementPath(movementFrom, movementTo),
      categoryPath(categoryFrom, categoryTo, '&metric=units'),
    ];
    for (const route of routes) {
      const anonymous = await request(app).get(`${route}&token=abc`);
      expect(anonymous.status, route).toBe(401);
      expect(anonymous.body).toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
      expect(anonymous.text).not.toContain('#meta');

      const cashierToken = await csv(`${route}&token=abc`, cashier);
      expect(cashierToken.status, route).toBe(403);
      expect(cashierToken.body).toMatchObject({ code: 'FORBIDDEN', status: 403 });
      expect(cashierToken.text).not.toContain('#meta');

      const adminToken = await csv(`${route}&token=abc`);
      expect(adminToken.status, route).toBe(400);
      expect(adminToken.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
      expect(adminToken.text).not.toContain('#meta');
    }
  });

  it('rechaza fechas imposibles, precisión 4–6, offsets y rangos fuera de contrato', async () => {
    const builders = [
      (from: string, to: string) => salesPath(from, to),
      (from: string, to: string) => seriesPath(from, to, '&granularity=hour'),
      (from: string, to: string) => rankingPath(from, to, '&metric=units&direction=top'),
      (from: string, to: string) => movementPath(from, to),
      (from: string, to: string) => categoryPath(from, to, '&metric=units'),
    ] as const;
    const ranges = [
      ['2027-06-01T08:00:00.0000Z', '2027-06-01T09:00:00.000Z'],
      ['2027-06-01T08:00:00.000000Z', '2027-06-01T09:00:00.000Z'],
      ['2027-06-01T08:00:00+01:00', '2027-06-01T09:00:00.000Z'],
      ['2027-02-30T08:00:00.000Z', '2027-06-01T09:00:00.000Z'],
      ['2027-06-01T09:00:00.000Z', '2027-06-01T08:00:00.000Z'],
      ['2000-01-01T07:59:59.999Z', '2027-06-01T09:00:00.000Z'],
      ['2024-01-01T08:00:00.000Z', '2025-01-01T08:00:00.001Z'],
    ] as const;
    for (const build of builders)
      for (const [from, to] of ranges) {
        const response = await csv(build(from, to));
        expect(response.status, `${build(from, to)}`).toBe(400);
        expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
        expect(response.text).not.toContain('#meta');
      }
    for (const build of builders) {
      const missing = await csv(build('', '2027-06-01T09:00:00.000Z'));
      expect(missing.status).toBe(400);
    }
  });

  it('ventas: conjunto completo frente a la página, orden, conciliación y sin PII', async () => {
    const response = await csv(salesPath(coreFrom, coreTo));
    expect(response.status).toBe(200);
    const file = parseExport(response.text);
    expect(file.meta.get('export')).toBe('sales-export');
    expect(file.meta.get('method')).toBe('all');
    expect(file.meta.get('rowOrder')).toBe('soldAtUtc ASC, saleId ASC');
    expect(file.meta.get('orderStatusScope')).toBe('current-at-generation');
    expect(file.meta.get('rowLimit')).toBe('20000');
    expect(file.meta.get('truncated')).toBe('false');
    expect(file.rows.length).toBeGreaterThan(20);
    expect(Number(file.meta.get('rowCount'))).toBe(file.rows.length);
    expect(file.header).toEqual([
      'saleId',
      'saleNumber',
      'orderId',
      'paymentId',
      'soldAtUtc',
      'soldAtLocal',
      'method',
      'orderStatus',
      'currency',
      'totalCents',
      'unitsSold',
      'lineCount',
    ]);
    const orders = file.rows.map((row) => [row.soldAtUtc!, BigInt(row.saleId!)]);
    expect(orders).toEqual(
      [...orders].sort((left, right) =>
        left[0]! === right[0]! ? (left[1]! < right[1]! ? -1 : 1) : left[0]! < right[0]! ? -1 : 1,
      ),
    );
    expect(file.raw).not.toContain('Cliente Secreto');
    expect(file.raw).not.toContain('+520000000099');
    expect(file.raw).not.toContain('folio');
    expect(file.raw).toContain('2027-06-01T09:00:00.123456Z');
    expect(file.raw).toContain('2027-06-01T02:00:00.123456-07:00');
    expect(file.raw).toContain('2027-06-02T07:59:59.999999Z');
    const multi = file.rows.find((row) => row.unitsSold === '3' && row.lineCount === '2');
    expect(multi).toBeDefined();
    expect(multi!.orderStatus).toBe('LISTO');
    expect(multi!.totalCents).toBe('9500');
    // La página visible solo muestra 20; el CSV contiene el conjunto completo.
    const page = await request(app)
      .get(`/api/v1/sales?from=${coreFrom}&to=${coreTo}`)
      .set('Cookie', admin.cookie);
    expect(page.status).toBe(200);
    expect(page.body.data).toHaveLength(20);
    const summary = await request(app)
      .get(`/api/v1/sales/summary?from=${coreFrom}&to=${coreTo}`)
      .set('Cookie', admin.cookie);
    const adminSummary = await request(app)
      .get(`/api/v1/admin/dashboard/summary?from=${coreFrom}&to=${coreTo}`)
      .set('Cookie', admin.cookie);
    expect(summary.status).toBe(200);
    expect(adminSummary.status).toBe(200);
    expect(file.meta.get('totals.totalCents')).toBe(summary.body.data.totalCents);
    expect(file.meta.get('totals.totalCents')).toBe(adminSummary.body.data.totalCents);
    expect(file.meta.get('totals.unitsSold')).toBe(adminSummary.body.data.unitsSold);
    const expectedCents = file.rows.reduce((sum, row) => sum + BigInt(row.totalCents!), 0n);
    const expectedUnits = file.rows.reduce((sum, row) => sum + BigInt(row.unitsSold!), 0n);
    const expectedLines = file.rows.reduce((sum, row) => sum + BigInt(row.lineCount!), 0n);
    expect(file.meta.get('totals.totalCents')).toBe(expectedCents.toString());
    expect(file.meta.get('totals.unitsSold')).toBe(expectedUnits.toString());
    expect(file.meta.get('totals.lineCount')).toBe(expectedLines.toString());
  });

  it('ventas: método, cero resultados, límite inyectado y sin CSV parcial', async () => {
    for (const method of ['CASH', 'STRIPE']) {
      const file = await exportRows(salesPath(coreFrom, coreTo, `&method=${method}`));
      expect(file.meta.get('method')).toBe(method);
      expect(file.rows.every((row) => row.method === method)).toBe(true);
      const summary = await request(app)
        .get(`/api/v1/sales/summary?from=${coreFrom}&to=${coreTo}&method=${method}`)
        .set('Cookie', admin.cookie);
      expect(file.meta.get('totals.totalCents')).toBe(summary.body.data.totalCents);
    }
    const zero = await exportRows(salesPath(zeroFrom, zeroTo));
    expect(zero.meta.get('rowCount')).toBe('0');
    expect(zero.rows).toEqual([]);
    expect(zero.header[0]).toBe('saleId');

    const limited = createApp({
      authService: auth,
      salesService: {
        salesCsv: async () => {
          throw exportLimitExceeded();
        },
      } as never,
      catalogRateLimit: 10000,
    });
    const response = await request(limited)
      .get(salesPath(coreFrom, coreTo))
      .set('Cookie', admin.cookie);
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'EXPORT_LIMIT_EXCEEDED', status: 400 });
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.text).not.toContain('#meta');
  });

  it('ventas: antifórmulas en saleNumber sin alterar importe, ID ni unidades', async () => {
    const file = await exportRows(salesPath(formulaFrom, formulaTo));
    expect(file.meta.get('rowCount')).toBe(String(formulaSales.length));
    expect(file.rows).toHaveLength(formulaSales.length);
    for (const seeded of formulaSales) {
      const row = file.rows.find((candidate) => candidate.saleId === seeded.saleId.toString());
      expect(row, seeded.value).toBeDefined();
      expect(row!.saleNumber, seeded.value).toBe(`'${seeded.value}`);
      expect(row!.saleId).toBe(seeded.saleId.toString());
      expect(row!.totalCents).toBe(seeded.totalCents.toString());
      expect(row!.unitsSold).toBe('1');
      expect(row!.orderId).toMatch(/^[1-9][0-9]*$/);
      expect(row!.paymentId).toMatch(/^[1-9][0-9]*$/);
    }
  });

  it('series: coincide con el endpoint, DST 23/25 h y límites 745/368 sin truncar', async () => {
    for (const [from, to, granularity, buckets] of [
      [coreFrom, coreTo, 'hour', 24],
      ['2026-03-08T08:00:00.000Z', '2026-03-09T07:00:00.000Z', 'day', 1],
      ['2026-03-08T08:00:00.000Z', '2026-03-09T07:00:00.000Z', 'hour', 23],
      ['2026-11-01T07:00:00.000Z', '2026-11-02T08:00:00.000Z', 'day', 1],
      ['2026-11-01T07:00:00.000Z', '2026-11-02T08:00:00.000Z', 'hour', 25],
    ] as const) {
      const file = await exportRows(seriesPath(from, to, `&granularity=${granularity}`));
      const json = await request(app)
        .get(
          `/api/v1/admin/dashboard/sales-series?from=${from}&to=${to}&granularity=${granularity}`,
        )
        .set('Cookie', admin.cookie);
      expect(json.status).toBe(200);
      expect(file.rows).toHaveLength(buckets);
      expect(file.meta.get('bucketCount')).toBe(String(buckets));
      expect(file.meta.get('rowCount')).toBe(String(buckets));
      expect(file.meta.get('totals.totalCents')).toBe(json.body.data.totals.totalCents);
      expect(file.meta.get('totals.ticketCount')).toBe(json.body.data.totals.ticketCount);
      expect(file.meta.get('totals.unitsSold')).toBe(json.body.data.totals.unitsSold);
      expect(file.rows.map((row) => row.startUtc)).toEqual(
        json.body.data.buckets.map((bucket: { start: string }) => bucket.start),
      );
      expect(file.rows.map((row) => row.localStart)).toEqual(
        json.body.data.buckets.map((bucket: { localStart: string }) => bucket.localStart),
      );
      expect(file.raw).toContain(',false,');
    }
    // Una serie con ventas conserva al menos un bucket vacío con 0,0,0.
    const coreSeries = await exportRows(seriesPath(coreFrom, coreTo, '&granularity=hour'));
    expect(
      coreSeries.rows.filter(
        (row) => row.totalCents === '0' && row.ticketCount === '0' && row.unitsSold === '0',
      ).length,
    ).toBeGreaterThan(0);
    const spring = await exportRows(
      seriesPath('2026-03-08T08:00:00.000Z', '2026-03-09T07:00:00.000Z', '&granularity=hour'),
    );
    expect(spring.rows.map((row) => row.localStart)).toContain('2026-03-08T03:00:00-07:00');
    const fall = await exportRows(
      seriesPath('2026-11-01T07:00:00.000Z', '2026-11-02T08:00:00.000Z', '&granularity=hour'),
    );
    expect(
      fall.rows.filter((row) => row.localStart?.startsWith('2026-11-01T01:00:00')),
    ).toHaveLength(2);
    const maxHours = await exportRows(
      seriesPath('2026-01-01T00:30:00.000Z', '2026-02-01T00:30:00.000Z', '&granularity=hour'),
    );
    expect(maxHours.rows).toHaveLength(745);
    expect(maxHours.meta.get('rowLimit')).toBe('745');
    const overHours = await csv(
      seriesPath('2026-01-01T00:30:00.000Z', '2026-02-01T00:30:00.001Z', '&granularity=hour'),
    );
    expect(overHours.status).toBe(400);
    expect(overHours.body.code).toBe('VALIDATION_ERROR');
    // Rango day máximo: 366 × 24 h; el máximo práctico de buckets es 367.
    const maxDays = await exportRows(
      seriesPath('2026-04-01T08:00:00.000Z', '2027-04-02T08:00:00.000Z', '&granularity=day'),
    );
    expect(Number(maxDays.meta.get('bucketCount'))).toBeLessThanOrEqual(368);
    expect(Number(maxDays.meta.get('bucketCount'))).toBeGreaterThanOrEqual(366);
    const overDays = await csv(
      seriesPath('2026-04-01T08:00:00.000Z', '2027-04-02T08:00:00.001Z', '&granularity=day'),
    );
    expect(overDays.status).toBe(400);
    const zeroSeries = await exportRows(
      seriesPath('2026-01-01T00:00:00.000Z', '2026-01-01T01:00:00.000Z', '&granularity=hour'),
    );
    expect(zeroSeries.rows).toHaveLength(1);
    expect(zeroSeries.rows[0]).toMatchObject({ totalCents: '0', ticketCount: '0', unitsSold: '0' });
  });

  it('ranking: top 5/10/20 y bottom coinciden con el endpoint, metadatos y escape', async () => {
    for (const top of ['5', '10', '20'])
      for (const metric of ['units', 'amount'])
        for (const direction of ['top', 'bottom']) {
          const extra = `&metric=${metric}&direction=${direction}&top=${top}`;
          const file = await exportRows(rankingPath(volumeFrom, volumeTo, extra));
          const json = await request(app)
            .get(
              `/api/v1/admin/dashboard/product-ranking?from=${volumeFrom}&to=${volumeTo}${extra}`,
            )
            .set('Cookie', admin.cookie);
          expect(json.status).toBe(200);
          expect(file.rows.map((row) => row.productId)).toEqual(
            json.body.data.items.map((item: { productId: string }) => item.productId),
          );
          expect(file.rows.map((row) => row.position)).toEqual(
            json.body.data.items.map((item: { position: string }) => item.position),
          );
          expect(file.rows.map((row) => row.unitsSold)).toEqual(
            json.body.data.items.map((item: { unitsSold: string }) => item.unitsSold),
          );
          expect(file.rows.map((row) => row.totalCents)).toEqual(
            json.body.data.items.map((item: { totalCents: string }) => item.totalCents),
          );
          expect(file.meta.get('top')).toBe(top);
          expect(file.meta.get('matchedProductCount')).toBe(json.body.data.matchedProductCount);
          expect(file.meta.get('matchedTotals.unitsSold')).toBe(
            json.body.data.matchedTotals.unitsSold,
          );
          expect(file.meta.get('matchedTotals.totalCents')).toBe(
            json.body.data.matchedTotals.totalCents,
          );
          expect(file.meta.get('truncated')).toBe(String(json.body.data.truncated));
          expect(file.rows.length).toBe(Math.min(Number(top), 25));
        }
    // Nombres con comillas/coma y fórmulas: escape RFC y antifórmulas en texto.
    const escaped = await exportRows(
      rankingPath(coreFrom, coreTo, '&metric=units&direction=top&top=20'),
    );
    expect(escaped.raw).toContain('"Café ""La Especial"", S.A."');
    expect(escaped.raw).toContain("'=1+1");
    expect(escaped.raw).toContain("'-Moka");
    const formulaRow = escaped.rows.find((row) => row.name === "'=1+1");
    expect(formulaRow).toBeDefined();
    expect(formulaRow!.unitsSold).toBe('3');
    expect(formulaRow!.totalCents).toBe('3000');
    // Default top=5 y eco del corte efectivo.
    const defaultTop = await exportRows(
      rankingPath(volumeFrom, volumeTo, '&metric=units&direction=top'),
    );
    expect(defaultTop.meta.get('top')).toBe('5');
    expect(defaultTop.rows).toHaveLength(5);
    // ID mayor que 2^53 como texto decimal exacto, sin exponentes.
    const large = await exportRows(rankingPath(largeFrom, largeTo, '&metric=units&direction=top'));
    expect(large.rows[0]).toMatchObject({
      productId: '9007199254740993',
      unitsSold: '2',
      totalCents: '2400',
    });
    expect(large.rows[0]!.productId).toMatch(/^[1-9][0-9]*$/);
    // Ranking sin productos con movimiento en el rango: metadatos, encabezado y cero filas.
    const zero = await exportRows(
      rankingPath(emptyFrom, emptyTo, '&metric=units&direction=top&top=5'),
    );
    expect(zero.meta.get('rowCount')).toBe('0');
    expect(zero.meta.get('matchedProductCount')).toBe('0');
    expect(zero.meta.get('matchedTotals.unitsSold')).toBe('0');
    expect(zero.meta.get('matchedTotals.totalCents')).toBe('0');
    expect(zero.meta.get('truncated')).toBe('false');
    expect(zero.rows).toEqual([]);
    expect(zero.header).toEqual([
      'position',
      'productId',
      'name',
      'nameSource',
      'unitsSold',
      'totalCents',
    ]);
  });

  it('sin movimiento: conjunto completo > página, semántica, método y cero', async () => {
    const file = await exportRows(movementPath(movementFrom, movementTo));
    const jsonItems: Record<string, string>[] = [];
    let cursor: string | null = null;
    do {
      const query: string = `from=${movementFrom}&to=${movementTo}&limit=50${cursor ? `&cursor=${cursor}` : ''}`;
      const page: SupertestResponse = await request(app)
        .get(`/api/v1/admin/dashboard/no-movement-products?${query}`)
        .set('Cookie', admin.cookie);
      expect(page.status).toBe(200);
      jsonItems.push(...page.body.data.items);
      cursor = page.body.data.page.nextCursor;
    } while (cursor);
    expect(jsonItems.length).toBeGreaterThan(20);
    expect(file.rows.map((row) => row.productId)).toEqual(jsonItems.map((item) => item.productId));
    expect(file.meta.get('totalNoMovementProducts')).toBe(String(jsonItems.length));
    expect(file.meta.get('rowCount')).toBe(String(jsonItems.length));
    expect(file.meta.get('rowLimit')).toBe('2000');
    expect(file.rows.map((row) => row.name)).toEqual(
      [...file.rows.map((row) => row.name)].sort((left, right) =>
        Buffer.compare(Buffer.from(left!, 'utf8'), Buffer.from(right!, 'utf8')),
      ),
    );
    expect(file.rows.map((row) => row.productId)).not.toContain(ids.nmMoved!.toString());
    expect(file.rows.map((row) => row.productId)).not.toContain(ids.nmAtTo!.toString());
    expect(file.rows.map((row) => row.productId)).not.toContain(ids.nmDeleted!.toString());
    expect(file.rows.map((row) => row.productId)).toContain(ids.nmUnavailable!.toString());
    expect(file.rows.map((row) => row.productId)).not.toContain(ids.nmOther!.toString());
    expect(file.raw).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z/);
    expect(file.raw).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}[+-]\d{2}:\d{2}/);

    const cash = await exportRows(movementPath(movementFrom, movementTo, '&method=CASH'));
    expect(cash.rows.map((row) => row.productId)).not.toContain(ids.nmMoved!.toString());
    expect(cash.rows.map((row) => row.productId)).toContain(ids.nmOther!.toString());
    const zero = await exportRows(movementPath(emptyFrom, emptyTo));
    expect(zero.rows).toEqual([]);
    expect(zero.meta.get('totalNoMovementProducts')).toBe('0');
  });

  it('sin movimiento: conjunto real superior a 2 000 responde 400 sin archivo', async () => {
    const response = await csv(movementPath(limitProductsFrom, limitProductsTo));
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'EXPORT_LIMIT_EXCEEDED', status: 400 });
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.text).not.toContain('#meta');
  });

  it('categorías: coincide con el endpoint, inactivas, reclasificación, base cero y residuo 99.99', async () => {
    for (const methodQuery of ['', '&method=CASH', '&method=STRIPE'])
      for (const metric of ['units', 'amount']) {
        const extra = `&metric=${metric}${methodQuery}`;
        const file = await exportRows(categoryPath(categoryFrom, categoryTo, extra));
        const json = await request(app)
          .get(
            `/api/v1/admin/dashboard/category-participation?from=${categoryFrom}&to=${categoryTo}${extra}`,
          )
          .set('Cookie', admin.cookie);
        expect(json.status).toBe(200);
        expect(file.rows.map((row) => row.categoryId)).toEqual(
          json.body.data.items.map((item: { categoryId: string }) => item.categoryId),
        );
        expect(file.rows.map((row) => row.sharePercent)).toEqual(
          json.body.data.items.map((item: { sharePercent: string }) => item.sharePercent),
        );
        expect(file.meta.get('denominator.unitsSold')).toBe(json.body.data.denominator.unitsSold);
        expect(file.meta.get('denominator.totalCents')).toBe(json.body.data.denominator.totalCents);
        expect(file.meta.get('totalCategories')).toBe(json.body.data.totalCategories);
        if (methodQuery === '') expect(file.rows.map((row) => row.isActive)).toContain('false');
      }
    const zeroBase = await exportRows(categoryPath(categoryFrom, categoryTo, '&metric=amount'));
    const zeroRow = zeroBase.rows.find((row) => row.categoryId === categoryIds.zero!.toString());
    expect(zeroRow).toMatchObject({ sharePercent: '0.00', totalCents: '0' });
    const reclassified = await exportRows(categoryPath(reclassFrom, reclassTo, '&metric=units'));
    expect(reclassified.rows.map((row) => row.categoryId)).toEqual([categoryIds.d!.toString()]);
    const residue = await exportRows(categoryPath(residueFrom, residueTo, '&metric=amount'));
    expect(residue.rows).toHaveLength(3);
    expect(residue.rows.map((row) => row.sharePercent)).toEqual(['33.33', '33.33', '33.33']);
    const sum = residue.rows.reduce(
      (total, row) => total + BigInt(row.sharePercent!.replace('.', '')),
      0n,
    );
    expect(sum).toBe(9999n);
    const zero = await exportRows(categoryPath(emptyFrom, emptyTo, '&metric=units'));
    expect(zero.rows).toEqual([]);
    expect(zero.meta.get('totalCategories')).toBe('0');
  });

  it('categorías: integridad no resoluble 500 saneado y tope inyectado 400', async () => {
    const deleted = await csv(categoryPath(deletedFrom, deletedTo, '&metric=units'));
    expect(deleted.status).toBe(500);
    expect(deleted.body).toMatchObject({ code: 'INTERNAL_ERROR', status: 500 });
    expect(deleted.headers['content-type']).toContain('application/problem+json');
    expect(deleted.text).not.toContain('#meta');
    expect(JSON.stringify(deleted.body)).not.toContain('categories');
    const limited = createApp({
      authService: auth,
      salesService: {
        categoryParticipationCsv: async () => {
          throw exportLimitExceeded();
        },
      } as never,
      catalogRateLimit: 10000,
    });
    const response = await request(limited)
      .get(categoryPath(categoryFrom, categoryTo, '&metric=units'))
      .set('Cookie', admin.cookie);
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'EXPORT_LIMIT_EXCEEDED', status: 400 });
    expect(response.text).not.toContain('#meta');
  });

  it('mantiene coherencia interna con ventas concurrentes', async () => {
    const names = ['coreA', 'coreB', 'coreC'];
    const inserts = Array.from({ length: 10 }, (_, index) =>
      createSale({
        method: index % 2 === 0 ? 'CASH' : 'STRIPE',
        soldAt: new Date(Date.UTC(2027, 9, 1, 8, index, 0, 0)),
        lines: [
          {
            productId: ids[names[index % names.length]!]!,
            name: `${names[index % names.length]} CSV`,
            unitPriceCents: BigInt(500 + index),
            quantity: 1,
          },
        ],
      }),
    );
    const reads = Array.from({ length: 4 }, async () => {
      const file = await exportRows(salesPath(concurrentFrom, concurrentTo));
      const cents = file.rows.reduce((sum, row) => sum + BigInt(row.totalCents!), 0n);
      const units = file.rows.reduce((sum, row) => sum + BigInt(row.unitsSold!), 0n);
      expect(file.meta.get('totals.totalCents')).toBe(cents.toString());
      expect(file.meta.get('totals.unitsSold')).toBe(units.toString());
      expect(Number(file.meta.get('rowCount'))).toBe(file.rows.length);
      return file;
    });
    await Promise.all([...inserts, ...reads]);
    const final = await exportRows(salesPath(concurrentFrom, concurrentTo));
    expect(final.rows.length).toBe(10);
    expect(final.meta.get('totals.totalCents')).toBe(
      final.rows.reduce((sum, row) => sum + BigInt(row.totalCents!), 0n).toString(),
    );
  });

  it('sanea 413, 429, 500, 503, Origin inválido y nunca devuelve CSV parcial', async () => {
    const route = salesPath(coreFrom, coreTo);
    const path = route;
    const oversized = await request(app)
      .get(path)
      .set('Cookie', admin.cookie)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ payload: 'a'.repeat(300_000) }));
    expect(oversized.status).toBe(413);
    expect(oversized.body).toMatchObject({ code: 'PAYLOAD_TOO_LARGE', status: 413 });
    expect(oversized.headers['cache-control']).toBe('no-store');
    expect(oversized.text).not.toContain('#meta');

    const badOrigin = await request(app)
      .get(path)
      .set('Cookie', admin.cookie)
      .set('Origin', 'https://evil.test');
    expect(badOrigin.status).toBe(403);
    expect(badOrigin.body).toMatchObject({ code: 'ORIGIN_NOT_ALLOWED', status: 403 });
    expect(badOrigin.text).not.toContain('#meta');

    const dependency = createApp({
      authService: auth,
      salesService: {
        salesCsv: async () => {
          throw Object.assign(new Error('secret-db-detail'), { code: 'P1001' });
        },
      } as never,
      catalogRateLimit: 10000,
    });
    const unavailable = await request(dependency).get(path).set('Cookie', admin.cookie);
    expect(unavailable.status).toBe(503);
    expect(unavailable.body).toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE', status: 503 });
    expect(JSON.stringify(unavailable.body)).not.toContain('secret-db-detail');
    expect(unavailable.text).not.toContain('#meta');

    const internal = createApp({
      authService: auth,
      salesService: {
        salesCsv: async () => {
          throw new Error('secret-internal-detail');
        },
      } as never,
      catalogRateLimit: 10000,
    });
    const unexpected = await request(internal).get(path).set('Cookie', admin.cookie);
    expect(unexpected.status).toBe(500);
    expect(unexpected.body).toMatchObject({ code: 'INTERNAL_ERROR', status: 500 });
    expect(JSON.stringify(unexpected.body)).not.toContain('secret-internal-detail');
    expect(unexpected.text).not.toContain('#meta');

    const throttledApp = createApp({
      authService: auth,
      salesService: new SalesService(new SalesRepository(db)),
      catalogRateLimit: 1,
    });
    const first = await request(throttledApp).get(path).set('Cookie', admin.cookie);
    expect(first.status).toBe(200);
    const throttled = await request(throttledApp).get(path).set('Cookie', admin.cookie);
    expect(throttled.status).toBe(429);
    expect(throttled.body).toMatchObject({ code: 'RATE_LIMITED', status: 429 });
    expect(throttled.headers['cache-control']).toBe('no-store');
    expect(throttled.text).not.toContain('#meta');
  });
});

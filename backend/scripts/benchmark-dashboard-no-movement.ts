import process from 'node:process';
import console from 'node:console';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { URL } from 'node:url';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { seedDemo } from './lib/demo-data.js';
import { digest } from '../src/modules/auth/auth.tokens.js';
import type { Principal } from '../src/modules/auth/auth.types.js';
import { SalesRepository, SalesService } from '../src/modules/sales/sales.service.js';
import { salesNoMovementQuery } from '../src/modules/sales/sales.validation.js';

/**
 * Medición reproducible E2-09 (TASK-DA-E2-09). No forma parte de `npm test` ni
 * del runner de integración y no añade índices ni migraciones. Crea una base
 * temporal aislada, siembra 15 000 ventas sintéticas en 31 días y 2 000
 * productos (solo 1 200 participan en ventas), y mide páginas reales del
 * servicio `noMovementProducts` con `EXPLAIN (ANALYZE, BUFFERS)`.
 *
 * El resultado es una medición local del entorno disponible, no un SLA. No
 * imprime credenciales ni parámetros de conexión.
 *
 * Uso:
 *
 *   node --env-file=.env.docker --import tsx scripts/benchmark-dashboard-no-movement.ts
 *
 * Variables opcionales: BENCH_SALES (15000), BENCH_PRODUCTS (2000),
 * BENCH_SOLD_PRODUCTS (1200), BENCH_RUNS (5), BENCH_WARMUP (1), BENCH_PAGES (3).
 */

const target = process.env.TEST_DATABASE_URL;
if (!target)
  throw new Error('Configura TEST_DATABASE_URL (cafeteria_test local) para el benchmark.');
const parsed = new URL(target);
if (
  decodeURIComponent(parsed.pathname) !== '/cafeteria_test' ||
  !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
)
  throw new Error('El benchmark solo usa una cafeteria_test local explícita.');

const runCount = Number(process.env.BENCH_RUNS ?? 5);
const warmupCount = Number(process.env.BENCH_WARMUP ?? 1);
const salesCount = Number(process.env.BENCH_SALES ?? 15000);
const productCount = Number(process.env.BENCH_PRODUCTS ?? 2000);
const soldProductCount = Math.min(Number(process.env.BENCH_SOLD_PRODUCTS ?? 1200), productCount);
const pageCount = Math.min(Math.max(Number(process.env.BENCH_PAGES ?? 3), 1), 20);
const from = '2032-01-01T00:00:00.000Z';
const to = '2032-02-01T00:00:00.000Z';
const fromMs = Date.parse(from);
const toMs = Date.parse(to);
const rangeDays = (toMs - fromMs) / 86_400_000;
const prefix = `BENCH-${randomBytes(4).toString('hex')}-`;
const productBaseId = 5_000_000n;
const databaseName = `cafeteria_bench_${randomBytes(6).toString('hex')}`;
const admin = new pg.Client({ connectionString: target, connectionTimeoutMillis: 5000 });
let databaseUrl: string | undefined;
let database: PrismaClient | undefined;
let data: pg.Client | undefined;
const report: Record<string, unknown> = {
  contract: 'TASK-DA-E2-09 noMovementProducts',
  coverage: {
    isolated: true,
    localBenchmark: true,
    sla: false,
    indexesAdded: false,
    measuredPages: pageCount,
  },
  volume: {
    requestedSales: salesCount,
    requestedProducts: productCount,
    soldProductSubset: soldProductCount,
    rangeDays,
    linesPerSale: '1–2',
    methods: ['CASH', 'STRIPE'],
    deletedProducts: Math.floor(productCount / 23),
    unavailableProducts: Math.floor(productCount / 11),
  },
  range: { from, to },
  runs: runCount,
  warmup: warmupCount,
  scenarios: [] as unknown[],
};
let benchmarkCompleted = false;

function redactConnection(text: string, url: string): string {
  return text
    .replaceAll(url, '[url-omitida]')
    .replace(/postgres(?:ql)?:\/\/\S+/gi, '[url-omitida]');
}

function migrate(url: string) {
  const result = spawnSync(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    {
      cwd: new URL('../', import.meta.url),
      env: { ...process.env, DATABASE_URL: url, SHADOW_DATABASE_URL: '' },
      encoding: 'utf8',
      timeout: 120000,
    },
  );
  if (result.error || result.status !== 0)
    throw new Error(`Falló migración aislada (código ${result.status ?? 'TIMEOUT'}).`);
}

function queryKind(query: string): string {
  const text = query.trimStart().toUpperCase();
  if (text.startsWith('BEGIN')) return 'begin';
  if (text.startsWith('COMMIT')) return 'commit';
  if (text.startsWith('ROLLBACK')) return 'rollback';
  if (text.includes('WITH UNIVERSE')) return 'noMovementAggregation';
  if (text.includes('FROM USERS WHERE ID')) return 'actorUserLock';
  if (text.includes('FROM AUTH_SESSIONS WHERE ID')) return 'actorSessionLock';
  if (text.includes('AUTH_SESSIONS')) return 'actorSessionLookup';
  if (text.includes('"USERS"')) return 'actorUserLookup';
  if (text.includes('"ROLES"')) return 'actorRoleLookup';
  return 'other';
}

function summarizePlan(node: unknown, depth = 0): unknown {
  if (depth > 4 || typeof node !== 'object' || node === null) return undefined;
  const record = node as Record<string, unknown>;
  return {
    node: record['Node Type'],
    relation: record['Relation Name'],
    joinType: record['Join Type'],
    actualRows: record['Actual Rows'],
    totalMs: record['Actual Total Time'],
    sharedHitBlocks: record['Shared Hit Blocks'],
    sharedReadBlocks: record['Shared Read Blocks'],
    plans: Array.isArray(record['Plans'])
      ? record['Plans'].map((child) => summarizePlan(child, depth + 1)).filter(Boolean)
      : undefined,
  };
}

async function seedProducts(client: pg.Client, categoryId: bigint) {
  const inserted = await client.query(
    `INSERT INTO products (id, category_id, name, base_price_cents, is_available,
       deleted_at, created_at, updated_at)
     SELECT $1::bigint + g, $2::bigint, $3 || 'P-' || lpad(g::text, 4, '0'),
            1000 + ((g % 40) * 100),
            CASE WHEN g % 11 = 0 THEN false ELSE true END,
            CASE WHEN g % 23 = 0 THEN $4::timestamptz - interval '1 day' ELSE NULL END,
            $4::timestamptz - interval '30 days', now()
     FROM generate_series(1, $5::int) AS g`,
    [productBaseId.toString(), categoryId.toString(), prefix, from, productCount],
  );
  if (inserted.rowCount !== productCount)
    throw new Error(`Productos inesperados: ${inserted.rowCount ?? 0}.`);
}

async function seedVolume(client: pg.Client, cashierId: bigint, cashSessionId: bigint) {
  const inserted = await client.query(
    `INSERT INTO orders (folio, source, status, payment_method, total_cents,
       cash_qr_token_hash, payment_expires_at, paid_at, created_at, updated_at)
     SELECT $1 || 'O-' || g::text, 'CASHIER', 'EN_PREPARACION',
            CASE WHEN g % 3 = 0 THEN 'CASH'::"PaymentMethod" ELSE 'STRIPE'::"PaymentMethod" END,
            0,
            CASE WHEN g % 3 = 0 THEN md5($1 || g::text) || md5(g::text || $1) ELSE NULL END,
            $2::timestamptz + ((g % 44640) * interval '1 minute') + interval '1 hour',
            $2::timestamptz + ((g % 44640) * interval '1 minute'),
            now(), now()
     FROM generate_series(1, $3::int) AS g`,
    [prefix, from, salesCount],
  );
  if (inserted.rowCount !== salesCount)
    throw new Error(`Ventas inesperadas: ${inserted.rowCount ?? 0}.`);

  // Primera línea de cada venta: solo el subconjunto de productos con movimiento.
  await client.query(
    `INSERT INTO order_items (order_id, product_id, product_name_snapshot,
       base_price_cents_snapshot, unit_price_cents, quantity, line_total_cents)
     WITH numbered AS (
       SELECT o.id, row_number() OVER (ORDER BY o.id) AS rn
       FROM orders o WHERE o.folio LIKE $1 || '%'
     )
     SELECT n.id, p.id, p.name, p.base_price_cents, p.base_price_cents,
            (1 + (n.rn % 3))::int,
            p.base_price_cents * (1 + (n.rn % 3))::bigint
     FROM numbered n
     JOIN products p ON p.id = $2::bigint + (((n.rn - 1) % $3::int) + 1)`,
    [prefix, productBaseId.toString(), soldProductCount],
  );

  // Segunda línea solo en ventas pares: 1–2 líneas por venta.
  await client.query(
    `INSERT INTO order_items (order_id, product_id, product_name_snapshot,
       base_price_cents_snapshot, unit_price_cents, quantity, line_total_cents)
     WITH numbered AS (
       SELECT o.id, row_number() OVER (ORDER BY o.id) AS rn
       FROM orders o WHERE o.folio LIKE $1 || '%'
     )
     SELECT n.id, p.id, p.name, p.base_price_cents, p.base_price_cents,
            (1 + ((n.rn + 1) % 3))::int,
            p.base_price_cents * (1 + ((n.rn + 1) % 3))::bigint
     FROM numbered n
     JOIN products p ON p.id = $2::bigint + (((n.rn * 7) % $3::int) + 1)
     WHERE n.rn % 2 = 0`,
    [prefix, productBaseId.toString(), soldProductCount],
  );

  await client.query(
    `UPDATE orders o SET total_cents = t.total, updated_at = now()
     FROM (
       SELECT oi.order_id, sum(oi.line_total_cents) AS total
       FROM order_items oi JOIN orders x ON x.id = oi.order_id
       WHERE x.folio LIKE $1 || '%'
       GROUP BY oi.order_id
     ) t
     WHERE o.id = t.order_id`,
    [prefix],
  );

  await client.query(
    `INSERT INTO payments (order_id, method, status, amount_cents, currency,
       cashier_id, cash_session_id, cash_received_cents, change_cents,
       confirmed_at, created_at, updated_at)
     SELECT o.id, o.payment_method, 'SUCCEEDED'::"PaymentStatus", o.total_cents, 'MXN',
            CASE WHEN o.payment_method = 'CASH' THEN $2::bigint ELSE NULL END,
            CASE WHEN o.payment_method = 'CASH' THEN $3::bigint ELSE NULL END,
            CASE WHEN o.payment_method = 'CASH' THEN o.total_cents ELSE NULL END,
            CASE WHEN o.payment_method = 'CASH' THEN 0 ELSE NULL END,
            o.paid_at, now(), now()
     FROM orders o WHERE o.folio LIKE $1 || '%'`,
    [prefix, cashierId.toString(), cashSessionId.toString()],
  );

  await client.query(
    `INSERT INTO sales (sale_number, order_id, payment_id, total_cents, sold_at)
     SELECT 'BS-' || o.id::text, o.id, p.id, o.total_cents, o.paid_at
     FROM orders o JOIN payments p ON p.order_id = o.id
     WHERE o.folio LIKE $1 || '%'`,
    [prefix],
  );
}

try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  const url = new URL(target);
  url.pathname = `/${databaseName}`;
  databaseUrl = url.href;
  migrate(databaseUrl);

  database = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 5000,
      max: 10,
    }),
    log: [{ emit: 'event', level: 'query' }],
  });
  const queries: { query: string; params: string; duration: number }[] = [];
  (
    database as unknown as {
      $on(
        event: 'query',
        listener: (event: { query: string; params: string; duration: number }) => void,
      ): void;
    }
  ).$on('query', (event) => {
    queries.push({ query: event.query, params: event.params, duration: event.duration });
  });
  await seedDemo(database);

  const role = await database.role.findUniqueOrThrow({ where: { name: 'ADMINISTRADOR' } });
  const user = await database.user.create({
    data: {
      name: 'benchmark-no-movement',
      roleId: role.id,
      accountType: 'STAFF',
      username: 'benchmark-no-movement',
      passwordHash: 'benchmark-not-a-real-credential',
    },
  });
  const stored = await database.authSession.create({
    data: {
      userId: user.id,
      familyId: randomUUID(),
      refreshTokenHash: digest(randomBytes(32).toString('base64url')),
      absoluteExpiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  const actor: Principal = {
    userId: user.id,
    sessionId: stored.id,
    familyId: 'benchmark-family',
    role: 'ADMINISTRADOR',
    accountType: 'STAFF',
    mustChangePin: false,
  };
  const cashSession = await database.cashSession.create({
    data: { employeeId: user.id, openingAmountCents: 0n },
  });
  const category = await database.category.findFirstOrThrow();

  data = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  await data.connect();
  const seedStarted = performance.now();
  await seedProducts(data, category.id);
  await seedVolume(data, user.id, cashSession.id);
  report.seedMs = Math.round(performance.now() - seedStarted);

  const [salesVolume] = (
    await data.query<{ sales: string; cash: string; stripe: string }>(
      `SELECT count(*)::text AS sales,
              count(*) FILTER (WHERE p.method = 'CASH')::text AS cash,
              count(*) FILTER (WHERE p.method = 'STRIPE')::text AS stripe
       FROM sales s JOIN payments p ON p.id = s.payment_id
       WHERE s.sold_at >= $1::timestamptz AND s.sold_at < $2::timestamptz`,
      [from, to],
    )
  ).rows;
  const [lineVolume] = (
    await data.query<{ lines: string; products: string; minLines: number; maxLines: number }>(
      `WITH per_sale AS (
         SELECT oi.order_id, count(*)::int AS lines
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE o.folio LIKE $1 || '%'
         GROUP BY oi.order_id
       )
       SELECT (SELECT count(*)::text FROM order_items oi
                 JOIN orders o ON o.id = oi.order_id
                WHERE o.folio LIKE $1 || '%') AS lines,
              (SELECT count(DISTINCT oi.product_id)::text FROM order_items oi
                 JOIN orders o ON o.id = oi.order_id
                WHERE o.folio LIKE $1 || '%') AS products,
              (SELECT min(lines) FROM per_sale) AS "minLines",
              (SELECT max(lines) FROM per_sale) AS "maxLines"`,
      [prefix],
    )
  ).rows;
  const [universe] = (
    await data.query<{ noMovement: string; universe: string }>(
      `SELECT count(*) FILTER (WHERE NOT EXISTS (
                SELECT 1 FROM order_items oi JOIN sales s ON s.order_id = oi.order_id
                WHERE oi.product_id = p.id
                  AND s.sold_at >= $1::timestamptz AND s.sold_at < $2::timestamptz
              ))::text AS "noMovement",
              count(*)::text AS universe
       FROM products p JOIN categories c ON c.id = p.category_id
       WHERE p.deleted_at IS NULL
         AND p.created_at < $2::timestamptz
         AND c.is_active = TRUE AND c.deleted_at IS NULL`,
      [from, to],
    )
  ).rows;
  const [indexes] = (
    await data.query<{ productIndexes: string; orderItemIndexes: string }>(
      `SELECT
         (SELECT string_agg(indexname, ',' ORDER BY indexname) FROM pg_indexes
           WHERE schemaname = 'public' AND tablename = 'products') AS "productIndexes",
         (SELECT string_agg(indexname, ',' ORDER BY indexname) FROM pg_indexes
           WHERE schemaname = 'public' AND tablename = 'order_items') AS "orderItemIndexes"`,
    )
  ).rows;
  report.actualVolume = {
    sales: salesVolume?.sales,
    cashSales: salesVolume?.cash,
    stripeSales: salesVolume?.stripe,
    lines: lineVolume?.lines,
    distinctProductsSold: lineVolume?.products,
    minLinesPerSale: lineVolume?.minLines,
    maxLinesPerSale: lineVolume?.maxLines,
    productsCreated: productCount,
    universeAtBenchmark: universe?.universe,
    noMovementAtBenchmark: universe?.noMovement,
    indexes: indexes,
  };

  const service = new SalesService(new SalesRepository(database));
  const baseInput = salesNoMovementQuery.parse({ from, to, limit: '20' });
  const firstResult = await service.noMovementProducts(actor, baseInput);
  const pages = [{ name: 'page-1', input: baseInput, result: firstResult }];
  let cursor = firstResult.data.page.nextCursor;
  let limit = firstResult.data.page.limit;
  for (let page = 2; cursor && page <= pageCount; page++) {
    const input = salesNoMovementQuery.parse({ from, to, limit, cursor });
    const result = await service.noMovementProducts(actor, input);
    pages.push({ name: `page-${page}`, input, result });
    cursor = result.data.page.nextCursor;
    limit = result.data.page.limit;
  }
  const cashInput = salesNoMovementQuery.parse({ from, to, limit: '50', method: 'CASH' });
  const scenarios = [
    ...pages.map((page) => ({
      name: page.name,
      input: page.input,
      expectedResult: page.result,
    })),
    { name: 'page-1-cash', input: cashInput, expectedResult: undefined },
  ];

  for (const scenario of scenarios) {
    for (let index = 0; index < warmupCount; index++)
      await service.noMovementProducts(actor, scenario.input);

    const rssBefore = process.memoryUsage().rss;
    const times: number[] = [];
    let last: Awaited<ReturnType<typeof service.noMovementProducts>> | undefined;
    let lastQueries: { query: string; params: string; duration: number }[] = [];
    for (let index = 0; index < runCount; index++) {
      queries.length = 0;
      const started = performance.now();
      last = await service.noMovementProducts(actor, scenario.input);
      times.push(performance.now() - started);
      lastQueries = [...queries];
    }
    const rssAfter = process.memoryUsage().rss;
    const sorted = [...times].sort((left, right) => left - right);
    const aggregation = lastQueries.filter((entry) => entry.query.includes('WITH universe'));
    const queryBreakdown = lastQueries.reduce<Record<string, number>>((counts, item) => {
      const kind = queryKind(item.query);
      counts[kind] = (counts[kind] ?? 0) + 1;
      return counts;
    }, {});
    const entry: Record<string, unknown> = {
      name: scenario.name,
      input: {
        limit: scenario.input.limit,
        method: scenario.input.method ?? null,
        hasCursor: Boolean(scenario.input.cursor),
      },
      ms: {
        runs: times.map((value) => Number(value.toFixed(2))),
        min: Number(sorted[0]?.toFixed(2)),
        median: Number(sorted[Math.floor(sorted.length / 2)]?.toFixed(2)),
        max: Number(sorted.at(-1)?.toFixed(2)),
        average: Number((times.reduce((sum, value) => sum + value, 0) / times.length).toFixed(2)),
      },
      queriesPerRun: {
        total: lastQueries.length,
        aggregation: aggregation.length,
        aggregationMs: aggregation.map((item) => Number(item.duration.toFixed(2))),
        actorRevalidation:
          (queryBreakdown.actorUserLock ?? 0) +
          (queryBreakdown.actorSessionLock ?? 0) +
          (queryBreakdown.actorSessionLookup ?? 0) +
          (queryBreakdown.actorUserLookup ?? 0) +
          (queryBreakdown.actorRoleLookup ?? 0),
        transactionControl:
          (queryBreakdown.begin ?? 0) +
          (queryBreakdown.commit ?? 0) +
          (queryBreakdown.rollback ?? 0),
        breakdown: queryBreakdown,
      },
      memory: {
        rssBeforeMb: Number((rssBefore / 1_048_576).toFixed(1)),
        rssAfterMb: Number((rssAfter / 1_048_576).toFixed(1)),
        rssDeltaMb: Number(((rssAfter - rssBefore) / 1_048_576).toFixed(1)),
      },
      result: {
        totalNoMovementProducts: last?.data.totalNoMovementProducts,
        itemsReturned: last?.data.items.length,
        hasNextCursor: Boolean(last?.data.page.nextCursor),
        firstItems: last?.data.items.slice(0, 3).map((item) => ({
          productId: item.productId,
          name: item.name,
          isAvailable: item.isAvailable,
        })),
      },
    };

    if (aggregation[0]) {
      try {
        const params = JSON.parse(aggregation[0].params) as unknown[];
        const explained = await data.query(
          `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${aggregation[0].query}`,
          params,
        );
        const top = explained.rows[0] as Record<string, unknown> | undefined;
        const payload = top?.['QUERY PLAN'];
        const planRoot = Array.isArray(payload)
          ? (payload[0] as Record<string, unknown>)
          : undefined;
        entry.plan = {
          executionMs: planRoot?.['Execution Time'],
          planningMs: planRoot?.['Planning Time'],
          summary: summarizePlan(planRoot?.['Plan']),
        };
      } catch (error) {
        entry.plan = {
          unavailable: error instanceof Error ? error.message : 'Error desconocido',
        };
      }
    } else {
      entry.plan = { unavailable: 'No se capturó la consulta agregada real.' };
    }
    (report.scenarios as unknown[]).push(entry);
  }

  benchmarkCompleted = true;
} catch (error) {
  console.error(`Benchmark incompleto: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await data?.end().catch(() => undefined);
  await database?.$disconnect().catch(() => undefined);
  try {
    await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
    report.cleanup = true;
  } catch (error) {
    report.cleanup = {
      ok: false,
      error: redactConnection(error instanceof Error ? error.message : String(error), target),
    };
    console.error('No se pudo eliminar la base temporal del benchmark.');
  }
  await admin.end().catch(() => undefined);
  if (benchmarkCompleted) console.log(JSON.stringify(report, null, 2));
}

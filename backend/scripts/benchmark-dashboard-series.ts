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

/**
 * Medición reproducible E2-01 (TASK-DA-E2-01). No forma parte de `npm test` ni
 * del runner de integración. Crea una base temporal aislada, siembra volumen
 * sintético y mide el servicio con 745 buckets. No imprime credenciales ni
 * parámetros. Uso:
 *
 *   node --env-file=.env.docker --import tsx scripts/benchmark-dashboard-series.ts
 *
 * Variables opcionales: BENCH_SALES (20000), BENCH_RUNS (7), BENCH_WARMUP (2).
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

const runCount = Number(process.env.BENCH_RUNS ?? 7);
const warmupCount = Number(process.env.BENCH_WARMUP ?? 2);
const salesCount = Number(process.env.BENCH_SALES ?? 20000);
const from = '2030-01-01T00:30:00.000Z';
const to = '2030-02-01T00:30:00.000Z'; // 744 h; 745 buckets hour por desalineación.
const slots = (Date.parse(to) - Date.parse(from)) / (5 * 60 * 1000);
const prefix = `BENCH-${randomBytes(4).toString('hex')}-`;
const databaseName = `cafeteria_bench_${randomBytes(6).toString('hex')}`;
const admin = new pg.Client({ connectionString: target, connectionTimeoutMillis: 5000 });
let databaseUrl: string | undefined;
let database: PrismaClient | undefined;
let data: pg.Client | undefined;
const report: Record<string, unknown> = {
  volumeSales: salesCount,
  rangeHours: (Date.parse(to) - Date.parse(from)) / 3_600_000,
  expectedBuckets: 745,
  runs: runCount,
  warmup: warmupCount,
};

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

function summarizePlan(node: unknown, depth = 0): unknown {
  if (depth > 3 || typeof node !== 'object' || node === null) return undefined;
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

async function seedVolume(client: pg.Client) {
  const base = from;
  const inserted = await client.query(
    `INSERT INTO orders (folio, source, status, payment_method, total_cents,
       payment_expires_at, paid_at, created_at, updated_at)
     SELECT $1 || g::text, 'CASHIER', 'EN_PREPARACION', 'STRIPE',
            1000 + (g % 9000),
            $2::timestamptz + (((g % $3::int) * interval '5 minutes') + interval '1 hour'),
            $2::timestamptz + ((g % $3::int) * interval '5 minutes'),
            now(), now()
     FROM generate_series(1, $4::int) AS g`,
    [prefix, base, slots, salesCount],
  );
  if (inserted.rowCount !== salesCount)
    throw new Error(`Volumen inesperado: ${inserted.rowCount ?? 0}.`);
  await client.query(
    `INSERT INTO payments (order_id, method, status, amount_cents, currency, confirmed_at,
       created_at, updated_at)
     SELECT o.id, 'STRIPE', 'SUCCEEDED', o.total_cents, 'MXN', o.paid_at, now(), now()
     FROM orders o WHERE o.folio LIKE $1 || '%'`,
    [prefix],
  );
  await client.query(
    `INSERT INTO sales (sale_number, order_id, payment_id, total_cents, sold_at)
     SELECT 'BS-' || o.id::text, o.id, p.id, o.total_cents, o.paid_at
     FROM orders o JOIN payments p ON p.order_id = o.id
     WHERE o.folio LIKE $1 || '%'`,
    [prefix],
  );
  const water = await database!.product.findFirstOrThrow({ where: { name: 'Agua (demo)' } });
  await client.query(
    `INSERT INTO order_items (order_id, product_id, product_name_snapshot,
       base_price_cents_snapshot, unit_price_cents, quantity, line_total_cents)
     SELECT o.id, $2::bigint, 'Agua (demo)', 1000, 1000,
            (1 + (o.id % 3))::int, 1000 * (1 + (o.id % 3))
     FROM orders o WHERE o.folio LIKE $1 || '%'`,
    [prefix, water.id.toString()],
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
      name: 'benchmark-series',
      roleId: role.id,
      accountType: 'STAFF',
      username: 'benchmark-series',
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

  data = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  await data.connect();
  const seedStarted = performance.now();
  await seedVolume(data);
  report.seedMs = Math.round(performance.now() - seedStarted);

  const service = new SalesService(new SalesRepository(database));
  const input = { from, to, granularity: 'hour' as const };
  for (let index = 0; index < warmupCount; index++) await service.salesSeries(actor, input);
  const rssBefore = process.memoryUsage().rss;
  const times: number[] = [];
  let last: Awaited<ReturnType<typeof service.salesSeries>> | undefined;
  for (let index = 0; index < runCount; index++) {
    queries.length = 0;
    const started = performance.now();
    last = await service.salesSeries(actor, input);
    times.push(performance.now() - started);
  }
  const rssAfter = process.memoryUsage().rss;
  const sorted = [...times].sort((left, right) => left - right);
  const aggregation = queries.filter((entry) => entry.query.includes('WITH buckets'));
  report.bucketCount = last?.data.bucketCount;
  report.lastTotals = last?.data.totals;
  report.ms = {
    runs: times.map((value) => Number(value.toFixed(2))),
    min: Number(sorted[0]?.toFixed(2)),
    median: Number(sorted[Math.floor(sorted.length / 2)]?.toFixed(2)),
    max: Number(sorted.at(-1)?.toFixed(2)),
    average: Number((times.reduce((sum, value) => sum + value, 0) / times.length).toFixed(2)),
  };
  report.queriesPerRun = {
    total: queries.length,
    aggregation: aggregation.length,
    aggregationMs: aggregation.map((entry) => Number(entry.duration.toFixed(2))),
    actorRevalidation: queries.length - aggregation.length,
  };
  report.memory = {
    rssBeforeMb: Number((rssBefore / 1_048_576).toFixed(1)),
    rssAfterMb: Number((rssAfter / 1_048_576).toFixed(1)),
    rssDeltaMb: Number(((rssAfter - rssBefore) / 1_048_576).toFixed(1)),
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
      const planRoot = Array.isArray(payload) ? (payload[0] as Record<string, unknown>) : undefined;
      report.plan = {
        executionMs: planRoot?.['Execution Time'],
        planningMs: planRoot?.['Planning Time'],
        summary: summarizePlan(planRoot?.['Plan']),
      };
    } catch (error) {
      report.plan = {
        unavailable: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(`Benchmark incompleto: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await data?.end().catch(() => undefined);
  await database?.$disconnect().catch(() => undefined);
  try {
    await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  } catch {
    console.error('No se pudo eliminar la base temporal del benchmark.');
  }
  await admin.end();
  report.cleanup = true;
}

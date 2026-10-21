import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
import pg from 'pg';
import { runRegressionSuite } from '../tests/database/regression-suite.mjs';

// Nunca modifica tablas de TEST_DATABASE_URL: crea bases propias, nuevas y sin volúmenes.
const target = process.env.TEST_DATABASE_URL;
if (!target) throw new Error('Configura TEST_DATABASE_URL apuntando a cafeteria_test aislada.');
const base = new URL(target);
if (
  decodeURIComponent(base.pathname) !== '/cafeteria_test' ||
  !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)
) {
  throw new Error('Solo se permite una cafeteria_test local explícita.');
}
const admin = new pg.Client({ connectionString: target, connectionTimeoutMillis: 5000 });
const owned = [];
const report = {
  checkedAt: new Date().toISOString(),
  version: '',
  regression: [],
  mutant: [],
  migration: {},
  cleanup: false,
  failure: null,
};
const suffix = randomBytes(6).toString('hex');
const root = new URL('../', import.meta.url);
function cli(args, url) {
  const child = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', ...args], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: url, SHADOW_DATABASE_URL: '' },
    encoding: 'utf8',
    timeout: 120000,
  });
  // No imprimir salida cruda: puede incluir URL o credenciales.
  if (child.error || child.status !== 0)
    throw new Error(`Falló Prisma ${args[1]}; código ${child.status ?? 'TIMEOUT'}.`);
  return child.stdout;
}
async function database(label) {
  const name = `cafeteria_review_${suffix}_${label}`;
  await admin.query(`CREATE DATABASE "${name}"`);
  owned.push(name);
  const url = new URL(target);
  url.pathname = `/${name}`;
  const makeClient = () =>
    new pg.Client({ connectionString: url.href, connectionTimeoutMillis: 5000 });
  const client = makeClient();
  await client.connect();
  return { client, makeClient, url: url.href };
}
try {
  await admin.connect();
  const version = (await admin.query('SHOW server_version')).rows[0].server_version;
  report.version = version;
  if (
    !version.startsWith('17.') &&
    !(version.startsWith('18.') && process.env.ALLOW_PG18_REVIEW === '1')
  ) {
    throw new Error(
      'La aceptación requiere PostgreSQL 17. Revisión alternativa 18 exige ALLOW_PG18_REVIEW=1 explícito.',
    );
  }
  const corrected = await database('corrected');
  try {
    cli(['migrate', 'deploy'], corrected.url);
    cli(['migrate', 'deploy'], corrected.url); // repetición sin reaplicar
    const diff = cli(
      [
        'migrate',
        'diff',
        '--from-config-datasource',
        '--to-schema',
        'prisma/schema.prisma',
        '--script',
      ],
      corrected.url,
    );
    report.migration = { deploy: true, repeatDeploy: true, schemaDiff: diff.trim() };
    assert.equal(diff.trim(), '-- This is an empty migration.', 'Drift inesperado frente a Prisma');
    report.regression = await runRegressionSuite(corrected.client, corrected.makeClient);
    await corrected.client.query(
      readFileSync(new URL('../tests/database/structural-assertions.sql', import.meta.url), 'utf8'),
    );
    report.migration.structuralAssertions = true;
    cli(['generate'], corrected.url);
    const smoke = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/prisma-smoke.mjs'], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: corrected.url },
      encoding: 'utf8',
      timeout: 60000,
    });
    assert.equal(smoke.status, 0, 'Falló smoke de cliente Prisma');
    report.migration.prismaClient = true;
  } finally {
    await corrected.client.end();
  }
  const mutant = await database('mutant');
  try {
    // Reintroduce únicamente C01-C04 para verificar sensibilidad de las pruebas.
    let sql = readFileSync(
      new URL('../prisma/migrations/20261015_initial_candidate/migration.sql', import.meta.url),
      'utf8',
    );
    sql = sql.replaceAll(' DEFAULT CURRENT_TIMESTAMP', '');
    sql = sql.replace('AND change_cents IS NOT NULL ', '');
    sql = sql.replace('AND difference_cents IS NOT NULL ', '');
    sql = sql.replace(
      /^ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_check_3".*\r?\n/m,
      '',
    );
    await mutant.client.query(sql);
    report.mutant = await runRegressionSuite(mutant.client, mutant.makeClient);
  } finally {
    await mutant.client.end();
  }
  const failures = report.regression.filter((r) => !r.passed);
  const required = [
    'C01: los 21',
    'C02: efectivo rechaza cambio NULL',
    'C03: cierre rechaza diferencia NULL',
    'C04: cierre rechaza importes negativos',
  ];
  if (
    failures.length ||
    required.some((name) => !report.mutant.some((r) => r.name.startsWith(name) && !r.passed))
  ) {
    throw new Error('La suite corregida falló o no detectó todos los mutantes C01-C04.');
  }
  console.info(
    `PostgreSQL ${version}: ${report.regression.length} comprobaciones correctas; mutantes C01-C04 detectados.`,
  );
} catch (error) {
  report.failure = error.code ?? error.message;
  console.error(
    `Verificación incompleta: ${error.code ?? 'VALIDATION_FAILED'}. Consulta evidencia saneada.`,
  );
  process.exitCode = 1;
} finally {
  for (const name of owned.reverse()) {
    // Solo nombres generados por este proceso, jamás desarrollo/test/shadow existentes.
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  }
  report.cleanup = true;
  await admin.end();
  mkdirSync(new URL('../docs/database/review-evidence/', import.meta.url), { recursive: true });
  writeFileSync(
    new URL('../docs/database/review-evidence/corrections-results.json', import.meta.url),
    JSON.stringify(report, null, 2) + '\n',
  );
}

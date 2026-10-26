import 'dotenv/config';
import process from 'node:process';
import console from 'node:console';
import { randomBytes } from 'node:crypto';
import { URL } from 'node:url';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { readdirSync } from 'node:fs';

let url;
try {
  url = new URL(process.env.TEST_DATABASE_URL ?? '');
} catch {
  console.error('Configura TEST_DATABASE_URL localmente para integración.');
  process.exit(1);
}
if (
  url.pathname !== '/cafeteria_test' ||
  !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
)
  throw new Error('Requiere cafeteria_test local aislada.');
const admin = new pg.Client({ connectionString: url.href, connectionTimeoutMillis: 5000 });
const owned = [];
try {
  await admin.connect();
  for (const file of readdirSync('tests/integration')
    .filter((file) => file.endsWith('.test.ts'))
    .sort()) {
    const name = `cafeteria_catalog_${randomBytes(6).toString('hex')}`;
    await admin.query(`CREATE DATABASE "${name}"`);
    owned.push(name);
    const target = new URL(url);
    target.pathname = `/${name}`;
    const env = {
      ...process.env,
      DATABASE_URL: target.href,
      SHADOW_DATABASE_URL: '',
      CATALOG_TEST_DATABASE_URL: target.href,
    };
    const migrate = spawnSync(
      process.execPath,
      ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
      { env, encoding: 'utf8', timeout: 120000 },
    );
    if (migrate.status !== 0)
      throw new Error('Falló migración aislada; no se muestran credenciales.');
    const tests = spawnSync(
      process.execPath,
      ['node_modules/vitest/vitest.mjs', 'run', `tests/integration/${file}`],
      { env, stdio: 'inherit', timeout: 120000 },
    );
    if (tests.status !== 0) process.exitCode = 1;
  }
} catch (error) {
  console.error(
    error.code
      ? `Integración no disponible (${error.code}).`
      : 'Integración incompleta; revisar entorno local.',
  );
  process.exitCode = 1;
} finally {
  for (const name of owned) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.end();
}

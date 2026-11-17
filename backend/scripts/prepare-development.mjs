import 'dotenv/config';
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
import { spawnSync } from 'node:child_process';
import pg from 'pg';

// Aplica la migración aprobada sin reset, exclusivamente a cafeteria local.
let url;
try {
  url = new URL(process.env.DATABASE_URL);
} catch {
  console.error('DATABASE_URL inválida; revisar .env localmente.');
  process.exit(1);
}
if (
  process.env.NODE_ENV === 'production' ||
  !['/cafeteria', '/ProyectoCafeteria'].includes(url.pathname) ||
  !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
) {
  throw new Error('Preparación permitida solo para cafeteria local de desarrollo.');
}
const client = new pg.Client({ connectionString: url.href, connectionTimeoutMillis: 5000 });
try {
  await client.connect();
  const { rows } = await client.query(
    "SELECT tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')",
  );
  if (rows.length && !rows.some((row) => row.tablename === '_prisma_migrations')) {
    throw new Error(
      'Base no vacía y sin historial Prisma. Requiere revisión manual; no se modificó.',
    );
  }
  const result = spawnSync(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    {
      env: { ...process.env, SHADOW_DATABASE_URL: '' },
      encoding: 'utf8',
      timeout: 120000,
    },
  );
  if (result.status !== 0) throw new Error('Migración no completada; no se ejecutó reset.');
  console.info('Migraciones aprobadas aplicadas a desarrollo; no se tocó shadow.');
} catch (error) {
  console.error(error.code ? `Preparación fallida (${error.code}).` : error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}

// Crea SOLO un contenedor/base efímeros propios. Nunca lee .env ni usa volúmenes.
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import console from 'node:console';
import { setTimeout } from 'node:timers/promises';
import { join } from 'node:path';
const name = `cafeteria-fin01-${randomBytes(6).toString('hex')}`;
const password = randomBytes(32).toString('hex');
function docker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 180000 });
  if (result.status !== 0)
    throw new Error('Docker aislado no disponible; no se muestran argumentos ni credenciales.');
  return result.stdout.trim();
}
let created = false;
try {
  docker([
    'run',
    '-d',
    '--rm',
    '--name',
    name,
    '-e',
    `POSTGRES_PASSWORD=${password}`,
    '-e',
    'POSTGRES_DB=cafeteria_test',
    '-p',
    '127.0.0.1::5432',
    '--health-cmd',
    'pg_isready -h 127.0.0.1 -U postgres -d cafeteria_test',
    '--health-interval',
    '1s',
    '--health-retries',
    '60',
    'postgres:17',
  ]);
  created = true;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (docker(['inspect', '--format', '{{.State.Health.Status}}', name]) === 'healthy') break;
    await setTimeout(1000);
  }
  const port = docker(['port', name, '5432/tcp']).split(':').at(-1);
  const env = {
    ...process.env,
    TEST_DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${port}/cafeteria_test`,
    DB_REVIEW_OUTPUT_DIR:
      process.env.DB_REVIEW_OUTPUT_DIR ??
      join(process.env.LOCALAPPDATA ?? '.', 'Temp', 'opencode', name),
  };
  for (const script of ['scripts/run-integration.mjs', 'scripts/verify-database.mjs']) {
    const result = spawnSync(process.execPath, [script], {
      env,
      stdio: 'inherit',
      timeout: 900000,
    });
    if (result.status !== 0) process.exitCode = 1;
  }
} catch {
  console.error('Verificación aislada incompleta; revisar Docker.');
  process.exitCode = 1;
} finally {
  if (created) docker(['stop', name]);
}

import { randomBytes } from 'node:crypto';
import console from 'node:console';
import process from 'node:process';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { parse } from 'dotenv';

const root = fileURLToPath(new URL('../', import.meta.url));
const envPath = new URL('../.env.docker', import.meta.url);
const action = process.argv[2];

function ensureEnvironment() {
  const password = randomBytes(24).toString('hex');
  const base = `postgresql://cafeteria_local:${password}@127.0.0.1:55432`;
  const contents = [
    '# Solo desarrollo local. No compartir ni subir a Git.',
    'POSTGRES_USER=cafeteria_local',
    `POSTGRES_PASSWORD=${password}`,
    'POSTGRES_PORT=55432',
    `DATABASE_URL=${base}/cafeteria`,
    `SHADOW_DATABASE_URL=${base}/cafeteria_shadow`,
    `TEST_DATABASE_URL=${base}/cafeteria_test`,
    '',
  ].join('\n');
  try {
    writeFileSync(envPath, contents, { flag: 'wx', mode: 0o600 });
    console.info('.env.docker creado con credenciales aleatorias locales.');
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    console.info('Se conserva .env.docker existente.');
  }
}

function run(command, args, environment) {
  const result = spawnSync(command, args, { cwd: root, env: environment, stdio: 'inherit' });
  if (result.error) {
    throw new Error('No se pudo ejecutar el comando. Comprueba Docker Desktop y Node.');
  }
  if (result.status !== 0) {
    throw new Error('El comando falló. Revisa el mensaje anterior; no se borraron volúmenes.');
  }
}

try {
  if (!['env', 'up', 'stop', 'status', 'check'].includes(action)) {
    throw new Error('Acción válida: env, up, stop, status o check.');
  }
  if (action === 'env' || action === 'up') ensureEnvironment();
  if (action !== 'env') {
    const local = parse(readFileSync(envPath));
    for (const name of [
      'POSTGRES_USER',
      'POSTGRES_PASSWORD',
      'DATABASE_URL',
      'SHADOW_DATABASE_URL',
      'TEST_DATABASE_URL',
    ]) {
      if (!local[name]) throw new Error(`Falta ${name} en .env.docker.`);
    }
    const environment = { ...process.env, ...local };
    if (action === 'check') {
      run(process.execPath, ['--import', 'tsx', 'scripts/check-database.ts'], environment);
    } else {
      const args = {
        up: ['up', '-d', '--wait', '--wait-timeout', '120', 'postgres'],
        stop: ['stop', 'postgres'],
        status: ['ps'],
      }[action];
      run(
        'docker',
        ['compose', '--env-file', '.env.docker', '-f', 'compose.yaml', ...args],
        environment,
      );
      if (action === 'up') {
        console.info('PostgreSQL local listo. Verifica con npm run db:check:docker.');
      }
    }
  }
} catch (error) {
  console.error(
    error.code === 'ENOENT' ? 'Falta .env.docker. Ejecuta npm run db:env primero.' : error.message,
  );
  process.exitCode = 1;
}

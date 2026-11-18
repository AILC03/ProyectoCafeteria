import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import console from 'node:console';
import { parse } from 'dotenv';

// Solo añade claves faltantes en .env ignorado; no imprime ni sustituye valores existentes.
const contents = readFileSync('.env', 'utf8'),
  existing = parse(contents);
const additions = [];
let updated = contents;
for (const name of ['AUTH_JWT_SECRET', 'AUTH_CSRF_SECRET']) {
  if (existing[name]) {
    if (!/^[a-f0-9]{64,}$/.test(existing[name]))
      throw new Error(`${name} ya existe pero no es válida; revisar localmente sin compartirla.`);
  } else additions.push(`${name}=${randomBytes(32).toString('hex')}`);
  // Sustituir solo placeholders vacíos; conservar valores reales y resto de configuración.
  if (Object.hasOwn(existing, name) && !existing[name])
    updated = updated
      .split(/\r?\n/)
      .filter((line) => !new RegExp(`^\\s*${name}\\s*=`).test(line))
      .join('\n');
}
if (existing.AUTH_JWT_SECRET && existing.AUTH_JWT_SECRET === existing.AUTH_CSRF_SECRET)
  throw new Error('Las claves existentes no deben repetirse.');
if (additions.length)
  writeFileSync(
    '.env',
    `${updated}\n# Claves locales de auth, no compartir ni versionar.\n${additions.join('\n')}\n`,
    { mode: 0o600 },
  );
console.info('Claves locales preparadas; no se mostraron ni modificaron contraseñas.');

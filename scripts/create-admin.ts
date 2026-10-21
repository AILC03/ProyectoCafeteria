import 'dotenv/config';
import { emitKeypressEvents } from 'node:readline';
import { hash, argon2id } from 'argon2';
import { createDatabase } from '../src/config/database.js';

function readSecret(prompt: string): Promise<string> {
  if (!process.stdin.isTTY)
    throw new Error('Ejecuta este comando en tu terminal local interactiva.');
  process.stdout.write(prompt);
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = () => {
      process.stdin.removeListener('keypress', onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
    };
    const onKey = (text: string | undefined, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === 'c') {
        finish();
        reject(new Error('Cancelado.'));
      } else if (key.name === 'return') {
        finish();
        resolve(value);
      } else if (key.name === 'backspace') value = Array.from(value).slice(0, -1).join('');
      else if (text && !key.ctrl && !text.includes('\u001b') && !/[\r\n]/.test(text)) value += text;
    };
    process.stdin.on('keypress', onKey);
  });
}

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (
    process.env.NODE_ENV === 'production' ||
    !['/cafeteria', '/ProyectoCafeteria'].includes(url.pathname) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  )
    throw new Error('Solo desarrollo local.');
  const password = await readSecret('Contraseña de AngelAdmin (8–24 caracteres, oculta): ');
  if (password.length < 8 || password.length > 24)
    throw new Error('La contraseña debe tener entre 8 y 24 caracteres.');
  const confirmation = await readSecret('Confirma contraseña (oculta): ');
  if (password !== confirmation) throw new Error('Las contraseñas no coinciden.');
  const passwordHash = await hash(password, {
    type: argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  const db = createDatabase(url.href);
  try {
    const role = await db.role.findUnique({ where: { name: 'ADMINISTRADOR' } });
    if (!role) throw new Error('Ejecuta primero db:seed.');
    const existing = await db.user.findUnique({ where: { username: 'AngelAdmin' } });
    if (existing)
      throw new Error('AngelAdmin ya existe; no se modificó ni restableció su contraseña.');
    await db.user.create({
      data: {
        accountType: 'STAFF',
        roleId: role.id,
        name: 'AngelAdmin',
        username: 'AngelAdmin',
        passwordHash,
      },
    });
    console.info('AngelAdmin creado con Argon2id. No hay contraseña guardada en archivos.');
  } finally {
    await db.$disconnect();
  }
}
main().catch((error: unknown) => {
  const safe =
    error instanceof Error &&
    [
      'Cancelado.',
      'La contraseña debe tener entre 8 y 24 caracteres.',
      'Las contraseñas no coinciden.',
      'Ejecuta primero db:seed.',
      'AngelAdmin ya existe; no se modificó ni restableció su contraseña.',
      'Ejecuta este comando en tu terminal local interactiva.',
    ].includes(error.message);
  console.error(
    safe
      ? (error as Error).message
      : 'No se creó administrador. Revisa configuración local; no se muestran secretos.',
  );
  process.exitCode = 1;
});

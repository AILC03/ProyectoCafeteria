import 'dotenv/config';
import { parseEnvironment } from '../src/config/env.js';
import { createDatabase } from '../src/config/database.js';
async function main() {
  const env = parseEnvironment(process.env),
    db = createDatabase(env.DATABASE_URL),
    now = new Date();
  try {
    const removed = await db.authAttemptLimit.deleteMany({
      where: {
        windowStartedAt: { lt: new Date(now.getTime() - 48 * 3600000) },
        OR: [{ blockedUntil: null }, { blockedUntil: { lt: now } }],
      },
    });
    console.info(
      `Contadores vencidos retirados: ${removed.count}. No se borraron usuarios ni sesiones.`,
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error('Limpieza de contadores no completada; revisar configuración local.');
  process.exitCode = 1;
});

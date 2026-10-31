import { createDatabase } from '../src/config/database.js';
import { purgeTicketSecrets } from '../src/modules/tickets/tickets.repository.js';
async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL explícita requerida');
  const db = createDatabase(process.env.DATABASE_URL);
  try {
    const result = await purgeTicketSecrets(db);
    console.info(`Payloads de ticket retirados: ${result.count}`);
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error('Limpieza de tickets no completada; no se muestran secretos.');
  process.exitCode = 1;
});

import 'dotenv/config';
import { createDatabase } from '../src/config/database.js';
import { seedDemo } from './lib/demo-data.js';

let url: URL;
try {
  url = new URL(process.env.DATABASE_URL ?? '');
} catch {
  console.error('DATABASE_URL inválida; revisar .env localmente.');
  process.exit(1);
}
if (
  process.env.NODE_ENV === 'production' ||
  !['/cafeteria', '/ProyectoCafeteria'].includes(url.pathname) ||
  !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
) {
  throw new Error('Semilla demo permitida solo en cafeteria local.');
}
const database = createDatabase(url.href);
try {
  const result = await seedDemo(database);
  console.info(
    `Semilla aditiva lista: ${result.roles} roles, ${result.categories} categorías y ${result.products} productos demo.`,
  );
} catch {
  console.error(
    'No se pudo completar semilla; transacción revertida. No se muestran datos privados.',
  );
  process.exitCode = 1;
} finally {
  await database.$disconnect();
}

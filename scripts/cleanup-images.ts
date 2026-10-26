import 'dotenv/config';
import { createDatabase } from '../src/config/database.js';
import { parseEnvironment } from '../src/config/env.js';
import { cloudinaryConfiguration } from '../src/config/cloudinary.js';
import { CloudinaryProvider } from '../src/modules/catalog/image.provider.js';
import { cleanupImages } from '../src/modules/catalog/image.service.js';

async function main() {
  const env = parseEnvironment(process.env),
    config = cloudinaryConfiguration(process.env);
  if (!config) throw new Error('Cloudinary no configurado');
  const db = createDatabase(env.DATABASE_URL);
  try {
    console.info(
      `Limpiezas completadas: ${await cleanupImages(db, new CloudinaryProvider(config))}`,
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error('Limpieza no completada; revisar configuración local. No se muestran secretos.');
  process.exitCode = 1;
});

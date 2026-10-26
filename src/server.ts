import { createApp } from './app.js';
import { parseEnvironment } from './config/env.js';
import pino from 'pino';
import { createDatabase } from './config/database.js';
import { PrismaCatalogRepository } from './modules/catalog/catalog.repository.js';
import { authConfiguration } from './config/auth.js';
import { AuthRepository } from './modules/auth/auth.repository.js';
import { AuthService } from './modules/auth/auth.service.js';
import { AdminRepository } from './modules/catalog/admin.repository.js';
import { AdminService } from './modules/catalog/admin.service.js';
import { ImageService } from './modules/catalog/image.service.js';
import { CloudinaryProvider } from './modules/catalog/image.provider.js';
import { cloudinaryConfiguration } from './config/cloudinary.js';

const logger = pino({
  redact: [
    'password',
    'passwordHash',
    'pin',
    'pinHash',
    'token',
    'access',
    'refresh',
    'csrfToken',
    'refreshTokenHash',
    'cookie',
    'authorization',
    'DATABASE_URL',
    'AUTH_JWT_SECRET',
    'AUTH_CSRF_SECRET',
    'CLOUDINARY_API_SECRET',
  ],
});
async function main() {
  const env = parseEnvironment(process.env);
  const auth = authConfiguration(process.env, env.FRONTEND_ORIGIN, env.NODE_ENV === 'production');
  if (env.NODE_ENV === 'production' && (!auth || !env.FRONTEND_ORIGIN.startsWith('https://')))
    throw new Error('Producción requiere claves de autenticación y HTTPS.');
  const cloud = cloudinaryConfiguration(process.env);
  const database = createDatabase(env.DATABASE_URL);
  try {
    await database.$connect();
  } catch {
    await database.$disconnect();
    throw new Error('PostgreSQL no disponible; no se inició la API.');
  }
  const adminService = new AdminService(new AdminRepository(database));
  const app = createApp({
    catalogRepository: new PrismaCatalogRepository(database),
    logger,
    frontendOrigin: env.FRONTEND_ORIGIN,
    catalogRateLimit: env.CATALOG_RATE_LIMIT,
    authService: auth ? new AuthService(new AuthRepository(database), auth) : undefined,
    adminService,
    imageService: cloud ? new ImageService(adminService, new CloudinaryProvider(cloud)) : undefined,
  });
  const server = app.listen(env.PORT, () =>
    logger.info({ port: env.PORT, authEnabled: !!auth, imagesEnabled: !!cloud }, 'api_started'),
  );
  let closing = false;
  function shutdown(failed = false) {
    if (closing) return;
    closing = true;
    const timeout = setTimeout(() => {
      server.closeAllConnections();
    }, 10_000);
    timeout.unref();
    server.close(() => {
      database
        .$disconnect()
        .then(() => {
          clearTimeout(timeout);
          process.exitCode = failed ? 1 : 0;
        })
        .catch(() => {
          process.exitCode = 1;
        });
    });
    server.closeIdleConnections();
  }
  server.on('error', () => {
    logger.error('http_server_error');
    shutdown(true);
  });
  process.once('SIGINT', () => shutdown());
  process.once('SIGTERM', () => shutdown());
}
main().catch(() => {
  logger.error('startup_failed_check_local_configuration');
  process.exitCode = 1;
});

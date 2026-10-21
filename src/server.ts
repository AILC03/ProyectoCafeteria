import { createApp } from './app.js';
import { parseEnvironment } from './config/env.js';
import pino from 'pino';
import { createDatabase } from './config/database.js';
import { PrismaCatalogRepository } from './modules/catalog/catalog.repository.js';

const logger = pino({
  redact: ['password', 'passwordHash', 'token', 'cookie', 'authorization', 'DATABASE_URL'],
});
async function main() {
  const env = parseEnvironment(process.env);
  const database = createDatabase(env.DATABASE_URL);
  try {
    await database.$connect();
  } catch {
    await database.$disconnect();
    throw new Error('PostgreSQL no disponible; no se inició la API.');
  }
  const app = createApp({
    catalogRepository: new PrismaCatalogRepository(database),
    logger,
    frontendOrigin: env.FRONTEND_ORIGIN,
    catalogRateLimit: env.CATALOG_RATE_LIMIT,
  });
  const server = app.listen(env.PORT, () => logger.info({ port: env.PORT }, 'api_started'));
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

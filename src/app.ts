import express from 'express';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  // Solo comprueba HTTP, no la conexión a PostgreSQL.
  app.get('/api/v1/health', (_request, response) => {
    response.json({ status: 'ok' });
  });
  return app;
}

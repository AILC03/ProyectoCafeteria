import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import type { Logger } from 'pino';
import { requestContext } from './middleware/request-context.js';
import { HttpProblem, notFound, problemHandler, unavailable } from './shared/http/problem.js';
import { CatalogService } from './modules/catalog/catalog.service.js';
import { catalogRoutes } from './modules/catalog/catalog.routes.js';
import type { CatalogRepository } from './modules/catalog/catalog.types.js';
import authRouter from './modules/auth/auth.routes.js';

// Parche para que JSON.stringify sepa manejar campos BigInt de PostgreSQL/Prisma
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

type AppOptions = {
  catalogRepository?: CatalogRepository;
  logger?: Logger;
  frontendOrigin?: string;
  catalogRateLimit?: number;
};



export function createApp(options: AppOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('query parser', 'simple');
  app.use(requestContext(options.logger));
  app.use(helmet());

  const origin = options.frontendOrigin ?? 'http://localhost:5173';
  app.use((request, _response, next) => {
    if (request.headers.origin && request.headers.origin !== origin)
      return next(new HttpProblem(403, 'ORIGIN_NOT_ALLOWED', 'Origen no permitido'));
    next();
  });

  app.use(cors({ origin, credentials: true, methods: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'] }));
  app.use(express.json({ limit: '256kb' }));

  // Solo comprueba HTTP, no la conexión a PostgreSQL.
  app.get('/api/v1/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  // Rutas del módulo de Autenticación
  app.use('/api/auth', authRouter);

  app.use(
    '/api/v1',
    rateLimit({
      windowMs: 60_000,
      limit: options.catalogRateLimit ?? 120,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_request, _response, next) =>
        next(new HttpProblem(429, 'RATE_LIMITED', 'Límite de solicitudes')),
    }),
  );

  const repository = options.catalogRepository ?? {
    async listCategories() {
      throw unavailable();
    },
    async listProducts() {
      throw unavailable();
    },
    async getProduct() {
      throw unavailable();
    },
    async getOptions() {
      throw unavailable();
    },
  };

  app.use('/api/v1', catalogRoutes(new CatalogService(repository)));
  app.use((_request, _response, next) => next(notFound()));
  app.use(problemHandler);

  return app;
}

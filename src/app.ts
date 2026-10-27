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
import { authRoutes } from './modules/auth/auth.routes.js';
import type { AuthService } from './modules/auth/auth.service.js';
import { adminRoutes, availabilityRoutes } from './modules/catalog/admin.routes.js';
import type { AdminService } from './modules/catalog/admin.service.js';
import type { ImageService } from './modules/catalog/image.service.js';
import { ordersRoutes } from './modules/orders/orders.routes.js';
import type { OrdersService } from './modules/orders/orders.service.js';

type AppOptions = {
  catalogRepository?: CatalogRepository;
  logger?: Logger;
  frontendOrigin?: string;
  catalogRateLimit?: number;
  authService?: AuthService;
  adminService?: AdminService;
  imageService?: ImageService;
  ordersService?: OrdersService;
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

  app.use(
    cors({
      origin,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'],
    }),
  );
  app.use(express.json({ limit: '256kb' }));

  // Solo comprueba HTTP, no la conexión a PostgreSQL.
  app.get('/api/v1/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

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

  if (options.authService) app.use('/api/v1/auth', authRoutes(options.authService));
  else
    app.all(
      [
        '/api/v1/auth/csrf',
        '/api/v1/auth/login/staff',
        '/api/v1/auth/login/customer',
        '/api/v1/auth/refresh',
        '/api/v1/auth/logout',
        '/api/v1/auth/me',
        '/api/v1/auth/pin',
        '/api/v1/auth/password',
      ],
      (_request, _response, next) => next(unavailable()),
    );

  if (options.authService && options.adminService) {
    app.use(
      '/api/v1/admin',
      adminRoutes(options.authService, options.adminService, options.imageService),
    );
    app.use('/api/v1', availabilityRoutes(options.authService, options.adminService));
  }

  if (options.authService && options.ordersService)
    app.use('/api/v1', ordersRoutes(options.authService, options.ordersService));

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

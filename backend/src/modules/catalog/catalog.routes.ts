import { Router } from 'express';
import type { CatalogService } from './catalog.service.js';
import { catalogController } from './catalog.controller.js';

export function catalogRoutes(service: CatalogService) {
  const router = Router();
  const controller = catalogController(service);
  router.get('/categories', controller.categories);
  router.get('/products', controller.products);
  router.get('/products/:productId', controller.product);
  router.get('/products/:productId/options', controller.options);
  return router;
}

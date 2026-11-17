import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/authenticate.js';
import { csrf } from '../../middleware/csrf.js';
import type { AuthService } from '../auth/auth.service.js';
import { privateCashResponse } from '../cash/cash.routes.js';
import { customersController } from './customers.controller.js';
import type { CustomersService } from './customers.service.js';

export function customersRoutes(auth: AuthService, service: CustomersService) {
  const router = Router(),
    c = customersController(service);
  const access = [privateCashResponse, authenticate(auth), authorize('CLIENTE')];
  router.get('/customers/me', ...access, c.profile);
  router.get('/customers/me/orders', ...access, c.history);
  router.get('/customers/me/favorites', ...access, c.favorites);
  router.put('/customers/me/favorites/:productId', ...access, csrf(auth), c.addFavorite);
  router.delete('/customers/me/favorites/:productId', ...access, csrf(auth), c.removeFavorite);
  router.post('/customers/me/orders/:id/repeat-preview', ...access, csrf(auth), c.repeatPreview);
  return router;
}

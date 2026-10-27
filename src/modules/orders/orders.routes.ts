import { Router, type RequestHandler } from 'express';
import { authenticate, authorize } from '../../middleware/authenticate.js';
import { csrf } from '../../middleware/csrf.js';
import { cookie, names } from '../auth/auth.http.js';
import type { AuthService } from '../auth/auth.service.js';
import type { OrdersService } from './orders.service.js';
import { ordersController } from './orders.controller.js';

export function ordersRoutes(auth: AuthService, service: OrdersService) {
  const router = Router(),
    controller = ordersController(service),
    protect = csrf(auth);
  const signedIn = authenticate(auth);
  const optionalCustomer: RequestHandler = (request, response, next) => {
    // Cookie presente inválida/vencida se rechaza; no degradar a invitado.
    if (
      cookie(request, names(auth).access) !== undefined ||
      cookie(request, names(auth).refresh) !== undefined
    )
      return signedIn(request, response, next);
    next();
  };
  // No-store solo para estas rutas, sin alterar catálogo u otros módulos.
  const noStore: RequestHandler = (_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  };
  router.post('/orders', noStore, protect, optionalCustomer, controller.createMobile);
  router.post(
    '/cashier/orders',
    noStore,
    protect,
    signedIn,
    authorize('CAJERO'),
    controller.createCashier,
  );
  router.get('/orders/:id', noStore, signedIn, controller.get);
  router.get(
    '/preparation/orders',
    noStore,
    signedIn,
    authorize('PREPARACION', 'CAJERO'),
    controller.preparation,
  );
  router.post(
    '/orders/:id/ready',
    noStore,
    protect,
    signedIn,
    authorize('PREPARACION', 'CAJERO'),
    controller.ready,
  );
  router.post(
    '/cashier/customers/search',
    noStore,
    protect,
    signedIn,
    authorize('CAJERO'),
    controller.searchCustomer,
  );
  router.patch(
    '/cashier/orders/:id/customer',
    noStore,
    protect,
    signedIn,
    authorize('CAJERO'),
    controller.associate,
  );
  return router;
}

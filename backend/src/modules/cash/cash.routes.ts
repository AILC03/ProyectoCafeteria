import { Router, type RequestHandler } from 'express';
import { authenticate, authorize } from '../../middleware/authenticate.js';
import { csrf } from '../../middleware/csrf.js';
import type { AuthService } from '../auth/auth.service.js';
import type { CashService } from './cash.service.js';
import { cashController } from './cash.controller.js';
export const privateCashResponse: RequestHandler = (_request, response, next) => {
  response.set('Cache-Control', 'no-store');
  response.set('Referrer-Policy', 'no-referrer');
  next();
};
export function cashRoutes(auth: AuthService, service: CashService) {
  const router = Router(),
    c = cashController(service),
    writeAccess = [privateCashResponse, authenticate(auth), authorize('CAJERO')],
    readAccess = [privateCashResponse, authenticate(auth), authorize('CAJERO', 'GERENTE')];
  router.post('/cash-sessions', ...writeAccess, csrf(auth), c.open);
  router.get('/cash-sessions/current', ...readAccess, c.current);
  router.get('/cash-sessions/:id', ...readAccess, c.get);
  router.post('/cash-sessions/:id/close', ...writeAccess, csrf(auth), c.close);
  return router;
}

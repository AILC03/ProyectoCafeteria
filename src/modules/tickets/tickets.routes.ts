import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/authenticate.js';
import type { AuthService } from '../auth/auth.service.js';
import { privateCashResponse } from '../cash/cash.routes.js';
import type { TicketsService } from './tickets.service.js';
import { ticketsController } from './tickets.controller.js';
export function ticketsRoutes(auth: AuthService, service: TicketsService) {
  const router = Router();
  router.get(
    '/sales/:id/ticket',
    privateCashResponse,
    authenticate(auth),
    authorize('CAJERO'),
    ticketsController(service).get,
  );
  return router;
}

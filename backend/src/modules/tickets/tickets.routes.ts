import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/authenticate.js';
import { csrf } from '../../middleware/csrf.js';
import type { AuthService } from '../auth/auth.service.js';
import { privateCashResponse } from '../cash/cash.routes.js';
import type { TicketsService } from './tickets.service.js';
import { ticketsController } from './tickets.controller.js';
import { principal } from '../auth/auth.http.js';
import { idSchema } from '../../shared/http/pagination.js';
import { invalidInput } from '../../shared/http/problem.js';
import { jsonValue } from '../../shared/http/serialization.js';
export function ticketsRoutes(auth: AuthService, service: TicketsService) {
  const router = Router();
  const c = ticketsController(service);
  router.get('/guest-ticket', privateCashResponse, c.getGuest);
  router.get(
    '/customers/me/orders/:id/ticket',
    privateCashResponse,
    authenticate(auth),
    authorize('CLIENTE'),
    async (req, res) => {
      if (
        Object.keys(req.query).length ||
        req.headers['transfer-encoding'] ||
        Number(req.headers['content-length'] ?? 0)
      )
        throw invalidInput();
      res.json(
        jsonValue(await service.ownOrder(principal(res), BigInt(idSchema.parse(req.params.id)))),
      );
    },
  );
  router.post(
    '/sales/:id/ticket-access',
    privateCashResponse,
    authenticate(auth),
    authorize('CAJERO'),
    csrf(auth),
    c.issueGuest,
  );
  router.get(
    '/sales/:id/ticket',
    privateCashResponse,
    authenticate(auth),
    authorize('CAJERO'),
    ticketsController(service).get,
  );
  return router;
}

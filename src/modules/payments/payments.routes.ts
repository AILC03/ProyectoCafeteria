import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/authenticate.js';
import { csrf } from '../../middleware/csrf.js';
import type { AuthService } from '../auth/auth.service.js';
import { privateCashResponse } from '../cash/cash.routes.js';
import type { PaymentsService } from './payments.service.js';
import { paymentsController } from './payments.controller.js';
export function paymentsRoutes(auth: AuthService, service: PaymentsService) {
  const router = Router();
  router.post(
    '/payments/cash',
    privateCashResponse,
    authenticate(auth),
    authorize('CAJERO'),
    csrf(auth),
    paymentsController(service).charge,
  );
  return router;
}

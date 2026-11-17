import { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { HttpProblem } from '../../shared/http/problem.js';
import { csrf } from '../../middleware/csrf.js';
import { cookie, names } from '../auth/auth.http.js';
import { forbidden } from '../auth/auth.tokens.js';
import type { AuthService } from '../auth/auth.service.js';
import type { CustomerRegistrationService } from './customer-registration.service.js';
import { customerRegistrationController } from './customer-registration.controller.js';

export function customerRegistrationRoutes(
  auth: AuthService,
  service: CustomerRegistrationService,
  requestLimit = 20,
) {
  const router = Router();
  const noStore: RequestHandler = (_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    response.set('Referrer-Policy', 'no-referrer');
    next();
  };
  const guestOnly: RequestHandler = (request, _response, next) => {
    if (
      cookie(request, names(auth).access) !== undefined ||
      cookie(request, names(auth).refresh) !== undefined
    )
      throw forbidden();
    next();
  };
  router.post(
    '/customer-registration/ticket',
    noStore,
    rateLimit({
      windowMs: 60000,
      limit: requestLimit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_request, _response, next) =>
        next(new HttpProblem(429, 'REGISTRATION_RATE_LIMITED', 'Límite de solicitudes')),
    }),
    guestOnly,
    csrf(auth),
    customerRegistrationController(service).register,
  );
  return router;
}

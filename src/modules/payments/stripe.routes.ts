import { Router, type RequestHandler } from 'express';
import { csrf } from '../../middleware/csrf.js';
import { authenticate } from '../../middleware/authenticate.js';
import { cookie, names, principal } from '../auth/auth.http.js';
import type { AuthService } from '../auth/auth.service.js';
import { privateCashResponse } from '../cash/cash.routes.js';
import { idSchema } from '../../shared/http/pagination.js';
import { invalidInput } from '../../shared/http/problem.js';
import { jsonValue } from '../../shared/http/serialization.js';
import { emptyInput, operationKey } from '../orders/orders.validation.js';
import type { StripeService } from './stripe.service.js';
export function stripeWebhook(service: StripeService): RequestHandler {
  return async (req, res) => {
    if (
      !Buffer.isBuffer(req.body) ||
      typeof req.headers['stripe-signature'] !== 'string' ||
      Object.keys(req.query).length
    )
      throw invalidInput();
    res
      .set('Cache-Control', 'no-store')
      .json(await service.receive(req.body, req.headers['stripe-signature']));
  };
}
export function stripeRoutes(auth: AuthService, service: StripeService) {
  const router = Router();
  router.post(
    '/orders/:id/checkout',
    privateCashResponse,
    csrf(auth),
    async (req, res, next) => {
      if (cookie(req, names(auth).access) || cookie(req, names(auth).refresh))
        return authenticate(auth)(req, res, next);
      next();
    },
    async (req, res) => {
      emptyInput.parse(req.query);
      emptyInput.parse(req.body);
      if (!req.is('application/json')) throw invalidInput();
      const token = req.headers['x-checkout-token'];
      if (token !== undefined && (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)))
        throw invalidInput();
      res.json(
        jsonValue(
          await service.checkout(
            res.locals.principal ? principal(res) : undefined,
            token,
            BigInt(idSchema.parse(req.params.id)),
            operationKey.parse(req.headers['idempotency-key']),
          ),
        ),
      );
    },
  );
  return router;
}

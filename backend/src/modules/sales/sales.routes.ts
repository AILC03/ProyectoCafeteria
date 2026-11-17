import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/authenticate.js';
import type { AuthService } from '../auth/auth.service.js';
import { principal } from '../auth/auth.http.js';
import { privateCashResponse } from '../cash/cash.routes.js';
import { jsonValue } from '../../shared/http/serialization.js';
import { invalidInput } from '../../shared/http/problem.js';
import { salesFilters, salesQuery } from './sales.validation.js';
import type { SalesService } from './sales.service.js';
export function salesRoutes(auth: AuthService, service: SalesService) {
  const router = Router();
  router.use('/sales', privateCashResponse);
  const access = [authenticate(auth), authorize('CAJERO')];
  router.get('/sales', ...access, async (req, res) => {
    if (req.headers['transfer-encoding'] || Number(req.headers['content-length'] ?? 0))
      throw invalidInput();
    res.json(jsonValue(await service.list(principal(res), salesQuery.parse(req.query))));
  });
  router.get('/sales/summary', ...access, async (req, res) => {
    if (req.headers['transfer-encoding'] || Number(req.headers['content-length'] ?? 0))
      throw invalidInput();
    const input = salesFilters.parse(req.query);
    if (input.from && input.to && new Date(input.from) >= new Date(input.to)) throw invalidInput();
    res.json(jsonValue(await service.summary(principal(res), input)));
  });
  return router;
}

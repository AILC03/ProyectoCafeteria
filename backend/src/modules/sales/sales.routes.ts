import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/authenticate.js';
import type { AuthService } from '../auth/auth.service.js';
import { principal } from '../auth/auth.http.js';
import { privateCashResponse } from '../cash/cash.routes.js';
import { jsonValue } from '../../shared/http/serialization.js';
import { invalidInput } from '../../shared/http/problem.js';
import {
  dashboardSummaryQuery,
  salesFilters,
  salesQuery,
  salesRankingQuery,
  salesSeriesQuery,
} from './sales.validation.js';
import type { SalesService } from './sales.service.js';
export function salesRoutes(auth: AuthService, service: SalesService) {
  const router = Router();
  router.use('/sales', privateCashResponse);
  const access = [authenticate(auth), authorize('CAJERO', 'GERENTE')];
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
  router.get(
    '/admin/dashboard/summary',
    privateCashResponse,
    authenticate(auth),
    authorize('ADMINISTRADOR'),
    async (req, res) => {
      if (req.headers['transfer-encoding'] || Number(req.headers['content-length'] ?? 0))
        throw invalidInput();
      res.json(
        jsonValue(
          await service.administrativeSummary(
            principal(res),
            dashboardSummaryQuery.parse(req.query),
          ),
        ),
      );
    },
  );
  router.get(
    '/admin/dashboard/sales-series',
    privateCashResponse,
    authenticate(auth),
    authorize('ADMINISTRADOR'),
    async (req, res) => {
      if (req.headers['transfer-encoding'] || Number(req.headers['content-length'] ?? 0))
        throw invalidInput();
      res.json(
        jsonValue(await service.salesSeries(principal(res), salesSeriesQuery.parse(req.query))),
      );
    },
  );
  router.get(
    '/admin/dashboard/product-ranking',
    privateCashResponse,
    authenticate(auth),
    authorize('ADMINISTRADOR'),
    async (req, res) => {
      if (req.headers['transfer-encoding'] || Number(req.headers['content-length'] ?? 0))
        throw invalidInput();
      res.json(
        jsonValue(await service.productRanking(principal(res), salesRankingQuery.parse(req.query))),
      );
    },
  );
  return router;
}

import { Router, type Request } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/authenticate.js';
import { csrf } from '../../middleware/csrf.js';
import { idSchema, pageQuerySchema } from '../../shared/http/pagination.js';
import { invalidInput } from '../../shared/http/problem.js';
import { jsonValue } from '../../shared/http/serialization.js';
import { principal, clearCookies } from '../auth/auth.http.js';
import type { AuthService } from '../auth/auth.service.js';
import { privateCashResponse } from '../cash/cash.routes.js';
import type { AccountsService } from './accounts.service.js';
import * as v from './accounts.validation.js';
const empty = z.object({}).strict();
function body<T>(req: Request, schema: z.ZodType<T>) {
  empty.parse(req.query);
  if (!req.is('application/json')) throw invalidInput();
  return schema.parse(req.body);
}
export function accountsRoutes(auth: AuthService, service: AccountsService) {
  const router = Router();
  const admin = [privateCashResponse, authenticate(auth), authorize('ADMINISTRADOR')];
  const client = [privateCashResponse, authenticate(auth), authorize('CLIENTE')];
  const protect = csrf(auth);
  router.patch('/customers/me', ...client, protect, async (req, res) => {
    const input = body(req, v.ownProfile);
    const result = await service.ownProfile(principal(res), input);
    if (input.phone) clearCookies(res, auth);
    res.json(jsonValue(result));
  });
  router.get('/admin/employees', ...admin, async (req, res) => {
    if (req.headers['transfer-encoding'] || Number(req.headers['content-length'] ?? 0))
      throw invalidInput();
    res.json(jsonValue(await service.employees(principal(res), pageQuerySchema.parse(req.query))));
  });
  router.post('/admin/employees', ...admin, protect, async (req, res) => {
    res
      .status(201)
      .json(jsonValue(await service.createEmployee(principal(res), body(req, v.employeeCreate))));
  });
  router.patch('/admin/employees/:id', ...admin, protect, async (req, res) => {
    res.json(
      jsonValue(
        await service.updateEmployee(
          principal(res),
          BigInt(idSchema.parse(req.params.id)),
          body(req, v.employeeUpdate),
        ),
      ),
    );
  });
  router.patch('/admin/customers/:id', ...admin, protect, async (req, res) => {
    res.json(
      jsonValue(
        await service.correctCustomer(
          principal(res),
          BigInt(idSchema.parse(req.params.id)),
          body(req, v.customerUpdate),
        ),
      ),
    );
  });
  router.post('/admin/customers/:id/pin-reset', ...admin, protect, async (req, res) => {
    await service.resetPin(
      principal(res),
      BigInt(idSchema.parse(req.params.id)),
      body(req, v.pinReset),
    );
    res.status(204).end();
  });
  router.post('/customers/me/recovery-email', ...client, protect, async (req, res) => {
    res
      .status(202)
      .json(await service.requestEmail(principal(res), body(req, v.emailRequest).email));
  });
  router.post('/auth/email-verification', privateCashResponse, protect, async (req, res) => {
    await service.rate(`confirm-ip:${req.ip}`, 20, 60000);
    await service.confirm('email', body(req, v.emailConfirm).token);
    res.status(204).end();
  });
  router.post('/auth/pin-recovery', privateCashResponse, protect, async (req, res) => {
    res
      .status(202)
      .json(
        await service.requestRecovery(body(req, v.recoveryRequest).identifier, req.ip ?? 'unknown'),
      );
  });
  router.post('/auth/pin-recovery/confirm', privateCashResponse, protect, async (req, res) => {
    await service.rate(`confirm-ip:${req.ip}`, 20, 60000);
    const input = body(req, v.recoveryConfirm);
    await service.confirm('pin', input.token, input.newPin);
    clearCookies(res, auth);
    res.status(204).end();
  });
  return router;
}

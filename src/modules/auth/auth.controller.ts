import type { RequestHandler } from 'express';
import { z } from 'zod';
import { invalidInput } from '../../shared/http/problem.js';
import { names, cookie, principal, clearCookies, setCredentials, setCsrf } from './auth.http.js';
import type { AuthService } from './auth.service.js';

const password = z.string().min(8).max(24);
const pin = z.string().regex(/^\d{4}$/);
const staff = z.object({ username: z.string().trim().min(1).max(24), password }).strict();
const customer = z.object({ identifier: z.string().trim().min(1).max(32), pin }).strict();
export function authController(service: AuthService) {
  const bootstrap: RequestHandler = async (request, response) => {
    const token = service.tokens.csrf(
      await service.binding(cookie(request, names(service).refresh)),
    );
    setCsrf(response, service, token);
    response.set('Cache-Control', 'no-store').json({ data: { csrfToken: token } });
  };
  const loginStaff: RequestHandler = async (request, response) => {
    const body = staff.parse(request.body);
    setCredentials(
      response,
      service,
      await service.login('staff', body.username, body.password, request.ip ?? 'unknown'),
    );
  };
  const loginCustomer: RequestHandler = async (request, response) => {
    const body = customer.parse(request.body);
    let identifier = body.identifier.toUpperCase();
    if (/^\d{10}$/.test(identifier)) identifier = `+52${identifier}`;
    if (!/^(\+52\d{10}|C\d{1,19})$/.test(identifier)) throw invalidInput();
    setCredentials(
      response,
      service,
      await service.login('customer', identifier, body.pin, request.ip ?? 'unknown'),
    );
  };
  const refresh: RequestHandler = async (request, response) => {
    z.object({})
      .strict()
      .parse(request.body ?? {});
    setCredentials(
      response,
      service,
      await service.refresh(cookie(request, names(service).refresh)),
    );
  };
  const logout: RequestHandler = async (request, response) => {
    z.object({})
      .strict()
      .parse(request.body ?? {});
    await service.logout(
      cookie(request, names(service).refresh),
      cookie(request, names(service).access),
    );
    clearCookies(response, service);
    response.set('Cache-Control', 'no-store').status(204).end();
  };
  const me: RequestHandler = async (_request, response) =>
    response.set('Cache-Control', 'no-store').json({ data: await service.me(principal(response)) });
  const changePin: RequestHandler = async (request, response) => {
    const body = z.object({ currentPin: pin, newPin: pin }).strict().parse(request.body);
    await service.changeSecret(principal(response), 'pin', body.currentPin, body.newPin);
    clearCookies(response, service);
    response.status(204).end();
  };
  const changePassword: RequestHandler = async (request, response) => {
    const body = z
      .object({ currentPassword: password, newPassword: password })
      .strict()
      .parse(request.body);
    await service.changeSecret(
      principal(response),
      'password',
      body.currentPassword,
      body.newPassword,
    );
    clearCookies(response, service);
    response.status(204).end();
  };
  return { bootstrap, loginStaff, loginCustomer, refresh, logout, me, changePin, changePassword };
}

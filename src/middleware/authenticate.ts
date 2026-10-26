import type { RequestHandler } from 'express';
import type { AuthService } from '../modules/auth/auth.service.js';
import type { RoleName } from '../modules/auth/auth.types.js';
import { cookie, names, principal } from '../modules/auth/auth.http.js';
import { HttpProblem } from '../shared/http/problem.js';
import { forbidden } from '../modules/auth/auth.tokens.js';

export function authenticate(service: AuthService, allowPinChange = false): RequestHandler {
  return async (request, response, next) => {
    const user = await service.authenticate(cookie(request, names(service).access));
    if (user.mustChangePin && !allowPinChange)
      throw new HttpProblem(403, 'PIN_CHANGE_REQUIRED', 'Debes cambiar tu NIP');
    response.locals.principal = user;
    next();
  };
}
export function authorize(...roles: RoleName[]): RequestHandler {
  return (_request, response, next) => {
    const user = principal(response);
    if (!roles.includes(user.role) && !(user.role === 'ADMINISTRADOR' && roles.includes('CAJERO')))
      throw forbidden();
    next();
  };
}

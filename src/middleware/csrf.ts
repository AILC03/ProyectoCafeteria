import type { RequestHandler } from 'express';
import type { AuthService } from '../modules/auth/auth.service.js';
import { cookie, names } from '../modules/auth/auth.http.js';
import { HttpProblem } from '../shared/http/problem.js';

export function csrf(service: AuthService): RequestHandler {
  return async (request, _response, next) => {
    const header = request.headers['x-csrf-token'];
    const stored = cookie(request, names(service).csrf);
    if (request.headers.origin !== service.config.origin || typeof header !== 'string' || !stored)
      throw new HttpProblem(403, 'CSRF_INVALID', 'Protección CSRF inválida');
    const binding = await service.binding(cookie(request, names(service).refresh));
    service.tokens.verifyCsrf(stored, header, binding);
    next();
  };
}

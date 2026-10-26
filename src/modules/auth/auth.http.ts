import type { Request, Response } from 'express';
import { unauthorized } from './auth.tokens.js';
import type { AuthService } from './auth.service.js';
import type { Principal } from './auth.types.js';

export function names(service: AuthService) {
  const prefix = service.config.secure ? '__Host-caf_' : 'caf_';
  return { access: `${prefix}access`, refresh: `${prefix}refresh`, csrf: `${prefix}csrf` };
}
export function cookie(request: Request, name: string) {
  const matches = (request.headers.cookie ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  if (matches.length > 1) throw unauthorized();
  const value = matches[0]?.slice(name.length + 1);
  if (value && (!/^[A-Za-z0-9_.-]+$/.test(value) || value.length > 4096)) throw unauthorized();
  return value;
}
export function clearCookies(response: Response, service: AuthService) {
  for (const name of Object.values(names(service)))
    response.clearCookie(name, {
      httpOnly: true,
      secure: service.config.secure,
      sameSite: 'lax',
      path: '/',
    });
}
export function setCsrf(response: Response, service: AuthService, token: string) {
  response.cookie(names(service).csrf, token, {
    httpOnly: true,
    secure: service.config.secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 3600000,
  });
}
export function setCredentials(
  response: Response,
  service: AuthService,
  result: Awaited<ReturnType<AuthService['login']>>,
) {
  const common = {
    httpOnly: true,
    secure: service.config.secure,
    sameSite: 'lax' as const,
    path: '/',
  };
  const remaining = Math.max(0, result.expiresAt.getTime() - service.now().getTime());
  response.cookie(names(service).access, result.access, {
    ...common,
    maxAge: Math.min(900000, remaining),
  });
  response.cookie(names(service).refresh, result.refresh, { ...common, maxAge: remaining });
  setCsrf(response, service, result.csrf);
  response
    .set('Cache-Control', 'no-store')
    .json({ data: { user: result.user, csrfToken: result.csrf } });
}
export function principal(response: Response): Principal {
  if (!response.locals.principal) throw unauthorized();
  return response.locals.principal as Principal;
}

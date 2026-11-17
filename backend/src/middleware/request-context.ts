import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Logger } from 'pino';

export function requestContext(logger?: Logger): RequestHandler {
  return (request, response, next) => {
    // No confiar en identificadores recibidos; no registrar query, cookies ni cuerpos.
    const requestId = randomUUID();
    response.locals.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);
    const started = performance.now();
    response.once('finish', () =>
      logger?.info(
        {
          requestId,
          method: request.method,
          status: response.statusCode,
          durationMs: Math.round(performance.now() - started),
        },
        'http_request',
      ),
    );
    next();
  };
}

import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

export class HttpProblem extends Error {
  constructor(
    public status: number,
    public code: string,
    public title: string,
    public detail = title,
  ) {
    super(title);
  }
}
export const invalidInput = () => new HttpProblem(400, 'VALIDATION_ERROR', 'Solicitud inválida');
export const notFound = () => new HttpProblem(404, 'NOT_FOUND', 'Recurso no encontrado');
export const unavailable = () =>
  new HttpProblem(503, 'DEPENDENCY_UNAVAILABLE', 'Servicio indisponible');

export const problemHandler: ErrorRequestHandler = (error: unknown, request, response, next) => {
  if (response.headersSent) return next(error);
  const record = error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
  const providerCode = record.code ?? record.errorCode;
  let problem: HttpProblem;
  if (error instanceof HttpProblem) problem = error;
  else if (error instanceof ZodError || error instanceof URIError) problem = invalidInput();
  else if (record.type === 'entity.too.large')
    problem = new HttpProblem(413, 'PAYLOAD_TOO_LARGE', 'Solicitud demasiado grande');
  else if (record.type === 'entity.parse.failed') problem = invalidInput();
  else if (typeof providerCode === 'string' && ['P2002', 'P2003', 'P2014'].includes(providerCode))
    problem = new HttpProblem(409, 'DATA_CONFLICT', 'Conflicto de datos');
  else if (providerCode === 'P2025') problem = notFound();
  else if (
    typeof providerCode === 'string' &&
    [
      'P1001',
      'P1002',
      'P1008',
      'P1017',
      'P2024',
      'P2021',
      'P2022',
      'P2010',
      'ECONNREFUSED',
      'ETIMEDOUT',
      '57P01',
    ].includes(providerCode)
  )
    problem = unavailable();
  else problem = new HttpProblem(500, 'INTERNAL_ERROR', 'Error interno');
  response
    .status(problem.status)
    .type('application/problem+json')
    .json({
      type: 'about:blank',
      title: problem.title,
      status: problem.status,
      detail: problem.detail,
      instance: request.path,
      code: problem.code,
      requestId: response.locals.requestId,
      ...(error instanceof ZodError
        ? {
            errors: error.issues.map((issue) => ({
              field: issue.path.join('.'),
              message: 'Valor inválido',
            })),
          }
        : {}),
    });
};

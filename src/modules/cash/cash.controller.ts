import type { RequestHandler } from 'express';
import { principal } from '../auth/auth.http.js';
import { jsonValue } from '../../shared/http/serialization.js';
import type { CashService } from './cash.service.js';
import { cashOpen, cashClose, dbId, emptyInput, operationKey } from './cash.validation.js';
export function cashController(service: CashService) {
  const open: RequestHandler = async (request, response) => {
    emptyInput.parse(request.query);
    const body = cashOpen.parse(request.body);
    response
      .status(201)
      .json(
        jsonValue(
          await service.open(
            principal(response),
            body.openingAmountCents,
            operationKey.parse(request.headers['idempotency-key']),
          ),
        ),
      );
  };
  const current: RequestHandler = async (request, response) => {
    emptyInput.parse(request.query);
    response.json(jsonValue(await service.current(principal(response))));
  };
  const get: RequestHandler = async (request, response) => {
    emptyInput.parse(request.query);
    response.json(jsonValue(await service.get(principal(response), dbId.parse(request.params.id))));
  };
  const close: RequestHandler = async (request, response) => {
    emptyInput.parse(request.query);
    const body = cashClose.parse(request.body);
    response.json(
      jsonValue(
        await service.close(
          principal(response),
          dbId.parse(request.params.id),
          body,
          operationKey.parse(request.headers['idempotency-key']),
        ),
      ),
    );
  };
  return { open, current, get, close };
}

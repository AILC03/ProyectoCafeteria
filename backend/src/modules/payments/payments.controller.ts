import type { RequestHandler } from 'express';
import { principal } from '../auth/auth.http.js';
import { jsonValue } from '../../shared/http/serialization.js';
import { emptyInput, operationKey } from '../cash/cash.validation.js';
import { cashCharge } from './payments.validation.js';
import type { PaymentsService } from './payments.service.js';
export function paymentsController(service: PaymentsService) {
  const charge: RequestHandler = async (request, response) => {
    emptyInput.parse(request.query);
    response
      .status(201)
      .json(
        jsonValue(
          await service.charge(
            principal(response),
            cashCharge.parse(request.body),
            operationKey.parse(request.headers['idempotency-key']),
          ),
        ),
      );
  };
  return { charge };
}

import type { RequestHandler } from 'express';
import { idSchema, pageQuerySchema } from '../../shared/http/pagination.js';
import { jsonValue } from '../../shared/http/serialization.js';
import { principal } from '../auth/auth.http.js';
import type { Principal } from '../auth/auth.types.js';
import type { OrdersService } from './orders.service.js';
import * as input from './orders.validation.js';

export function ordersController(service: OrdersService) {
  const createMobile: RequestHandler = async (request, response) => {
    input.emptyInput.parse(request.query);
    const body = input.mobileOrder.parse(request.body),
      key = input.operationKey.parse(request.headers['idempotency-key']);
    response
      .status(201)
      .json(
        await service.create(
          'MOBILE',
          response.locals.principal as Principal | undefined,
          body,
          key,
        ),
      );
  };
  const createCashier: RequestHandler = async (request, response) => {
    input.emptyInput.parse(request.query);
    const body = input.cashierOrder.parse(request.body),
      key = input.operationKey.parse(request.headers['idempotency-key']);
    response.status(201).json(await service.create('CASHIER', principal(response), body, key));
  };
  const get: RequestHandler = async (request, response) => {
    input.emptyInput.parse(request.query);
    response.json(
      jsonValue(await service.get(principal(response), BigInt(idSchema.parse(request.params.id)))),
    );
  };
  const preparation: RequestHandler = async (request, response) => {
    response.json(
      jsonValue(
        await service.preparation(principal(response), pageQuerySchema.parse(request.query)),
      ),
    );
  };
  const searchCustomer: RequestHandler = async (request, response) => {
    input.emptyInput.parse(request.query);
    response.json(
      jsonValue(
        await service.searchCustomer(
          principal(response),
          input.customerSearch.parse(request.body).identifier,
        ),
      ),
    );
  };
  const associate: RequestHandler = async (request, response) => {
    input.emptyInput.parse(request.query);
    response.json(
      jsonValue(
        await service.associate(
          principal(response),
          BigInt(idSchema.parse(request.params.id)),
          input.customerSelection.parse(request.body),
        ),
      ),
    );
  };
  const ready: RequestHandler = async (request, response) => {
    input.emptyInput.parse(request.query);
    input.emptyInput.parse(request.body);
    response.json(
      jsonValue(
        await service.ready(principal(response), BigInt(idSchema.parse(request.params.id))),
      ),
    );
  };
  return { createMobile, createCashier, get, preparation, searchCustomer, associate, ready };
}

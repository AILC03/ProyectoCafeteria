import type { Request, RequestHandler } from 'express';
import { principal } from '../auth/auth.http.js';
import { invalidInput } from '../../shared/http/problem.js';
import { jsonValue } from '../../shared/http/serialization.js';
import { historyQuery, profileQuery, resourceId } from './customers.validation.js';
import type { CustomersService } from './customers.service.js';

function requireNoBody(request: Request) {
  if (
    request.headers['transfer-encoding'] ||
    (request.headers['content-length'] && request.headers['content-length'] !== '0')
  )
    throw invalidInput();
}
export function customersController(service: CustomersService) {
  const profile: RequestHandler = async (request, response) => {
    requireNoBody(request);
    profileQuery.parse(request.query);
    response.json(jsonValue(await service.profile(principal(response))));
  };
  const history: RequestHandler = async (request, response) => {
    requireNoBody(request);
    response.json(
      jsonValue(await service.history(principal(response), historyQuery.parse(request.query))),
    );
  };
  const favorites: RequestHandler = async (request, response) => {
    requireNoBody(request);
    response.json(
      jsonValue(await service.favorites(principal(response), historyQuery.parse(request.query))),
    );
  };
  const addFavorite: RequestHandler = async (request, response) => {
    profileQuery.parse(request.query);
    emptyMutationBody(request);
    await service.addFavorite(
      principal(response),
      BigInt(resourceId.parse(request.params.productId)),
    );
    response.status(204).end();
  };
  const removeFavorite: RequestHandler = async (request, response) => {
    profileQuery.parse(request.query);
    emptyMutationBody(request);
    await service.removeFavorite(
      principal(response),
      BigInt(resourceId.parse(request.params.productId)),
    );
    response.status(204).end();
  };
  const repeatPreview: RequestHandler = async (request, response) => {
    profileQuery.parse(request.query);
    emptyMutationBody(request, true);
    response.json(
      jsonValue(
        await service.repeatPreview(
          principal(response),
          BigInt(resourceId.parse(request.params.id)),
        ),
      ),
    );
  };
  return { profile, history, favorites, addFavorite, removeFavorite, repeatPreview };
}
function emptyMutationBody(request: Request, required = false) {
  const hasBody =
    request.headers['transfer-encoding'] ||
    (request.headers['content-length'] && request.headers['content-length'] !== '0');
  if (hasBody && !request.is('application/json')) throw invalidInput();
  profileQuery.parse(request.body ?? (required ? undefined : {}));
}

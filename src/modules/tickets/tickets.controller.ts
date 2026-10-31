import type { RequestHandler } from 'express';
import { principal } from '../auth/auth.http.js';
import { jsonValue } from '../../shared/http/serialization.js';
import { emptyInput, ticketId } from './tickets.validation.js';
import type { TicketsService } from './tickets.service.js';
export function ticketsController(service: TicketsService) {
  const get: RequestHandler = async (request, response) => {
    emptyInput.parse(request.query);
    response.json(
      jsonValue(await service.get(principal(response), ticketId.parse(request.params.id))),
    );
  };
  return { get };
}

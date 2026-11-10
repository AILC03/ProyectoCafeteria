import type { RequestHandler } from 'express';
import { principal } from '../auth/auth.http.js';
import { jsonValue } from '../../shared/http/serialization.js';
import { emptyInput, ticketId, guestTicketTokenSchema } from './tickets.validation.js';
import { notFound, invalidInput } from '../../shared/http/problem.js';
import type { TicketsService } from './tickets.service.js';
export function ticketsController(service: TicketsService) {
  const get: RequestHandler = async (request, response) => {
    emptyInput.parse(request.query);
    response.json(
      jsonValue(await service.get(principal(response), ticketId.parse(request.params.id))),
    );
  };
  const issueGuest: RequestHandler = async (request, response) => {
    emptyInput.parse(request.query);
    emptyInput.parse(request.body);
    response
      .status(201)
      .json(
        jsonValue(await service.issueGuest(principal(response), ticketId.parse(request.params.id))),
      );
  };
  const getGuest: RequestHandler = async (request, response) => {
    emptyInput.parse(request.query);
    // GET no admite cuerpos, ni siquiera vacíos: el permiso solo viaja en cabecera.
    if (
      request.headers['transfer-encoding'] ||
      (request.headers['content-length'] && request.headers['content-length'] !== '0')
    ) {
      throw invalidInput();
    }
    const token = request.get('X-Ticket-Token');
    if (!token) throw notFound();
    response.json(jsonValue(await service.getGuest(guestTicketTokenSchema.parse(token))));
  };
  return { get, issueGuest, getGuest };
}

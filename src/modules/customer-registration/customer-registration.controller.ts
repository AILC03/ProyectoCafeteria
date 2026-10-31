import type { RequestHandler } from 'express';
import type { CustomerRegistrationService } from './customer-registration.service.js';
import { registrationQuery, ticketRegistrationSchema } from './customer-registration.schemas.js';
export function customerRegistrationController(service: CustomerRegistrationService) {
  const register: RequestHandler = async (request, response) => {
    registrationQuery.parse(request.query);
    const result = await service.register(ticketRegistrationSchema.parse(request.body));
    response.status(201).json({ data: result });
  };
  return { register };
}

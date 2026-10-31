import { z } from 'zod';
import { customerNameSchema, phoneSchema, pinSchema } from '../../shared/http/customer-input.js';
import { registrationTokenSchema } from '../tickets/tickets.validation.js';
export const ticketRegistrationSchema = z
  .object({
    token: registrationTokenSchema,
    name: customerNameSchema,
    phone: phoneSchema,
    pin: pinSchema,
  })
  .strict();
export type TicketRegistrationInput = z.infer<typeof ticketRegistrationSchema>;
export const registrationQuery = z.object({}).strict();

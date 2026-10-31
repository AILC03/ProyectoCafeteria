import { idSchema } from '../../shared/http/pagination.js';
import { z } from 'zod';
export { emptyInput } from '../orders/orders.validation.js';
export const ticketId = idSchema.transform(BigInt);
// Mismo original base64url que produce opaque() y entrega TicketCipher/CASH-02.
export const registrationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

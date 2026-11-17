import { z } from 'zod';
import { cents, dbId } from '../cash/cash.validation.js';
export const cashCharge = z
  .object({
    cashSessionId: dbId,
    orderId: dbId,
    cashReceivedCents: cents,
    changeCents: cents.optional(),
  })
  .strict();
export type ChargeInput = z.infer<typeof cashCharge>;

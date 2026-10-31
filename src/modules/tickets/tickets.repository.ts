import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
export class TicketsTransaction {
  constructor(private tx: Prisma.TransactionClient) {}
  registration(saleId: bigint) {
    return this.tx.customerRegistrationToken.findUnique({ where: { saleId } });
  }
  createRegistration(data: Prisma.CustomerRegistrationTokenUncheckedCreateInput) {
    return this.tx.customerRegistrationToken.create({ data });
  }
}
export function purgeTicketSecrets(db: PrismaClient, now = new Date()) {
  return db.customerRegistrationToken.updateMany({
    where: {
      encryptedPayload: { not: null },
      OR: [{ expiresAt: { lte: now } }, { usedAt: { not: null } }],
    },
    data: { encryptedPayload: null, keyVersion: null },
  });
}

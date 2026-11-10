import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
export class TicketsTransaction {
  constructor(private tx: Prisma.TransactionClient) {}
  async lockSale(saleId: bigint) {
    await this.tx.$queryRaw`SELECT id FROM sales WHERE id=${saleId} FOR UPDATE`;
  }
  async lockPayment(paymentId: bigint) {
    await this.tx.$queryRaw`SELECT id FROM payments WHERE id=${paymentId} FOR UPDATE`;
  }
  guest(tokenHash: string) {
    return this.tx.guestTicketToken.findUnique({ where: { tokenHash } });
  }
  revokeGuest(saleId: bigint, now: Date) {
    return this.tx.guestTicketToken.updateMany({
      where: { saleId, revokedAt: null },
      data: { revokedAt: now },
    });
  }
  createGuest(data: Prisma.GuestTicketTokenUncheckedCreateInput) {
    return this.tx.guestTicketToken.create({ data });
  }
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

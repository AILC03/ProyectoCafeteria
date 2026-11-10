import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { withTransaction } from '../../shared/database/transaction.js';
export class StripeRepository {
  constructor(readonly db: PrismaClient) {}
  transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
    return withTransaction(this.db, fn);
  }
  async schedule(
    tx: Prisma.TransactionClient,
    type: string,
    reference: string,
    dedupeKey: string,
    availableAt = new Date(),
  ) {
    return tx.job.upsert({
      where: { dedupeKey },
      create: { type, reference, dedupeKey, availableAt },
      update: {},
    });
  }
}

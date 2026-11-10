import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import { withTransaction } from '../shared/database/transaction.js';

export type Work = {
  id: bigint;
  type: string;
  reference: string;
  attempts: number;
  leaseToken: string;
  encryptedPayload?: string | null;
  keyVersion?: string | null;
  expiresAt?: Date | null;
};
export class WorkerRepository {
  constructor(readonly db: PrismaClient) {}
  async claim(
    outbox: boolean,
    now: Date,
    leaseMs = 60000,
    allowedTypes?: string[],
  ): Promise<Work | undefined> {
    const table = outbox ? Prisma.sql`outbox_messages` : Prisma.sql`jobs`;
    const lease = randomUUID();
    const rows = await this.db.$queryRaw<Work[]>(Prisma.sql`
      UPDATE ${table} w SET status='PROCESSING',attempts=attempts+1,locked_until=${new Date(now.getTime() + leaseMs)},lease_token=${lease}::uuid
      WHERE id=(SELECT id FROM ${table} WHERE attempts<8
        ${allowedTypes ? (allowedTypes.length ? Prisma.sql`AND type IN (${Prisma.join(allowedTypes)})` : Prisma.sql`AND FALSE`) : Prisma.empty} AND
        ((status='PENDING' AND available_at<=${now}) OR (status='PROCESSING' AND locked_until<=${now}))
        ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING id,type,reference,attempts,lease_token::text AS "leaseToken"
      ${outbox ? Prisma.sql`,encrypted_payload AS "encryptedPayload",key_version AS "keyVersion",expires_at AS "expiresAt"` : Prisma.empty}`);
    return rows[0];
  }
  async finish(work: Work, outbox: boolean, ok: boolean, now: Date) {
    const table = outbox ? Prisma.sql`outbox_messages` : Prisma.sql`jobs`;
    const final = ok || work.attempts >= 8;
    // Fencing: un worker cuyo lease fue recuperado no puede finalizar el nuevo.
    await this.db.$executeRaw(Prisma.sql`UPDATE ${table}
      SET status=${ok ? 'SUCCEEDED' : final ? 'FAILED' : 'PENDING'}::"JobStatus",
      locked_until=NULL,lease_token=NULL,available_at=${new Date(now.getTime() + Math.min(3600000, 1000 * 2 ** work.attempts))}
      ${outbox ? (final ? Prisma.sql`,encrypted_payload=NULL,key_version=NULL` : Prisma.empty) : Prisma.sql`,last_error=${ok ? null : 'HANDLER_FAILED'}`}
      WHERE id=${work.id} AND lease_token=${work.leaseToken}::uuid AND status='PROCESSING'`);
  }
  async maintenance(now: Date) {
    await withTransaction(this.db, async (tx) => {
      // Un proceso caído en el último intento se vuelve visible para revisión.
      await tx.job.updateMany({
        where: {
          status: 'PROCESSING',
          attempts: { gte: 8 },
          lockedUntil: { lte: now },
          leaseToken: { not: null },
        },
        data: {
          status: 'FAILED',
          lockedUntil: null,
          leaseToken: null,
          lastError: 'LEASE_EXHAUSTED',
        },
      });
      await tx.outboxMessage.updateMany({
        where: {
          OR: [
            { expiresAt: { lte: now }, encryptedPayload: { not: null } },
            { status: 'PROCESSING', attempts: { gte: 8 }, lockedUntil: { lte: now } },
          ],
        },
        data: {
          status: 'FAILED',
          encryptedPayload: null,
          keyVersion: null,
          lockedUntil: null,
          leaseToken: null,
        },
      });
      await tx.$executeRaw`UPDATE orders SET status='EXPIRADA',expired_at=${now},updated_at=${now}
        WHERE id IN (SELECT o.id FROM orders o WHERE o.status='PENDIENTE_PAGO' AND o.payment_method='CASH'
          AND o.payment_expires_at<=${now} AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id=o.id AND p.status='SUCCEEDED')
          ORDER BY o.id FOR UPDATE SKIP LOCKED LIMIT 100)`;
      const pending = await tx.order.findMany({
        where: {
          status: 'PENDIENTE_PAGO',
          paymentMethod: 'STRIPE',
          paymentExpiresAt: { lte: now },
        },
        select: { id: true },
        take: 100,
        orderBy: { id: 'asc' },
      });
      for (const o of pending) {
        const dedupeKey = `stripe:expire:${o.id}`;
        await tx.job.upsert({
          where: { dedupeKey },
          create: { type: 'STRIPE_RECONCILE', reference: o.id.toString(), dedupeKey },
          update: {},
        });
      }
      await tx.order.updateMany({
        where: { createdAt: { lte: new Date(now.getTime() - 48 * 3600000) } },
        data: {
          cashQrEncryptedPayload: null,
          cashQrKeyVersion: null,
          checkoutEncryptedPayload: null,
          checkoutKeyVersion: null,
        },
      });
      await tx.customerRegistrationToken.updateMany({
        where: { expiresAt: { lte: now } },
        data: { encryptedPayload: null, keyVersion: null },
      });
    });
  }
}

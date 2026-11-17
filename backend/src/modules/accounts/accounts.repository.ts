import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
import { withTransaction } from '../../shared/database/transaction.js';
import type { Position } from '../../shared/http/pagination.js';
export const customerFields = { id: true, customerNumber: true, name: true, phone: true } as const;
export const staffFields = {
  id: true,
  name: true,
  username: true,
  isActive: true,
  role: { select: { name: true } },
} as const;
export class AccountsRepository {
  constructor(readonly db: PrismaClient) {}
  transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
    return withTransaction(this.db, fn);
  }
  lock(tx: Prisma.TransactionClient, id: bigint) {
    return tx.$queryRaw`SELECT id FROM users WHERE id=${id} FOR UPDATE`;
  }
  async employees(tx: Prisma.TransactionClient, limit: number, after?: Position) {
    const rows = await tx.$queryRaw<
      {
        id: bigint;
        name: string;
        username: string;
        role: string;
        isActive: boolean;
        positionTime: string;
      }[]
    >(Prisma.sql`
      SELECT u.id,u.name,u.username,r.name AS role,u.is_active AS "isActive",
      to_char(u.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "positionTime"
      FROM users u JOIN roles r ON r.id=u.role_id WHERE u.account_type='STAFF'
      ${after ? Prisma.sql`AND (u.created_at,u.id)>(${after.createdAt}::timestamptz,${BigInt(after.id)})` : Prisma.empty}
      ORDER BY u.created_at,u.id LIMIT ${limit + 1}`);
    return rows.map(({ positionTime, ...data }) => ({
      data,
      position: { id: data.id.toString(), createdAt: positionTime },
    }));
  }
}

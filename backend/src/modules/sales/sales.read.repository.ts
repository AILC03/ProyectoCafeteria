import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
import { withTransaction } from '../../shared/database/transaction.js';
import type { Position } from '../../shared/http/pagination.js';
import { OrdersTransaction } from '../orders/orders.repository.js';
import { forbidden } from '../auth/auth.tokens.js';
import type { Principal } from '../auth/auth.types.js';
import type { SalesFilters } from './sales.validation.js';

export class SalesRepository {
  constructor(private db: PrismaClient) {}
  read<T>(actor: Principal, fn: (tx: Prisma.TransactionClient) => Promise<T>) {
    return withTransaction(this.db, async (tx) => {
      const role = await new OrdersTransaction(tx).actor(actor, new Date());
      if (!['CAJERO', 'ADMINISTRADOR'].includes(role)) throw forbidden();
      return fn(tx);
    });
  }
  where(input: SalesFilters) {
    return Prisma.sql`TRUE
      ${input.from ? Prisma.sql`AND s.sold_at >= ${new Date(input.from)}` : Prisma.empty}
      ${input.to ? Prisma.sql`AND s.sold_at < ${new Date(input.to)}` : Prisma.empty}
      ${input.method ? Prisma.sql`AND p.method::text=${input.method}` : Prisma.empty}`;
  }
  async list(actor: Principal, input: SalesFilters, limit: number, after?: Position) {
    return this.read(actor, async (tx) => {
      const rows = await tx.$queryRaw<
        {
          id: bigint;
          saleNumber: string;
          orderId: bigint;
          paymentId: bigint;
          totalCents: bigint;
          soldAt: Date;
          method: 'CASH' | 'STRIPE';
          positionTime: string;
        }[]
      >(Prisma.sql`SELECT s.id,s.sale_number AS "saleNumber",s.order_id AS "orderId",
        s.payment_id AS "paymentId",s.total_cents AS "totalCents",s.sold_at AS "soldAt",p.method,
        to_char(s.sold_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "positionTime"
        FROM sales s JOIN payments p ON p.id=s.payment_id WHERE ${this.where(input)}
        ${after ? Prisma.sql`AND (s.sold_at,s.id)>(${after.createdAt}::timestamptz,${BigInt(after.id)})` : Prisma.empty}
        ORDER BY s.sold_at,s.id LIMIT ${limit + 1}`);
      return rows.map(({ positionTime, ...data }) => ({
        data,
        position: { id: data.id.toString(), createdAt: positionTime },
      }));
    });
  }
  summary(actor: Principal, input: SalesFilters) {
    return this.read(actor, async (tx) => {
      const [row] = await tx.$queryRaw<
        { count: string; totalCents: string; cashCents: string; stripeCents: string }[]
      >(Prisma.sql`
        SELECT count(*)::text AS count,coalesce(sum(s.total_cents),0)::text AS "totalCents",
        coalesce(sum(s.total_cents) FILTER (WHERE p.method='CASH'),0)::text AS "cashCents",
        coalesce(sum(s.total_cents) FILTER (WHERE p.method='STRIPE'),0)::text AS "stripeCents"
        FROM sales s JOIN payments p ON p.id=s.payment_id WHERE ${this.where(input)}`);
      return { data: row! };
    });
  }
}

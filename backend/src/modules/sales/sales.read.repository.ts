import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
import { withTransaction } from '../../shared/database/transaction.js';
import type { Position } from '../../shared/http/pagination.js';
import { OrdersTransaction } from '../orders/orders.repository.js';
import { forbidden } from '../auth/auth.tokens.js';
import type { Principal } from '../auth/auth.types.js';
import type { DashboardSummaryQuery, SalesFilters, SalesOrder } from './sales.validation.js';

type DashboardAggregateRow = {
  ticketCount: string;
  totalCents: string;
  cashCents: string;
  stripeCents: string;
  unitsSold: string;
  previousTicketCount: string;
  previousTotalCents: string;
  previousUnitsSold: string;
};

export type SalesSeriesAggregate = {
  totalCents: string;
  ticketCount: string;
  unitsSold: string;
};

export class SalesRepository {
  constructor(private db: PrismaClient) {}
  read<T>(actor: Principal, fn: (tx: Prisma.TransactionClient) => Promise<T>) {
    return withTransaction(this.db, async (tx) => {
      const role = await new OrdersTransaction(tx).actor(actor, new Date());
      if (!['CAJERO', 'ADMINISTRADOR', 'GERENTE'].includes(role)) throw forbidden();
      return fn(tx);
    });
  }
  where(input: SalesFilters) {
    return Prisma.sql`TRUE
      ${input.from ? Prisma.sql`AND s.sold_at >= ${new Date(input.from)}` : Prisma.empty}
      ${input.to ? Prisma.sql`AND s.sold_at < ${new Date(input.to)}` : Prisma.empty}
      ${input.method ? Prisma.sql`AND p.method::text=${input.method}` : Prisma.empty}`;
  }
  async list(
    actor: Principal,
    input: SalesFilters,
    limit: number,
    after?: Position,
    order: SalesOrder = 'asc',
  ) {
    return this.read(actor, async (tx) => {
      const comparison = order === 'desc' ? Prisma.sql`<` : Prisma.sql`>`;
      const ordering =
        order === 'desc'
          ? Prisma.sql`ORDER BY s.sold_at DESC,s.id DESC`
          : Prisma.sql`ORDER BY s.sold_at,s.id`;
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
        ${after ? Prisma.sql`AND (s.sold_at,s.id)${comparison}(${after.createdAt}::timestamptz,${BigInt(after.id)})` : Prisma.empty}
        ${ordering} LIMIT ${limit + 1}`);
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
  /**
   * Agregado por bucket en una sola lectura. `sold_at` permanece en PostgreSQL
   * (microsegundos intactos): se filtra y asigna por los límites efectivos de
   * cada bucket, sin convertir filas a Date. Unidades por venta sin unir
   * opciones ni intentos de pago.
   */
  seriesAggregates(
    actor: Principal,
    input: { from: Date; to: Date; method?: 'CASH' | 'STRIPE' },
    buckets: { effectiveFrom: Date; effectiveTo: Date }[],
  ): Promise<SalesSeriesAggregate[]> {
    const method = input.method ? Prisma.sql`AND p.method::text=${input.method}` : Prisma.empty;
    const bucketValues = Prisma.join(
      buckets.map(
        (bucket, index) =>
          Prisma.sql`(${index}::int,${bucket.effectiveFrom}::timestamptz,${bucket.effectiveTo}::timestamptz)`,
      ),
    );
    return this.read(actor, async (tx) => {
      const rows = await tx.$queryRaw<
        { idx: number; totalCents: string; ticketCount: string; unitsSold: string }[]
      >(Prisma.sql`
        WITH buckets(idx,effective_from,effective_to) AS (VALUES ${bucketValues}),
        range_sales AS (
          SELECT s.id,s.order_id,s.total_cents,s.sold_at
          FROM sales s JOIN payments p ON p.id=s.payment_id
          WHERE s.sold_at >= ${input.from}::timestamptz
            AND s.sold_at < ${input.to}::timestamptz ${method}
        ),
        sale_units AS (
          SELECT rs.id AS sale_id,coalesce(sum(oi.quantity),0)::bigint AS units
          FROM range_sales rs JOIN order_items oi ON oi.order_id=rs.order_id
          GROUP BY rs.id
        )
        SELECT b.idx::int AS idx,
          coalesce(sum(rs.total_cents),0)::text AS "totalCents",
          count(rs.id)::text AS "ticketCount",
          coalesce(sum(su.units),0)::text AS "unitsSold"
        FROM buckets b
        LEFT JOIN range_sales rs
          ON rs.sold_at >= b.effective_from AND rs.sold_at < b.effective_to
        LEFT JOIN sale_units su ON su.sale_id=rs.id
        GROUP BY b.idx ORDER BY b.idx`);
      const byIndex = new Map(rows.map((row) => [row.idx, row]));
      return buckets.map((_bucket, index) => {
        const row = byIndex.get(index);
        // El SQL devuelve siempre una fila por bucket (GROUP BY sobre buckets).
        // Si faltase, no se inventan ceros: error interno saneado.
        if (!row) throw new Error('Agregado de serie incompleto');
        return {
          totalCents: row.totalCents,
          ticketCount: row.ticketCount,
          unitsSold: row.unitsSold,
        };
      });
    });
  }
  administrativeSummary(actor: Principal, input: DashboardSummaryQuery) {
    const from = new Date(input.from);
    const to = new Date(input.to);
    const previousFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));
    const method = input.method ? Prisma.sql`AND p.method::text=${input.method}` : Prisma.empty;
    return this.read(actor, async (tx) => {
      const [row] = await tx.$queryRaw<DashboardAggregateRow[]>(Prisma.sql`
        WITH params AS (
          SELECT ${from}::timestamptz AS from_ts,
                 ${to}::timestamptz AS to_ts,
                 ${previousFrom}::timestamptz AS previous_from_ts
        ),
        current_sales AS (
          SELECT s.order_id, s.total_cents, p.method
          FROM sales s JOIN payments p ON p.id=s.payment_id, params
          WHERE s.sold_at >= params.from_ts AND s.sold_at < params.to_ts ${method}
        ),
        previous_sales AS (
          SELECT s.order_id, s.total_cents
          FROM sales s JOIN payments p ON p.id=s.payment_id, params
          WHERE s.sold_at >= params.previous_from_ts AND s.sold_at < params.from_ts ${method}
        ),
        current_totals AS (
          SELECT count(*)::text AS "ticketCount",
                 coalesce(sum(total_cents),0)::text AS "totalCents",
                 coalesce(sum(total_cents) FILTER (WHERE method='CASH'),0)::text AS "cashCents",
                 coalesce(sum(total_cents) FILTER (WHERE method='STRIPE'),0)::text AS "stripeCents"
          FROM current_sales
        ),
        current_units AS (
          SELECT coalesce(sum(oi.quantity),0)::text AS "unitsSold"
          FROM current_sales cs JOIN order_items oi ON oi.order_id=cs.order_id
        ),
        previous_totals AS (
          SELECT count(*)::text AS "previousTicketCount",
                 coalesce(sum(total_cents),0)::text AS "previousTotalCents"
          FROM previous_sales
        ),
        previous_units AS (
          SELECT coalesce(sum(oi.quantity),0)::text AS "previousUnitsSold"
          FROM previous_sales ps JOIN order_items oi ON oi.order_id=ps.order_id
        )
        SELECT * FROM current_totals, current_units, previous_totals, previous_units`);
      if (!row) throw new Error('No se pudo calcular el resumen administrativo');
      return row;
    });
  }
}

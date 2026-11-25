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

export type SalesRankingAggregateItem = {
  productId: string;
  name: string;
  nameSource: 'current' | 'snapshot';
  unitsSold: string;
  totalCents: string;
};

export type SalesRankingAggregate = {
  matchedProductCount: string;
  matchedUnitsSold: string;
  matchedTotalCents: string;
  items: SalesRankingAggregateItem[];
};

export type SalesRankingInput = {
  from: Date;
  to: Date;
  method?: 'CASH' | 'STRIPE';
  metric: 'units' | 'amount';
  direction: 'top' | 'bottom';
  limit: number;
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
  /**
   * Ranking E2 en una sola lectura agregada. Agrupa por `product_id` sin unir
   * opciones, reembolsos, eventos ni reintentos de pago; suma el histórico de
   * líneas y calcula los metadatos antes de recortar a `top`. El nombre de una
   * baja usa el snapshot más reciente del conjunto filtrado (`sold_at DESC,
   * item_id DESC`) resuelto en el mismo CTE. `sold_at` permanece en PostgreSQL
   * (microsegundos intactos) y D11 no filtra por estado del pago.
   */
  rankingAggregates(actor: Principal, input: SalesRankingInput) {
    const method = input.method ? Prisma.sql`AND p.method::text = ${input.method}` : Prisma.empty;
    const direction = input.direction === 'top' ? Prisma.sql`DESC` : Prisma.sql`ASC`;
    const primary = input.metric === 'units' ? Prisma.sql`r.units_sold` : Prisma.sql`r.total_cents`;
    const secondary =
      input.metric === 'units' ? Prisma.sql`r.total_cents` : Prisma.sql`r.units_sold`;
    return this.read(actor, async (tx) => {
      const [row] = await tx.$queryRaw<SalesRankingAggregate[]>(Prisma.sql`
        WITH filtered_sales AS (
          SELECT s.order_id,s.sold_at
          FROM sales s JOIN payments p ON p.id=s.payment_id
          WHERE s.sold_at >= ${input.from}::timestamptz
            AND s.sold_at < ${input.to}::timestamptz ${method}
        ),
        product_totals AS (
          SELECT oi.product_id,
                 sum(oi.quantity)::numeric AS units_sold,
                 sum(oi.line_total_cents)::numeric AS total_cents
          FROM filtered_sales fs JOIN order_items oi ON oi.order_id=fs.order_id
          GROUP BY oi.product_id
          HAVING sum(oi.quantity) > 0
        ),
        latest_snapshots AS (
          SELECT DISTINCT ON (oi.product_id)
                 oi.product_id,oi.product_name_snapshot
          FROM filtered_sales fs JOIN order_items oi ON oi.order_id=fs.order_id
          ORDER BY oi.product_id,fs.sold_at DESC,oi.id DESC
        ),
        matched AS (
          SELECT count(*)::text AS product_count,
                 coalesce(sum(pt.units_sold),0)::numeric AS units,
                 coalesce(sum(pt.total_cents),0)::numeric AS cents
          FROM product_totals pt
        ),
        ranked AS (
          SELECT pt.product_id,pt.units_sold,pt.total_cents,
                 CASE WHEN pr.deleted_at IS NULL THEN pr.name ELSE ls.product_name_snapshot END AS name,
                 CASE WHEN pr.deleted_at IS NULL THEN 'current' ELSE 'snapshot' END AS name_source
          FROM product_totals pt
          JOIN products pr ON pr.id=pt.product_id
          LEFT JOIN latest_snapshots ls ON ls.product_id=pt.product_id
        ),
        top_items AS (
          SELECT r.product_id,r.name,r.name_source,r.units_sold,r.total_cents
          FROM ranked r
          ORDER BY ${primary} ${direction},${secondary} ${direction},
                   r.name COLLATE "C" ASC,r.product_id ASC
          LIMIT ${input.limit}
        )
        SELECT m.product_count AS "matchedProductCount",
               m.units::text AS "matchedUnitsSold",
               m.cents::text AS "matchedTotalCents",
               coalesce(
                 jsonb_agg(
                   jsonb_build_object(
                     'productId',r.product_id::text,
                     'name',r.name,
                     'nameSource',r.name_source,
                     'unitsSold',r.units_sold::text,
                     'totalCents',r.total_cents::text
                   )
                   ORDER BY ${primary} ${direction},${secondary} ${direction},
                            r.name COLLATE "C" ASC,r.product_id ASC
                 ) FILTER (WHERE r.product_id IS NOT NULL),
                 '[]'::jsonb
               ) AS items
        FROM matched m LEFT JOIN top_items r ON TRUE
        GROUP BY m.product_count,m.units,m.cents`);
      // El agregado de metadatos siempre produce una fila; su ausencia es un
      // fallo interno y nunca se sustituye por ceros inventados.
      if (!row) throw new Error('Agregado de ranking incompleto');
      return row;
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

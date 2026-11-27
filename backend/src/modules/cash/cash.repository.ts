import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
import { withTransaction } from '../../shared/database/transaction.js';
import type { Position } from '../../shared/http/pagination.js';
import { OrdersTransaction } from '../orders/orders.repository.js';
import { PaymentsTransaction } from '../payments/payments.repository.js';
import { SalesTransaction } from '../sales/sales.repository.js';
import { TicketsTransaction } from '../tickets/tickets.repository.js';
import type { Principal } from '../auth/auth.types.js';
import { forbidden } from '../auth/auth.tokens.js';
import type { AdminCashFilters } from './cash.validation.js';

export type AdminCashSessionRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeUsername: string | null;
  openedAt: string;
  closedAt: string | null;
  closedByEmployeeId: string | null;
  closedByName: string | null;
  exceptionalCloseReason: string | null;
  openingAmountCents: string;
  cashSalesCents: string;
  successfulPayments: string;
  computedExpectedCashCents: string;
  expectedCashCents: string | null;
  countedCashCents: string | null;
  differenceCents: string | null;
};

export type AdminCashSummaryRow = {
  sessionCount: string;
  closedCount: string;
  openCount: string;
  shortageCents: string;
  surplusCents: string;
  differenceCount: string;
};
export class CashTransaction {
  readonly orders: OrdersTransaction;
  readonly payments: PaymentsTransaction;
  readonly sales: SalesTransaction;
  readonly tickets: TicketsTransaction;
  constructor(private tx: Prisma.TransactionClient) {
    this.orders = new OrdersTransaction(tx);
    this.payments = new PaymentsTransaction(tx);
    this.sales = new SalesTransaction(tx);
    this.tickets = new TicketsTransaction(tx);
  }
  async lockCash() {
    await this.tx.$executeRaw`SELECT pg_advisory_xact_lock(2026,2)`;
  }
  active() {
    return this.tx.cashSession.findFirst({ where: { closedAt: null } });
  }
  async session(id: bigint) {
    await this.tx.$queryRaw`SELECT id FROM cash_sessions WHERE id=${id} FOR UPDATE`;
    return this.tx.cashSession.findUnique({ where: { id } });
  }
  open(employeeId: bigint, openingAmountCents: bigint, now: Date) {
    return this.tx.cashSession.create({ data: { employeeId, openingAmountCents, openedAt: now } });
  }
  close(id: bigint, data: Prisma.CashSessionUncheckedUpdateInput) {
    return this.tx.cashSession.update({ where: { id }, data });
  }
  async ledger(id: bigint) {
    const [result] = await this.tx.$queryRaw<{ total: string; count: string; invalid: string }[]>`
      SELECT COALESCE(sum(p.amount_cents),0)::text AS total, count(*)::text AS count,
        count(*) FILTER (WHERE s.id IS NULL OR s.order_id<>p.order_id OR s.total_cents<>p.amount_cents OR p.cashier_id<>c.employee_id)::text AS invalid
      FROM payments p JOIN cash_sessions c ON c.id=p.cash_session_id
      LEFT JOIN sales s ON s.payment_id=p.id
      WHERE p.cash_session_id=${id} AND p.method='CASH' AND p.status='SUCCEEDED'`;
    if (!result) throw new Error('Missing cash ledger');
    return result;
  }
  audit(actorId: bigint, action: string, reason: string, now: Date) {
    return this.tx.auditEvent.create({ data: { actorId, action, reason, occurredAt: now } });
  }
}
export class CashRepository {
  constructor(private db: PrismaClient) {}
  transaction<T>(fn: (tx: CashTransaction) => Promise<T>) {
    return withTransaction(this.db, (tx) => fn(new CashTransaction(tx)));
  }
  /** Lectura administrativa: exige ADMINISTRADOR y nunca escribe. */
  private adminRead<T>(actor: Principal, fn: (tx: Prisma.TransactionClient) => Promise<T>) {
    return withTransaction(this.db, async (tx) => {
      const role = await new OrdersTransaction(tx).actor(actor, new Date());
      if (role !== 'ADMINISTRADOR') throw forbidden();
      return fn(tx);
    });
  }
  private adminWhere(input: AdminCashFilters) {
    return Prisma.sql`c.opened_at >= ${new Date(input.from)}::timestamptz
      AND c.opened_at < ${new Date(input.to)}::timestamptz
      ${input.status === 'OPEN' ? Prisma.sql`AND c.closed_at IS NULL` : Prisma.empty}
      ${input.status === 'CLOSED' ? Prisma.sql`AND c.closed_at IS NOT NULL` : Prisma.empty}
      ${input.difference === 'SHORTAGE' ? Prisma.sql`AND c.difference_cents < 0` : Prisma.empty}
      ${input.difference === 'SURPLUS' ? Prisma.sql`AND c.difference_cents > 0` : Prisma.empty}
      ${input.difference === 'NONE' ? Prisma.sql`AND c.difference_cents = 0` : Prisma.empty}
      ${input.employeeId !== undefined ? Prisma.sql`AND c.employee_id = ${input.employeeId}` : Prisma.empty}`;
  }
  /**
   * Historial administrativo en una sola lectura. Ordena por apertura
   * descendente y usa keyset `(opened_at, id)` sin OFFSET. Las ventas en
   * efectivo y el esperado se calculan con el mismo criterio del cierre.
   */
  async adminSessions(actor: Principal, input: AdminCashFilters, limit: number, after?: Position) {
    return this.adminRead(actor, async (tx) => {
      const rows = await tx.$queryRaw<
        (AdminCashSessionRow & { positionTime: string })[]
      >(Prisma.sql`
        SELECT c.id::text AS id,
          c.employee_id::text AS "employeeId",
          e.name AS "employeeName",
          e.username AS "employeeUsername",
          to_char(c.opened_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "openedAt",
          to_char(c.closed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "closedAt",
          c.closed_by_employee_id::text AS "closedByEmployeeId",
          cb.name AS "closedByName",
          c.exceptional_close_reason AS "exceptionalCloseReason",
          c.opening_amount_cents::text AS "openingAmountCents",
          coalesce(l.total,0)::text AS "cashSalesCents",
          coalesce(l.count,0)::text AS "successfulPayments",
          (c.opening_amount_cents + coalesce(l.total,0))::text AS "computedExpectedCashCents",
          c.expected_cash_cents::text AS "expectedCashCents",
          c.counted_cash_cents::text AS "countedCashCents",
          c.difference_cents::text AS "differenceCents",
          to_char(c.opened_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "positionTime"
        FROM cash_sessions c
        JOIN users e ON e.id=c.employee_id
        LEFT JOIN users cb ON cb.id=c.closed_by_employee_id
        LEFT JOIN LATERAL (
          SELECT sum(p.amount_cents)::bigint AS total,count(*)::bigint AS count
          FROM payments p
          WHERE p.cash_session_id=c.id AND p.method='CASH' AND p.status='SUCCEEDED'
        ) l ON TRUE
        WHERE ${this.adminWhere(input)}
        ${after ? Prisma.sql`AND (c.opened_at,c.id) < (${after.createdAt}::timestamptz,${BigInt(after.id)})` : Prisma.empty}
        ORDER BY c.opened_at DESC,c.id DESC
        LIMIT ${limit + 1}`);
      return rows.map(({ positionTime, ...data }) => ({
        data,
        position: { id: data.id, createdAt: positionTime },
      }));
    });
  }
  /** Totales del mismo filtro, independientes de la página solicitada. */
  adminSummary(actor: Principal, input: AdminCashFilters) {
    return this.adminRead(actor, async (tx) => {
      const [row] = await tx.$queryRaw<AdminCashSummaryRow[]>(Prisma.sql`
        SELECT count(*)::text AS "sessionCount",
          count(*) FILTER (WHERE c.closed_at IS NOT NULL)::text AS "closedCount",
          count(*) FILTER (WHERE c.closed_at IS NULL)::text AS "openCount",
          coalesce(sum(c.difference_cents) FILTER (WHERE c.difference_cents < 0),0)::text AS "shortageCents",
          coalesce(sum(c.difference_cents) FILTER (WHERE c.difference_cents > 0),0)::text AS "surplusCents",
          count(*) FILTER (WHERE c.difference_cents IS NOT NULL AND c.difference_cents <> 0)::text AS "differenceCount"
        FROM cash_sessions c
        WHERE ${this.adminWhere(input)}`);
      if (!row) throw new Error('No se pudo calcular el resumen administrativo de caja');
      return row;
    });
  }
}

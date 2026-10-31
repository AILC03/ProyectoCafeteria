import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { withTransaction } from '../../shared/database/transaction.js';
import { OrdersTransaction } from '../orders/orders.repository.js';
import { PaymentsTransaction } from '../payments/payments.repository.js';
import { SalesTransaction } from '../sales/sales.repository.js';
import { TicketsTransaction } from '../tickets/tickets.repository.js';
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
}

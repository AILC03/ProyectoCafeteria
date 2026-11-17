import type { Principal } from '../auth/auth.types.js';
import { forbidden, digest, opaque } from '../auth/auth.tokens.js';
import { notFound, unavailable } from '../../shared/http/problem.js';
import { CashRepository } from '../cash/cash.repository.js';
import { cashOperation, sessionSummary } from '../cash/cash.service.js';
import { cashChange, cashConflict, checkedCents } from '../cash/cash.rules.js';
import type { TicketCipher } from '../tickets/tickets.cipher.js';
import type { ChargeInput } from './payments.validation.js';
export class PaymentsService {
  constructor(
    readonly repository: CashRepository,
    readonly cipher?: TicketCipher,
    readonly now: () => Date = () => new Date(),
  ) {}
  charge(actor: Principal, input: ChargeInput, key: string) {
    return cashOperation(
      this.repository,
      actor,
      'payments:cash',
      key,
      input,
      this.now,
      async (tx) => {
        await tx.lockCash();
        const session = await tx.session(input.cashSessionId);
        if (!session) throw notFound();
        if (session.employeeId !== actor.userId) throw forbidden();
        if (session.closedAt) throw cashConflict('Caja cerrada');
        await tx.orders.lockOrder(input.orderId);
        const order = await tx.orders.get(input.orderId);
        if (!order) throw notFound();
        if (
          order.paymentMethod !== 'CASH' ||
          order.status !== 'PENDIENTE_PAGO' ||
          order.paidAt ||
          order.paymentExpiresAt <= this.now()
        )
          throw cashConflict('Orden no cobrable en efectivo');
        if ((await tx.payments.succeeded(order.id)) || (await tx.sales.byOrder(order.id)))
          throw cashConflict('Orden ya cobrada');
        const changeCents = cashChange(
          order.totalCents,
          input.cashReceivedCents,
          input.changeCents,
        );
        const summary = await sessionSummary(tx, session);
        checkedCents(summary.computedExpectedCashCents + order.totalCents);
        if (!order.customerId && !this.cipher) throw unavailable();
        const paidAt = this.now();
        if (order.paymentExpiresAt <= paidAt) throw cashConflict('Plazo de pago vencido');
        const payment = await tx.payments.createCash({
          orderId: order.id,
          amountCents: order.totalCents,
          cashierId: actor.userId,
          cashSessionId: session.id,
          cashReceivedCents: input.cashReceivedCents,
          changeCents,
          confirmedAt: paidAt,
        });
        const sale = await tx.sales.create({
          orderId: order.id,
          paymentId: payment.id,
          totalCents: order.totalCents,
          soldAt: paidAt,
        });
        if (!order.customerId) {
          const token = opaque();
          await tx.tickets.createRegistration({
            saleId: sale.id,
            tokenHash: digest(token),
            encryptedPayload: this.cipher!.seal(token, sale.id),
            keyVersion: this.cipher!.version,
            createdAt: paidAt,
            expiresAt: new Date(paidAt.getTime() + 24 * 3600000),
          });
        }
        const prepared = await tx.payments.prepare(order.id, paidAt);
        await tx.audit(
          actor.userId,
          'CASH_PAYMENT_SUCCEEDED',
          `Caja ${session.id}; orden ${order.id}; pago ${payment.id}; venta ${sale.id}`,
          paidAt,
        );
        return {
          payment,
          sale,
          order: prepared,
          ticket: { saleId: sale.id, path: `/api/v1/sales/${sale.id}/ticket` },
        };
      },
    );
  }
}

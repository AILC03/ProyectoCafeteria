import type { Principal } from '../auth/auth.types.js';
import { digest } from '../auth/auth.tokens.js';
import { notFound, unavailable } from '../../shared/http/problem.js';
import { CashRepository } from '../cash/cash.repository.js';
import { requireCashRole } from '../cash/cash.service.js';
import { orderDto } from '../orders/orders.repository.js';
import type { TicketCipher } from './tickets.cipher.js';
export class TicketsService {
  constructor(
    readonly repository: CashRepository,
    readonly cipher?: TicketCipher,
    readonly now: () => Date = () => new Date(),
  ) {}
  get(actor: Principal, id: bigint) {
    return this.repository.transaction(async (tx) => {
      requireCashRole(await tx.orders.actor(actor, this.now()));
      const sale = await tx.sales.get(id);
      if (!sale) throw notFound();
      const payment = sale.payment,
        order = await tx.orders.get(sale.orderId);
      if (
        !order ||
        payment.method !== 'CASH' ||
        payment.status !== 'SUCCEEDED' ||
        !payment.confirmedAt ||
        payment.orderId !== sale.orderId ||
        payment.amountCents !== sale.totalCents ||
        order.totalCents !== sale.totalCents ||
        payment.cashReceivedCents === null ||
        payment.changeCents === null
      )
        throw notFound();
      const registration = await tx.tickets.registration(sale.id);
      let qr = null;
      if (
        !order.customerId &&
        registration &&
        !registration.usedAt &&
        registration.expiresAt > this.now()
      ) {
        if (!this.cipher || !registration.encryptedPayload || !registration.keyVersion)
          throw unavailable();
        const token = this.cipher.open(
          registration.encryptedPayload,
          sale.id,
          registration.keyVersion,
        );
        if (digest(token) !== registration.tokenHash) throw unavailable();
        qr = {
          purpose: 'CUSTOMER_REGISTRATION',
          token,
          qrPayload: `cafeteria:register:${token}`,
          expiresAt: registration.expiresAt,
        };
      }
      return {
        data: {
          saleId: sale.id,
          saleNumber: sale.saleNumber,
          orderFolio: order.folio,
          soldAt: sale.soldAt,
          currency: payment.currency,
          totalCents: sale.totalCents,
          cashReceivedCents: payment.cashReceivedCents,
          changeCents: payment.changeCents,
          items: orderDto(order).items,
          registration: qr,
        },
      };
    });
  }
}

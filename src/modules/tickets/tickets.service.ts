import type { Principal } from '../auth/auth.types.js';
import { digest, opaque, forbidden } from '../auth/auth.tokens.js';
import { notFound, unavailable } from '../../shared/http/problem.js';
import { CashRepository, type CashTransaction } from '../cash/cash.repository.js';
import { requireCashRole } from '../cash/cash.service.js';
import { orderDto } from '../orders/orders.repository.js';
import type { TicketCipher } from './tickets.cipher.js';
export class TicketsService {
  constructor(
    readonly repository: CashRepository,
    readonly cipher?: TicketCipher,
    readonly now: () => Date = () => new Date(),
  ) {}
  // Venta existente → orden → pago, compatible con el alta QR de esa compra.
  private async guestReceipt(tx: CashTransaction, id: bigint) {
    await tx.tickets.lockSale(id);
    const found = await tx.sales.get(id);
    if (!found) throw notFound();
    await tx.orders.lockOrder(found.orderId);
    await tx.tickets.lockPayment(found.paymentId);
    const sale = await tx.sales.get(id);
    if (!sale) throw notFound();
    const order = await tx.orders.get(sale.orderId),
      payment = sale.payment;
    if (
      !order ||
      !order.paidAt ||
      payment.status !== 'SUCCEEDED' ||
      !payment.confirmedAt ||
      payment.currency !== 'MXN' ||
      payment.confirmedAt > this.now() ||
      order.paidAt > this.now() ||
      order.paymentMethod !== payment.method ||
      !['EN_PREPARACION', 'LISTO'].includes(order.status) ||
      payment.orderId !== order.id ||
      payment.amountCents !== sale.totalCents ||
      order.totalCents !== sale.totalCents ||
      (payment.method === 'CASH'
        ? order.paidAt.getTime() !== payment.confirmedAt.getTime() ||
          payment.cashReceivedCents === null ||
          payment.changeCents === null ||
          payment.cashReceivedCents - payment.changeCents !== sale.totalCents
        : !payment.providerPaidAt || order.paidAt.getTime() !== payment.providerPaidAt.getTime())
    )
      throw notFound();
    return { sale, order, payment };
  }
  issueGuest(actor: Principal, id: bigint) {
    return this.repository.transaction(async (tx) => {
      requireCashRole(await tx.orders.actor(actor, this.now()));
      const { sale, order, payment } = await this.guestReceipt(tx, id);
      const now = this.now();
      const expiresAt = new Date(
        (payment.providerPaidAt ?? payment.confirmedAt)!.getTime() + 24 * 3600000,
      );
      if (order.customerId || expiresAt <= now) throw notFound();
      const token = opaque();
      await tx.tickets.revokeGuest(sale.id, now);
      await tx.tickets.createGuest({
        saleId: sale.id,
        tokenHash: digest(token),
        expiresAt,
        createdAt: now,
      });
      await tx.audit(actor.userId, 'GUEST_TICKET_ISSUED', `Venta ${sale.id}`, now);
      if (expiresAt <= this.now()) throw notFound();
      return { data: { purpose: 'GUEST_TICKET', token, expiresAt, path: '/api/v1/guest-ticket' } };
    });
  }
  getGuest(token: string) {
    return this.repository.transaction(async (tx) => {
      const hash = digest(token),
        found = await tx.tickets.guest(hash);
      if (!found) throw notFound();
      const { sale, order, payment } = await this.guestReceipt(tx, found.saleId);
      // Releer tras obtener el lock: una reemisión concurrente puede haberlo revocado.
      const access = await tx.tickets.guest(hash),
        now = this.now();
      if (
        !access ||
        access.revokedAt ||
        access.expiresAt <= now ||
        (payment.providerPaidAt ?? payment.confirmedAt)!.getTime() + 24 * 3600000 <= now.getTime()
      )
        throw notFound();
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
        },
      };
    });
  }
  get(actor: Principal, id: bigint) {
    return this.repository.transaction(async (tx) => {
      const role = await tx.orders.actor(actor, this.now());
      if (role !== 'CLIENTE') requireCashRole(role);
      const sale = await tx.sales.get(id);
      if (!sale) throw notFound();
      const payment = sale.payment,
        order = await tx.orders.get(sale.orderId);
      if (
        !order ||
        (role === 'CLIENTE' && order.customerId !== actor.userId) ||
        !order.paidAt ||
        !['EN_PREPARACION', 'LISTO'].includes(order.status) ||
        payment.method !== order.paymentMethod ||
        payment.status !== 'SUCCEEDED' ||
        !payment.confirmedAt ||
        payment.orderId !== sale.orderId ||
        payment.amountCents !== sale.totalCents ||
        order.totalCents !== sale.totalCents ||
        (payment.method === 'CASH' &&
          (payment.cashReceivedCents === null ||
            payment.changeCents === null ||
            payment.cashReceivedCents - payment.changeCents !== sale.totalCents)) ||
        (payment.method === 'STRIPE' &&
          (!payment.providerPaidAt || order.paidAt.getTime() !== payment.providerPaidAt.getTime()))
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
  async ownOrder(actor: Principal, id: bigint) {
    const saleId = await this.repository.transaction(async (tx) => {
      if ((await tx.orders.actor(actor, this.now())) !== 'CLIENTE') throw forbidden();
      const order = await tx.orders.get(id);
      if (!order || order.customerId !== actor.userId) throw notFound();
      const sale = await tx.sales.byOrder(id);
      if (!sale) throw notFound();
      return sale.id;
    });
    return this.get(actor, saleId);
  }
}

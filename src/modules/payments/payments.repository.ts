import type { Prisma } from '../../generated/prisma/client.js';
export const cashPaymentSelect = {
  id: true,
  orderId: true,
  method: true,
  status: true,
  amountCents: true,
  currency: true,
  cashierId: true,
  cashSessionId: true,
  cashReceivedCents: true,
  changeCents: true,
  confirmedAt: true,
} as const satisfies Prisma.PaymentSelect;
export class PaymentsTransaction {
  constructor(private tx: Prisma.TransactionClient) {}
  succeeded(orderId: bigint) {
    return this.tx.payment.findFirst({
      where: { orderId, status: 'SUCCEEDED' },
      select: { id: true },
    });
  }
  createCash(data: {
    orderId: bigint;
    amountCents: bigint;
    cashierId: bigint;
    cashSessionId: bigint;
    cashReceivedCents: bigint;
    changeCents: bigint;
    confirmedAt: Date;
  }) {
    return this.tx.payment.create({
      data: { ...data, method: 'CASH', status: 'SUCCEEDED', currency: 'MXN' },
      select: cashPaymentSelect,
    });
  }
  prepare(orderId: bigint, now: Date) {
    return this.tx.order.update({
      where: { id: orderId },
      data: { status: 'EN_PREPARACION', paidAt: now },
      select: { id: true, folio: true, status: true, paidAt: true },
    });
  }
}

import type { Prisma } from '../../generated/prisma/client.js';
import { visibleNumber } from '../../shared/database/visible-number.js';
export class SalesTransaction {
  constructor(private tx: Prisma.TransactionClient) {}
  byOrder(orderId: bigint) {
    return this.tx.sale.findUnique({ where: { orderId } });
  }
  get(id: bigint) {
    return this.tx.sale.findUnique({ where: { id }, include: { payment: true } });
  }
  async create(data: { orderId: bigint; paymentId: bigint; totalCents: bigint; soldAt: Date }) {
    const [reserved] = await this.tx.$queryRaw<
      { id: bigint }[]
    >`SELECT nextval(pg_get_serial_sequence('sales','id')) AS id`;
    if (!reserved) throw new Error('No sale identity');
    return this.tx.sale.create({
      data: { ...data, id: reserved.id, saleNumber: visibleNumber('V', reserved.id) },
    });
  }
}

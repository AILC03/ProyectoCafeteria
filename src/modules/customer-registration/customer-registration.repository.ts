import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { withTransaction } from '../../shared/database/transaction.js';
import { visibleNumber } from '../../shared/database/visible-number.js';
import { unavailable } from '../../shared/http/problem.js';

export class CustomerRegistrationTransaction {
  constructor(private tx: Prisma.TransactionClient) {}
  async lockToken(tokenHash: string) {
    const [row] = await this.tx.$queryRaw<
      { id: bigint }[]
    >`SELECT id FROM customer_registration_tokens WHERE token_hash=${tokenHash} FOR UPDATE`;
    if (!row) return null;
    // No se necesita leer/desencriptar el payload original para consumir el hash.
    return this.tx.customerRegistrationToken.findUnique({
      where: { id: row.id },
      select: {
        id: true,
        saleId: true,
        expiresAt: true,
        usedAt: true,
        usedByCustomerId: true,
      },
    });
  }
  async lockPurchase(saleId: bigint) {
    await this.tx.$queryRaw`SELECT id FROM sales WHERE id=${saleId} FOR UPDATE`;
    const sale = await this.tx.sale.findUnique({
      where: { id: saleId },
      select: { id: true, orderId: true, paymentId: true, totalCents: true },
    });
    if (!sale) return null;
    await this.tx.$queryRaw`SELECT id FROM orders WHERE id=${sale.orderId} FOR UPDATE`;
    await this.tx.$queryRaw`SELECT id FROM payments WHERE id=${sale.paymentId} FOR UPDATE`;
    const order = await this.tx.order.findUnique({
      where: { id: sale.orderId },
      select: {
        id: true,
        customerId: true,
        status: true,
        paidAt: true,
        expiredAt: true,
        totalCents: true,
        paymentMethod: true,
      },
    });
    const payment = await this.tx.payment.findUnique({
      where: { id: sale.paymentId },
      select: {
        orderId: true,
        method: true,
        status: true,
        confirmedAt: true,
        amountCents: true,
        currency: true,
      },
    });
    return { sale, order, payment };
  }
  async lockPhone(phoneHash: string) {
    await this.tx
      .$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`customer-registration:phone:${phoneHash}`},0))`;
  }
  async phoneExists(phone: string) {
    return !!(await this.tx.user.findUnique({ where: { phone }, select: { id: true } }));
  }
  async clientRoleId() {
    const [role] = await this.tx.$queryRaw<
      { id: bigint }[]
    >`SELECT id FROM roles WHERE name='CLIENTE' FOR SHARE`;
    if (!role) throw unavailable();
    return role.id;
  }
  async createCustomer(data: {
    roleId: bigint;
    name: string;
    phone: string;
    pinHash: string;
    now: Date;
  }) {
    // Reservar identity: IDs y números no se reciclan. Saltar colisiones de fixtures
    // o cuentas antiguas que no siguieran la convención, con límite y sin sobrescribir.
    for (let attempt = 0; attempt < 16; attempt++) {
      const [row] = await this.tx.$queryRaw<
        { id: bigint }[]
      >`SELECT nextval(pg_get_serial_sequence('users','id')) AS id`;
      if (!row) throw unavailable();
      const customerNumber = visibleNumber('C', row.id);
      if (
        await this.tx.user.findFirst({
          where: { OR: [{ id: row.id }, { customerNumber }] },
          select: { id: true },
        })
      )
        continue;
      // El UNIQUE de phone protege también escritores ajenos al advisory lock.
      // ON CONFLICT no aborta PostgreSQL: permite devolver conflicto seguro específico.
      const [created] = await this.tx.$queryRaw<
        { id: bigint; customerNumber: string; name: string; phone: string }[]
      >`
        INSERT INTO users (id,account_type,role_id,name,customer_number,phone,pin_hash,must_change_pin,is_active,created_at,updated_at)
        VALUES (${row.id},'CUSTOMER'::"AccountType",${data.roleId},${data.name},${customerNumber},${data.phone},${data.pinHash},false,true,${data.now},${data.now})
        ON CONFLICT (phone) DO NOTHING
        RETURNING id,customer_number AS "customerNumber",name,phone`;
      return created ?? null;
    }
    throw unavailable();
  }
  async associate(orderId: bigint, customerId: bigint) {
    const result = await this.tx.order.updateMany({
      where: {
        id: orderId,
        customerId: null,
        paidAt: { not: null },
        status: { in: ['EN_PREPARACION', 'LISTO'] },
      },
      data: { customerId },
    });
    return result.count === 1;
  }
  async consume(tokenId: bigint, customerId: bigint, now: Date) {
    const result = await this.tx.customerRegistrationToken.updateMany({
      where: { id: tokenId, usedAt: null, usedByCustomerId: null, expiresAt: { gt: now } },
      data: { usedAt: now, usedByCustomerId: customerId, encryptedPayload: null, keyVersion: null },
    });
    return result.count === 1;
  }
  audit(customerId: bigint, saleId: bigint, now: Date) {
    return this.tx.auditEvent.create({
      data: {
        actorId: customerId,
        customerId,
        action: 'CUSTOMER_REGISTERED_BY_TICKET',
        reason: `Alta por ticket de venta ${saleId}`,
        occurredAt: now,
      },
    });
  }
}
export class CustomerRegistrationRepository {
  constructor(private db: PrismaClient) {}
  transaction<T>(fn: (tx: CustomerRegistrationTransaction) => Promise<T>) {
    return withTransaction(this.db, (tx) => fn(new CustomerRegistrationTransaction(tx)));
  }
}

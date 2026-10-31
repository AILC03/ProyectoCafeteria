import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
import type { Principal, RoleName } from '../auth/auth.types.js';
import { forbidden, unauthorized } from '../auth/auth.tokens.js';
import type { Position } from '../../shared/http/pagination.js';
import type { PricedItem } from './orders.pricing.js';
import { withTransaction } from '../../shared/database/transaction.js';
import { visibleNumber } from '../../shared/database/visible-number.js';

const orderSelect = {
  id: true,
  folio: true,
  source: true,
  status: true,
  paymentMethod: true,
  totalCents: true,
  customerId: true,
  guestName: true,
  paymentExpiresAt: true,
  paidAt: true,
  readyAt: true,
  readyByEmployeeId: true,
  createdAt: true,
  order_item_orderId: {
    orderBy: { id: 'asc' },
    select: {
      id: true,
      productId: true,
      productNameSnapshot: true,
      basePriceCentsSnapshot: true,
      unitPriceCents: true,
      quantity: true,
      lineTotalCents: true,
      order_item_option_orderItemId: {
        orderBy: { id: 'asc' },
        select: {
          optionValueId: true,
          groupNameSnapshot: true,
          optionNameSnapshot: true,
          surchargeCentsSnapshot: true,
        },
      },
    },
  },
} as const satisfies Prisma.OrderSelect;
type OrderRecord = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;
export function orderDto(order: OrderRecord) {
  const { order_item_orderId, ...data } = order;
  return {
    ...data,
    items: order_item_orderId.map(
      ({
        order_item_option_orderItemId,
        productNameSnapshot,
        basePriceCentsSnapshot,
        ...item
      }) => ({
        ...item,
        productName: productNameSnapshot,
        basePriceCents: basePriceCentsSnapshot,
        options: order_item_option_orderItemId.map(
          ({ groupNameSnapshot, optionNameSnapshot, surchargeCentsSnapshot, ...option }) => ({
            ...option,
            groupName: groupNameSnapshot,
            optionName: optionNameSnapshot,
            surchargeCents: surchargeCentsSnapshot,
          }),
        ),
      }),
    ),
  };
}
export class OrdersTransaction {
  constructor(private tx: Prisma.TransactionClient) {}
  async actor(actor: Principal, now: Date): Promise<RoleName> {
    // Auth revocation/credential changes lock the user FOR UPDATE; mutations hold SHARE.
    await this.tx.$queryRaw`SELECT id FROM users WHERE id=${actor.userId} FOR SHARE`;
    await this.tx.$queryRaw`SELECT id FROM auth_sessions WHERE id=${actor.sessionId} FOR SHARE`;
    const session = await this.tx.authSession.findUnique({
      where: { id: actor.sessionId },
      select: {
        userId: true,
        revokedAt: true,
        absoluteExpiresAt: true,
        user: {
          select: {
            isActive: true,
            mustChangePin: true,
            accountType: true,
            role: { select: { name: true } },
          },
        },
      },
    });
    if (
      !session ||
      session.userId !== actor.userId ||
      session.revokedAt ||
      session.absoluteExpiresAt <= now ||
      !session.user.isActive
    )
      throw unauthorized();
    const { user } = session;
    if (user.mustChangePin) throw forbidden();
    if (
      user.accountType === 'CUSTOMER'
        ? user.role.name !== 'CLIENTE'
        : !['CAJERO', 'PREPARACION', 'ADMINISTRADOR'].includes(user.role.name)
    )
      throw forbidden();
    return user.role.name as RoleName;
  }
  async lockIdempotency(scope: string, actorKey: string, keyHash: string) {
    await this.tx
      .$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`orders:${scope}:${actorKey}:${keyHash}`},0))`;
  }
  idempotency(scope: string, actorKey: string, keyHash: string) {
    return this.tx.idempotencyRecord.findUnique({
      where: { scope_actorKey_keyHash: { scope, actorKey, keyHash } },
    });
  }
  removeIdempotency(id: bigint) {
    return this.tx.idempotencyRecord.delete({ where: { id } });
  }
  saveIdempotency(data: Prisma.IdempotencyRecordUncheckedCreateInput) {
    return this.tx.idempotencyRecord.create({ data });
  }
  async lockCatalog() {
    await this.tx.$executeRaw`SELECT pg_advisory_xact_lock(2026,1)`;
  }
  products(ids: bigint[]) {
    return this.tx.product.findMany({
      where: { id: { in: ids } },
      include: {
        category: true,
        product_option_group_productId: {
          include: {
            optionGroup: true,
            product_option_value_productOptionGroupId: { include: { optionValue: true } },
          },
        },
      },
    });
  }
  async customer(identifier: string) {
    const where = {
      isActive: true,
      accountType: 'CUSTOMER' as const,
      role: { name: 'CLIENTE' },
      ...(identifier.startsWith('C') ? { customerNumber: identifier } : { phone: identifier }),
    };
    const found = await this.tx.user.findFirst({ where, select: { id: true } });
    if (!found) return null;
    await this.tx.$queryRaw`SELECT id FROM users WHERE id=${found.id} FOR SHARE`;
    return this.tx.user.findFirst({
      where: { ...where, id: found.id },
      select: { id: true, name: true, customerNumber: true },
    });
  }
  async create(data: {
    source: 'MOBILE' | 'CASHIER';
    paymentMethod: 'CASH' | 'STRIPE';
    customerId: bigint | null;
    createdByEmployeeId: bigint | null;
    guestName: string | null;
    totalCents: bigint;
    paymentExpiresAt: Date;
    createdAt: Date;
    cashQrTokenHash: string | null;
    items: PricedItem[];
  }) {
    const [reserved] = await this.tx.$queryRaw<
      { id: bigint }[]
    >`SELECT nextval(pg_get_serial_sequence('orders','id')) AS id`;
    if (!reserved) throw new Error('No order identity');
    const { items, ...fields } = data;
    return this.tx.order.create({
      data: {
        ...fields,
        id: reserved.id,
        folio: visibleNumber('A', reserved.id),
        order_item_orderId: {
          create: items.map(({ options, ...item }) => ({
            ...item,
            order_item_option_orderItemId: { create: options },
          })),
        },
      },
      select: orderSelect,
    });
  }
  async lockOrder(id: bigint) {
    await this.tx.$queryRaw`SELECT id FROM orders WHERE id=${id} FOR UPDATE`;
  }
  async hasSuccessfulCashPayment(id: bigint, totalCents: bigint) {
    return !!(await this.tx.payment.findFirst({
      where: {
        orderId: id,
        method: 'CASH',
        status: 'SUCCEEDED',
        amountCents: totalCents,
        confirmedAt: { not: null },
        currency: 'MXN',
        sale: { is: { orderId: id, totalCents } },
      },
      select: { id: true },
    }));
  }
  get(id: bigint) {
    return this.tx.order.findUnique({ where: { id }, select: orderSelect });
  }
  associate(id: bigint, customerId: bigint) {
    return this.tx.order.update({
      where: { id },
      data: { customerId, guestName: null },
      select: orderSelect,
    });
  }
  ready(id: bigint, actorId: bigint, now: Date) {
    return this.tx.order.update({
      where: { id },
      data: { status: 'LISTO', readyAt: now, readyByEmployeeId: actorId },
      select: orderSelect,
    });
  }
  audit(actorId: bigint, action: string, orderId: bigint, now: Date) {
    return this.tx.auditEvent.create({
      data: { actorId, action, reason: `Orden ${orderId}`, occurredAt: now },
    });
  }
  async preparation(limit: number, after?: Position) {
    const rows = await this.tx.$queryRaw<
      {
        id: bigint;
        folio: string;
        guestName: string | null;
        status: 'EN_PREPARACION';
        createdAt: Date;
        positionTime: string;
      }[]
    >(Prisma.sql`
      SELECT id,folio,guest_name AS "guestName",status,created_at AS "createdAt",
        to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "positionTime"
      FROM orders WHERE status='EN_PREPARACION'
      ${after ? Prisma.sql`AND (created_at,id)>(${after.createdAt}::timestamptz,${BigInt(after.id)})` : Prisma.empty}
      ORDER BY created_at,id LIMIT ${limit + 1}`);
    return rows.map(({ positionTime, ...data }) => ({
      data,
      position: { id: data.id.toString(), createdAt: positionTime },
    }));
  }
}
export class OrdersRepository {
  constructor(private db: PrismaClient) {}
  async transaction<T>(fn: (tx: OrdersTransaction) => Promise<T>): Promise<T> {
    return withTransaction(this.db, (tx) => fn(new OrdersTransaction(tx)));
  }
}

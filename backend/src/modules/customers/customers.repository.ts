import { Prisma, type PrismaClient, type Order } from '../../generated/prisma/client.js';
import { withTransaction } from '../../shared/database/transaction.js';
import type { Position } from '../../shared/http/pagination.js';
import { OrdersTransaction } from '../orders/orders.repository.js';

export type CustomerOrderSummary = Pick<
  Order,
  | 'id'
  | 'folio'
  | 'status'
  | 'paymentMethod'
  | 'totalCents'
  | 'createdAt'
  | 'paymentExpiresAt'
  | 'paidAt'
  | 'readyAt'
>;

export class CustomersTransaction {
  readonly orders: OrdersTransaction;
  constructor(private tx: Prisma.TransactionClient) {
    this.orders = new OrdersTransaction(tx);
  }
  profile(customerId: bigint) {
    return this.tx.user.findFirst({
      where: { id: customerId, accountType: 'CUSTOMER', isActive: true, role: { name: 'CLIENTE' } },
      select: {
        customerNumber: true,
        name: true,
        phone: true,
        recoveryEmail: true,
        recoveryEmailVerifiedAt: true,
        createdAt: true,
      },
    });
  }
  visibleProduct(productId: bigint) {
    return this.tx.product.findFirst({
      where: { id: productId, deletedAt: null, category: { isActive: true, deletedAt: null } },
      select: { id: true },
    });
  }
  addFavorite(customerId: bigint, productId: bigint, createdAt: Date) {
    return this.tx.favorite.createMany({
      data: [{ customerId, productId, createdAt }],
      skipDuplicates: true,
    });
  }
  removeFavorite(customerId: bigint, productId: bigint) {
    return this.tx.favorite.deleteMany({ where: { customerId, productId } });
  }
  async favorites(customerId: bigint, limit: number, after?: Position) {
    const rows = await this.tx.$queryRaw<
      {
        productId: bigint;
        categoryId: bigint;
        name: string;
        description: string | null;
        basePriceCents: bigint;
        imageUrl: string | null;
        isAvailable: boolean;
        favoritedAt: Date;
        positionTime: string;
      }[]
    >(Prisma.sql`
      SELECT p.id AS "productId",p.category_id AS "categoryId",p.name,p.description,
        p.base_price_cents AS "basePriceCents",p.image_url AS "imageUrl",p.is_available AS "isAvailable",
        f.created_at AS "favoritedAt",
        to_char(f.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "positionTime"
      FROM favorites f JOIN products p ON p.id=f.product_id JOIN categories c ON c.id=p.category_id
      WHERE f.customer_id=${customerId} AND p.deleted_at IS NULL AND c.deleted_at IS NULL AND c.is_active
      ${after ? Prisma.sql`AND (f.created_at,f.product_id)>(${after.createdAt}::timestamptz,${BigInt(after.id)})` : Prisma.empty}
      ORDER BY f.created_at,f.product_id LIMIT ${limit + 1}`);
    return rows.map(({ positionTime, ...data }) => ({
      data,
      position: { id: data.productId.toString(), createdAt: positionTime },
    }));
  }
  async history(customerId: bigint, limit: number, after?: Position) {
    // Siempre filtrar por identidad de sesión; cursor solo controla posición.
    const rows = await this.tx.$queryRaw<
      (CustomerOrderSummary & { positionTime: string })[]
    >(Prisma.sql`
      SELECT o.id,o.folio,o.status,o.payment_method AS "paymentMethod",
        o.total_cents AS "totalCents",o.created_at AS "createdAt",
        o.payment_expires_at AS "paymentExpiresAt",o.paid_at AS "paidAt",o.ready_at AS "readyAt",
        to_char(o.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "positionTime"
      FROM orders o WHERE o.customer_id=${customerId}
      ${after ? Prisma.sql`AND (o.created_at,o.id)>(${after.createdAt}::timestamptz,${BigInt(after.id)})` : Prisma.empty}
      ORDER BY o.created_at,o.id LIMIT ${limit + 1}`);
    return rows.map(({ positionTime, ...data }) => ({
      data,
      position: { id: data.id.toString(), createdAt: positionTime },
    }));
  }
}

export class CustomersRepository {
  constructor(private db: PrismaClient) {}
  transaction<T>(fn: (tx: CustomersTransaction) => Promise<T>) {
    return withTransaction(this.db, (tx) => fn(new CustomersTransaction(tx)));
  }
}

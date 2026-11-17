import { decodeCursor, paginate } from '../../shared/http/pagination.js';
import { unavailable, notFound } from '../../shared/http/problem.js';
import { digest, forbidden } from '../auth/auth.tokens.js';
import type { Principal } from '../auth/auth.types.js';
import type { CustomersRepository } from './customers.repository.js';
import { repeatSelection } from './customers.repeat.js';

export class CustomersService {
  constructor(
    readonly repository: CustomersRepository,
    readonly now: () => Date = () => new Date(),
  ) {}
  profile(actor: Principal) {
    return this.repository.transaction(async (tx) => {
      if ((await tx.orders.actor(actor, this.now())) !== 'CLIENTE') throw forbidden();
      const profile = await tx.profile(actor.userId);
      if (!profile?.customerNumber || !profile.phone) throw unavailable();
      return { data: profile };
    });
  }
  history(actor: Principal, input: { limit: number; cursor?: string }) {
    return this.repository.transaction(async (tx) => {
      if ((await tx.orders.actor(actor, this.now())) !== 'CLIENTE') throw forbidden();
      const filters = digest(`customer-history:${actor.userId}`);
      const after = decodeCursor(input.cursor, 'customer-orders', filters);
      return paginate(
        await tx.history(actor.userId, input.limit, after),
        input.limit,
        'customer-orders',
        filters,
      );
    });
  }
  favorites(actor: Principal, input: { limit: number; cursor?: string }) {
    return this.repository.transaction(async (tx) => {
      if ((await tx.orders.actor(actor, this.now())) !== 'CLIENTE') throw forbidden();
      const filters = digest(`customer-favorites:${actor.userId}`);
      const after = decodeCursor(input.cursor, 'customer-favorites', filters);
      return paginate(
        await tx.favorites(actor.userId, input.limit, after),
        input.limit,
        'customer-favorites',
        filters,
      );
    });
  }
  addFavorite(actor: Principal, productId: bigint) {
    return this.repository.transaction(async (tx) => {
      if ((await tx.orders.actor(actor, this.now())) !== 'CLIENTE') throw forbidden();
      await tx.orders.lockCatalog();
      if (!(await tx.visibleProduct(productId))) throw notFound();
      await tx.addFavorite(actor.userId, productId, this.now());
    });
  }
  removeFavorite(actor: Principal, productId: bigint) {
    return this.repository.transaction(async (tx) => {
      if ((await tx.orders.actor(actor, this.now())) !== 'CLIENTE') throw forbidden();
      await tx.removeFavorite(actor.userId, productId);
    });
  }
  repeatPreview(actor: Principal, id: bigint) {
    return this.repository.transaction(async (tx) => {
      if ((await tx.orders.actor(actor, this.now())) !== 'CLIENTE') throw forbidden();
      // Catálogo antes de orden existente, conforme al protocolo de integridad.
      await tx.orders.lockCatalog();
      await tx.orders.lockOrder(id);
      const order = await tx.orders.get(id);
      if (!order || order.customerId !== actor.userId) throw notFound();
      const source = {
        id: order.id,
        items: order.order_item_orderId.map((item) => ({
          productId: item.productId,
          productName: item.productNameSnapshot,
          unitPriceCents: item.unitPriceCents,
          quantity: item.quantity,
          options: item.order_item_option_orderItemId.map((option) => ({
            optionValueId: option.optionValueId,
            optionName: option.optionNameSnapshot,
          })),
        })),
      };
      return {
        data: repeatSelection(
          source,
          await tx.orders.products([...new Set(source.items.map((item) => item.productId))]),
        ),
      };
    });
  }
}

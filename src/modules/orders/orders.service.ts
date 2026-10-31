import { createHash, randomBytes } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client.js';
import { HttpProblem, invalidInput, notFound } from '../../shared/http/problem.js';
import { jsonValue } from '../../shared/http/serialization.js';
import { decodeCursor, paginate } from '../../shared/http/pagination.js';
import type { Principal, RoleName } from '../auth/auth.types.js';
import { forbidden } from '../auth/auth.tokens.js';
import { OrdersRepository, orderDto } from './orders.repository.js';
import { orderConflict, priceOrder } from './orders.pricing.js';
import type { CustomerSelection, OrderInput } from './orders.validation.js';

const digest = (input: string) => createHash('sha256').update(input).digest('hex');
function canonical(input: unknown): string {
  if (Array.isArray(input)) return `[${input.map(canonical).join(',')}]`;
  if (input && typeof input === 'object')
    return `{${Object.entries(input)
      .filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${JSON.stringify(key)}:${canonical(value)}`)
      .join(',')}}`;
  return JSON.stringify(input);
}
const staff = (role: RoleName) => ['CAJERO', 'ADMINISTRADOR'].includes(role);
export class OrdersService {
  constructor(
    readonly repository: OrdersRepository,
    readonly now: () => Date = () => new Date(),
  ) {}
  create(
    source: 'MOBILE' | 'CASHIER',
    actor: Principal | undefined,
    input: OrderInput,
    key: string,
  ) {
    return this.repository.transaction(async (tx) => {
      const role = actor ? await tx.actor(actor, this.now()) : undefined;
      if (source === 'CASHIER' ? !role || !staff(role) : role && role !== 'CLIENTE')
        throw forbidden();
      if (source === 'MOBILE' && actor && input.guestName) throw invalidInput();
      const scope = `orders:create:${source}`,
        actorKey = actor ? `user:${actor.userId}` : 'guest';
      const keyHash = digest(key),
        requestHash = digest(canonical(input));
      await tx.lockIdempotency(scope, actorKey, keyHash);
      const now = this.now();
      const existing = await tx.idempotency(scope, actorKey, keyHash);
      if (existing && existing.expiresAt > now) {
        if (existing.requestHash !== requestHash)
          throw new HttpProblem(409, 'IDEMPOTENCY_CONFLICT', 'Clave usada con otra entrada');
        if (existing.status !== 'COMPLETED' || !existing.responseJson)
          throw orderConflict('Operación no completada');
        return existing.responseJson;
      }
      if (existing) await tx.removeIdempotency(existing.id);
      let customerId = source === 'MOBILE' && actor ? actor.userId : null;
      if (input.customer) {
        const customer = await tx.customer(input.customer.identifier);
        if (!customer) throw notFound();
        if (customer.name !== input.customer.confirmedName)
          throw orderConflict('Debe confirmar el nombre vigente del cliente');
        customerId = customer.id;
      }
      await tx.lockCatalog();
      const priced = priceOrder(
        input,
        await tx.products([...new Set(input.items.map((item) => BigInt(item.productId)))]),
      );
      const createdAt = this.now();
      const order = await tx.create({
        source,
        paymentMethod: input.paymentMethod,
        customerId,
        createdByEmployeeId: source === 'CASHIER' && actor ? actor.userId : null,
        guestName: customerId ? null : (input.guestName ?? null),
        ...priced,
        createdAt,
        paymentExpiresAt: new Date(createdAt.getTime() + 30 * 60000),
        // Satisfacer CHECK CASH existente sin emitir QR/token ni habilitar cobro.
        cashQrTokenHash:
          input.paymentMethod === 'CASH' ? digest(randomBytes(32).toString('hex')) : null,
      });
      const response = jsonValue({ data: orderDto(order) }) as Prisma.InputJsonObject;
      const record = await tx.saveIdempotency({
        scope,
        actorKey,
        keyHash,
        requestHash,
        status: 'COMPLETED',
        resourceType: 'order',
        resourceId: order.id,
        responseJson: response,
        createdAt,
        expiresAt: new Date(createdAt.getTime() + 48 * 3600000),
      });
      // Responder la misma representación JSONB que recibirán todos los reintentos.
      return record.responseJson;
    });
  }
  get(actor: Principal, id: bigint) {
    return this.repository.transaction(async (tx) => {
      const role = await tx.actor(actor, this.now());
      const order = await tx.get(id);
      if (
        !order ||
        (role === 'CLIENTE' && order.customerId !== actor.userId) ||
        (role === 'PREPARACION' && order.status !== 'EN_PREPARACION')
      )
        throw notFound();
      return { data: orderDto(order) };
    });
  }
  preparation(actor: Principal, input: { limit: number; cursor?: string }) {
    const after = decodeCursor(input.cursor, 'preparation-orders', 'EN_PREPARACION');
    return this.repository.transaction(async (tx) => {
      const role = await tx.actor(actor, this.now());
      if (!staff(role) && role !== 'PREPARACION') throw forbidden();
      return paginate(
        await tx.preparation(input.limit, after),
        input.limit,
        'preparation-orders',
        'EN_PREPARACION',
      );
    });
  }
  searchCustomer(actor: Principal, identifier: string) {
    return this.repository.transaction(async (tx) => {
      if (!staff(await tx.actor(actor, this.now()))) throw forbidden();
      const customer = await tx.customer(identifier);
      if (!customer) throw notFound();
      return { data: customer };
    });
  }
  associate(actor: Principal, id: bigint, input: CustomerSelection) {
    return this.repository.transaction(async (tx) => {
      if (!staff(await tx.actor(actor, this.now()))) throw forbidden();
      // Cliente antes de orden: mismo orden de locks que creación y futuras asociaciones.
      const customer = await tx.customer(input.identifier);
      if (!customer) throw notFound();
      if (customer.name !== input.confirmedName)
        throw orderConflict('Debe confirmar el nombre vigente del cliente');
      await tx.lockOrder(id);
      const order = await tx.get(id);
      if (!order) throw notFound();
      if (order.status !== 'PENDIENTE_PAGO' || order.paidAt || order.paymentExpiresAt <= this.now())
        throw orderConflict('La asociación solo se cambia antes del pago y vencimiento');
      const updated = await tx.associate(id, customer.id);
      await tx.audit(actor.userId, 'ORDER_CUSTOMER_ASSOCIATED', id, this.now());
      return { data: orderDto(updated) };
    });
  }
  ready(actor: Principal, id: bigint) {
    return this.repository.transaction(async (tx) => {
      const role = await tx.actor(actor, this.now());
      if (!staff(role) && role !== 'PREPARACION') throw forbidden();
      await tx.lockOrder(id);
      const order = await tx.get(id);
      if (!order) throw notFound();
      if (order.status !== 'EN_PREPARACION' || !order.paidAt)
        throw orderConflict('Solo órdenes pagadas EN_PREPARACION pueden pasar a LISTO');
      if (
        order.paymentMethod === 'CASH' &&
        !(await tx.hasSuccessfulCashPayment(id, order.totalCents))
      )
        throw orderConflict('Falta pago CASH exitoso y venta coherente');
      const now = this.now(),
        updated = await tx.ready(id, actor.userId, now);
      await tx.audit(actor.userId, 'ORDER_READY', id, now);
      return { data: orderDto(updated) };
    });
  }
}

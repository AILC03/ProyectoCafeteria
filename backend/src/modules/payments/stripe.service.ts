import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { jsonValue } from '../../shared/http/serialization.js';
import type { Principal } from '../auth/auth.types.js';
import { digest, forbidden, opaque } from '../auth/auth.tokens.js';
import { HttpProblem, invalidInput, notFound, unavailable } from '../../shared/http/problem.js';
import { OrdersTransaction } from '../orders/orders.repository.js';
import { SalesTransaction } from '../sales/sales.repository.js';
import type { TicketCipher } from '../tickets/tickets.cipher.js';
import type { CheckoutState, StripeProvider } from './stripe.provider.js';
import { StripeRepository } from './stripe.repository.js';
const conflict = () =>
  new HttpProblem(409, 'STRIPE_CONFLICT', 'Orden o intento de pago no disponible');
export class StripeService {
  constructor(
    readonly repository: StripeRepository,
    readonly provider?: StripeProvider,
    readonly ticketCipher?: TicketCipher,
    readonly now: () => Date = () => new Date(),
  ) {}
  private requireProvider() {
    if (!this.provider) throw unavailable();
    return this.provider;
  }
  private check(state: CheckoutState, order: { id: bigint; totalCents: bigint }) {
    if (
      state.orderId !== order.id.toString() ||
      state.amountCents !== order.totalCents ||
      state.currency !== 'MXN' ||
      (state.paid &&
        (!state.paidAt ||
          !state.paymentIntentId ||
          state.status !== 'complete' ||
          state.paidAt > this.now()))
    )
      throw new Error('STRIPE_MISMATCH');
  }
  async checkout(
    actor: Principal | undefined,
    token: string | undefined,
    orderId: bigint,
    key: string,
  ) {
    this.requireProvider();
    const reservation = await this.repository.transaction(async (tx) => {
      const orders = new OrdersTransaction(tx);
      if (actor && (await orders.actor(actor, this.now())) !== 'CLIENTE') throw forbidden();
      await orders.lockOrder(orderId);
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (
        !order ||
        (actor
          ? order.customerId !== actor.userId
          : !token || !!order.customerId || order.checkoutTokenHash !== digest(token))
      )
        throw notFound();
      const scope = 'stripe:checkout',
        actorKey = actor ? `user:${actor.userId}` : `guest:${digest(token!)}`,
        keyHash = digest(key),
        requestHash = digest(orderId.toString());
      await orders.lockIdempotency(scope, actorKey, keyHash);
      const previous = await orders.idempotency(scope, actorKey, keyHash);
      if (previous && previous.expiresAt > this.now() && previous.requestHash !== requestHash)
        throw new HttpProblem(409, 'IDEMPOTENCY_CONFLICT', 'Clave usada con otra orden');
      if (previous && previous.expiresAt > this.now() && previous.status === 'COMPLETED') {
        const snapshot = z
          .object({
            data: z.object({
              paymentId: z.string().regex(/^[1-9]\d*$/),
              checkoutSessionId: z.string(),
              url: z.string().url(),
              expiresAt: z.string().datetime(),
            }),
          })
          .parse(previous.responseJson);
        return {
          paymentId: BigInt(snapshot.data.paymentId),
          replay: {
            data: {
              ...snapshot.data,
              paymentId: BigInt(snapshot.data.paymentId),
              expiresAt: new Date(snapshot.data.expiresAt),
            },
          },
        };
      }
      if (
        order.paymentMethod !== 'STRIPE' ||
        order.status !== 'PENDIENTE_PAGO' ||
        order.paymentExpiresAt <= this.now()
      )
        throw conflict();
      let payment = await tx.payment.findFirst({
        where: { orderId, method: 'STRIPE', status: 'PENDING' },
        orderBy: { id: 'desc' },
      });
      if (!payment) {
        if (await tx.payment.findFirst({ where: { orderId, method: 'STRIPE' } })) throw conflict();
        const createdAt = this.now();
        payment = await tx.payment.create({
          data: {
            orderId,
            method: 'STRIPE',
            amountCents: order.totalCents,
            stripeCreationKey: `checkout:${randomUUID()}`,
            createdAt,
            stripeExpiresAt: new Date(createdAt.getTime() + 31 * 60000),
          },
        });
        await this.repository.schedule(
          tx,
          'STRIPE_RECONCILE',
          orderId.toString(),
          `stripe:create:${payment.id}`,
        );
      }
      if (previous && previous.expiresAt <= this.now()) await orders.removeIdempotency(previous.id);
      if (!previous || previous.expiresAt <= this.now())
        await orders.saveIdempotency({
          scope,
          actorKey,
          keyHash,
          requestHash,
          resourceType: 'payment',
          resourceId: payment.id,
          expiresAt: new Date(this.now().getTime() + 48 * 3600000),
        });
      return { paymentId: payment.id, replay: undefined };
    });
    if (reservation.replay) return reservation.replay;
    const { paymentId } = reservation;
    await this.synchronize(orderId);
    const payment = await this.repository.db.payment.findUniqueOrThrow({
      where: { id: paymentId },
    });
    if (
      !payment.stripeCheckoutSessionId ||
      !payment.stripeCheckoutUrl ||
      !payment.stripeExpiresAt ||
      payment.status !== 'PENDING'
    )
      throw conflict();
    const response = {
      data: {
        paymentId: payment.id,
        checkoutSessionId: payment.stripeCheckoutSessionId,
        url: payment.stripeCheckoutUrl,
        expiresAt: payment.stripeExpiresAt,
      },
    };
    await this.repository.db.idempotencyRecord.updateMany({
      where: {
        scope: 'stripe:checkout',
        resourceType: 'payment',
        resourceId: paymentId,
        status: 'IN_PROGRESS',
      },
      data: { status: 'COMPLETED', responseJson: jsonValue(response) as Prisma.InputJsonObject },
    });
    return response;
  }
  async receive(raw: Buffer, signature: string) {
    const provider = this.requireProvider();
    let event: ReturnType<StripeProvider['event']>;
    try {
      event = provider.event(raw, signature);
    } catch {
      throw invalidInput();
    }
    if (
      !/^evt_[A-Za-z0-9_]{1,240}$/.test(event.id) ||
      event.type.length > 80 ||
      (event.checkoutSessionId && !/^cs_[A-Za-z0-9_]{1,240}$/.test(event.checkoutSessionId))
    )
      throw invalidInput();
    await this.repository.transaction(async (tx) => {
      await tx.paymentEvent.createMany({
        data: [
          {
            providerEventId: event.id,
            eventType: event.type,
            checkoutSessionId: event.checkoutSessionId,
            processingStatus: event.checkoutSessionId ? 'RECEIVED' : 'IGNORED',
          },
        ],
        skipDuplicates: true,
      });
      if (event.checkoutSessionId)
        await this.repository.schedule(tx, 'STRIPE_EVENT', event.id, `stripe:event:${event.id}`);
    });
    return { received: true };
  }
  async processEvent(id: string) {
    const event = await this.repository.db.paymentEvent.findUniqueOrThrow({
      where: { providerEventId: id },
    });
    if (['PROCESSED', 'IGNORED'].includes(event.processingStatus)) return;
    const payment = await this.repository.db.payment.findUnique({
      where: { stripeCheckoutSessionId: event.checkoutSessionId ?? '' },
    });
    if (!payment) {
      // Webhook puede adelantarse a guardar la respuesta de create. La cola de
      // creación reconcilia primero y este evento se reintenta sin perderse.
      throw new Error('STRIPE_ATTEMPT_NOT_LINKED');
    }
    await this.synchronize(payment.orderId);
    await this.repository.db.paymentEvent.update({
      where: { id: event.id },
      data: { paymentId: payment.id, processingStatus: 'PROCESSED', processedAt: this.now() },
    });
  }
  async synchronize(orderId: bigint) {
    const provider = this.requireProvider();
    const payment = await this.repository.db.payment.findFirst({
      where: { orderId, method: 'STRIPE' },
      orderBy: { id: 'desc' },
    });
    const order = await this.repository.db.order.findUnique({ where: { id: orderId } });
    if (!order || order.paymentMethod !== 'STRIPE') return;
    if (!payment) {
      await this.repository.transaction(async (tx) => {
        await new OrdersTransaction(tx).lockOrder(orderId);
        // Sin intento jamás se llamó al proveedor: puede expirar con seguridad.
        if (!(await tx.payment.findFirst({ where: { orderId } })))
          await tx.order.updateMany({
            where: { id: orderId, status: 'PENDIENTE_PAGO', paymentExpiresAt: { lte: this.now() } },
            data: { status: 'EXPIRADA', expiredAt: this.now() },
          });
      });
      return;
    }
    if (payment.status === 'SUCCEEDED') return;
    let state: CheckoutState;
    if (payment.stripeCheckoutSessionId)
      state = await provider.retrieve(payment.stripeCheckoutSessionId);
    else {
      // Stripe conserva sus claves al menos 24h; después no repetir creación
      // incierta automáticamente, ni declarar expiración sin conciliación.
      if (
        !payment.stripeCreationKey ||
        !payment.stripeExpiresAt ||
        this.now().getTime() - payment.createdAt.getTime() >= 23 * 3600000
      )
        throw new Error('STRIPE_REVIEW_REQUIRED');
      state = await provider.create({
        orderId: orderId.toString(),
        amountCents: order.totalCents,
        key: payment.stripeCreationKey,
        expiresAt: payment.stripeExpiresAt,
      });
    }
    this.check(state, order);
    if (state.status === 'open' && order.paymentExpiresAt <= this.now()) {
      // Timeout/caída conserva PENDING: nunca expirar solo por reloj.
      try {
        state = await provider.expire(state.id);
      } catch {
        state = await provider.retrieve(state.id);
      }
      this.check(state, order);
      if (state.status === 'open') throw new Error('STRIPE_STILL_OPEN');
    }
    const result = state;
    await this.repository.transaction(async (tx) => {
      await new OrdersTransaction(tx).lockOrder(orderId);
      const current = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      const p = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
      if (p.status === 'SUCCEEDED') return;
      if (p.stripeCheckoutSessionId && p.stripeCheckoutSessionId !== result.id)
        throw new Error('STRIPE_SESSION_MISMATCH');
      await tx.payment.update({
        where: { id: p.id },
        data: {
          stripeCheckoutSessionId: result.id,
          stripeCheckoutUrl: result.url ?? p.stripeCheckoutUrl,
          stripeExpiresAt: result.expiresAt,
        },
      });
      if (result.paid) {
        const confirmedAt = this.now();
        await tx.payment.update({
          where: { id: p.id },
          data: {
            status: 'SUCCEEDED',
            stripePaymentIntentId: result.paymentIntentId,
            confirmedAt,
            providerPaidAt: result.paidAt,
          },
        });
        if (current.status === 'EXPIRADA') {
          await tx.paymentIncident.create({
            data: { orderId, paymentId: p.id, reason: 'STRIPE_PAYMENT_AFTER_FINAL_EXPIRATION' },
          });
          const refund = await tx.refund.create({
            data: {
              paymentId: p.id,
              amountCents: p.amountCents,
              reason: 'STRIPE_PAYMENT_AFTER_FINAL_EXPIRATION',
            },
          });
          await this.repository.schedule(
            tx,
            'STRIPE_REFUND',
            refund.id.toString(),
            `stripe:refund:${refund.id}`,
          );
          return;
        }
        if (current.status !== 'PENDIENTE_PAGO') throw conflict();
        if (!current.customerId && !this.ticketCipher) throw unavailable();
        const sale = await new SalesTransaction(tx).create({
          orderId,
          paymentId: p.id,
          totalCents: p.amountCents,
          soldAt: result.paidAt!,
        });
        if (!current.customerId) {
          const token = opaque();
          await tx.customerRegistrationToken.create({
            data: {
              saleId: sale.id,
              tokenHash: digest(token),
              encryptedPayload: this.ticketCipher!.seal(token, sale.id),
              keyVersion: this.ticketCipher!.version,
              expiresAt: new Date(result.paidAt!.getTime() + 24 * 3600000),
              createdAt: result.paidAt!,
            },
          });
        }
        await tx.order.update({
          where: { id: orderId },
          data: { status: 'EN_PREPARACION', paidAt: result.paidAt },
        });
      } else if (result.status === 'expired') {
        await tx.payment.update({ where: { id: p.id }, data: { status: 'EXPIRED' } });
        if (current.status === 'PENDIENTE_PAGO')
          await tx.order.update({
            where: { id: orderId },
            data: { status: 'EXPIRADA', expiredAt: this.now() },
          });
      } else if (result.status === 'complete') throw new Error('STRIPE_UNCONFIRMED_COMPLETE');
    });
  }
  async refund(id: bigint) {
    const provider = this.requireProvider();
    const refund = await this.repository.db.refund.findUniqueOrThrow({
      where: { id },
      include: { payment: true },
    });
    if (refund.status === 'SUCCEEDED' || refund.status === 'FAILED') return;
    if (!refund.payment.stripePaymentIntentId) throw new Error('STRIPE_REFUND_NO_INTENT');
    if (!refund.stripeRefundId && this.now().getTime() - refund.createdAt.getTime() >= 23 * 3600000)
      throw new Error('STRIPE_REFUND_REVIEW_REQUIRED');
    const result = await provider.refund({
      paymentIntentId: refund.payment.stripePaymentIntentId,
      amountCents: refund.amountCents,
      key: `refund:${refund.id}`,
      refundId: refund.stripeRefundId ?? undefined,
    });
    await this.repository.db.refund.updateMany({
      where: { id, status: { in: ['REQUESTED', 'PENDING'] } },
      data: { stripeRefundId: result.id, status: result.status },
    });
    if (result.status === 'PENDING') throw new Error('STRIPE_REFUND_PENDING');
  }
  handlers() {
    return {
      STRIPE_RECONCILE: (id: string) => this.synchronize(BigInt(id)),
      STRIPE_EVENT: (id: string) => this.processEvent(id),
      STRIPE_REFUND: (id: string) => this.refund(BigInt(id)),
    };
  }
}

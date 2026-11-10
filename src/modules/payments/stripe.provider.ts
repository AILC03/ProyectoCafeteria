import Stripe from 'stripe';
export type CheckoutState = {
  id: string;
  orderId: string;
  amountCents: bigint;
  currency: string;
  status: 'open' | 'expired' | 'complete';
  paid: boolean;
  paymentIntentId: string | null;
  paidAt: Date | null;
  expiresAt: Date;
  url: string | null;
};
export interface StripeProvider {
  create(input: {
    orderId: string;
    amountCents: bigint;
    key: string;
    expiresAt: Date;
  }): Promise<CheckoutState>;
  retrieve(id: string): Promise<CheckoutState>;
  expire(id: string): Promise<CheckoutState>;
  event(
    raw: Buffer,
    signature: string,
  ): { id: string; type: string; checkoutSessionId: string | null };
  refund(input: {
    paymentIntentId: string;
    amountCents: bigint;
    key: string;
    refundId?: string;
  }): Promise<{ id: string; status: 'PENDING' | 'SUCCEEDED' | 'FAILED' }>;
}
// Adaptador real disponible para revisión; FIN-01 solo autoriza pruebas simuladas.
export class StripeSdkProvider implements StripeProvider {
  private client: Stripe;
  constructor(
    secret: string,
    private webhookSecret: string,
    private frontendOrigin: string,
  ) {
    if (!secret.startsWith('sk_test_') || !webhookSecret.startsWith('whsec_'))
      throw new Error('Stripe requiere configuración de pruebas');
    this.client = new Stripe(secret, { maxNetworkRetries: 1, timeout: 15000 });
  }
  private async state(s: Stripe.Checkout.Session): Promise<CheckoutState> {
    if (s.status !== 'open' && s.status !== 'expired' && s.status !== 'complete')
      throw new Error('STRIPE_UNKNOWN_STATE');
    let paidAt: Date | null = null;
    const intent =
      typeof s.payment_intent === 'string' ? s.payment_intent : (s.payment_intent?.id ?? null);
    if (s.payment_status === 'paid' && intent) {
      const pi = await this.client.paymentIntents.retrieve(intent, { expand: ['latest_charge'] });
      const charge = pi.latest_charge;
      if (charge && typeof charge !== 'string' && charge.paid)
        paidAt = new Date(charge.created * 1000);
    }
    const status = s.status === 'open' ? 'open' : s.status === 'expired' ? 'expired' : 'complete';
    return {
      id: s.id,
      orderId: s.metadata?.orderId ?? '',
      amountCents: BigInt(s.amount_total ?? -1),
      currency: s.currency?.toUpperCase() ?? '',
      status,
      paid: s.payment_status === 'paid',
      paymentIntentId: intent,
      paidAt,
      expiresAt: new Date(s.expires_at * 1000),
      url: s.url,
    };
  }
  async create(input: { orderId: string; amountCents: bigint; key: string; expiresAt: Date }) {
    const session = await this.client.checkout.sessions.create(
      {
        mode: 'payment',
        allowed_payment_method_types: ['card'],
        currency: 'mxn',
        metadata: { orderId: input.orderId },
        client_reference_id: input.orderId,
        line_items: [
          {
            price_data: {
              currency: 'mxn',
              product_data: { name: `Orden ${input.orderId}` },
              unit_amount: Number(input.amountCents),
            },
            quantity: 1,
          },
        ],
        expires_at: Math.floor(input.expiresAt.getTime() / 1000),
        success_url: `${this.frontendOrigin}/pago/retorno`,
        cancel_url: `${this.frontendOrigin}/pago/retorno`,
      },
      { idempotencyKey: input.key },
    );
    return this.state(session);
  }
  async retrieve(id: string) {
    return this.state(await this.client.checkout.sessions.retrieve(id));
  }
  async expire(id: string) {
    return this.state(await this.client.checkout.sessions.expire(id));
  }
  event(raw: Buffer, signature: string) {
    const event = this.client.webhooks.constructEvent(raw, signature, this.webhookSecret, 300);
    const supported = ['checkout.session.completed', 'checkout.session.expired'].includes(
      event.type,
    );
    return {
      id: event.id,
      type: event.type,
      checkoutSessionId: supported ? (event.data.object as Stripe.Checkout.Session).id : null,
    };
  }
  async refund(input: {
    paymentIntentId: string;
    amountCents: bigint;
    key: string;
    refundId?: string;
  }) {
    const r = input.refundId
      ? await this.client.refunds.retrieve(input.refundId)
      : await this.client.refunds.create(
          { payment_intent: input.paymentIntentId, amount: Number(input.amountCents) },
          { idempotencyKey: input.key },
        );
    return {
      id: r.id,
      status:
        r.status === 'succeeded'
          ? ('SUCCEEDED' as const)
          : ['failed', 'canceled'].includes(r.status ?? '')
            ? ('FAILED' as const)
            : ('PENDING' as const),
    };
  }
}

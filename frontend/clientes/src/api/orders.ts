import { apiFetch } from './client';

export interface OrderItemInput {
  productId: string;
  quantity: number;
  optionValueIds?: string[];
}

export interface CreateOrderParams {
  paymentMethod: 'CASH' | 'STRIPE';
  items: OrderItemInput[];
  guestName?: string;
  includeCashQr?: boolean;
  includeCheckoutToken?: boolean;
}

export interface BackendOrderItem {
  id: string;
  productName: string;
  basePriceCents: string;
  unitPriceCents: string;
  quantity: number;
  lineTotalCents: string;
  options: Array<{
    groupName: string;
    valueName: string;
    surchargeCents: string;
  }>;
}

export interface BackendOrder {
  id: string;
  folio: string;
  source: 'MOBILE' | 'POS';
  status: 'PENDIENTE_PAGO' | 'PAGADA' | 'PREPARANDO' | 'LISTO' | 'ENTREGADA' | 'EXPIRADA' | 'CANCELADA';
  paymentMethod: 'CASH' | 'STRIPE';
  totalCents: string;
  customerId: string | null;
  guestName: string | null;
  paymentExpiresAt: string;
  paidAt: string | null;
  readyAt: string | null;
  readyByEmployeeId: string | null;
  createdAt: string;
  items?: BackendOrderItem[];
}

export interface CreateOrderResponse {
  data: BackendOrder;
  cashQr?: {
    purpose: 'CASH_PAYMENT';
    token: string;
    qrPayload: string;
    expiresAt: string;
  };
  checkout?: {
    purpose: 'STRIPE_CHECKOUT';
    token: string;
    expiresAt: string;
  };
}

/**
 * Crea un pedido móvil. Puede ser como invitado o con la sesión de cliente activa.
 * Genera una clave de idempotencia UUID v4 aleatoria para proteger contra doble cobro/creación.
 */
export async function createMobileOrder(params: CreateOrderParams): Promise<CreateOrderResponse> {
  const idempotencyKey = crypto.randomUUID();

  const body: Record<string, unknown> = {
    paymentMethod: params.paymentMethod,
    items: params.items.map((it) => ({
      productId: it.productId,
      quantity: it.quantity,
      optionValueIds: it.optionValueIds ?? [],
    })),
  };

  if (params.guestName) {
    body.guestName = params.guestName.trim();
  }

  if (params.paymentMethod === 'CASH' && params.includeCashQr) {
    body.includeCashQr = true;
  }

  if (params.paymentMethod === 'STRIPE' && params.includeCheckoutToken) {
    body.includeCheckoutToken = true;
  }

  return apiFetch<CreateOrderResponse>('/orders', {
    method: 'POST',
    headers: {
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(body),
  });
}

/**
 * Consulta el historial de órdenes del cliente autenticado.
 */
export async function getCustomerOrders(cursor?: string): Promise<{ data: BackendOrder[]; nextCursor: string | null }> {
  const query = cursor ? `?limit=20&cursor=${encodeURIComponent(cursor)}` : '?limit=20';
  const res = await apiFetch<{ data: BackendOrder[]; page?: { nextCursor: string | null } }>(
    `/customers/me/orders${query}`
  );
  return {
    data: res.data,
    nextCursor: res.page?.nextCursor ?? null,
  };
}

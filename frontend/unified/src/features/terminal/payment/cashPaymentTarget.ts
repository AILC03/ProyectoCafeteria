import type { PosOrder } from '../pos/posApi';
import type { ScannedCashOrder } from './cashQrApi';

export type CashPaymentItem = {
  productName: string;
  quantity: number;
  options?: readonly string[];
};

export type CashPaymentTarget = {
  id: string;
  folio: string;
  totalCents: string;
  paymentExpiresAt: string;
  origin: 'pos' | 'qr';
  items: readonly CashPaymentItem[];
};

export function targetFromPosOrder(order: PosOrder): CashPaymentTarget {
  return {
    id: order.id,
    folio: order.folio,
    totalCents: order.totalCents,
    paymentExpiresAt: order.paymentExpiresAt,
    origin: 'pos',
    items: order.items.map((item) => ({
      productName: item.productName,
      quantity: item.quantity,
      options: item.options.map((option) => option.optionName),
    })),
  };
}

export function targetFromScannedOrder(order: ScannedCashOrder): CashPaymentTarget {
  return {
    id: order.orderId,
    folio: order.orderFolio,
    totalCents: order.totalCents,
    paymentExpiresAt: order.paymentExpiresAt,
    origin: 'qr',
    items: order.items.map((item) => ({
      productName: item.productName,
      quantity: item.quantity,
      options: item.options?.map((option) => option.optionName),
    })),
  };
}

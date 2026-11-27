import { useSyncExternalStore } from 'react';
import type { CheckedCartLine } from '../cart/cartValidation';
import type { MobileOrder } from './mobileOrders';

export type CashReceipt = { order: MobileOrder; lines: CheckedCartLine[] };

let receipts: CashReceipt[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

/** In-memory receipts survive an automatic guest exit but never persistence. */
export const cashReceipts = {
  add(receipt: CashReceipt): void {
    receipts = [...receipts.filter((item) => item.order.id !== receipt.order.id), receipt];
    notify();
  },
  clear(): void {
    if (receipts.length === 0) return;
    receipts = [];
    notify();
  },
  getSnapshot: (): CashReceipt[] => receipts,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useCashReceipts(): CashReceipt[] {
  return useSyncExternalStore(cashReceipts.subscribe, cashReceipts.getSnapshot, cashReceipts.getSnapshot);
}

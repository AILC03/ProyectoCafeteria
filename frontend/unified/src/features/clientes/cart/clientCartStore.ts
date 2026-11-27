import { useSyncExternalStore } from 'react';
import { getCartDraft, saveCartDraft, type CartDraftItem } from '../../../shared/storage';
import { cashReceipts } from '../orders/cashReceipts';

export const MAX_CART_LINES = 50;
export const MAX_CART_QUANTITY = 99;

function lineKey(item: CartDraftItem): string {
  const options = [...new Set(item.optionValueIds)].sort((a, b) => a.localeCompare(b));
  return `${item.productId}\u0000${options.join('\u0001')}`;
}

/** Normalizes a full list (e.g. a repeated order) by summing identical lines. */
function mergeItems(items: readonly CartDraftItem[]): CartDraftItem[] {
  const merged: CartDraftItem[] = [];
  const positions = new Map<string, number>();
  for (const item of items) {
    const key = lineKey(item);
    const index = positions.get(key);
    if (index === undefined) {
      positions.set(key, merged.length);
      merged.push({ productId: item.productId, quantity: item.quantity, optionValueIds: [...item.optionValueIds] });
    } else {
      const current = merged[index]!;
      merged[index] = { ...current, quantity: Math.min(MAX_CART_QUANTITY, current.quantity + item.quantity) };
    }
  }
  return merged;
}

export type ClientCartSnapshot = Readonly<{
  items: CartDraftItem[];
  open: boolean;
  notice: string | null;
  storageWarning: boolean;
  locked: boolean;
  revision: number;
}>;

function initialItems(): CartDraftItem[] {
  return getCartDraft().items.slice(0, MAX_CART_LINES);
}

class ClientCartStore {
  private state: ClientCartSnapshot = {
    items: initialItems(),
    open: false,
    notice: null,
    storageWarning: false,
    locked: false,
    revision: 0,
  };
  private readonly listeners = new Set<() => void>();

  getSnapshot = (): ClientCartSnapshot => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(next: Partial<ClientCartSnapshot>): void {
    this.state = { ...this.state, ...next };
    this.listeners.forEach((listener) => listener());
  }

  private persist(items: CartDraftItem[]): void {
    const saved = saveCartDraft({ version: 1, items });
    this.set({ storageWarning: !saved && items.length > 0 });
  }

  private replace(items: CartDraftItem[], notice: string | null = null): void {
    this.persist(items);
    this.set({ items, notice });
  }

  open = (): void => { this.set({ open: true }); };
  close = (): void => { this.set({ open: false }); };
  toggle = (): void => { this.set({ open: !this.state.open }); };

  hydrate = (): void => {
    this.set({
      items: initialItems(),
      open: false,
      notice: null,
      storageWarning: false,
      locked: false,
    });
  };

  clearNotice = (): void => { if (this.state.notice !== null) this.set({ notice: null }); };

  setLocked = (locked: boolean): void => {
    if (this.state.locked !== locked) this.set({ locked });
  };

  bumpRevision = (): void => { this.set({ revision: this.state.revision + 1 }); };

  replaceItems = (items: CartDraftItem[]): void => {
    if (items.length > 0) cashReceipts.clear();
    this.replace(mergeItems(items).slice(0, MAX_CART_LINES));
  };

  addItem = (item: CartDraftItem): boolean => {
    if (this.state.locked) return false;
    const key = lineKey(item);
    const existingIndex = this.state.items.findIndex((line) => lineKey(line) === key);
    if (existingIndex >= 0) {
      // Idéntico producto y mismas opciones: suma cantidad en una sola línea.
      const quantity = Math.min(
        MAX_CART_QUANTITY,
        this.state.items[existingIndex]!.quantity + item.quantity,
      );
      cashReceipts.clear();
      this.replace(
        this.state.items.map((line, index) =>
          index === existingIndex ? { ...line, quantity } : line,
        ),
        'Producto añadido al carrito.',
      );
      return true;
    }
    if (this.state.items.length >= MAX_CART_LINES) {
      this.set({ notice: `El carrito admite hasta ${MAX_CART_LINES} líneas. Quita una antes de añadir otra.` });
      return false;
    }
    cashReceipts.clear();
    this.replace(
      [...this.state.items, { productId: item.productId, quantity: item.quantity, optionValueIds: [...item.optionValueIds] }],
      'Producto añadido al carrito.',
    );
    return true;
  };

  removeItem = (index: number): void => {
    if (this.state.locked) return;
    cashReceipts.clear();
    this.replace(this.state.items.filter((_, position) => position !== index));
  };

  clear = (): void => {
    this.set({ items: [], open: false, notice: null, storageWarning: false, locked: false });
  };
}

export const clientCartStore = new ClientCartStore();

export function useClientCart(): ClientCartSnapshot {
  return useSyncExternalStore(clientCartStore.subscribe, clientCartStore.getSnapshot, clientCartStore.getSnapshot);
}

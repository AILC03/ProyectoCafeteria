import { useSyncExternalStore } from 'react';
import { getCartDraft, saveCartDraft, type CartDraftItem } from '../../../shared/storage';
import { cashReceipts } from '../orders/cashReceipts';

export const MAX_CART_LINES = 50;

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
    this.replace(items.slice(0, MAX_CART_LINES));
  };

  addItem = (item: CartDraftItem): boolean => {
    if (this.state.locked) return false;
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

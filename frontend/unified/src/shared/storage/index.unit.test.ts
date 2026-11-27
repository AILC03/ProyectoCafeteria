import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CART_DRAFT_KEY, POS_DRAFT_KEY, PREFERENCES_KEY, clearPrivateState, defaultPreferences, getCartDraft, getPosDraft,
  cleanupLegacyDatabase, cleanupLegacyDatabaseWithRetry, getPreferences, migrateAndCleanupStorage, saveCartDraft, savePosDraft, savePreferences, startLegacyDatabaseCleanupLifecycle,
} from './index';

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('shared storage adapter', () => {
  it('persists only the preferences allowlist and sanitizes its footer', () => {
    savePreferences({ theme: 'theme-dark', audio: false, ticketWidth: '58mm', autoPrint: true, ticketFooter: '<b>Gracias</b>\u0000', token: 'never' });
    expect(getPreferences()).toEqual({ theme: 'theme-dark', audio: false, ticketWidth: '58mm', autoPrint: true, ticketFooter: 'bGracias/b' });
    expect(localStorage.getItem(PREFERENCES_KEY)).not.toContain('never');
  });

  it('rejects invalid JSON and invalid cart fields with safe defaults', () => {
    localStorage.setItem(PREFERENCES_KEY, '{bad json');
    localStorage.setItem(CART_DRAFT_KEY, JSON.stringify({ version: 1, items: [
      { productId: 'coffee-1', quantity: 2, optionValueIds: ['milk-1'], price: 1 },
      { productId: 'coffee-2', quantity: 0, optionValueIds: [] },
      { productId: 'bad id!', quantity: 1, optionValueIds: [] },
    ] }));
    expect(getPreferences()).toEqual(defaultPreferences);
    expect(getCartDraft()).toEqual({ version: 1, items: [{ productId: 'coffee-1', quantity: 2, optionValueIds: ['milk-1'] }] });
  });

  it('persists only safe POS draft fields and rejects invalid lines', () => {
    const saved = savePosDraft({
      version: 1,
      lines: [
        { productId: '10', quantity: 2, optionValueIds: ['5', '5'], productName: 'Latte', selectedLabels: ['Mediano'], unitEstimateCents: '6500', guestName: 'Ada' },
        { productId: '11', quantity: 0, optionValueIds: [], productName: 'Agua', selectedLabels: [], unitEstimateCents: '2000' },
        { productId: '12', quantity: 1, optionValueIds: [], productName: '', selectedLabels: [], unitEstimateCents: '2000' },
        { productId: '13', quantity: 1, optionValueIds: [], productName: 'Té', selectedLabels: [], unitEstimateCents: 'abc' },
      ],
    });
    expect(saved).toBe(true);
    expect(getPosDraft()).toEqual({
      version: 1,
      lines: [{ productId: '10', quantity: 2, optionValueIds: ['5'], productName: 'Latte', selectedLabels: ['Mediano'], unitEstimateCents: '6500' }],
    });
    expect(localStorage.getItem(POS_DRAFT_KEY)).not.toContain('Ada');
    clearPrivateState();
    expect(getPosDraft()).toEqual({ version: 1, lines: [] });
  });

  it('migrates only allowed legacy preferences and deletes all inventoried legacy sources', async () => {
    localStorage.setItem('taffy_theme', 'theme-latte');
    localStorage.setItem('taffy_audio', 'false');
    localStorage.setItem('taffy_ticket_footer', 'legacy footer must not migrate');
    localStorage.setItem('coffees_current_employee', '{sensitive and intentionally unread}');
    localStorage.setItem('taffy_cart', JSON.stringify([{ productId: 'coffee-1', quantity: 3, optionValueIds: ['size-m'], name: 'Latte', price: 999, guestName: 'Ada' }]));
    localStorage.setItem('coffees_pos_ticket_width', '58mm');
    const prohibitedKeys = [
      'coffees_current_employee', 'taffy_current_employee', 'coffees_employees_local', 'taffy_employees_local', 'coffees_employees_v1', 'taffy_employees_v1',
      'coffees_employees_tenant-A', 'taffy_employees_tenant_B',
      'coffees_employees_admin@coffeespos.com', 'taffy_employees_admin@taffypos.com',
      'coffees_pos_account', 'taffy_account', 'taffy_business_account', 'coffees_accounts_registry', 'taffy_accounts_registry', 'coffees_unlinked_manual', 'taffy_unlinked_manual',
      'coffees_orders_local', 'taffy_orders_local', 'coffees_orders_backup', 'taffy_orders_backup', 'coffees_orders_backup_tenant-A', 'taffy_orders_backup_tenant_B',
      'coffees_orders_backup_admin@coffeespos.com', 'taffy_orders_backup_admin@taffypos.com',
      'coffees_menu_products_local', 'taffy_menu_products_local', 'coffees_menu_products_v1', 'taffy_menu_products_v1',
      'coffees_menu_categories_local', 'taffy_menu_categories_local', 'coffees_menu_categories_v1', 'taffy_menu_categories_v1',
      'coffees_menu_products_tenant-A', 'taffy_menu_products_v1_tenant_B', 'coffees_menu_categories_tenant-A', 'taffy_menu_categories_v1_tenant_B',
      'coffees_menu_products_admin@coffeespos.com', 'taffy_menu_products_v1_admin@taffypos.com',
      'coffees_menu_categories_admin@coffeespos.com', 'taffy_menu_categories_v1_admin@taffypos.com',
      'taffy_past_orders', 'taffy_is_guest', 'taffy_guest_name',
    ];
    prohibitedKeys.forEach((key) => localStorage.setItem(key, '{sensitive and intentionally unread}'));
    localStorage.setItem('coffees_employees_invalid.tenant', 'must not match a broad prefix');
    const nativeGetItem = Storage.prototype.getItem;
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItemWithoutSensitiveReads(this: Storage, key: string) {
      return nativeGetItem.call(this, key);
    });
    await migrateAndCleanupStorage();
    const readsDuringMigration = getItem.mock.calls.map(([key]) => key);
    expect(getPreferences()).toMatchObject({ theme: 'theme-latte', audio: false });
    expect(getPreferences().ticketWidth).toBe('58mm');
    expect(getPreferences().ticketFooter).toBe(defaultPreferences.ticketFooter);
    expect(getCartDraft()).toEqual({ version: 1, items: [] });
    expect(localStorage.getItem('taffy_theme')).toBeNull();
    expect(localStorage.getItem('taffy_cart')).toBeNull();
    expect(localStorage.getItem('taffy_ticket_footer')).toBeNull();
    expect(localStorage.getItem('coffees_current_employee')).toBeNull();
    expect(localStorage.getItem(CART_DRAFT_KEY)).toBeNull();
    prohibitedKeys.forEach((key) => expect(localStorage.getItem(key)).toBeNull());
    expect(localStorage.getItem('coffees_employees_invalid.tenant')).toBe('must not match a broad prefix');
    expect(readsDuringMigration).not.toEqual(expect.arrayContaining(prohibitedKeys));
    expect(readsDuringMigration).not.toContain('taffy_cart');
  });

  it('reports IndexedDB deletion success without opening or reading the database', async () => {
    const listeners = new Map<string, () => void>();
    const deleteDatabase = vi.fn(() => ({ addEventListener: (event: string, listener: () => void) => listeners.set(event, listener) }));
    vi.stubGlobal('indexedDB', { deleteDatabase });
    const result = cleanupLegacyDatabase();
    expect(deleteDatabase).toHaveBeenCalledWith('CoffeesPosDatabase');
    listeners.get('success')?.();
    await expect(result).resolves.toEqual({ status: 'deleted' });
  });

  it('reports a blocked IndexedDB deletion so bootstrap callers can retry', async () => {
    const listeners = new Map<string, () => void>();
    vi.stubGlobal('indexedDB', { deleteDatabase: vi.fn(() => ({ addEventListener: (event: string, listener: () => void) => listeners.set(event, listener) })) });
    const result = cleanupLegacyDatabase();
    listeners.get('blocked')?.();
    await expect(result).resolves.toEqual({ status: 'blocked' });
  });

  it('retries IndexedDB deletion once after an error and reports both attempts', async () => {
    const listeners: Array<Map<string, () => void>> = [];
    const deleteDatabase = vi.fn(() => {
      const events = new Map<string, () => void>();
      listeners.push(events);
      return { addEventListener: (event: string, listener: () => void) => events.set(event, listener) };
    });
    vi.stubGlobal('indexedDB', { deleteDatabase });
    const report = cleanupLegacyDatabaseWithRetry();
    listeners[0]?.get('error')?.();
    await vi.waitFor(() => expect(deleteDatabase).toHaveBeenCalledTimes(2));
    listeners[1]?.get('success')?.();
    await expect(report).resolves.toEqual({ attempts: [{ status: 'error' }, { status: 'deleted' }], final: { status: 'deleted' } });
  });

  it('stops after a finite retry when IndexedDB stays blocked', async () => {
    const listeners: Array<Map<string, () => void>> = [];
    const deleteDatabase = vi.fn(() => {
      const events = new Map<string, () => void>();
      listeners.push(events);
      return { addEventListener: (event: string, listener: () => void) => events.set(event, listener) };
    });
    vi.stubGlobal('indexedDB', { deleteDatabase });
    const report = cleanupLegacyDatabaseWithRetry();
    listeners[0]?.get('blocked')?.();
    await vi.waitFor(() => expect(deleteDatabase).toHaveBeenCalledTimes(2));
    listeners[1]?.get('blocked')?.();
    await expect(report).resolves.toEqual({ attempts: [{ status: 'blocked' }, { status: 'blocked' }], final: { status: 'blocked' } });
    expect(deleteDatabase).toHaveBeenCalledTimes(2);
  });

  it('retries a blocked database cleanup on focus and removes its lifecycle listener after deletion', async () => {
    const listeners: Array<Map<string, () => void>> = [];
    const deleteDatabase = vi.fn(() => {
      const events = new Map<string, () => void>();
      listeners.push(events);
      return { addEventListener: (event: string, listener: () => void) => events.set(event, listener) };
    });
    vi.stubGlobal('indexedDB', { deleteDatabase });
    const reports: unknown[] = [];
    const removeEventListener = vi.spyOn(window, 'removeEventListener');
    const dispose = startLegacyDatabaseCleanupLifecycle((report) => reports.push(report));
    expect(startLegacyDatabaseCleanupLifecycle()).toBe(dispose);
    listeners[0]?.get('blocked')?.();
    await vi.waitFor(() => expect(deleteDatabase).toHaveBeenCalledTimes(2));
    listeners[1]?.get('blocked')?.();
    await vi.waitFor(() => expect(reports).toHaveLength(1));
    window.dispatchEvent(new Event('focus'));
    await vi.waitFor(() => expect(deleteDatabase).toHaveBeenCalledTimes(3));
    listeners[2]?.get('success')?.();
    await vi.waitFor(() => expect(reports).toHaveLength(2));
    expect(removeEventListener).toHaveBeenCalledWith('focus', expect.any(Function));
    dispose();
  });

  it('clears the cart draft but preserves preferences for actor changes', () => {
    savePreferences({ theme: 'theme-mint' });
    saveCartDraft({ version: 1, items: [{ productId: 'coffee-1', quantity: 1, optionValueIds: [] }] });
    clearPrivateState();
    expect(localStorage.getItem(CART_DRAFT_KEY)).toBeNull();
    expect(getPreferences().theme).toBe('theme-mint');
  });

  it('uses safe defaults when storage is inaccessible and reports quota failures', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('blocked'); });
    expect(getPreferences()).toEqual(defaultPreferences);
    vi.restoreAllMocks();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota'); });
    expect(saveCartDraft({ version: 1, items: [] })).toBe(false);
  });
});

export const PREFERENCES_KEY = 'cafeteria:preferences:v1';
export const CART_DRAFT_KEY = 'cafeteria:cart-draft:v1';
export const POS_DRAFT_KEY = 'cafeteria:pos-draft:v1';

const LEGACY_PREFERENCE_KEYS = {
  theme: ['coffees_theme', 'taffy_theme'],
  audio: ['coffees_audio', 'taffy_audio'],
  ticketWidth: ['coffees_ticket_width', 'taffy_ticket_width', 'coffees_pos_ticket_width'],
  autoPrint: ['coffees_auto_print', 'taffy_auto_print'],
} as const;
const LEGACY_CART_KEY = 'taffy_cart';
const LEGACY_DATABASE = 'CoffeesPosDatabase';
/**
 * TASK-07 legacy inventory. These are deleted by key only: their values can
 * contain actor, account, ticket or catalogue data and must never be read.
 */
const PROHIBITED_LEGACY_KEYS = new Set([
  'taffy_past_orders', 'taffy_is_guest', 'taffy_guest_name',
  'coffees_menu_categories_local', 'taffy_menu_categories_local',
  'coffees_menu_products_local', 'taffy_menu_products_local',
  'coffees_pos_account', 'taffy_account', 'taffy_business_account', 'coffees_accounts_registry', 'taffy_accounts_registry',
  'coffees_unlinked_manual', 'taffy_unlinked_manual',
  'coffees_current_employee', 'taffy_current_employee',
  'coffees_orders_local', 'taffy_orders_local', 'coffees_orders_backup', 'taffy_orders_backup',
  'coffees_employees_local', 'taffy_employees_local',
  'coffees_employees_v1', 'taffy_employees_v1',
  'taffy_business_mode', 'coffees_ticket_footer', 'taffy_ticket_footer',
  'coffees_pos_ticket_footer', 'coffees_pos_ticket_width',
]);
/** Tenant identifiers are deliberately bounded; broader prefix matching is forbidden. */
const TENANT = '(?:[A-Za-z0-9][A-Za-z0-9_-]{0,63}|[A-Za-z0-9][A-Za-z0-9._+-]{0,63}@[A-Za-z0-9][A-Za-z0-9.-]{0,62}\\.[A-Za-z]{2,63})';
const PROHIBITED_LEGACY_PATTERNS = [
  new RegExp(`^(?:coffees|taffy)_employees_${TENANT}$`),
  new RegExp(`^(?:coffees|taffy)_orders_backup_${TENANT}$`),
  new RegExp(`^(?:coffees|taffy)_menu_(?:products|categories)_(?:${TENANT}|v1_${TENANT})$`),
] as const;
const MAX_CART_ITEMS = 50;
const MAX_OPTION_VALUES = 20;
const MAX_ID_LENGTH = 80;
const MAX_FOOTER_LENGTH = 160;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;

export type Preferences = {
  theme: 'theme-nordic' | 'theme-dark' | 'theme-latte' | 'theme-mint';
  audio: boolean;
  ticketWidth: '58mm' | '80mm';
  autoPrint: boolean;
  ticketFooter: string;
};

export type CartDraftItem = { productId: string; quantity: number; optionValueIds: string[] };
export type CartDraft = { version: 1; items: CartDraftItem[] };
/** POS draft line: catalogue facts and estimates only, never customer data. */
export type PosDraftLine = {
  productId: string;
  quantity: number;
  optionValueIds: string[];
  productName: string;
  selectedLabels: string[];
  unitEstimateCents: string;
};
export type PosDraft = { version: 1; lines: PosDraftLine[] };

export const defaultPreferences: Preferences = {
  theme: 'theme-nordic', audio: true, ticketWidth: '80mm', autoPrint: false,
  ticketFooter: '¡Gracias por su compra! Vuelva pronto.',
};

function storage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}

function read(store: Storage, key: string): string | null {
  try { return store.getItem(key); } catch { return null; }
}

function remove(store: Storage, key: string): void {
  try { store.removeItem(key); } catch { /* storage is optional */ }
}

function write(store: Storage, key: string, value: string): boolean {
  try { store.setItem(key, value); return true; } catch { return false; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parse(value: string | null): unknown {
  if (value === null) return null;
  try { return JSON.parse(value) as unknown; } catch { return null; }
}

function sanitizeFooter(value: unknown): string {
  if (typeof value !== 'string') return defaultPreferences.ticketFooter;
  const clean = value.replace(/[<>]/g, '').split('').filter((character) => {
    const code = character.charCodeAt(0);
    return code >= 32 && code !== 127;
  }).join('').trim().slice(0, MAX_FOOTER_LENGTH);
  return clean || defaultPreferences.ticketFooter;
}

function preferencesFrom(value: unknown): Preferences {
  const candidate = isRecord(value) ? value : {};
  return {
    theme: candidate.theme === 'theme-dark' || candidate.theme === 'theme-latte' || candidate.theme === 'theme-mint' || candidate.theme === 'theme-nordic' ? candidate.theme : defaultPreferences.theme,
    audio: typeof candidate.audio === 'boolean' ? candidate.audio : defaultPreferences.audio,
    ticketWidth: candidate.ticketWidth === '58mm' || candidate.ticketWidth === '80mm' ? candidate.ticketWidth : defaultPreferences.ticketWidth,
    autoPrint: typeof candidate.autoPrint === 'boolean' ? candidate.autoPrint : defaultPreferences.autoPrint,
    ticketFooter: sanitizeFooter(candidate.ticketFooter),
  };
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_ID_LENGTH && idPattern.test(value);
}

function cartFrom(value: unknown): CartDraft {
  const rawItems = Array.isArray(value) ? value : isRecord(value) && value.version === 1 && Array.isArray(value.items) ? value.items : [];
  const items: CartDraftItem[] = [];
  for (const raw of rawItems.slice(0, MAX_CART_ITEMS)) {
    if (!isRecord(raw) || !validId(raw.productId) || typeof raw.quantity !== 'number' || !Number.isInteger(raw.quantity) || raw.quantity < 1 || raw.quantity > 99 || !Array.isArray(raw.optionValueIds) || raw.optionValueIds.length > MAX_OPTION_VALUES) continue;
    const optionValueIds = raw.optionValueIds.filter(validId);
    if (optionValueIds.length !== raw.optionValueIds.length) continue;
    items.push({ productId: raw.productId, quantity: raw.quantity, optionValueIds: [...new Set(optionValueIds)] });
  }
  return { version: 1, items };
}

export function getPreferences(): Preferences {
  const store = storage();
  return store === null ? { ...defaultPreferences } : preferencesFrom(parse(read(store, PREFERENCES_KEY)));
}

export function savePreferences(preferences: unknown): boolean {
  const store = storage();
  return store !== null && write(store, PREFERENCES_KEY, JSON.stringify(preferencesFrom(preferences)));
}

export function getCartDraft(): CartDraft {
  const store = storage();
  return store === null ? { version: 1, items: [] } : cartFrom(parse(read(store, CART_DRAFT_KEY)));
}

export function saveCartDraft(draft: unknown): boolean {
  const store = storage();
  return store !== null && write(store, CART_DRAFT_KEY, JSON.stringify(cartFrom(draft)));
}

function shortText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function cents(value: unknown): value is string {
  return typeof value === 'string' && /^(0|[1-9][0-9]{0,18})$/.test(value);
}

function posDraftFrom(value: unknown): PosDraft {
  const rawLines =
    isRecord(value) && value.version === 1 && Array.isArray(value.lines) ? value.lines : [];
  const lines: PosDraftLine[] = [];
  for (const raw of rawLines.slice(0, MAX_CART_ITEMS)) {
    if (
      !isRecord(raw) ||
      !validId(raw.productId) ||
      typeof raw.quantity !== 'number' ||
      !Number.isInteger(raw.quantity) ||
      raw.quantity < 1 ||
      raw.quantity > 99 ||
      !Array.isArray(raw.optionValueIds) ||
      raw.optionValueIds.length > MAX_OPTION_VALUES ||
      !shortText(raw.productName, 120) ||
      !Array.isArray(raw.selectedLabels) ||
      raw.selectedLabels.length > MAX_OPTION_VALUES ||
      !cents(raw.unitEstimateCents)
    ) {
      continue;
    }
    const optionValueIds = raw.optionValueIds.filter(validId);
    if (optionValueIds.length !== raw.optionValueIds.length) continue;
    if (!raw.selectedLabels.every((label) => typeof label === 'string' && label.length <= 120)) {
      continue;
    }
    lines.push({
      productId: raw.productId,
      quantity: raw.quantity,
      optionValueIds: [...new Set(optionValueIds)],
      productName: raw.productName,
      selectedLabels: raw.selectedLabels.map((label) => label as string),
      unitEstimateCents: raw.unitEstimateCents,
    });
  }
  return { version: 1, lines };
}

export function getPosDraft(): PosDraft {
  const store = storage();
  return store === null ? { version: 1, lines: [] } : posDraftFrom(parse(read(store, POS_DRAFT_KEY)));
}

export function savePosDraft(draft: unknown): boolean {
  const store = storage();
  return store !== null && write(store, POS_DRAFT_KEY, JSON.stringify(posDraftFrom(draft)));
}

export function clearPosDraft(): void {
  const store = storage();
  if (store !== null) remove(store, POS_DRAFT_KEY);
}

/** Private actor-bound state only; workstation preferences deliberately remain. */
export function clearPrivateState(): void {
  const store = storage();
  if (store !== null) remove(store, CART_DRAFT_KEY);
  if (store !== null) remove(store, POS_DRAFT_KEY);
}

function legacyValue(store: Storage, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = read(store, key);
    if (value !== null) return value;
  }
  return null;
}

export type LegacyDatabaseCleanupResult =
  | { status: 'deleted' }
  | { status: 'blocked' }
  | { status: 'error' }
  | { status: 'unavailable' };
export type LegacyDatabaseCleanupReport = {
  attempts: readonly LegacyDatabaseCleanupResult[];
  final: LegacyDatabaseCleanupResult;
};
export type LegacyDatabaseReportListener = (report: LegacyDatabaseCleanupReport) => void;

let activeLifecycleCleanup: (() => void) | null = null;

/** Safe to call again after a blocked or failed browser deletion attempt. */
export function cleanupLegacyDatabase(): Promise<LegacyDatabaseCleanupResult> {
  if (typeof globalThis.indexedDB === 'undefined') return Promise.resolve({ status: 'unavailable' });
  try {
    const request = globalThis.indexedDB.deleteDatabase(LEGACY_DATABASE);
    return new Promise((resolve) => {
      request.addEventListener('success', () => resolve({ status: 'deleted' }), { once: true });
      request.addEventListener('blocked', () => resolve({ status: 'blocked' }), { once: true });
      request.addEventListener('error', () => resolve({ status: 'error' }), { once: true });
    });
  } catch { return Promise.resolve({ status: 'error' }); }
}

/** Makes at most two delete attempts; blocked/error results are observable to callers. */
export async function cleanupLegacyDatabaseWithRetry(): Promise<LegacyDatabaseCleanupReport> {
  const attempts: LegacyDatabaseCleanupResult[] = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await cleanupLegacyDatabase();
    attempts.push(result);
    if (result.status !== 'blocked' && result.status !== 'error') return { attempts, final: result };
  }
  return { attempts, final: attempts[attempts.length - 1]! };
}

/**
 * Bootstrap orchestration: one bounded initial attempt and, only if necessary,
 * one bounded retry on the next focus. The module guard prevents duplicate
 * global listeners if a caller is mounted twice under StrictMode.
 */
export function startLegacyDatabaseCleanupLifecycle(onReport?: LegacyDatabaseReportListener): () => void {
  if (activeLifecycleCleanup !== null) return activeLifecycleCleanup;
  let disposed = false;
  let retryListener: (() => void) | null = null;
  const dispose = () => {
    disposed = true;
    if (retryListener !== null && typeof window !== 'undefined') window.removeEventListener('focus', retryListener);
    retryListener = null;
    if (activeLifecycleCleanup === dispose) activeLifecycleCleanup = null;
  };
  activeLifecycleCleanup = dispose;
  void migrateAndCleanupStorage().then((report) => {
    onReport?.(report);
    if (disposed || (report.final.status !== 'blocked' && report.final.status !== 'error') || typeof window === 'undefined') {
      if (!disposed && (report.final.status === 'deleted' || report.final.status === 'unavailable')) dispose();
      return;
    }
    retryListener = () => {
      if (retryListener === null) return;
      window.removeEventListener('focus', retryListener);
      retryListener = null;
      void cleanupLegacyDatabaseWithRetry().then((retryReport) => {
        onReport?.(retryReport);
        dispose();
      });
    };
    window.addEventListener('focus', retryListener, { once: true });
  });
  return dispose;
}

function removeProhibitedLegacyKeys(store: Storage): void {
  const keys: string[] = [];
  try {
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);
      if (key !== null && (PROHIBITED_LEGACY_KEYS.has(key) || PROHIBITED_LEGACY_PATTERNS.some((pattern) => pattern.test(key)))) keys.push(key);
    }
  } catch { return; }
  keys.forEach((key) => remove(store, key));
}

/** Runs once per bootstrap safely; there is intentionally no migration marker. */
export function migrateAndCleanupStorage(): Promise<LegacyDatabaseCleanupReport> {
  const store = storage();
  if (store !== null) {
    const legacyAudio = legacyValue(store, LEGACY_PREFERENCE_KEYS.audio);
    const legacyAutoPrint = legacyValue(store, LEGACY_PREFERENCE_KEYS.autoPrint);
    const legacyPreferences = preferencesFrom({
      theme: legacyValue(store, LEGACY_PREFERENCE_KEYS.theme),
      audio: legacyAudio === 'true' ? true : legacyAudio === 'false' ? false : undefined,
      ticketWidth: legacyValue(store, LEGACY_PREFERENCE_KEYS.ticketWidth),
      autoPrint: legacyAutoPrint === 'true' ? true : legacyAutoPrint === 'false' ? false : undefined,
    });
    const hasLegacyPreferences = Object.values(LEGACY_PREFERENCE_KEYS).some((keys) => legacyValue(store, keys) !== null);
    if (read(store, PREFERENCES_KEY) === null && hasLegacyPreferences) savePreferences(legacyPreferences);
    for (const keys of Object.values(LEGACY_PREFERENCE_KEYS)) keys.forEach((key) => remove(store, key));

    // Legacy drafts have no actor binding; discard without parsing them.
    remove(store, LEGACY_CART_KEY);
    // Legacy account, ticket and catalogue keys are never read or parsed.
    removeProhibitedLegacyKeys(store);
  }
  return cleanupLegacyDatabaseWithRetry();
}

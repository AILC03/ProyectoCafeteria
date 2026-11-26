const UNIVERSE_DEFINITION =
  'product-not-deleted+category-active+category-not-deleted+created-before-asOf+availability-ignored+current-catalog-state';

export type NoMovementFixtureItem = {
  productId: string;
  name: string;
  category: { id: string; name: string };
  isAvailable: boolean;
  createdAt: string;
};

type NoMovementFixtureOptions = {
  generatedAt?: string;
  total?: string;
};

const PERIOD = {
  from: '2026-11-24T08:00:00.000Z',
  to: '2026-11-25T08:00:00.000Z',
  timeZone: 'America/Tijuana' as const,
};

const CURSOR_PREFIX = 'cursor-';

export const canonicalNoMovementItems: NoMovementFixtureItem[] = [
  {
    productId: '10',
    name: 'Latte',
    category: { id: '3', name: 'Cafés' },
    isAvailable: true,
    createdAt: '2024-01-15T18:00:00.000000Z',
  },
  {
    productId: '12',
    name: 'Moka',
    category: { id: '3', name: 'Cafés' },
    isAvailable: false,
    createdAt: '2026-11-20T17:30:00.123456Z',
  },
  {
    productId: '11',
    name: 'Té chai',
    category: { id: '4', name: 'Tés' },
    isAvailable: true,
    createdAt: '2025-06-01T09:05:00.000001Z',
  },
];

export const manyNoMovementItems: NoMovementFixtureItem[] = Array.from(
  { length: 25 },
  (_, index) => {
    const value = index + 1;
    return {
      productId: String(value),
      name: `Activo ${String(value).padStart(2, '0')}`,
      category: { id: '7', name: 'Bebidas' },
      isAvailable: value % 2 === 0,
      createdAt: `2026-11-24T12:00:${String(index % 60).padStart(2, '0')}.000001Z`,
    };
  },
);

export const largeNoMovementItems: NoMovementFixtureItem[] = [
  {
    productId: '9007199254740993',
    name: 'A producto enorme',
    category: { id: '1', name: 'Grandes' },
    isAvailable: false,
    createdAt: '2026-11-20T17:30:00.123456Z',
  },
  {
    productId: '123456789012345678901',
    name: 'B producto de veinte dígitos',
    category: { id: '2', name: 'Grandes' },
    isAvailable: true,
    createdAt: '2026-11-24T12:00:00.000001Z',
  },
];

export function noMovementCursorFor(offset: number): string {
  return `${CURSOR_PREFIX}${offset}`;
}

function cursorOffset(cursor: string | null): number {
  if (cursor === null) return 0;
  const match = new RegExp(`^${CURSOR_PREFIX}(\\d+)$`).exec(cursor);
  return match === null ? 0 : Number(match[1]);
}

/**
 * Contract-shaped page for the exact request URL. The cursor is a test-only
 * `cursor-<offset>` token; production never interprets it and the fixture keeps
 * the deterministic name/productId order.
 */
export function noMovementForUrl(
  url: string,
  allItems: NoMovementFixtureItem[] = canonicalNoMovementItems,
  options: NoMovementFixtureOptions = {},
) {
  const query = new URL(url).searchParams;
  const from = query.get('from') ?? PERIOD.from;
  const to = query.get('to') ?? PERIOD.to;
  const methodParam = query.get('method');
  const method = methodParam === 'CASH' || methodParam === 'STRIPE' ? methodParam : null;
  const limitParam = query.get('limit');
  const limit = limitParam === '10' || limitParam === '50' ? limitParam : '20';
  const offset = cursorOffset(query.get('cursor'));
  const pageSize = Number(limit);
  const items = allItems.slice(offset, offset + pageSize);
  const nextOffset = offset + pageSize;
  return {
    generatedAt: options.generatedAt ?? '2026-11-24T18:30:00.000Z',
    currency: 'MXN',
    period: { from, to, timeZone: PERIOD.timeZone },
    method,
    universe: {
      asOf: to,
      definition: UNIVERSE_DEFINITION,
      includesUnavailable: true as const,
    },
    totalNoMovementProducts: options.total ?? String(allItems.length),
    page: {
      limit,
      nextCursor: nextOffset < allItems.length ? noMovementCursorFor(nextOffset) : null,
    },
    items,
  };
}

export const canonicalNoMovement = noMovementForUrl(
  `http://no-movement.fixture/?from=${PERIOD.from}&to=${PERIOD.to}&limit=20`,
);

export const manyNoMovement = noMovementForUrl(
  `http://no-movement.fixture/?from=${PERIOD.from}&to=${PERIOD.to}&limit=20`,
  manyNoMovementItems,
);

export const zeroNoMovement = noMovementForUrl(
  `http://no-movement.fixture/?from=${PERIOD.from}&to=${PERIOD.to}&limit=20`,
  [],
);

export const largeNoMovement = noMovementForUrl(
  `http://no-movement.fixture/?from=${PERIOD.from}&to=${PERIOD.to}&limit=20`,
  largeNoMovementItems,
);

export const fallbackNoMovementPeriod = PERIOD;

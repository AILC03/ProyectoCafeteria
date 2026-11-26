export type RankingFixtureItem = {
  productId: string;
  name: string;
  nameSource?: 'current' | 'snapshot';
  unitsSold: string;
  totalCents: string;
};

type RankingFixtureOptions = {
  withPosition?: boolean;
  withNameSource?: boolean;
  matchedProductCount?: string;
  matchedTotals?: { unitsSold: string; totalCents: string };
  truncated?: boolean;
  generatedAt?: string;
};

const PERIOD = {
  from: '2026-11-24T08:00:00.000Z',
  to: '2026-11-25T08:00:00.000Z',
  timeZone: 'America/Tijuana' as const,
};

const utf8 = new TextEncoder();

function compareExact(a: string, b: string): number {
  const left = BigInt(a);
  const right = BigInt(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareUtf8(a: string, b: string): number {
  const left = utf8.encode(a);
  const right = utf8.encode(b);
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return left.length - right.length;
}

function sortItems(
  items: RankingFixtureItem[],
  metric: 'units' | 'amount',
  direction: 'top' | 'bottom',
): RankingFixtureItem[] {
  const sign = direction === 'top' ? -1 : 1;
  const primary = metric === 'units' ? 'unitsSold' : 'totalCents';
  const secondary = metric === 'units' ? 'totalCents' : 'unitsSold';
  return [...items].sort((a, b) => {
    const primaryOrder = compareExact(a[primary], b[primary]);
    if (primaryOrder !== 0) return sign * primaryOrder;
    const secondaryOrder = compareExact(a[secondary], b[secondary]);
    if (secondaryOrder !== 0) return sign * secondaryOrder;
    const nameOrder = compareUtf8(a.name, b.name);
    if (nameOrder !== 0) return nameOrder;
    return compareExact(a.productId, b.productId);
  });
}

function sumItems(items: RankingFixtureItem[]): { unitsSold: string; totalCents: string } {
  let unitsSold = 0n;
  let totalCents = 0n;
  for (const item of items) {
    unitsSold += BigInt(item.unitsSold);
    totalCents += BigInt(item.totalCents);
  }
  return { unitsSold: unitsSold.toString(), totalCents: totalCents.toString() };
}

export const canonicalRankingItems: RankingFixtureItem[] = [
  { productId: '10', name: 'Latte', nameSource: 'current', unitsSold: '6', totalCents: '21000' },
  { productId: '11', name: 'Capuchino', nameSource: 'current', unitsSold: '3', totalCents: '8500' },
  { productId: '12', name: 'Americano', nameSource: 'snapshot', unitsSold: '3', totalCents: '5000' },
];

export const twelveMovementItems: RankingFixtureItem[] = Array.from({ length: 12 }, (_, index) => {
  const value = index + 1;
  return {
    productId: String(value),
    name: `Producto ${String(value).padStart(2, '0')}`,
    unitsSold: String(value),
    totalCents: String(value * 100),
  };
});

export const tieRankingItems: RankingFixtureItem[] = [
  { productId: '10', name: 'Café', nameSource: 'current', unitsSold: '3', totalCents: '8500' },
  { productId: '12', name: 'Café', nameSource: 'current', unitsSold: '3', totalCents: '5000' },
  { productId: '11', name: 'Zeta', nameSource: 'current', unitsSold: '2', totalCents: '5000' },
  { productId: '13', name: 'Ávila', nameSource: 'current', unitsSold: '2', totalCents: '5000' },
];

export const snapshotRankingItems: RankingFixtureItem[] = [
  { productId: '7', name: 'Latte antiguo', nameSource: 'snapshot', unitsSold: '4', totalCents: '12000' },
  { productId: '8', name: 'Té actual', nameSource: 'current', unitsSold: '2', totalCents: '3000' },
];

export const freeProductItems: RankingFixtureItem[] = [
  { productId: '201', name: 'Muestra gratis', unitsSold: '1', totalCents: '0' },
  { productId: '202', name: 'Café pequeño', unitsSold: '2', totalCents: '3000' },
  { productId: '203', name: 'Café grande', unitsSold: '7', totalCents: '5000' },
];

export const largeRankingItems: RankingFixtureItem[] = [
  {
    productId: '9007199254740993',
    name: 'Producto enorme',
    unitsSold: '9007199254740993',
    totalCents: '9007199254740995',
  },
  { productId: '9007199254740994', name: 'Producto grande', unitsSold: '2', totalCents: '4' },
];

export const over19DigitItems: RankingFixtureItem[] = [
  {
    productId: '123456789012345678901',
    name: 'Producto de veinte dígitos',
    unitsSold: '123456789012345678901',
    totalCents: '123456789012345678901',
  },
  { productId: '123456789012345678902', name: 'Producto corto', unitsSold: '2', totalCents: '4' },
];

export const longNameItem: RankingFixtureItem = {
  productId: '501',
  name: 'A'.repeat(160),
  unitsSold: '1',
  totalCents: '100',
};

function fixtureUrl(filter: {
  from?: string;
  to?: string;
  metric: 'units' | 'amount';
  direction: 'top' | 'bottom';
  top?: string;
  method?: 'CASH' | 'STRIPE';
}): string {
  const params = new URLSearchParams();
  params.set('from', filter.from ?? PERIOD.from);
  params.set('to', filter.to ?? PERIOD.to);
  params.set('metric', filter.metric);
  params.set('direction', filter.direction);
  if (filter.top !== undefined) params.set('top', filter.top);
  if (filter.method !== undefined) params.set('method', filter.method);
  return `http://ranking.fixture/?${params.toString()}`;
}

/**
 * Contract-shaped ranking for the exact request URL. Test-only data: it keeps
 * unrelated dashboard tests deterministic without hiding the parser in production.
 */
export function productRankingForUrl(
  url: string,
  allItems: RankingFixtureItem[] = canonicalRankingItems,
  options: RankingFixtureOptions = {},
) {
  const query = new URL(url).searchParams;
  const from = query.get('from') ?? PERIOD.from;
  const to = query.get('to') ?? PERIOD.to;
  const metric = query.get('metric') === 'amount' ? 'amount' : 'units';
  const direction = query.get('direction') === 'bottom' ? 'bottom' : 'top';
  const top = query.get('top') ?? '5';
  const methodParam = query.get('method');
  const method = methodParam === 'CASH' || methodParam === 'STRIPE' ? methodParam : null;
  const sorted = sortItems(allItems, metric, direction);
  const selected = sorted.slice(0, Number(top));
  const totals = options.matchedTotals ?? sumItems(allItems);
  const matchedProductCount = options.matchedProductCount ?? String(allItems.length);
  const truncated = options.truncated ?? BigInt(matchedProductCount) > BigInt(selected.length);
  return {
    generatedAt: options.generatedAt ?? '2026-11-24T18:30:00.000Z',
    currency: 'MXN',
    period: { from, to, timeZone: PERIOD.timeZone },
    method,
    metric,
    direction,
    top,
    matchedProductCount,
    matchedTotals: totals,
    truncated,
    items: selected.map((item, index) => ({
      ...(options.withPosition === false ? {} : { position: String(index + 1) }),
      productId: item.productId,
      name: item.name,
      ...(options.withNameSource === false || item.nameSource === undefined
        ? {}
        : { nameSource: item.nameSource }),
      unitsSold: item.unitsSold,
      totalCents: item.totalCents,
    })),
  };
}

export const canonicalRanking = productRankingForUrl(
  fixtureUrl({ metric: 'units', direction: 'top', top: '5' }),
);

export const amountTopRanking = productRankingForUrl(
  fixtureUrl({ metric: 'amount', direction: 'top', top: '5' }),
  twelveMovementItems,
);

export const unitsBottomRanking = productRankingForUrl(
  fixtureUrl({ metric: 'units', direction: 'bottom', top: '5' }),
  freeProductItems,
);

export const amountBottomRanking = productRankingForUrl(
  fixtureUrl({ metric: 'amount', direction: 'bottom', top: '5' }),
  freeProductItems,
);

export const topTenRanking = productRankingForUrl(
  fixtureUrl({ metric: 'units', direction: 'top', top: '10' }),
  twelveMovementItems,
);

export const topTwentyRanking = productRankingForUrl(
  fixtureUrl({ metric: 'units', direction: 'top', top: '20' }),
  twelveMovementItems,
);

export const tieRanking = productRankingForUrl(
  fixtureUrl({ metric: 'units', direction: 'top', top: '10' }),
  tieRankingItems,
);

export const snapshotRanking = productRankingForUrl(
  fixtureUrl({ metric: 'units', direction: 'top', top: '5' }),
  snapshotRankingItems,
);

export const rankingWithoutOptional = productRankingForUrl(
  fixtureUrl({ metric: 'units', direction: 'top', top: '5' }),
  canonicalRankingItems,
  { withPosition: false, withNameSource: false },
);

export const zeroRanking = productRankingForUrl(
  fixtureUrl({ metric: 'units', direction: 'top', top: '5' }),
  [],
);

/**
 * Literal D07 order vector for `metric=units`, `direction=top` and
 * `method=CASH`. It is authored by hand and is deliberately **not** produced by
 * `sortItems`/`productRankingForUrl`, so the adapter and the panel are compared
 * against a fixed expectation instead of the same comparator used by the
 * production parser (review finding R-2).
 *
 * Expected order, hardcoded:
 * 1. 304 `Beta` — 9 units / 21000 cents
 * 2. 305 `Zeta` — 5 units / 1000 cents
 * 3. 302 `Café` — 2 units / 1000 cents (byte order before 303 by productId)
 * 4. 303 `Café` — 2 units / 1000 cents
 * 5. 301 `Ávila` — 2 units / 1000 cents (`0xC3` byte sorts after `0x43`)
 */
export const literalOrderRanking = {
  generatedAt: '2026-11-24T18:30:00.000Z',
  currency: 'MXN',
  period: { from: PERIOD.from, to: PERIOD.to, timeZone: PERIOD.timeZone },
  method: 'CASH',
  metric: 'units',
  direction: 'top',
  top: '5',
  matchedProductCount: '5',
  matchedTotals: { unitsSold: '20', totalCents: '25000' },
  truncated: false,
  items: [
    { position: '1', productId: '304', name: 'Beta', unitsSold: '9', totalCents: '21000' },
    { position: '2', productId: '305', name: 'Zeta', unitsSold: '5', totalCents: '1000' },
    { position: '3', productId: '302', name: 'Café', unitsSold: '2', totalCents: '1000' },
    { position: '4', productId: '303', name: 'Café', unitsSold: '2', totalCents: '1000' },
    { position: '5', productId: '301', name: 'Ávila', unitsSold: '2', totalCents: '1000' },
  ],
} as const;

/** Expected order for [literalOrderRanking], hardcoded independently of the fixture sorter. */
export const literalOrderProductIds = ['304', '305', '302', '303', '301'] as const;

export const largeRanking = productRankingForUrl(
  fixtureUrl({ metric: 'amount', direction: 'top', top: '5' }),
  largeRankingItems,
);

export const over19DigitRanking = productRankingForUrl(
  fixtureUrl({ metric: 'amount', direction: 'top', top: '5' }),
  over19DigitItems,
);

export const longNameRanking = productRankingForUrl(
  fixtureUrl({ metric: 'amount', direction: 'top', top: '5' }),
  [longNameItem],
);

export const fallbackPeriod = PERIOD;
export const fixtureRequestUrl = fixtureUrl;

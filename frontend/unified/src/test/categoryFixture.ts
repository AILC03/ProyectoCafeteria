export type CategoryFixtureItem = {
  categoryId: string;
  name: string;
  isActive: boolean;
  unitsSold: string;
  totalCents: string;
};

type CategoryFixtureOptions = {
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

/** UTF-8 byte order, equivalent to PostgreSQL COLLATE "C". */
function compareUtf8(a: string, b: string): number {
  const left = utf8.encode(a);
  const right = utf8.encode(b);
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return left.length - right.length;
}

type Metric = 'units' | 'amount';

function metricValue(item: CategoryFixtureItem, metric: Metric): bigint {
  return BigInt(metric === 'units' ? item.unitsSold : item.totalCents);
}

function sortItems(items: CategoryFixtureItem[], metric: Metric): CategoryFixtureItem[] {
  return [...items].sort((a, b) => {
    const metricOrder = compareExact(metricValue(a, metric).toString(), metricValue(b, metric).toString());
    if (metricOrder !== 0) return -metricOrder;
    const nameOrder = compareUtf8(a.name, b.name);
    if (nameOrder !== 0) return nameOrder;
    return compareExact(a.categoryId, b.categoryId);
  });
}

function sumItems(items: CategoryFixtureItem[]): { unitsSold: string; totalCents: string } {
  let unitsSold = 0n;
  let totalCents = 0n;
  for (const item of items) {
    unitsSold += BigInt(item.unitsSold);
    totalCents += BigInt(item.totalCents);
  }
  return { unitsSold: unitsSold.toString(), totalCents: totalCents.toString() };
}

/** Exact half-up percentage with two decimals, computed only inside the fixture. */
function sharePercentFor(value: bigint, denominator: bigint): string {
  if (denominator === 0n) return '0.00';
  const centesimas = (value * 20000n + denominator) / (2n * denominator);
  const whole = centesimas / 100n;
  const fraction = centesimas % 100n;
  return `${whole}.${fraction.toString().padStart(2, '0')}`;
}

export const canonicalCategoryItems: CategoryFixtureItem[] = [
  { categoryId: '3', name: 'Cafés', isActive: true, unitsSold: '8', totalCents: '26000' },
  { categoryId: '5', name: 'Panadería', isActive: false, unitsSold: '3', totalCents: '7500' },
  { categoryId: '7', name: 'Postres', isActive: true, unitsSold: '1', totalCents: '2500' },
];

export const freeCategoryItems: CategoryFixtureItem[] = [
  { categoryId: '3', name: 'Gratis', isActive: true, unitsSold: '2', totalCents: '0' },
  { categoryId: '4', name: 'Muestra', isActive: true, unitsSold: '1', totalCents: '0' },
];

export const roundingCategoryItems: CategoryFixtureItem[] = [
  { categoryId: '31', name: 'A', isActive: true, unitsSold: '1', totalCents: '1000' },
  { categoryId: '32', name: 'B', isActive: true, unitsSold: '1', totalCents: '1000' },
  { categoryId: '33', name: 'C', isActive: true, unitsSold: '1', totalCents: '1000' },
];

export const tieBreakCategoryItems: CategoryFixtureItem[] = [
  {
    categoryId: '9007199254740993',
    name: 'Empate',
    isActive: true,
    unitsSold: '5',
    totalCents: '1000',
  },
  { categoryId: '10', name: 'Empate', isActive: true, unitsSold: '5', totalCents: '1000' },
];

export const largeCategoryItems: CategoryFixtureItem[] = [
  {
    categoryId: '22',
    name: 'Grande B',
    isActive: true,
    unitsSold: '6004799503160662',
    totalCents: '6004799503160662',
  },
  {
    categoryId: '21',
    name: 'Grande A',
    isActive: true,
    unitsSold: '3002399751580331',
    totalCents: '3002399751580331',
  },
];

export const over19DigitCategoryItems: CategoryFixtureItem[] = [
  {
    categoryId: '123456789012345678901',
    name: 'Categoría enorme',
    isActive: false,
    unitsSold: '123456789012345678901',
    totalCents: '123456789012345678901',
  },
  { categoryId: '2', name: 'Categoría corta', isActive: true, unitsSold: '2', totalCents: '4' },
];

/**
 * Contract-shaped category participation for the exact request URL. Test-only
 * data: it keeps unrelated dashboard tests deterministic without hiding the
 * production parser, and it mirrors the backend order and half-up shares.
 */
export function categoryParticipationForUrl(
  url: string,
  allItems: CategoryFixtureItem[] = canonicalCategoryItems,
  options: CategoryFixtureOptions = {},
) {
  const query = new URL(url).searchParams;
  const from = query.get('from') ?? PERIOD.from;
  const to = query.get('to') ?? PERIOD.to;
  const metric: Metric = query.get('metric') === 'amount' ? 'amount' : 'units';
  const methodParam = query.get('method');
  const method = methodParam === 'CASH' || methodParam === 'STRIPE' ? methodParam : null;
  const denominator = sumItems(allItems);
  const selected = metric === 'units' ? denominator.unitsSold : denominator.totalCents;
  const sorted = sortItems(allItems, metric);
  return {
    generatedAt: options.generatedAt ?? '2026-11-24T18:30:00.000Z',
    currency: 'MXN',
    period: { from, to, timeZone: PERIOD.timeZone },
    method,
    metric,
    denominator,
    totalCategories: String(allItems.length),
    items: sorted.map((item) => ({
      categoryId: item.categoryId,
      name: item.name,
      isActive: item.isActive,
      unitsSold: item.unitsSold,
      totalCents: item.totalCents,
      sharePercent: sharePercentFor(metricValue(item, metric), BigInt(selected)),
    })),
  };
}

export const fallbackCategoryPeriod = PERIOD;

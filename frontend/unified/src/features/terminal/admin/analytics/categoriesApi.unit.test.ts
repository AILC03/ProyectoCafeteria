import { describe, expect, test } from 'vitest';
import { delay, HttpResponse, http } from 'msw';
import { ApiError } from '../../../../shared/api/client';
import { server } from '../../../../test/server';
import {
  categoryParticipationForUrl,
  canonicalCategoryItems,
  freeCategoryItems,
  largeCategoryItems,
  over19DigitCategoryItems,
  roundingCategoryItems,
  tieBreakCategoryItems,
} from '../../../../test/categoryFixture';
import {
  buildCategoryParticipationQuery,
  formatCategoryParticipationError,
  getCategoryParticipation,
  parseCategoryParticipation,
  UnverifiableCategoryParticipationError,
  type CategoryParticipationFilter,
} from './categoriesApi';

const from = '2026-11-24T08:00:00.000Z';
const to = '2026-11-25T08:00:00.000Z';
const amountFilter: CategoryParticipationFilter = { from, to, metric: 'amount' };
const fixtureUrl = `http://categories.fixture/?from=${from}&to=${to}&metric=amount`;

function withData(data: unknown): { data: unknown } {
  return { data };
}

function canonical() {
  return categoryParticipationForUrl(fixtureUrl);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function mutate(change: (value: ReturnType<typeof canonical>) => void) {
  const value = clone(canonical());
  change(value);
  return () => parseCategoryParticipation(withData(value), amountFilter);
}

describe('administrative category participation API adapter', () => {
  test('builds only the approved query parameters and normalizes instants', () => {
    const query = new URLSearchParams(
      buildCategoryParticipationQuery({
        from: '2026-11-24T08:15:00Z',
        to,
        metric: 'units',
      }).slice(1),
    );
    expect([...query.keys()]).toEqual(['from', 'to', 'metric']);
    expect(query.get('from')).toBe('2026-11-24T08:15:00.000Z');
    expect(query.get('to')).toBe(to);
    expect(query.get('metric')).toBe('units');
    expect(query.has('method')).toBe(false);

    const cash = new URLSearchParams(
      buildCategoryParticipationQuery({ from, to, metric: 'amount', method: 'CASH' }).slice(1),
    );
    expect([...cash.keys()]).toEqual(['from', 'to', 'metric', 'method']);
    expect(cash.get('method')).toBe('CASH');

    const allMethods = new URLSearchParams(
      buildCategoryParticipationQuery({ from, to, metric: 'amount', method: 'ALL' }).slice(1),
    );
    expect(allMethods.has('method')).toBe(false);
  });

  test.each([
    ['missing metric', { from, to }],
    ['invalid metric', { from, to, metric: 'both' }],
    ['missing from', { to, metric: 'units' }],
    ['missing to', { from, metric: 'units' }],
    ['category filter', { from, to, metric: 'units', category: '3' }],
    ['categoryId filter', { from, to, metric: 'units', categoryId: '3' }],
    ['top', { from, to, metric: 'units', top: '10' }],
    ['direction', { from, to, metric: 'units', direction: 'top' }],
    ['limit', { from, to, metric: 'units', limit: '10' }],
    ['cursor', { from, to, metric: 'units', cursor: 'abc' }],
    ['granularity', { from, to, metric: 'units', granularity: 'day' }],
    ['timeZone', { from, to, metric: 'units', timeZone: 'America/Tijuana' }],
    ['order', { from, to, metric: 'units', order: 'asc' }],
    ['sort', { from, to, metric: 'units', sort: 'name' }],
    ['includeZeroSales', { from, to, metric: 'units', includeZeroSales: 'true' }],
    ['includeInactive', { from, to, metric: 'units', includeInactive: 'true' }],
    ['lowercase method', { from, to, metric: 'units', method: 'cash' }],
    ['empty method', { from, to, metric: 'units', method: '' }],
    ['invalid method', { from, to, metric: 'units', method: 'CARD' }],
    ['from before 2000', { from: '2000-01-01T07:59:59.999Z', to, metric: 'units' }],
    ['to equals from', { from, to: from, metric: 'units' }],
    ['offset input', { from: '2026-11-24T08:15:00-08:00', to, metric: 'units' }],
    ['impossible date', { from: '2026-02-30T08:00:00.000Z', to, metric: 'units' }],
    ['hour 24', { from: '2026-11-24T24:00:00.000Z', to, metric: 'units' }],
    ['four fractional digits', { from: '2026-11-24T08:15:00.0000Z', to, metric: 'units' }],
    ['range over 366 days', { from: '2000-01-01T08:00:00.000Z', to: '2001-01-01T08:00:00.001Z', metric: 'units' }],
  ])('rejects an invalid filter before HTTP: %s', (_name, filter) => {
    expect(() => buildCategoryParticipationQuery(filter as never)).toThrow(/no es válido/);
  });

  test('accepts a range of exactly 366 days', () => {
    const exactFrom = '2000-01-01T08:00:00.000Z';
    const exactTo = '2001-01-01T08:00:00.000Z';
    const query = new URLSearchParams(
      buildCategoryParticipationQuery({ from: exactFrom, to: exactTo, metric: 'units' }).slice(1),
    );
    expect(query.get('from')).toBe(exactFrom);
    expect(query.get('to')).toBe(exactTo);

    const result = parseCategoryParticipation(
      withData(
        categoryParticipationForUrl(
          `http://categories.fixture/?from=${exactFrom}&to=${exactTo}&metric=units`,
        ),
      ),
      { from: exactFrom, to: exactTo, metric: 'units' },
    );
    expect(result.period).toEqual({ from: exactFrom, to: exactTo, timeZone: 'America/Tijuana' });
  });

  test('rejects arrays and non-scalar values', () => {
    expect(() =>
      buildCategoryParticipationQuery({ from: [from], to, metric: 'units' } as never),
    ).toThrow(/no es válido/);
    expect(() =>
      buildCategoryParticipationQuery({ from, to, metric: ['units'] } as never),
    ).toThrow(/no es válido/);
    expect(() =>
      buildCategoryParticipationQuery({ from, to, metric: 'units', method: ['CASH'] } as never),
    ).toThrow(/no es válido/);
  });

  test('rejects an invalid filter before any HTTP call', async () => {
    let calls = 0;
    server.use(
      http.get('/api/v1/admin/dashboard/category-participation', () => {
        calls += 1;
        return HttpResponse.json(withData(canonical()));
      }),
    );
    await expect(
      getCategoryParticipation({ from, to, metric: 'units', category: '3' } as never),
    ).rejects.toBeInstanceOf(TypeError);
    expect(calls).toBe(0);
  });

  test('parses the canonical closed DTO, including an inactive category and exact shares', () => {
    const result = parseCategoryParticipation(withData(canonical()), amountFilter);
    expect(result.currency).toBe('MXN');
    expect(result.method).toBeNull();
    expect(result.metric).toBe('amount');
    expect(result.denominator).toEqual({ unitsSold: '12', totalCents: '36000' });
    expect(result.totalCategories).toBe('3');
    expect(result.items.map((item) => item.categoryId)).toEqual(['3', '5', '7']);
    expect(result.items[1]).toMatchObject({ isActive: false, sharePercent: '20.83' });
    expect(result.items.map((item) => item.sharePercent)).toEqual(['72.22', '20.83', '6.94']);
    expect(result.items.map((item) => item.unitsSold)).toEqual(['8', '3', '1']);
  });

  test('echoes the requested metric, method and period', () => {
    const cashUrl = `http://categories.fixture/?from=${from}&to=${to}&metric=units&method=CASH`;
    const result = parseCategoryParticipation(
      withData(categoryParticipationForUrl(cashUrl, canonicalCategoryItems)),
      { from, to, metric: 'units', method: 'CASH' },
    );
    expect(result.method).toBe('CASH');
    expect(result.metric).toBe('units');
    expect(result.items.map((item) => item.sharePercent)).toEqual(['66.67', '25.00', '8.33']);
  });

  test('parses the zero state without inventing categories', () => {
    const zero = categoryParticipationForUrl(`${fixtureUrl}`, []);
    const result = parseCategoryParticipation(withData(zero), amountFilter);
    expect(result.items).toEqual([]);
    expect(result.denominator).toEqual({ unitsSold: '0', totalCents: '0' });
    expect(result.totalCategories).toBe('0');
  });

  test('preserves items and "0.00" shares when the selected base is zero', () => {
    const result = parseCategoryParticipation(
      withData(categoryParticipationForUrl(fixtureUrl, freeCategoryItems)),
      amountFilter,
    );
    expect(result.items).toHaveLength(2);
    expect(result.denominator).toEqual({ unitsSold: '3', totalCents: '0' });
    expect(result.items.map((item) => item.sharePercent)).toEqual(['0.00', '0.00']);
  });

  test('preserves the rounding residue without normalizing to 100.00', () => {
    const result = parseCategoryParticipation(
      withData(
        categoryParticipationForUrl(
          `http://categories.fixture/?from=${from}&to=${to}&metric=units`,
          roundingCategoryItems,
        ),
      ),
      { from, to, metric: 'units' },
    );
    expect(result.items.map((item) => item.sharePercent)).toEqual(['33.33', '33.33', '33.33']);
  });

  test('preserves exact integers above 2^53 and over 19 digits', () => {
    const large = parseCategoryParticipation(
      withData(
        categoryParticipationForUrl(
          `http://categories.fixture/?from=${from}&to=${to}&metric=units`,
          largeCategoryItems,
        ),
      ),
      { from, to, metric: 'units' },
    );
    expect(large.items.map((item) => item.categoryId)).toEqual(['22', '21']);
    expect(large.denominator.unitsSold).toBe('9007199254740993');
    expect(large.items.map((item) => item.sharePercent)).toEqual(['66.67', '33.33']);

    const over19 = parseCategoryParticipation(
      withData(
        categoryParticipationForUrl(
          `http://categories.fixture/?from=${from}&to=${to}&metric=units`,
          over19DigitCategoryItems,
        ),
      ),
      { from, to, metric: 'units' },
    );
    expect(over19.items[0].categoryId).toBe('123456789012345678901');
    expect(over19.items[0].unitsSold).toBe('123456789012345678901');
  });

  test('breaks a metric and name tie by numeric categoryId, including above 2^53', () => {
    const result = parseCategoryParticipation(
      withData(
        categoryParticipationForUrl(
          `http://categories.fixture/?from=${from}&to=${to}&metric=units`,
          tieBreakCategoryItems,
        ),
      ),
      { from, to, metric: 'units' },
    );
    expect(result.items.map((item) => item.categoryId)).toEqual(['10', '9007199254740993']);
    expect(result.items.map((item) => item.name)).toEqual(['Empate', 'Empate']);
    expect(result.items.map((item) => item.unitsSold)).toEqual(['5', '5']);
    expect(result.items.map((item) => item.sharePercent)).toEqual(['50.00', '50.00']);
  });

  test('measures the category name in Unicode code points, not UTF-16 units', () => {
    const accepted = clone(canonical());
    accepted.items[0].name = '😀'.repeat(120);
    expect(() => parseCategoryParticipation(withData(accepted), amountFilter)).not.toThrow();

    const rejected = clone(canonical());
    rejected.items[0].name = '😀'.repeat(121);
    expect(() => parseCategoryParticipation(withData(rejected), amountFilter)).toThrow(
      UnverifiableCategoryParticipationError,
    );
  });

  test.each([
    ['root extra key', () => ({ data: canonical(), extra: true })],
    ['data extra key', () => withData({ ...canonical(), extra: true })],
    ['wrong currency', () => withData({ ...canonical(), currency: 'USD' })],
    ['wrong time zone', () => withData({ ...canonical(), period: { ...canonical().period, timeZone: 'UTC' } })],
    ['generatedAt with two decimals', () => withData({ ...canonical(), generatedAt: '2026-11-24T18:30:00.00Z' })],
    ['generatedAt before the domain', () => withData({ ...canonical(), generatedAt: '1999-12-31T23:59:59.999Z' })],
    ['period over 366 days', () => withData({
      ...canonical(),
      period: {
        from: '2000-01-01T08:00:00.000Z',
        to: '2001-01-01T08:00:00.001Z',
        timeZone: 'America/Tijuana',
      },
    })],
    ['wrong method literal', () => withData({ ...canonical(), method: 'CARD' })],
    ['wrong metric literal', () => withData({ ...canonical(), metric: 'both' })],
    ['denominator extra key', () => withData({ ...canonical(), denominator: { ...canonical().denominator, extra: true } })],
    ['denominator decimal', () => withData({ ...canonical(), denominator: { ...canonical().denominator, totalCents: '36000.0' } })],
    ['totalCategories leading zero', () => withData({ ...canonical(), totalCategories: '03' })],
    ['totalCategories mismatch', () => withData({ ...canonical(), totalCategories: '2' })],
    ['items not an array', () => withData({ ...canonical(), items: {} })],
    ['item extra key', () => mutate((value) => {
      (value.items[0] as Record<string, unknown>).customer = 'Ana';
    })],
    ['missing item key', () => mutate((value) => {
      delete (value.items[0] as Record<string, unknown>).sharePercent;
    })],
    ['category id zero', () => mutate((value) => {
      value.items[0].categoryId = '0';
    })],
    ['category id leading zero', () => mutate((value) => {
      value.items[0].categoryId = '03';
    })],
    ['empty category name', () => mutate((value) => {
      value.items[0].name = '';
    })],
    ['category name over 120 characters', () => mutate((value) => {
      value.items[0].name = 'A'.repeat(121);
    })],
    ['isActive as string', () => mutate((value) => {
      (value.items[0] as Record<string, unknown>).isActive = 'true';
    })],
    ['item units zero', () => mutate((value) => {
      value.items[0].unitsSold = '0';
    })],
    ['item units decimal', () => mutate((value) => {
      value.items[0].unitsSold = '8.0';
    })],
    ['negative item amount', () => mutate((value) => {
      value.items[0].totalCents = '-1';
    })],
    ['sharePercent over 100', () => mutate((value) => {
      value.items[0].sharePercent = '100.01';
    })],
    ['sharePercent one decimal', () => mutate((value) => {
      value.items[0].sharePercent = '72.2';
    })],
    ['sharePercent three decimals', () => mutate((value) => {
      value.items[0].sharePercent = '72.222';
    })],
    ['sharePercent negative', () => mutate((value) => {
      value.items[0].sharePercent = '-1.00';
    })],
    ['sharePercent as number', () => mutate((value) => {
      (value.items[0] as Record<string, unknown>).sharePercent = 72.22;
    })],
    ['duplicate category ids', () => mutate((value) => {
      value.items[1].categoryId = value.items[0].categoryId;
    })],
    ['incompatible order', () => mutate((value) => {
      const first = value.items[0];
      value.items[0] = value.items[1];
      value.items[1] = first;
    })],
    ['units denominator mismatch', () => mutate((value) => {
      value.denominator.unitsSold = '13';
    })],
    ['amount denominator mismatch', () => mutate((value) => {
      value.denominator.totalCents = '36001';
    })],
    ['empty items with denominator', () => withData({
      ...canonical(),
      totalCategories: '0',
      items: [],
    })],
    ['empty items with totalCategories', () => withData({
      ...canonical(),
      denominator: { unitsSold: '0', totalCents: '0' },
      items: [],
    })],
  ])('rejects an unverifiable response: %s', (_name, body) => {
    expect(() => parseCategoryParticipation(body(), amountFilter)).toThrow(
      UnverifiableCategoryParticipationError,
    );
  });

  test('rejects a response with a different effective filter', () => {
    expect(() =>
      parseCategoryParticipation(withData(canonical()), {
        from: '2026-11-24T08:00:00.001Z',
        to,
        metric: 'amount',
      }),
    ).toThrow(UnverifiableCategoryParticipationError);
    expect(() =>
      parseCategoryParticipation(withData(canonical()), { from, to, metric: 'units' }),
    ).toThrow(UnverifiableCategoryParticipationError);
    expect(() =>
      parseCategoryParticipation(withData(canonical()), {
        from,
        to,
        metric: 'amount',
        method: 'STRIPE',
      }),
    ).toThrow(UnverifiableCategoryParticipationError);
  });

  test('accepts 100.00 when a single category holds the whole base', () => {
    const single = categoryParticipationForUrl(fixtureUrl, [canonicalCategoryItems[0]]);
    const result = parseCategoryParticipation(withData(single), amountFilter);
    expect(result.items[0].sharePercent).toBe('100.00');
    expect(result.totalCategories).toBe('1');
  });

  test('rejects a nonzero share when the selected base is zero', () => {
    const value = categoryParticipationForUrl(fixtureUrl, freeCategoryItems);
    value.items[0].sharePercent = '50.00';
    expect(() => parseCategoryParticipation(withData(value), amountFilter)).toThrow(
      UnverifiableCategoryParticipationError,
    );
  });

  test('sends the exact filters and parses the response', async () => {
    const urls: string[] = [];
    server.use(
      http.get('/api/v1/admin/dashboard/category-participation', ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json(withData(categoryParticipationForUrl(request.url)));
      }),
    );
    const result = await getCategoryParticipation(amountFilter);
    expect(result.items).toHaveLength(3);
    const query = new URL(urls[0]).searchParams;
    expect([...query.keys()]).toEqual(['from', 'to', 'metric']);
    expect(query.get('metric')).toBe('amount');
    expect(query.has('method')).toBe(false);
    expect(query.has('category')).toBe(false);
    expect(query.has('categoryId')).toBe(false);
  });

  test('sends the method when provided and never retries an error response', async () => {
    const urls: string[] = [];
    server.use(
      http.get('/api/v1/admin/dashboard/category-participation', ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json(withData(categoryParticipationForUrl(request.url)));
      }),
    );
    await getCategoryParticipation({ from, to, metric: 'units', method: 'STRIPE' });
    const query = new URL(urls[0]).searchParams;
    expect(query.get('method')).toBe('STRIPE');

    for (const status of [400, 401, 403, 413, 429, 500, 503]) {
      let calls = 0;
      server.use(
        http.get('/api/v1/admin/dashboard/category-participation', () => {
          calls += 1;
          return HttpResponse.json(
            { title: 'Error', status, code: status === 403 ? 'FORBIDDEN' : 'ERROR' },
            { status },
          );
        }),
      );
      await expect(getCategoryParticipation(amountFilter)).rejects.toBeInstanceOf(ApiError);
      expect(calls).toBe(1);
    }

    server.use(
      http.get('/api/v1/admin/dashboard/category-participation', () => HttpResponse.error()),
    );
    await expect(getCategoryParticipation(amountFilter)).rejects.toBeInstanceOf(ApiError);
  });

  test('formats API errors, network failures and invalid DTOs without inventing data', () => {
    expect(formatCategoryParticipationError(new ApiError(400, 'Solicitud'))).toMatch(
      /no es válido/,
    );
    expect(formatCategoryParticipationError(new ApiError(401, 'Sesión'))).toMatch(
      /sesión venció/,
    );
    expect(
      formatCategoryParticipationError(new ApiError(403, 'Permiso', { code: 'FORBIDDEN' })),
    ).toMatch(/administración/);
    expect(
      formatCategoryParticipationError(new ApiError(403, 'NIP', { code: 'PIN_CHANGE_REQUIRED' })),
    ).toMatch(/cambiar tu NIP/);
    expect(
      formatCategoryParticipationError(new ApiError(403, 'Origen', { code: 'ORIGIN_NOT_ALLOWED' })),
    ).toMatch(/origen/);
    expect(formatCategoryParticipationError(new ApiError(413, 'Grande'))).toMatch(
      /demasiado grande/,
    );
    expect(formatCategoryParticipationError(new ApiError(429, 'Límite'))).toMatch(/Demasiadas/);
    expect(formatCategoryParticipationError(new ApiError(500, 'Interno'))).toMatch(
      /No fue posible consultar/,
    );
    expect(formatCategoryParticipationError(new ApiError(503, 'Servicio'))).toMatch(
      /no está disponible/,
    );
    expect(formatCategoryParticipationError(new ApiError(0, 'Red'))).toMatch(/no está disponible/);
    expect(
      formatCategoryParticipationError(
        new DOMException('abort', 'AbortError'),
      ),
    ).toMatch(/cancelada/);
    expect(
      formatCategoryParticipationError(new UnverifiableCategoryParticipationError()),
    ).toMatch(/no se puede verificar/);
  });

  test('supports aborting a request without reporting a network error', async () => {
    server.use(
      http.get('/api/v1/admin/dashboard/category-participation', async () => {
        await delay(100);
        return HttpResponse.json(withData(canonical()));
      }),
    );
    const controller = new AbortController();
    const request = getCategoryParticipation(amountFilter, controller.signal);
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });
});

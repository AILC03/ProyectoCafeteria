import { describe, expect, test } from 'vitest';
import { delay, HttpResponse, http } from 'msw';
import { ApiError } from '../../../../shared/api/client';
import { server } from '../../../../test/server';
import {
  canonicalNoMovement,
  fallbackNoMovementPeriod,
  largeNoMovement,
  largeNoMovementItems,
  manyNoMovement,
  manyNoMovementItems,
  noMovementCursorFor,
  noMovementForUrl,
  zeroNoMovement,
  type NoMovementFixtureItem,
} from '../../../../test/noMovementFixture';
import {
  buildNoMovementQuery,
  formatNoMovementError,
  getDashboardNoMovement,
  parseDashboardNoMovement,
  UnverifiableNoMovementError,
  type NoMovementFilter,
} from './noMovementApi';

const from = fallbackNoMovementPeriod.from;
const to = fallbackNoMovementPeriod.to;
const canonicalFilter: NoMovementFilter = { from, to, limit: '20' };

function withData(data: unknown): { data: unknown } {
  return { data };
}

function mutate(
  change: (value: ReturnType<typeof cloneCanonical>) => void,
  expected: NoMovementFilter = canonicalFilter,
) {
  const value = cloneCanonical();
  change(value);
  return () => parseDashboardNoMovement(withData(value), expected);
}

function cloneCanonical() {
  return structuredClone(canonicalNoMovement);
}

function fixtureUrl(extra = ''): string {
  return `http://no-movement.fixture/?from=${from}&to=${to}&limit=20${extra}`;
}

describe('administrative no-movement API adapter', () => {
  test('builds only the approved query parameters with the default page size', () => {
    const query = new URLSearchParams(
      buildNoMovementQuery({ from: '2026-11-24T08:15:00Z', to }).slice(1),
    );
    expect([...query.keys()]).toEqual(['from', 'to', 'limit']);
    expect(query.get('from')).toBe('2026-11-24T08:15:00.000Z');
    expect(query.get('to')).toBe(to);
    expect(query.get('limit')).toBe('20');
    expect(query.has('method')).toBe(false);
    expect(query.has('cursor')).toBe(false);

    const full = new URLSearchParams(
      buildNoMovementQuery({
        from,
        to,
        method: 'CASH',
        limit: '10',
        cursor: noMovementCursorFor(10),
      }).slice(1),
    );
    expect([...full.keys()]).toEqual(['from', 'to', 'method', 'limit', 'cursor']);
    expect(full.get('method')).toBe('CASH');
    expect(full.get('limit')).toBe('10');
    expect(full.get('cursor')).toBe('cursor-10');

    const allMethods = new URLSearchParams(
      buildNoMovementQuery({ from, to, method: 'ALL', limit: '50' }).slice(1),
    );
    expect(allMethods.has('method')).toBe(false);
    expect(allMethods.get('limit')).toBe('50');
  });

  test.each([
    ['no fraction', '2026-11-24T08:15:00Z', '2026-11-24T08:15:00.000Z'],
    ['one decimal', '2026-11-24T08:15:00.5Z', '2026-11-24T08:15:00.500Z'],
    ['two decimals', '2026-11-24T08:15:00.25Z', '2026-11-24T08:15:00.250Z'],
    ['three decimals', '2026-11-24T08:15:00.125Z', '2026-11-24T08:15:00.125Z'],
  ])('accepts and normalizes %s input instants', (_name, input, normalized) => {
    const query = new URLSearchParams(buildNoMovementQuery({ from: input, to }).slice(1));
    expect(query.get('from')).toBe(normalized);
  });

  test.each([
    ['missing from', { to }],
    ['missing to', { from }],
    ['extra category filter', { from, to, category: '1' }],
    ['extra top', { from, to, top: '10' }],
    ['extra includeUnavailable', { from, to, includeUnavailable: 'true' }],
    ['extra offset', { from, to, offset: '20' }],
    ['invalid method lowercase', { from, to, method: 'cash' }],
    ['invalid method empty', { from, to, method: '' }],
    ['invalid method CARD', { from, to, method: 'CARD' }],
    ['from before 2000', { from: '2000-01-01T07:59:59.999Z', to }],
    ['from inside the 2000 UTC gap', { from: '2000-01-01T00:00:00.000Z', to }],
    ['to equals from', { from, to: from }],
    ['to before from', { from, to: '2026-11-24T07:15:00.000Z' }],
    ['impossible date', { from: '2026-02-30T08:00:00.000Z', to }],
    ['offset input', { from: '2026-11-24T08:15:00-08:00', to }],
    ['hour 24', { from: '2026-11-24T24:00:00.000Z', to }],
    ['four fractional digits', { from: '2026-11-24T08:15:00.0000Z', to }],
    ['five fractional digits', { from: '2026-11-24T08:15:00.12345Z', to }],
    ['six fractional digits', { from: '2026-11-24T08:15:00.123456Z', to }],
    ['range over 366 days', { from: '2000-01-01T08:00:00.000Z', to: '2001-01-01T08:00:00.001Z' }],
    ['numeric limit', { from, to, limit: 20 }],
    ['limit 05', { from, to, limit: '05' }],
    ['limit +20', { from, to, limit: '+20' }],
    ['limit 20.0', { from, to, limit: '20.0' }],
    ['limit 5', { from, to, limit: '5' }],
    ['limit 100', { from, to, limit: '100' }],
    ['empty limit', { from, to, limit: '' }],
    ['empty cursor', { from, to, cursor: '' }],
    ['cursor padding', { from, to, cursor: 'abc==' }],
    ['cursor plus sign', { from, to, cursor: 'abc+def' }],
    ['cursor control character', { from, to, cursor: 'abc\n' }],
    ['cursor over 2048', { from, to, cursor: 'a'.repeat(2049) }],
  ])('rejects an invalid filter before HTTP: %s', (_name, filter) => {
    expect(() => buildNoMovementQuery(filter as never)).toThrow(/no es válido/);
  });

  test('accepts a 366-day boundary and rejects overflow without truncating', () => {
    expect(() =>
      buildNoMovementQuery({
        from: '2000-01-01T08:00:00.000Z',
        to: '2001-01-01T08:00:00.000Z',
      }),
    ).not.toThrow();
    expect(() =>
      buildNoMovementQuery({
        from: '2000-01-01T08:00:00.000Z',
        to: '2001-01-01T08:00:00.001Z',
      }),
    ).toThrow(/no es válido/);
  });

  test('rejects arrays and non-scalar values', () => {
    expect(() => buildNoMovementQuery({ from: [from], to } as never)).toThrow(/no es válido/);
    expect(() => buildNoMovementQuery({ from, to, method: ['CASH'] } as never)).toThrow(
      /no es válido/,
    );
    expect(() => buildNoMovementQuery({ from, to, limit: ['20'] } as never)).toThrow(/no es válido/);
    expect(() => buildNoMovementQuery({ from, to, cursor: ['cursor-1'] } as never)).toThrow(
      /no es válido/,
    );
  });

  test('rejects an invalid filter before any HTTP call', async () => {
    let calls = 0;
    server.use(
      http.get('/api/v1/admin/dashboard/no-movement-products', () => {
        calls += 1;
        return HttpResponse.json(withData(canonicalNoMovement));
      }),
    );
    await expect(getDashboardNoMovement({ from, to, limit: '100' as never })).rejects.toBeInstanceOf(
      TypeError,
    );
    expect(calls).toBe(0);
  });

  test('parses the canonical closed DTO with exact ids, microsecond alta and availability', () => {
    const result = parseDashboardNoMovement(withData(canonicalNoMovement), canonicalFilter);
    expect(result).toEqual(canonicalNoMovement);
    expect(result.items.map((item) => item.productId)).toEqual(['10', '12', '11']);
    expect(result.items[1]).toMatchObject({ isAvailable: false, createdAt: '2026-11-20T17:30:00.123456Z' });
    expect(result.totalNoMovementProducts).toBe('3');
    expect(result.page).toEqual({ limit: '20', nextCursor: null });
    expect(result.universe).toEqual({
      asOf: to,
      definition: canonicalNoMovement.universe.definition,
      includesUnavailable: true,
    });
  });

  test('parses a first full page and the final page with the same total', () => {
    const first = parseDashboardNoMovement(
      withData(noMovementForUrl(fixtureUrl(), manyNoMovementItems)),
      canonicalFilter,
    );
    expect(first.items).toHaveLength(20);
    expect(first.totalNoMovementProducts).toBe('25');
    expect(first.page.nextCursor).toBe(noMovementCursorFor(20));

    const second = parseDashboardNoMovement(
      withData(
        noMovementForUrl(
          fixtureUrl(`&cursor=${noMovementCursorFor(20)}`),
          manyNoMovementItems,
        ),
      ),
      canonicalFilter,
    );
    expect(second.items).toHaveLength(5);
    expect(second.totalNoMovementProducts).toBe('25');
    expect(second.page.nextCursor).toBeNull();
    expect([...first.items, ...second.items].map((item) => item.productId)).toEqual(
      manyNoMovementItems.map((item) => item.productId),
    );
  });

  test('echoes the effective limit, method and period', () => {
    const cashItems: NoMovementFixtureItem[] = [
      {
        productId: '7',
        name: 'Activo',
        category: { id: '2', name: 'Bebidas' },
        isAvailable: true,
        createdAt: '2026-11-20T17:30:00.123456Z',
      },
    ];
    const cash = parseDashboardNoMovement(
      withData(
        noMovementForUrl(
          `http://no-movement.fixture/?from=${from}&to=${to}&method=CASH&limit=10`,
          cashItems,
        ),
      ),
      { from, to, method: 'CASH', limit: '10' },
    );
    expect(cash.method).toBe('CASH');
    expect(cash.page.limit).toBe('10');
    expect(parseDashboardNoMovement(withData(canonicalNoMovement), canonicalFilter).method).toBeNull();
  });

  test('parses the zero state without inventing rows or a cursor', () => {
    const result = parseDashboardNoMovement(withData(zeroNoMovement), canonicalFilter);
    expect(result.items).toEqual([]);
    expect(result.totalNoMovementProducts).toBe('0');
    expect(result.page).toEqual({ limit: '20', nextCursor: null });
  });

  test('preserves ids and counts above 2^53 and more than 19 digits', () => {
    const result = parseDashboardNoMovement(withData(largeNoMovement), canonicalFilter);
    expect(result.items.map((item) => item.productId)).toEqual([
      '9007199254740993',
      '123456789012345678901',
    ]);
    expect(result.totalNoMovementProducts).toBe('2');
    expect(largeNoMovementItems[1].category.id).toBe('2');
  });

  test.each([
    ['root extra key', () => ({ data: canonicalNoMovement, extra: true })],
    ['data extra key', () => withData({ ...canonicalNoMovement, extra: true })],
    ['wrong currency', () => withData({ ...canonicalNoMovement, currency: 'USD' })],
    ['wrong time zone', () => withData({ ...canonicalNoMovement, period: { ...canonicalNoMovement.period, timeZone: 'UTC' } })],
    ['generatedAt with two decimals', () => withData({ ...canonicalNoMovement, generatedAt: '2026-11-24T18:30:00.00Z' })],
    ['generatedAt before the domain', () => withData({ ...canonicalNoMovement, generatedAt: '1999-12-31T23:59:59.999Z' })],
    ['period over 366 days', () => withData({
      ...canonicalNoMovement,
      period: {
        from: '2000-01-01T08:00:00.000Z',
        to: '2001-01-01T08:00:00.001Z',
        timeZone: 'America/Tijuana',
      },
    })],
    ['wrong method', () => withData({ ...canonicalNoMovement, method: 'CARD' })],
    ['wrong method echo', () => withData({ ...canonicalNoMovement, method: 'CASH' })],
    ['universe extra key', () => withData({ ...canonicalNoMovement, universe: { ...canonicalNoMovement.universe, extra: true } })],
    ['universe asOf differs from to', () => withData({ ...canonicalNoMovement, universe: { ...canonicalNoMovement.universe, asOf: '2026-11-25T07:00:00.000Z' } })],
    ['universe definition changed', () => withData({ ...canonicalNoMovement, universe: { ...canonicalNoMovement.universe, definition: 'other' } })],
    ['universe excludes unavailable', () => withData({ ...canonicalNoMovement, universe: { ...canonicalNoMovement.universe, includesUnavailable: false } })],
    ['total with leading zero', () => withData({ ...canonicalNoMovement, totalNoMovementProducts: '03' })],
    ['total negative', () => withData({ ...canonicalNoMovement, totalNoMovementProducts: '-1' })],
    ['total decimal', () => withData({ ...canonicalNoMovement, totalNoMovementProducts: '3.0' })],
    ['total as number', () => withData({ ...canonicalNoMovement, totalNoMovementProducts: 3 })],
    ['total smaller than the page', () => withData({ ...canonicalNoMovement, totalNoMovementProducts: '2' })],
    ['page extra key', () => withData({ ...canonicalNoMovement, page: { ...canonicalNoMovement.page, extra: true } })],
    ['page numeric limit', () => withData({ ...canonicalNoMovement, page: { ...canonicalNoMovement.page, limit: 20 } })],
    ['page limit 100', () => withData({ ...canonicalNoMovement, page: { ...canonicalNoMovement.page, limit: '100' } })],
    ['page limit echo mismatch', () => withData({ ...canonicalNoMovement, page: { ...canonicalNoMovement.page, limit: '10' } })],
    ['page cursor empty', () => withData({ ...canonicalNoMovement, page: { limit: '20', nextCursor: '' } })],
    ['page cursor padding', () => withData({ ...canonicalNoMovement, page: { limit: '20', nextCursor: 'abc==' } })],
    ['page cursor on an empty result', () => withData({ ...canonicalNoMovement, totalNoMovementProducts: '0', items: [], page: { limit: '20', nextCursor: 'cursor-1' } })],
    ['page cursor without a full page', () => withData({ ...canonicalNoMovement, page: { limit: '20', nextCursor: 'cursor-3' } })],
    ['items not an array', () => withData({ ...canonicalNoMovement, items: {} })],
    ['more items than the limit', () => withData({ ...manyNoMovement, page: { limit: '10', nextCursor: null } })],
    ['missing product id', () => mutate((value) => {
      delete (value.items[0] as Record<string, unknown>).productId;
    })],
    ['product id leading zero', () => mutate((value) => {
      value.items[0].productId = '010';
    })],
    ['product id zero', () => mutate((value) => {
      value.items[0].productId = '0';
    })],
    ['empty product name', () => mutate((value) => {
      value.items[0].name = '';
    })],
    ['product name over 160 characters', () => mutate((value) => {
      value.items[0].name = 'A'.repeat(161);
    })],
    ['item extra key', () => mutate((value) => {
      (value.items[0] as Record<string, unknown>).customer = 'Ana';
    })],
    ['category id zero', () => mutate((value) => {
      value.items[0].category.id = '0';
    })],
    ['category id leading zero', () => mutate((value) => {
      value.items[0].category.id = '03';
    })],
    ['empty category name', () => mutate((value) => {
      value.items[0].category.name = '';
    })],
    ['category name over 120 characters', () => mutate((value) => {
      value.items[0].category.name = 'A'.repeat(121);
    })],
    ['availability as string', () => mutate((value) => {
      (value.items[0] as Record<string, unknown>).isAvailable = 'true';
    })],
    ['createdAt with three decimals', () => mutate((value) => {
      value.items[0].createdAt = '2024-01-15T18:00:00.000Z';
    })],
    ['createdAt exactly at to', () => mutate((value) => {
      value.items[0].createdAt = '2026-11-25T08:00:00.000000Z';
    })],
    ['createdAt after to', () => mutate((value) => {
      value.items[0].createdAt = '2026-11-25T08:00:00.000001Z';
    })],
    ['unsorted names', () => mutate((value) => {
      const first = value.items[0];
      value.items[0] = value.items[1];
      value.items[1] = first;
    })],
  ])('rejects an unverifiable response: %s', (_name, body) => {
    expect(() => parseDashboardNoMovement(body(), canonicalFilter)).toThrow(
      UnverifiableNoMovementError,
    );
  });

  test('rejects duplicate ids and equal names without numeric productId order', () => {
    expect(
      mutate((value) => {
        value.items[1].productId = '10';
      }),
    ).toThrow(UnverifiableNoMovementError);

    expect(
      mutate((value) => {
        value.items = [
          { ...value.items[0], productId: '12', name: 'Café' },
          { ...value.items[0], productId: '10', name: 'Café' },
        ];
        value.totalNoMovementProducts = '2';
      }),
    ).toThrow(UnverifiableNoMovementError);
  });

  test('rejects a response for different effective filters', () => {
    expect(() =>
      parseDashboardNoMovement(withData(canonicalNoMovement), {
        from: '2026-11-24T08:00:00.001Z',
        to,
        limit: '20',
      }),
    ).toThrow(UnverifiableNoMovementError);
    expect(() =>
      parseDashboardNoMovement(withData(canonicalNoMovement), {
        from,
        to,
        method: 'STRIPE',
        limit: '20',
      }),
    ).toThrow(UnverifiableNoMovementError);
    expect(() =>
      parseDashboardNoMovement(withData(canonicalNoMovement), {
        from,
        to,
        limit: '10',
      }),
    ).toThrow(UnverifiableNoMovementError);
  });

  test('sends the exact filters and parses the response', async () => {
    const urls: string[] = [];
    server.use(
      http.get('/api/v1/admin/dashboard/no-movement-products', ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json(withData(canonicalNoMovement));
      }),
    );
    const result = await getDashboardNoMovement(canonicalFilter);
    expect(result).toEqual(canonicalNoMovement);
    const query = new URL(urls[0]).searchParams;
    expect(query.get('from')).toBe(from);
    expect(query.get('to')).toBe(to);
    expect(query.get('limit')).toBe('20');
    expect(query.has('method')).toBe(false);
    expect(query.has('cursor')).toBe(false);
  });

  test('sends the method and cursor when provided', async () => {
    const urls: string[] = [];
    server.use(
      http.get('/api/v1/admin/dashboard/no-movement-products', ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json(
          withData(
            noMovementForUrl(
              request.url,
              [largeNoMovementItems[0]],
            ),
          ),
        );
      }),
    );
    await getDashboardNoMovement({
      from,
      to,
      method: 'STRIPE',
      limit: '10',
      cursor: noMovementCursorFor(10),
    });
    const query = new URL(urls[0]).searchParams;
    expect(query.get('method')).toBe('STRIPE');
    expect(query.get('limit')).toBe('10');
    expect(query.get('cursor')).toBe(noMovementCursorFor(10));
  });

  test('formats API errors, network failures and never retries an error response', async () => {
    for (const status of [400, 401, 403, 413, 429, 500, 503]) {
      let calls = 0;
      server.use(
        http.get('/api/v1/admin/dashboard/no-movement-products', () => {
          calls += 1;
          return HttpResponse.json(
            { title: 'Error', status, code: status === 403 ? 'FORBIDDEN' : 'ERROR' },
            { status },
          );
        }),
      );
      await expect(getDashboardNoMovement(canonicalFilter)).rejects.toBeInstanceOf(ApiError);
      expect(calls).toBe(1);
    }

    server.use(
      http.get('/api/v1/admin/dashboard/no-movement-products', () => HttpResponse.error()),
    );
    await expect(getDashboardNoMovement(canonicalFilter)).rejects.toBeInstanceOf(ApiError);

    expect(formatNoMovementError(new ApiError(400, 'Solicitud'))).toMatch(/no es válido/);
    expect(formatNoMovementError(new ApiError(401, 'Sesión'))).toMatch(/sesión venció/);
    expect(formatNoMovementError(new ApiError(403, 'Permiso', { code: 'FORBIDDEN' }))).toMatch(
      /administración/,
    );
    expect(
      formatNoMovementError(new ApiError(403, 'NIP', { code: 'PIN_CHANGE_REQUIRED' })),
    ).toMatch(/cambiar tu NIP/);
    expect(
      formatNoMovementError(new ApiError(403, 'Origen', { code: 'ORIGIN_NOT_ALLOWED' })),
    ).toMatch(/origen/);
    expect(formatNoMovementError(new ApiError(413, 'Grande'))).toMatch(/demasiado grande/);
    expect(formatNoMovementError(new ApiError(429, 'Límite'))).toMatch(/Demasiadas/);
    expect(formatNoMovementError(new ApiError(500, 'Interno'))).toMatch(
      /No fue posible consultar/,
    );
    expect(formatNoMovementError(new ApiError(503, 'Servicio'))).toMatch(/no está disponible/);
    expect(formatNoMovementError(new ApiError(0, 'Red'))).toMatch(/no está disponible/);
    expect(formatNoMovementError(new DOMException('abort', 'AbortError'))).toMatch(/cancelada/);
    expect(formatNoMovementError(new UnverifiableNoMovementError())).toMatch(
      /no se puede verificar/,
    );
  });

  test('supports aborting a request without reporting a network error', async () => {
    server.use(
      http.get('/api/v1/admin/dashboard/no-movement-products', async () => {
        await delay(100);
        return HttpResponse.json(withData(canonicalNoMovement));
      }),
    );
    const controller = new AbortController();
    const request = getDashboardNoMovement(canonicalFilter, controller.signal);
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });
});

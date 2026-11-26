import { describe, expect, test } from 'vitest';
import { delay, HttpResponse, http } from 'msw';
import { ApiError } from '../../../../shared/api/client';
import { server } from '../../../../test/server';
import {
  amountBottomRanking,
  amountTopRanking,
  canonicalRanking,
  fallbackPeriod,
  largeRanking,
  literalOrderProductIds,
  literalOrderRanking,
  longNameRanking,
  over19DigitRanking,
  rankingWithoutOptional,
  snapshotRanking,
  tieRanking,
  topTenRanking,
  topTwentyRanking,
  unitsBottomRanking,
  zeroRanking,
} from '../../../../test/rankingFixture';
import {
  buildProductRankingQuery,
  formatProductRankingError,
  getProductRanking,
  parseProductRanking,
  UnverifiableProductRankingError,
  type ProductRankingFilter,
} from './rankingApi';

const from = fallbackPeriod.from;
const to = fallbackPeriod.to;
const canonicalFilter: ProductRankingFilter = { from, to, metric: 'units', direction: 'top' };

function withData(data: unknown): { data: unknown } {
  return { data };
}

describe('administrative product-ranking API adapter', () => {
  test('builds only the approved query parameters and normalizes instants', () => {
    const query = new URLSearchParams(
      buildProductRankingQuery({
        from: '2026-11-24T08:15:00Z',
        to,
        metric: 'units',
        direction: 'top',
      }).slice(1),
    );
    expect([...query.keys()]).toEqual(['from', 'to', 'metric', 'direction']);
    expect(query.get('from')).toBe('2026-11-24T08:15:00.000Z');
    expect(query.get('to')).toBe(to);
    expect(query.get('metric')).toBe('units');
    expect(query.get('direction')).toBe('top');
    expect(query.has('top')).toBe(false);
    expect(query.has('method')).toBe(false);

    const full = new URLSearchParams(
      buildProductRankingQuery({
        from,
        to,
        metric: 'amount',
        direction: 'bottom',
        top: '10',
        method: 'CASH',
      }).slice(1),
    );
    expect([...full.keys()]).toEqual(['from', 'to', 'metric', 'direction', 'top', 'method']);
    expect(full.get('top')).toBe('10');
    expect(full.get('method')).toBe('CASH');
  });

  test('omits the method when the UI value is ALL and keeps top as a string', () => {
    const query = new URLSearchParams(
      buildProductRankingQuery({
        from,
        to,
        metric: 'units',
        direction: 'top',
        top: '20',
        method: 'ALL',
      }).slice(1),
    );
    expect(query.has('method')).toBe(false);
    expect(query.get('top')).toBe('20');
  });

  test.each([
    ['no fraction', '2026-11-24T08:15:00Z', '2026-11-24T08:15:00.000Z'],
    ['one decimal', '2026-11-24T08:15:00.5Z', '2026-11-24T08:15:00.500Z'],
    ['two decimals', '2026-11-24T08:15:00.25Z', '2026-11-24T08:15:00.250Z'],
    ['three decimals', '2026-11-24T08:15:00.125Z', '2026-11-24T08:15:00.125Z'],
  ])('accepts and normalizes %s input instants', (_name, input, normalized) => {
    const query = new URLSearchParams(
      buildProductRankingQuery({ from: input, to, metric: 'units', direction: 'top' }).slice(1),
    );
    expect(query.get('from')).toBe(normalized);
  });

  test.each([
    ['missing metric', { from, to, direction: 'top' }],
    ['missing direction', { from, to, metric: 'units' }],
    ['invalid metric', { from, to, metric: 'amounts', direction: 'top' }],
    ['invalid direction', { from, to, metric: 'units', direction: 'asc' }],
    ['invalid method', { from, to, metric: 'units', direction: 'top', method: 'CARD' }],
    ['extra key', { from, to, metric: 'units', direction: 'top', category: '1' }],
    ['from before 2000', { from: '2000-01-01T07:59:59.999Z', to, metric: 'units', direction: 'top' }],
    ['from inside 2000 UTC gap', { from: '2000-01-01T00:00:00.000Z', to, metric: 'units', direction: 'top' }],
    ['to equals from', { from, to: from, metric: 'units', direction: 'top' }],
    ['to before from', { from, to: '2026-11-24T07:15:00.000Z', metric: 'units', direction: 'top' }],
    ['impossible date', { from: '2026-02-30T08:00:00.000Z', to, metric: 'units', direction: 'top' }],
    ['offset input', { from: '2026-11-24T08:15:00-08:00', to, metric: 'units', direction: 'top' }],
    ['hour 24', { from: '2026-11-24T24:00:00.000Z', to, metric: 'units', direction: 'top' }],
    ['four fractional digits', { from: '2026-11-24T08:15:00.0000Z', to, metric: 'units', direction: 'top' }],
    ['five fractional digits', { from: '2026-11-24T08:15:00.12345Z', to, metric: 'units', direction: 'top' }],
    ['six fractional digits', { from: '2026-11-24T08:15:00.123456Z', to, metric: 'units', direction: 'top' }],
    ['range over 366 days', { from: '2000-01-01T08:00:00.000Z', to: '2001-01-01T08:00:00.001Z', metric: 'units', direction: 'top' }],
    ['numeric top', { from, to, metric: 'units', direction: 'top', top: 5 }],
    ['top 05', { from, to, metric: 'units', direction: 'top', top: '05' }],
    ['top +5', { from, to, metric: 'units', direction: 'top', top: '+5' }],
    ['top 5.0', { from, to, metric: 'units', direction: 'top', top: '5.0' }],
    ['top 0', { from, to, metric: 'units', direction: 'top', top: '0' }],
    ['top 4', { from, to, metric: 'units', direction: 'top', top: '4' }],
    ['top 21', { from, to, metric: 'units', direction: 'top', top: '21' }],
    ['empty method', { from, to, metric: 'units', direction: 'top', method: '' }],
  ])('rejects an invalid filter: %s', (_name, filter) => {
    expect(() => buildProductRankingQuery(filter as never)).toThrow(/no es válido/);
  });

  test('rejects arrays, non-scalar values and a 366-day boundary overflow', () => {
    expect(() =>
      buildProductRankingQuery({ from: [from], to, metric: 'units', direction: 'top' } as never),
    ).toThrow(/no es válido/);
    expect(() =>
      buildProductRankingQuery({ from, to, metric: ['units'], direction: 'top' } as never),
    ).toThrow(/no es válido/);
    expect(() =>
      buildProductRankingQuery({ from, to, metric: 'units', direction: 'top', method: ['CASH'] } as never),
    ).toThrow(/no es válido/);
    expect(() =>
      buildProductRankingQuery({
        from: '2000-01-01T08:00:00.000Z',
        to: '2001-01-01T08:00:00.000Z',
        metric: 'units',
        direction: 'top',
      }),
    ).not.toThrow();
  });

  test('rejects an invalid filter before any HTTP call', async () => {
    let calls = 0;
    server.use(
      http.get('/api/v1/admin/dashboard/product-ranking', () => {
        calls += 1;
        return HttpResponse.json(withData(canonicalRanking));
      }),
    );
    await expect(
      getProductRanking({ from, to, metric: 'units', direction: 'top', top: '05' as never }),
    ).rejects.toBeInstanceOf(TypeError);
    expect(calls).toBe(0);
  });

  test('parses the canonical ranking with exact ids, amounts and optional fields', () => {
    const result = parseProductRanking(withData(canonicalRanking), canonicalFilter);
    expect(result).toEqual(canonicalRanking);
    expect(result.items[0].productId).toBe('10');
    expect(result.items[2].nameSource).toBe('snapshot');
    expect(result.matchedTotals).toEqual({ unitsSold: '12', totalCents: '34500' });
  });

  test('parses both metrics and both directions without grouping by name', () => {
    expect(
      parseProductRanking(withData(amountTopRanking), {
        from,
        to,
        metric: 'amount',
        direction: 'top',
      }).items.map((item) => item.productId),
    ).toEqual(['12', '11', '10', '9', '8']);

    const unitsBottom = parseProductRanking(withData(unitsBottomRanking), {
      from,
      to,
      metric: 'units',
      direction: 'bottom',
    });
    expect(unitsBottom.items.map((item) => item.productId)).toEqual(['201', '202', '203']);

    const amountBottom = parseProductRanking(withData(amountBottomRanking), {
      from,
      to,
      metric: 'amount',
      direction: 'bottom',
    });
    expect(amountBottom.items.map((item) => item.productId)).toEqual(['201', '202', '203']);
    expect(amountBottom.items[0]).toMatchObject({ unitsSold: '1', totalCents: '0' });
  });

  test('parses top 10 and top 20 with complete totals before the cut', () => {
    const ten = parseProductRanking(withData(topTenRanking), {
      from,
      to,
      metric: 'units',
      direction: 'top',
      top: '10',
    });
    expect(ten.items).toHaveLength(10);
    expect(ten.matchedProductCount).toBe('12');
    expect(ten.matchedTotals).toEqual({ unitsSold: '78', totalCents: '7800' });
    expect(ten.truncated).toBe(true);

    const twenty = parseProductRanking(withData(topTwentyRanking), {
      from,
      to,
      metric: 'units',
      direction: 'top',
      top: '20',
    });
    expect(twenty.items).toHaveLength(12);
    expect(twenty.truncated).toBe(false);
  });

  test('parses the literal D07 order vector without reusing the fixture sorter (R-2)', () => {
    // `literalOrderRanking` is hand-authored in `rankingFixture.ts`; its expected
    // order is hardcoded in `literalOrderProductIds` instead of being produced by
    // the fixture comparator, so this assertion is independent of that sorter.
    const result = parseProductRanking(withData(literalOrderRanking), {
      from,
      to,
      metric: 'units',
      direction: 'top',
      top: '5',
      method: 'CASH',
    });
    expect(result.items.map((item) => item.productId)).toEqual([...literalOrderProductIds]);
    expect(result.items.map((item) => item.name)).toEqual(['Beta', 'Zeta', 'Café', 'Café', 'Ávila']);
    expect(result.items.map((item) => item.position)).toEqual(['1', '2', '3', '4', '5']);
    expect(result.method).toBe('CASH');
    expect(result.matchedTotals).toEqual({ unitsSold: '20', totalCents: '25000' });
  });

  test('parses equal names, ties, accents and snapshot names deterministically', () => {
    const ties = parseProductRanking(withData(tieRanking), {
      from,
      to,
      metric: 'units',
      direction: 'top',
      top: '10',
    });
    expect(ties.items.map((item) => item.productId)).toEqual(['10', '12', '11', '13']);
    expect(ties.items[0].name).toBe('Café');
    expect(ties.items[1].name).toBe('Café');

    const snapshots = parseProductRanking(withData(snapshotRanking), canonicalFilter);
    expect(snapshots.items[0].nameSource).toBe('snapshot');
    expect(snapshots.items[1].nameSource).toBe('current');
  });

  test('parses rankings without optional position and nameSource', () => {
    const result = parseProductRanking(withData(rankingWithoutOptional), canonicalFilter);
    expect(result.items).toHaveLength(3);
    expect(result.items.every((item) => item.position === undefined)).toBe(true);
    expect(result.items.every((item) => item.nameSource === undefined)).toBe(true);
  });

  test('rejects a row with unitsSold = 0 because the contract excludes products without movement (R-1)', () => {
    // Accepted E2 contract (D05/R03/R04): `bottom` excludes products without
    // movement (`unitsSold = 0`) and never pads the top with zero rows. The panel
    // relies on that guarantee and renders the received rows unchanged, so this
    // adapter keeps rejecting `unitsSold: "0"` instead of relaxing the DTO.
    expect(() =>
      parseProductRanking(
        withData({
          ...unitsBottomRanking,
          matchedProductCount: '3',
          matchedTotals: { unitsSold: '9', totalCents: '8000' },
          items: [
            { ...unitsBottomRanking.items[0], unitsSold: '0' },
            ...unitsBottomRanking.items.slice(1),
          ],
        }),
        { from, to, metric: 'units', direction: 'bottom' },
      ),
    ).toThrow(UnverifiableProductRankingError);
  });

  test('parses the zero ranking without inventing rows', () => {
    const result = parseProductRanking(withData(zeroRanking), canonicalFilter);
    expect(result.items).toEqual([]);
    expect(result.matchedProductCount).toBe('0');
    expect(result.matchedTotals).toEqual({ unitsSold: '0', totalCents: '0' });
    expect(result.truncated).toBe(false);
  });

  test('preserves values above 2^53 and more than 19 digits as exact strings', () => {
    const large = parseProductRanking(withData(largeRanking), {
      from,
      to,
      metric: 'amount',
      direction: 'top',
    });
    expect(large.items[0].productId).toBe('9007199254740993');
    expect(large.matchedTotals.unitsSold).toBe('9007199254740995');
    expect(large.matchedTotals.totalCents).toBe('9007199254740999');

    const over19 = parseProductRanking(withData(over19DigitRanking), {
      from,
      to,
      metric: 'amount',
      direction: 'top',
    });
    expect(over19.items[0].productId).toBe('123456789012345678901');
    expect(over19.matchedTotals.totalCents).toBe('123456789012345678905');
  });

  test('accepts a name of exactly 160 characters', () => {
    expect(() =>
      parseProductRanking(withData(longNameRanking), {
        from,
        to,
        metric: 'amount',
        direction: 'top',
      }),
    ).not.toThrow();
  });

  test.each([
    ['root extra key', { data: canonicalRanking, extra: true }],
    ['data extra key', withData({ ...canonicalRanking, extra: true })],
    ['wrong currency', withData({ ...canonicalRanking, currency: 'USD' })],
    ['wrong time zone', withData({ ...canonicalRanking, period: { ...canonicalRanking.period, timeZone: 'UTC' } })],
    ['generatedAt with two decimals', withData({ ...canonicalRanking, generatedAt: '2026-11-24T18:30:00.00Z' })],
    ['generatedAt before the domain', withData({ ...canonicalRanking, generatedAt: '1999-12-31T23:59:59.999Z' })],
    ['period mismatch', withData({ ...canonicalRanking, period: { ...canonicalRanking.period, from: '2026-11-24T08:00:00.001Z' } })],
    ['period over 366 days', withData({
      ...canonicalRanking,
      period: {
        from: '2000-01-01T08:00:00.000Z',
        to: '2001-01-01T08:00:00.001Z',
        timeZone: 'America/Tijuana',
      },
    })],
    ['wrong metric echo', withData({ ...canonicalRanking, metric: 'amount' })],
    ['wrong direction echo', withData({ ...canonicalRanking, direction: 'bottom' })],
    ['wrong top echo', withData({ ...canonicalRanking, top: '10' })],
    ['wrong top shape', withData({ ...canonicalRanking, top: '05' })],
    ['numeric top', withData({ ...canonicalRanking, top: 5 })],
    ['wrong method echo', withData({ ...canonicalRanking, method: 'CASH' })],
    ['count mismatch', withData({ ...canonicalRanking, matchedProductCount: '4' })],
    ['count with leading zero', withData({ ...canonicalRanking, matchedProductCount: '03' })],
    ['truncated mismatch', withData({ ...canonicalRanking, truncated: true })],
    ['duplicate product ids', withData({
      ...canonicalRanking,
      matchedProductCount: '2',
      matchedTotals: { unitsSold: '9', totalCents: '26000' },
      items: [canonicalRanking.items[0], { ...canonicalRanking.items[1], productId: '10' }],
    })],
    ['zero units', withData({
      ...canonicalRanking,
      items: [{ ...canonicalRanking.items[0], unitsSold: '0' }, ...canonicalRanking.items.slice(1)],
    })],
    ['leading-zero units', withData({
      ...canonicalRanking,
      items: [{ ...canonicalRanking.items[0], unitsSold: '06' }, ...canonicalRanking.items.slice(1)],
    })],
    ['leading-zero product id', withData({
      ...canonicalRanking,
      items: [{ ...canonicalRanking.items[0], productId: '010' }, ...canonicalRanking.items.slice(1)],
    })],
    ['extra item key', withData({
      ...canonicalRanking,
      items: [{ ...canonicalRanking.items[0], customer: 'Ana' }, ...canonicalRanking.items.slice(1)],
    })],
    ['position gap', withData({
      ...canonicalRanking,
      items: [canonicalRanking.items[0], { ...canonicalRanking.items[1], position: '3' }, canonicalRanking.items[2]],
    })],
    ['mixed positions', withData({
      ...canonicalRanking,
      items: [canonicalRanking.items[0], { ...canonicalRanking.items[1], position: undefined }, canonicalRanking.items[2]],
    })],
    ['empty name', withData({
      ...canonicalRanking,
      items: [{ ...canonicalRanking.items[0], name: '' }, ...canonicalRanking.items.slice(1)],
    })],
    ['name over 160 characters', withData({
      ...canonicalRanking,
      items: [{ ...canonicalRanking.items[0], name: 'A'.repeat(161) }, ...canonicalRanking.items.slice(1)],
    })],
    ['invalid nameSource', withData({
      ...canonicalRanking,
      items: [{ ...canonicalRanking.items[0], nameSource: 'archived' }, ...canonicalRanking.items.slice(1)],
    })],
    ['unsorted primary metric', withData({
      ...canonicalRanking,
      items: [canonicalRanking.items[1], canonicalRanking.items[0], canonicalRanking.items[2]],
    })],
    ['unsorted byte name order', withData({
      ...tieRanking,
      items: [tieRanking.items[0], tieRanking.items[1], tieRanking.items[3], tieRanking.items[2]],
    })],
    ['totals mismatch without truncation', withData({
      ...canonicalRanking,
      matchedTotals: { unitsSold: '13', totalCents: '34500' },
    })],
    ['visible rows exceed totals', withData({
      ...canonicalRanking,
      matchedTotals: { unitsSold: '1', totalCents: '1' },
    })],
    ['zero count with rows', withData({
      ...canonicalRanking,
      matchedProductCount: '0',
      matchedTotals: { unitsSold: '0', totalCents: '0' },
    })],
    ['invalid item count string', withData({ ...canonicalRanking, matchedProductCount: '3.0' })],
    ['negative total', withData({
      ...canonicalRanking,
      matchedTotals: { unitsSold: '12', totalCents: '-1' },
    })],
  ])('rejects an unverifiable response: %s', (_name, body) => {
    expect(() => parseProductRanking(body, canonicalFilter)).toThrow(
      UnverifiableProductRankingError,
    );
  });

  test('rejects a response for different filters', () => {
    expect(() =>
      parseProductRanking(withData(canonicalRanking), {
        from: '2026-11-24T08:00:00.001Z',
        to,
        metric: 'units',
        direction: 'top',
      }),
    ).toThrow(UnverifiableProductRankingError);
    expect(() =>
      parseProductRanking(withData(canonicalRanking), { ...canonicalFilter, metric: 'amount' }),
    ).toThrow(UnverifiableProductRankingError);
    expect(() =>
      parseProductRanking(withData(canonicalRanking), { ...canonicalFilter, top: '10' }),
    ).toThrow(UnverifiableProductRankingError);
    expect(() =>
      parseProductRanking(withData(canonicalRanking), { ...canonicalFilter, method: 'STRIPE' }),
    ).toThrow(UnverifiableProductRankingError);
  });

  test('sends the exact filters and parses the response', async () => {
    const urls: string[] = [];
    server.use(
      http.get('/api/v1/admin/dashboard/product-ranking', ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json(withData(canonicalRanking));
      }),
    );
    const result = await getProductRanking(canonicalFilter);
    expect(result).toEqual(canonicalRanking);
    const query = new URL(urls[0]).searchParams;
    expect(query.get('from')).toBe(from);
    expect(query.get('to')).toBe(to);
    expect(query.get('metric')).toBe('units');
    expect(query.get('direction')).toBe('top');
    expect(query.has('top')).toBe(false);
    expect(query.has('method')).toBe(false);
  });

  test('formats API errors, network failures and never retries an error response', async () => {
    for (const status of [400, 401, 403, 413, 429, 500, 503]) {
      let calls = 0;
      server.use(
        http.get('/api/v1/admin/dashboard/product-ranking', () => {
          calls += 1;
          return HttpResponse.json(
            { title: 'Error', status, code: status === 403 ? 'FORBIDDEN' : 'ERROR' },
            { status },
          );
        }),
      );
      await expect(getProductRanking(canonicalFilter)).rejects.toBeInstanceOf(ApiError);
      expect(calls).toBe(1);
    }

    server.use(
      http.get('/api/v1/admin/dashboard/product-ranking', () => HttpResponse.error()),
    );
    await expect(getProductRanking(canonicalFilter)).rejects.toBeInstanceOf(ApiError);

    expect(formatProductRankingError(new ApiError(400, 'Solicitud'))).toMatch(/no es válido/);
    expect(formatProductRankingError(new ApiError(401, 'Sesión'))).toMatch(/sesión venció/);
    expect(formatProductRankingError(new ApiError(403, 'Permiso', { code: 'FORBIDDEN' }))).toMatch(/administración/);
    expect(formatProductRankingError(new ApiError(403, 'NIP', { code: 'PIN_CHANGE_REQUIRED' }))).toMatch(/cambiar tu NIP/);
    expect(formatProductRankingError(new ApiError(403, 'Origen', { code: 'ORIGIN_NOT_ALLOWED' }))).toMatch(/origen/);
    expect(formatProductRankingError(new ApiError(413, 'Grande'))).toMatch(/demasiado grande/);
    expect(formatProductRankingError(new ApiError(429, 'Límite'))).toMatch(/Demasiadas/);
    expect(formatProductRankingError(new ApiError(500, 'Interno'))).toMatch(/No fue posible consultar/);
    expect(formatProductRankingError(new ApiError(503, 'Servicio'))).toMatch(/no está disponible/);
    expect(formatProductRankingError(new ApiError(0, 'Red'))).toMatch(/no está disponible/);
    expect(formatProductRankingError(new DOMException('abort', 'AbortError'))).toMatch(/cancelada/);
    expect(formatProductRankingError(new UnverifiableProductRankingError())).toMatch(/no se puede verificar/);
  });

  test('supports aborting a ranking request without reporting a network error', async () => {
    server.use(
      http.get('/api/v1/admin/dashboard/product-ranking', async () => {
        await delay(100);
        return HttpResponse.json(withData(canonicalRanking));
      }),
    );
    const controller = new AbortController();
    const request = getProductRanking(canonicalFilter, controller.signal);
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });
});

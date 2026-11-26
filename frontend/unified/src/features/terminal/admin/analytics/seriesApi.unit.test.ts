import { describe, expect, test } from 'vitest';
import { delay, HttpResponse, http } from 'msw';
import { ApiError } from '../../../../shared/api/client';
import { server } from '../../../../test/server';
import { salesSeriesForUrl } from '../../../../test/seriesFixture';
import {
  buildSalesSeriesQuery,
  formatSalesSeriesError,
  getSalesSeries,
  parseSalesSeries,
  UnverifiableSalesSeriesError,
} from './seriesApi';

const from = '2026-11-24T08:15:00.000Z';
const to = '2026-11-24T09:15:00.000Z';

const partial = {
  generatedAt: '2026-11-24T18:30:00.000Z',
  currency: 'MXN',
  period: { from, to, timeZone: 'America/Tijuana' },
  method: null,
  granularity: 'hour',
  bucketCount: '2',
  totals: { totalCents: '8500', ticketCount: '2', unitsSold: '3' },
  buckets: [
    {
      start: '2026-11-24T08:00:00.000Z',
      end: '2026-11-24T09:00:00.000Z',
      localStart: '2026-11-24T00:00:00-08:00',
      effectiveFrom: '2026-11-24T08:15:00.000Z',
      effectiveTo: '2026-11-24T09:00:00.000Z',
      partial: true,
      totalCents: '4000',
      ticketCount: '1',
      unitsSold: '2',
    },
    {
      start: '2026-11-24T09:00:00.000Z',
      end: '2026-11-24T10:00:00.000Z',
      localStart: '2026-11-24T01:00:00-08:00',
      effectiveFrom: '2026-11-24T09:00:00.000Z',
      effectiveTo: '2026-11-24T09:15:00.000Z',
      partial: true,
      totalCents: '4500',
      ticketCount: '1',
      unitsSold: '1',
    },
  ],
};

const zero = {
  generatedAt: '2026-11-24T18:30:00.000Z',
  currency: 'MXN',
  period: {
    from: '2026-11-24T08:00:00.000Z',
    to: '2026-11-24T09:00:00.000Z',
    timeZone: 'America/Tijuana',
  },
  method: 'CASH',
  granularity: 'hour',
  bucketCount: '1',
  totals: { totalCents: '0', ticketCount: '0', unitsSold: '0' },
  buckets: [
    {
      start: '2026-11-24T08:00:00.000Z',
      end: '2026-11-24T09:00:00.000Z',
      localStart: '2026-11-24T00:00:00-08:00',
      effectiveFrom: '2026-11-24T08:00:00.000Z',
      effectiveTo: '2026-11-24T09:00:00.000Z',
      partial: false,
      totalCents: '0',
      ticketCount: '0',
      unitsSold: '0',
    },
  ],
};

const minBoundary = {
  generatedAt: '2000-01-01T08:00:00.000Z',
  currency: 'MXN',
  period: {
    from: '2000-01-01T08:00:00.000Z',
    to: '2000-01-01T09:00:00.000Z',
    timeZone: 'America/Tijuana',
  },
  method: null,
  granularity: 'hour',
  bucketCount: '1',
  totals: { totalCents: '0', ticketCount: '0', unitsSold: '0' },
  buckets: [
    {
      start: '2000-01-01T08:00:00.000Z',
      end: '2000-01-01T09:00:00.000Z',
      localStart: '2000-01-01T00:00:00-08:00',
      effectiveFrom: '2000-01-01T08:00:00.000Z',
      effectiveTo: '2000-01-01T09:00:00.000Z',
      partial: false,
      totalCents: '0',
      ticketCount: '0',
      unitsSold: '0',
    },
  ],
};

const fallDst = {
  generatedAt: '2026-11-24T18:30:00.000Z',
  currency: 'MXN',
  period: {
    from: '2026-11-01T08:00:00.000Z',
    to: '2026-11-01T10:00:00.000Z',
    timeZone: 'America/Tijuana',
  },
  method: null,
  granularity: 'hour',
  bucketCount: '2',
  totals: { totalCents: '300', ticketCount: '2', unitsSold: '2' },
  buckets: [
    {
      start: '2026-11-01T08:00:00.000Z',
      end: '2026-11-01T09:00:00.000Z',
      localStart: '2026-11-01T01:00:00-07:00',
      effectiveFrom: '2026-11-01T08:00:00.000Z',
      effectiveTo: '2026-11-01T09:00:00.000Z',
      partial: false,
      totalCents: '100',
      ticketCount: '1',
      unitsSold: '1',
    },
    {
      start: '2026-11-01T09:00:00.000Z',
      end: '2026-11-01T10:00:00.000Z',
      localStart: '2026-11-01T01:00:00-08:00',
      effectiveFrom: '2026-11-01T09:00:00.000Z',
      effectiveTo: '2026-11-01T10:00:00.000Z',
      partial: false,
      totalCents: '200',
      ticketCount: '1',
      unitsSold: '1',
    },
  ],
};

const springDay = {
  generatedAt: '2026-03-08T18:30:00.000Z',
  currency: 'MXN',
  period: {
    from: '2026-03-08T08:00:00.000Z',
    to: '2026-03-09T07:00:00.000Z',
    timeZone: 'America/Tijuana',
  },
  method: 'STRIPE',
  granularity: 'day',
  bucketCount: '1',
  totals: { totalCents: '9007199254740995', ticketCount: '1', unitsSold: '2' },
  buckets: [
    {
      start: '2026-03-08T08:00:00.000Z',
      end: '2026-03-09T07:00:00.000Z',
      localStart: '2026-03-08T00:00:00-08:00',
      effectiveFrom: '2026-03-08T08:00:00.000Z',
      effectiveTo: '2026-03-09T07:00:00.000Z',
      partial: false,
      totalCents: '9007199254740995',
      ticketCount: '1',
      unitsSold: '2',
    },
  ],
};

function withData(data: Record<string, unknown>): { data: unknown } {
  return { data };
}

describe('administrative sales-series API adapter', () => {
  test('builds only the approved query parameters and normalizes instants', () => {
    const query = new URLSearchParams(
      buildSalesSeriesQuery({
        from: '2026-11-24T08:15:00Z',
        to,
        granularity: 'hour',
      }).slice(1),
    );
    expect([...query.keys()]).toEqual(['from', 'to', 'granularity']);
    expect(query.get('from')).toBe('2026-11-24T08:15:00.000Z');
    expect(query.get('to')).toBe(to);
    expect(query.get('granularity')).toBe('hour');

    const cash = new URLSearchParams(
      buildSalesSeriesQuery({ from, to, granularity: 'hour', method: 'CASH' }).slice(1),
    );
    expect([...cash.keys()]).toEqual(['from', 'to', 'granularity', 'method']);
    expect(cash.get('method')).toBe('CASH');

    const day = new URLSearchParams(
      buildSalesSeriesQuery({ from: '2026-03-08T08:00:00.000Z', to: '2026-03-09T07:00:00.000Z', granularity: 'day' }).slice(1),
    );
    expect(day.get('granularity')).toBe('day');
  });

  test.each([
    ['no fraction', '2026-11-24T08:15:00Z', '2026-11-24T08:15:00.000Z'],
    ['one decimal', '2026-11-24T08:15:00.5Z', '2026-11-24T08:15:00.500Z'],
    ['two decimals', '2026-11-24T08:15:00.25Z', '2026-11-24T08:15:00.250Z'],
    ['three decimals', '2026-11-24T08:15:00.125Z', '2026-11-24T08:15:00.125Z'],
  ])('accepts and normalizes %s input instants', (_name, input, normalized) => {
    const query = new URLSearchParams(
      buildSalesSeriesQuery({ from: input, to, granularity: 'hour' }).slice(1),
    );
    expect(query.get('from')).toBe(normalized);
    expect(query.get('to')).toBe(to);
  });

  test.each([
    ['missing granularity', { from, to }],
    ['invalid granularity', { from, to, granularity: 'week' }],
    ['invalid method', { from, to, granularity: 'hour', method: 'ALL' }],
    ['extra key', { from, to, granularity: 'hour', metric: 'units' }],
    ['from before 2000', { from: '2000-01-01T07:59:59.999Z', to, granularity: 'hour' }],
    ['from inside 2000 UTC gap', { from: '2000-01-01T00:00:00.000Z', to, granularity: 'hour' }],
    ['to equals from', { from, to: from, granularity: 'hour' }],
    ['to before from', { from, to: '2026-11-24T07:15:00.000Z', granularity: 'hour' }],
    ['impossible date', { from: '2026-02-30T08:00:00.000Z', to, granularity: 'hour' }],
    ['four fractional digits', { from: '2026-11-24T08:15:00.0000Z', to, granularity: 'hour' }],
    ['five fractional digits', { from: '2026-11-24T08:15:00.12345Z', to, granularity: 'hour' }],
    ['six fractional digits', { from: '2026-11-24T08:15:00.123456Z', to, granularity: 'hour' }],
    ['hour range over 744h', { from: '2000-01-01T08:00:00.000Z', to: '2000-02-01T09:00:00.000Z', granularity: 'hour' }],
    ['day range over 366 days', { from: '2000-01-01T08:00:00.000Z', to: '2001-01-02T09:00:00.000Z', granularity: 'day' }],
  ])('rejects an invalid filter: %s', (_name, filter) => {
    expect(() => buildSalesSeriesQuery(filter as never)).toThrow(/no es válido/);
  });

  test('rejects arrays and non-scalar values instead of coercing them', () => {
    expect(() =>
      buildSalesSeriesQuery({ from: [from], to, granularity: 'hour' } as never),
    ).toThrow(/no es válido/);
    expect(() =>
      buildSalesSeriesQuery({ from, to, granularity: ['hour'] } as never),
    ).toThrow(/no es válido/);
    expect(() =>
      buildSalesSeriesQuery({ from, to, granularity: 'hour', method: ['CASH'] } as never),
    ).toThrow(/no es válido/);
    expect(() => parseSalesSeries({ data: { ...partial, buckets: {} } })).toThrow(
      UnverifiableSalesSeriesError,
    );
  });

  test('accepts 745 hour buckets and enforces the 746/369 guards before parsing', () => {
    const hourUrl =
      'http://local/?from=2026-01-01T00:30:00.000Z&to=2026-02-01T00:30:00.000Z&granularity=hour';
    const hourSeries = salesSeriesForUrl(hourUrl);
    expect(hourSeries.buckets).toHaveLength(745);
    expect(() =>
      parseSalesSeries(
        { data: hourSeries },
        {
          from: '2026-01-01T00:30:00.000Z',
          to: '2026-02-01T00:30:00.000Z',
          granularity: 'hour',
        },
      ),
    ).not.toThrow();
    expect(() =>
      parseSalesSeries(
        {
          data: {
            ...hourSeries,
            bucketCount: '746',
            buckets: [...hourSeries.buckets, hourSeries.buckets[0]],
          },
        },
        {
          from: '2026-01-01T00:30:00.000Z',
          to: '2026-02-01T00:30:00.000Z',
          granularity: 'hour',
        },
      ),
    ).toThrow(UnverifiableSalesSeriesError);

    const dayUrl =
      'http://local/?from=2026-01-01T08:00:00.000Z&to=2026-01-02T08:00:00.000Z&granularity=day';
    const daySeries = salesSeriesForUrl(dayUrl);
    expect(() =>
      parseSalesSeries(
        {
          data: {
            ...daySeries,
            bucketCount: '369',
            buckets: Array.from({ length: 369 }, () => daySeries.buckets[0]),
          },
        },
        {
          from: '2026-01-01T08:00:00.000Z',
          to: '2026-01-02T08:00:00.000Z',
          granularity: 'day',
        },
      ),
    ).toThrow(UnverifiableSalesSeriesError);
  });

  test('parses partial buckets and sends the exact filters', async () => {
    const urls: string[] = [];
    server.use(
      http.get('/api/v1/admin/dashboard/sales-series', ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json(withData(partial));
      }),
    );
    const result = await getSalesSeries({ from, to, granularity: 'hour' });
    expect(result).toEqual(partial);
    const query = new URL(urls[0]).searchParams;
    expect(query.get('from')).toBe(from);
    expect(query.get('to')).toBe(to);
    expect(query.get('granularity')).toBe('hour');
    expect(query.has('method')).toBe(false);
  });

  test('accepts a zero series, buckets with no sales, and a method echo', () => {
    expect(parseSalesSeries(withData(zero), { from: zero.period.from, to: zero.period.to, granularity: 'hour', method: 'CASH' })).toEqual(zero);
  });

  test('accepts both repeated 01:00 buckets in the fall DST transition', () => {
    const result = parseSalesSeries(withData(fallDst), {
      from: fallDst.period.from,
      to: fallDst.period.to,
      granularity: 'hour',
    });
    expect(result.buckets.map((bucket) => bucket.localStart)).toEqual([
      '2026-11-01T01:00:00-07:00',
      '2026-11-01T01:00:00-08:00',
    ]);
    expect(result.totals.totalCents).toBe('300');
  });

  test('accepts the 23-hour spring day and large exact integers without Number', () => {
    const result = parseSalesSeries(withData(springDay), {
      from: springDay.period.from,
      to: springDay.period.to,
      granularity: 'day',
      method: 'STRIPE',
    });
    expect(result.totals.totalCents).toBe('9007199254740995');
    expect(Date.parse(result.buckets[0].end) - Date.parse(result.buckets[0].start)).toBe(23 * 60 * 60 * 1000);
  });

  test('accepts the minimum domain instant semantically, not only by year pattern', () => {
    expect(parseSalesSeries(withData(minBoundary))).toEqual(minBoundary);
  });

  test.each([
    ['generatedAt 1 ms before the minimum', { generatedAt: '2000-01-01T07:59:59.999Z' }],
    ['generatedAt in the first hours of 2000', { generatedAt: '2000-01-01T00:00:00.000Z' }],
    ['period.from in the first hours of 2000', { period: { ...minBoundary.period, from: '2000-01-01T07:59:59.999Z' } }],
    ['bucket start in the first hours of 2000', {
      buckets: [{ ...minBoundary.buckets[0], start: '2000-01-01T07:00:00.000Z', end: '2000-01-01T08:00:00.000Z' }],
    }],
    ['bucket end before the minimum', {
      buckets: [{ ...minBoundary.buckets[0], end: '2000-01-01T07:59:59.999Z' }],
    }],
    ['effective start before the minimum', {
      buckets: [{ ...minBoundary.buckets[0], effectiveFrom: '2000-01-01T07:00:00.000Z' }],
    }],
  ])('rejects a DTO below the minimum domain: %s', (_name, override) => {
    expect(() =>
      parseSalesSeries(withData({ ...minBoundary, ...override })),
    ).toThrow(UnverifiableSalesSeriesError);
  });

  function daySeries(
    from: string,
    to: string,
    start: string,
    end: string,
    localStart: string,
  ) {
    return withData({
      generatedAt: '2026-11-24T18:30:00.000Z',
      currency: 'MXN',
      period: { from, to, timeZone: 'America/Tijuana' },
      method: null,
      granularity: 'day',
      bucketCount: '1',
      totals: { totalCents: '0', ticketCount: '0', unitsSold: '0' },
      buckets: [
        {
          start,
          end,
          localStart,
          effectiveFrom: from,
          effectiveTo: to,
          partial: false,
          totalCents: '0',
          ticketCount: '0',
          unitsSold: '0',
        },
      ],
    });
  }

  test('accepts the 24-hour and 25-hour day buckets ending at the next local midnight', () => {
    const normal24 = daySeries(
      '2026-11-24T08:00:00.000Z',
      '2026-11-25T08:00:00.000Z',
      '2026-11-24T08:00:00.000Z',
      '2026-11-25T08:00:00.000Z',
      '2026-11-24T00:00:00-08:00',
    );
    expect(() => parseSalesSeries(normal24)).not.toThrow();

    const fall25 = daySeries(
      '2026-11-01T07:00:00.000Z',
      '2026-11-02T08:00:00.000Z',
      '2026-11-01T07:00:00.000Z',
      '2026-11-02T08:00:00.000Z',
      '2026-11-01T00:00:00-07:00',
    );
    expect(() => parseSalesSeries(fall25)).not.toThrow();

    expect(() => parseSalesSeries(withData(springDay))).not.toThrow();
  });

  test.each([
    ['24 hours but ending at local 01:00', daySeries(
      '2026-03-08T08:00:00.000Z',
      '2026-03-09T08:00:00.000Z',
      '2026-03-08T08:00:00.000Z',
      '2026-03-09T08:00:00.000Z',
      '2026-03-08T00:00:00-08:00',
    )],
    ['24 hours but ending at local 23:00', daySeries(
      '2026-11-01T07:00:00.000Z',
      '2026-11-02T07:00:00.000Z',
      '2026-11-01T07:00:00.000Z',
      '2026-11-02T07:00:00.000Z',
      '2026-11-01T00:00:00-07:00',
    )],
    ['a day bucket ending at local noon', daySeries(
      '2026-11-24T08:00:00.000Z',
      '2026-11-24T20:00:00.000Z',
      '2026-11-24T08:00:00.000Z',
      '2026-11-24T20:00:00.000Z',
      '2026-11-24T00:00:00-08:00',
    )],
  ])('rejects a day bucket not ending at the next local midnight: %s', (_name, body) => {
    expect(() => parseSalesSeries(body)).toThrow(UnverifiableSalesSeriesError);
  });

  test.each([
    ['root extra key', { data: partial, extra: true }],
    ['data extra key', withData({ ...partial, extra: true })],
    ['wrong currency', withData({ ...partial, currency: 'USD' })],
    ['wrong time zone', withData({ ...partial, period: { ...partial.period, timeZone: 'UTC' } })],
    ['wrong granularity echo', withData({ ...partial, granularity: 'day' })],
    ['wrong method echo', withData({ ...partial, method: 'CASH' })],
    ['bucket count mismatch', withData({ ...partial, bucketCount: '3' })],
    ['empty buckets', withData({ ...partial, bucketCount: '0', buckets: [], totals: { totalCents: '0', ticketCount: '0', unitsSold: '0' } })],
    ['non-contiguous buckets', withData({ ...partial, buckets: [partial.buckets[0], partial.buckets[0]], totals: { totalCents: '8000', ticketCount: '2', unitsSold: '4' } })],
    ['totals mismatch', withData({ ...partial, totals: { totalCents: '8501', ticketCount: '2', unitsSold: '3' } })],
    ['partial flag mismatch', withData({ ...partial, buckets: [{ ...partial.buckets[0], partial: false }, partial.buckets[1]] })],
    ['effective limit mismatch', withData({ ...partial, buckets: [{ ...partial.buckets[0], effectiveFrom: '2026-11-24T08:00:00.000Z' }, partial.buckets[1]] })],
    ['wrong local offset', withData({ ...partial, buckets: [partial.buckets[0], { ...partial.buckets[1], localStart: '2026-11-24T01:00:00-07:00' }] })],
    ['non-existent spring local hour', withData({
      generatedAt: '2026-03-08T18:30:00.000Z',
      currency: 'MXN',
      period: { from: '2026-03-08T10:00:00.000Z', to: '2026-03-08T11:00:00.000Z', timeZone: 'America/Tijuana' },
      method: null,
      granularity: 'hour',
      bucketCount: '1',
      totals: { totalCents: '0', ticketCount: '0', unitsSold: '0' },
      buckets: [{
        start: '2026-03-08T10:00:00.000Z',
        end: '2026-03-08T11:00:00.000Z',
        localStart: '2026-03-08T02:00:00-08:00',
        effectiveFrom: '2026-03-08T10:00:00.000Z',
        effectiveTo: '2026-03-08T11:00:00.000Z',
        partial: false,
        totalCents: '0',
        ticketCount: '0',
        unitsSold: '0',
      }],
    })],
    ['generatedAt before the domain', withData({ ...partial, generatedAt: '1999-12-31T23:59:59.999Z' })],
    ['period before the domain', withData({ ...partial, period: { ...partial.period, from: '2000-01-01T07:59:59.999Z' } })],
    ['invalid bucket count string', withData({ ...partial, bucketCount: '02' })],
    ['negative metric', withData({ ...partial, totals: { totalCents: '-1', ticketCount: '2', unitsSold: '3' } })],
  ])('rejects an unverifiable response: %s', (_name, body) => {
    expect(() => parseSalesSeries(body, { from, to, granularity: 'hour' })).toThrow(
      UnverifiableSalesSeriesError,
    );
  });

  test('rejects a response for different filters', () => {
    expect(() =>
      parseSalesSeries(withData(partial), {
        from: '2026-11-24T08:00:00.000Z',
        to,
        granularity: 'hour',
      }),
    ).toThrow(UnverifiableSalesSeriesError);
    expect(() =>
      parseSalesSeries(withData(partial), { from, to, granularity: 'day' }),
    ).toThrow(UnverifiableSalesSeriesError);
    expect(() =>
      parseSalesSeries(withData(partial), { from, to, granularity: 'hour', method: 'STRIPE' }),
    ).toThrow(UnverifiableSalesSeriesError);
  });

  test('formats API errors and never retries a failed series request', async () => {
    for (const status of [400, 401, 403, 429, 500, 503]) {
      let calls = 0;
      server.use(
        http.get('/api/v1/admin/dashboard/sales-series', () => {
          calls += 1;
          return HttpResponse.json(
            { title: 'Error', status, code: status === 403 ? 'FORBIDDEN' : 'ERROR' },
            { status },
          );
        }),
      );
      await expect(getSalesSeries({ from, to, granularity: 'hour' })).rejects.toBeInstanceOf(ApiError);
      expect(calls).toBe(1);
    }
    expect(formatSalesSeriesError(new ApiError(400, 'Solicitud'))).toMatch(/granularidad/);
    expect(formatSalesSeriesError(new ApiError(401, 'Sesión'))).toMatch(/sesión venció/);
    expect(formatSalesSeriesError(new ApiError(403, 'Permiso', { code: 'FORBIDDEN' }))).toMatch(/administración/);
    expect(formatSalesSeriesError(new ApiError(403, 'NIP', { code: 'PIN_CHANGE_REQUIRED' }))).toMatch(/cambiar tu NIP/);
    expect(formatSalesSeriesError(new ApiError(403, 'Origen', { code: 'ORIGIN_NOT_ALLOWED' }))).toMatch(/origen/);
    expect(formatSalesSeriesError(new ApiError(429, 'Límite'))).toMatch(/Demasiadas/);
    expect(formatSalesSeriesError(new ApiError(500, 'Interno'))).toMatch(/No fue posible consultar/);
    expect(formatSalesSeriesError(new ApiError(503, 'Servicio'))).toMatch(/no están disponibles/);
    expect(formatSalesSeriesError(new ApiError(0, 'Red'))).toMatch(/no están disponibles/);
    expect(formatSalesSeriesError(new DOMException('abort', 'AbortError'))).toMatch(/cancelada/);
    expect(formatSalesSeriesError(new UnverifiableSalesSeriesError())).toMatch(/no se puede verificar/);
  });

  test('supports aborting a series request without reporting a network error', async () => {
    server.use(
      http.get('/api/v1/admin/dashboard/sales-series', async () => {
        await delay(100);
        return HttpResponse.json(withData(partial));
      }),
    );
    const controller = new AbortController();
    const request = getSalesSeries({ from, to, granularity: 'hour' }, controller.signal);
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });
});

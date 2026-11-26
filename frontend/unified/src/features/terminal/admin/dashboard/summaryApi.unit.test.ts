import { describe, expect, test } from 'vitest';
import { delay, HttpResponse, http } from 'msw';
import { ApiError } from '../../../../shared/api/client';
import { server } from '../../../../test/server';
import {
  buildDashboardSummaryQuery,
  formatDashboardSummaryError,
  getDashboardSummary,
  parseDashboardSummary,
  UnverifiableDashboardSummaryError,
} from './summaryApi';

const from = '2026-11-24T08:00:00.000Z';
const to = '2026-11-25T08:00:00.000Z';
const valid = {
  generatedAt: '2026-11-24T18:30:00.000Z',
  currency: 'MXN',
  period: {
    from,
    to,
    timeZone: 'America/Tijuana',
    previousFrom: '2026-11-23T08:00:00.000Z',
    previousTo: from,
  },
  totalCents: '1234500',
  ticketCount: '42',
  averageTicketCents: '29393',
  unitsSold: '87',
  paymentMix: { cashCents: '800000', stripeCents: '434500' },
  comparison: {
    totalCents: { previous: '1000000', change: '234500', changePercent: '23.45' },
    ticketCount: { previous: '38', change: '4', changePercent: '10.53' },
    averageTicketCents: { previous: '26316', change: '3077', changePercent: '11.69' },
    unitsSold: { previous: '80', change: '7', changePercent: '8.75' },
  },
};

const zero = {
  ...valid,
  totalCents: '0',
  ticketCount: '0',
  averageTicketCents: '0',
  unitsSold: '0',
  paymentMix: { cashCents: '0', stripeCents: '0' },
  comparison: {
    totalCents: { previous: '0', change: '0', changePercent: null },
    ticketCount: { previous: '0', change: '0', changePercent: null },
    averageTicketCents: { previous: '0', change: '0', changePercent: null },
    unitsSold: { previous: '0', change: '0', changePercent: null },
  },
};

describe('administrative summary API adapter', () => {
  test('builds only the approved query parameters in stable order', () => {
    const plain = new URLSearchParams(buildDashboardSummaryQuery({ from, to }).slice(1));
    expect([...plain.keys()]).toEqual(['from', 'to']);
    expect(plain.get('from')).toBe(from);
    expect(plain.get('to')).toBe(to);
    const cash = new URLSearchParams(
      buildDashboardSummaryQuery({ from, to, method: 'CASH' }).slice(1),
    );
    expect([...cash.keys()]).toEqual(['from', 'to', 'method']);
    expect(cash.get('method')).toBe('CASH');
    const stripe = new URLSearchParams(
      buildDashboardSummaryQuery({ from, to, method: 'STRIPE' }).slice(1),
    );
    expect(stripe.get('method')).toBe('STRIPE');
    expect(() =>
      buildDashboardSummaryQuery({ from, to, limit: 20 } as unknown as { from: string; to: string }),
    ).toThrow(/no es válido/);
    expect(() =>
      buildDashboardSummaryQuery({ from: '2026-11-24T00:00:00-08:00', to }),
    ).toThrow(/no es válido/);
    expect(() =>
      buildDashboardSummaryQuery({ from: '2026-02-30T00:00:00.000Z', to }),
    ).toThrow(/no es válido/);
    expect(() => buildDashboardSummaryQuery({ from: to, to: from })).toThrow(/no es válido/);
    expect(() =>
      buildDashboardSummaryQuery({
        from: '2026-01-01T00:00:00.000Z',
        to: '2027-01-03T00:00:00.000Z',
      }),
    ).toThrow(/no es válido/);
  });

  test('parses a valid summary and sends the exact filters', async () => {
    const urls: string[] = [];
    server.use(
      http.get('/api/v1/admin/dashboard/summary', ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json({ data: valid });
      }),
    );
    const result = await getDashboardSummary({ from, to });
    expect(result).toEqual(valid);
    expect(new URL(urls[0]).searchParams.get('from')).toBe(from);
    expect(new URL(urls[0]).searchParams.get('to')).toBe(to);
    expect(new URL(urls[0]).searchParams.has('method')).toBe(false);
  });

  test('accepts zero totals and a null comparison base', () => {
    expect(parseDashboardSummary({ data: zero }, { from, to })).toEqual(zero);
  });

  test.each([
    ['root extra key', { data: valid, extra: true }],
    ['data extra key', { data: { ...valid, extra: true } }],
    ['wrong currency', { data: { ...valid, currency: 'USD' } }],
    ['wrong time zone', { data: { ...valid, period: { ...valid.period, timeZone: 'UTC' } } }],
    ['payment mix mismatch', { data: { ...valid, paymentMix: { cashCents: '1', stripeCents: '1' } } }],
    [
      'comparison change mismatch',
      {
        data: {
          ...valid,
          comparison: {
            ...valid.comparison,
            totalCents: { ...valid.comparison.totalCents, change: '1' },
          },
        },
      },
    ],
    [
      'previous period mismatch',
      {
        data: {
          ...valid,
          period: { ...valid.period, previousFrom: '2026-11-22T08:00:00.000Z' },
        },
      },
    ],
    [
      'negative zero percentage',
      {
        data: {
          ...valid,
          comparison: {
            ...valid.comparison,
            totalCents: { ...valid.comparison.totalCents, changePercent: '-0.00' },
          },
        },
      },
    ],
    [
      'average without tickets',
      { data: { ...valid, ticketCount: '0', averageTicketCents: '1' } },
    ],
    [
      'missing comparison base',
      {
        data: {
          ...valid,
          comparison: {
            ...valid.comparison,
            totalCents: { ...valid.comparison.totalCents, changePercent: null },
          },
        },
      },
    ],
    [
      'zero base with percentage',
      {
        data: {
          ...valid,
          comparison: {
            ...valid.comparison,
            totalCents: {
              previous: '0',
              change: '1234500',
              changePercent: '1.00',
            },
          },
        },
      },
    ],
  ])('rejects unverifiable response: %s', (_name, body) => {
    expect(() => parseDashboardSummary(body, { from, to })).toThrow(
      UnverifiableDashboardSummaryError,
    );
  });

  test('rejects a response for a different period', () => {
    expect(() =>
      parseDashboardSummary(
        { data: valid },
        { from: '2026-11-25T08:00:00.000Z', to: '2026-11-26T08:00:00.000Z' },
      ),
    ).toThrow(UnverifiableDashboardSummaryError);
  });

  test('formats API errors and does not retry a failed summary', async () => {
    let calls = 0;
    server.use(
      http.get('/api/v1/admin/dashboard/summary', () => {
        calls += 1;
        return HttpResponse.json(
          { title: 'No autorizado', status: 403, code: 'FORBIDDEN' },
          { status: 403 },
        );
      }),
    );
    await expect(getDashboardSummary({ from, to })).rejects.toBeInstanceOf(ApiError);
    expect(calls).toBe(1);
    expect(
      formatDashboardSummaryError(
        new ApiError(403, 'No autorizado', { status: 403, code: 'FORBIDDEN' }),
      ),
    ).toMatch(/administración/);
    expect(formatDashboardSummaryError(new ApiError(400, 'Solicitud'))).toMatch(/periodo/);
    expect(formatDashboardSummaryError(new ApiError(401, 'Sesión'))).toMatch(/sesión venció/);
    expect(
      formatDashboardSummaryError(
        new ApiError(403, 'NIP', { code: 'PIN_CHANGE_REQUIRED' }),
      ),
    ).toMatch(/cambiar tu NIP/);
    expect(
      formatDashboardSummaryError(
        new ApiError(403, 'Origen', { code: 'ORIGIN_NOT_ALLOWED' }),
      ),
    ).toMatch(/origen/);
    expect(formatDashboardSummaryError(new ApiError(429, 'Límite'))).toMatch(/Demasiadas/);
    expect(formatDashboardSummaryError(new ApiError(503, 'Servicio'))).toMatch(/Inténtalo de nuevo/);
    expect(formatDashboardSummaryError(new DOMException('abort', 'AbortError'))).toMatch(
      /cancelada/,
    );
    expect(
      formatDashboardSummaryError(new UnverifiableDashboardSummaryError()),
    ).toMatch(/no se puede verificar/);
  });

  test('supports aborting a summary request without reporting it as a network error', async () => {
    server.use(
      http.get('/api/v1/admin/dashboard/summary', async () => {
        await delay(100);
        return HttpResponse.json({ data: valid });
      }),
    );
    const controller = new AbortController();
    const request = getDashboardSummary({ from, to }, controller.signal);
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });

  test('formats invalid filters without making a request', () => {
    expect(() => buildDashboardSummaryQuery({ from: 'nope', to })).toThrow(/no es válido/);
  });
});

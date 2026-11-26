import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { delay, HttpResponse, http } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { server } from '../../../../test/server';
import { categoryParticipationForUrl } from '../../../../test/categoryFixture';
import { noMovementForUrl } from '../../../../test/noMovementFixture';
import { productRankingForUrl } from '../../../../test/rankingFixture';
import { salesSeriesForUrl } from '../../../../test/seriesFixture';
import { DashboardSummary } from '../dashboard/DashboardSummary';
import { barHeightPercent, formatSeriesCount, SalesSeries } from './SalesSeries';

const now = () => new Date('2026-11-24T20:00:00.000Z');
const todayFrom = '2026-11-24T08:00:00.000Z';
const todayTo = '2026-11-25T08:00:00.000Z';

function summaryFor(url: string) {
  const query = new URL(url).searchParams;
  const from = query.get('from')!;
  const to = query.get('to')!;
  const duration = Date.parse(to) - Date.parse(from);
  return {
    generatedAt: '2026-11-24T18:30:00.000Z',
    currency: 'MXN',
    period: {
      from,
      to,
      timeZone: 'America/Tijuana',
      previousFrom: new Date(Date.parse(from) - duration).toISOString(),
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
}

function renderSeries(props: { from?: string; to?: string; method?: 'ALL' | 'CASH' | 'STRIPE' } = {}) {
  return render(
    <SalesSeries
      from={props.from ?? todayFrom}
      to={props.to ?? todayTo}
      method={props.method ?? 'ALL'}
    />,
  );
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardSummary now={now} />
    </MemoryRouter>,
  );
}

const fallDst = {
  generatedAt: '2026-11-24T18:30:00.000Z',
  currency: 'MXN',
  period: { from: '2026-11-01T08:00:00.000Z', to: '2026-11-01T10:00:00.000Z', timeZone: 'America/Tijuana' },
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
  period: { from: '2026-03-08T08:00:00.000Z', to: '2026-03-09T07:00:00.000Z', timeZone: 'America/Tijuana' },
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

const partial = {
  generatedAt: '2026-11-24T18:30:00.000Z',
  currency: 'MXN',
  period: { from: '2026-11-24T08:15:00.000Z', to: '2026-11-24T09:15:00.000Z', timeZone: 'America/Tijuana' },
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
  period: { from: todayFrom, to: '2026-11-24T09:00:00.000Z', timeZone: 'America/Tijuana' },
  method: 'CASH',
  granularity: 'hour',
  bucketCount: '1',
  totals: { totalCents: '0', ticketCount: '0', unitsSold: '0' },
  buckets: [
    {
      start: todayFrom,
      end: '2026-11-24T09:00:00.000Z',
      localStart: '2026-11-24T00:00:00-08:00',
      effectiveFrom: todayFrom,
      effectiveTo: '2026-11-24T09:00:00.000Z',
      partial: false,
      totalCents: '0',
      ticketCount: '0',
      unitsSold: '0',
    },
  ],
};

const cashSession = {
  id: '7',
  employeeId: '3',
  openedAt: '2026-11-24T08:00:00.000Z',
  closedAt: null,
  closedByEmployeeId: null,
  exceptionalCloseReason: null,
  openingAmountCents: '100000',
  expectedCashCents: null,
  countedCashCents: null,
  differenceCents: null,
  cashSalesCents: '4500',
  successfulPayments: '1',
  computedExpectedCashCents: '104500',
};

beforeEach(() => {
  server.use(
    http.get('/api/v1/cash-sessions/current', () => HttpResponse.json({ data: null })),
    http.get('/api/v1/sales', () => HttpResponse.json({ data: [], page: { limit: 5, nextCursor: null } })),
    http.get('/api/v1/admin/dashboard/product-ranking', ({ request }) =>
      HttpResponse.json({ data: productRankingForUrl(request.url) }),
    ),
    http.get('/api/v1/admin/dashboard/no-movement-products', ({ request }) =>
      HttpResponse.json({ data: noMovementForUrl(request.url, []) }),
    ),
    http.get('/api/v1/admin/dashboard/category-participation', ({ request }) =>
      HttpResponse.json({ data: categoryParticipationForUrl(request.url) }),
    ),
  );
});

describe('sales-series panel', () => {
  test('keeps the drawing scale bounded without converting full amounts to Number', () => {
    expect(barHeightPercent('500', '1000')).toBe('50%');
    expect(barHeightPercent('9007199254740995', '9007199254740995')).toBe('100%');
    expect(barHeightPercent('0', '1000')).toBe('0%');
    expect(barHeightPercent('1', '0')).toBe('0%');
  });

  test('renders exact metrics, partial buckets and a captioned table', async () => {
    server.use(
      http.get('/api/v1/admin/dashboard/sales-series', () => HttpResponse.json({ data: partial })),
    );
    renderSeries({ from: partial.period.from, to: partial.period.to });
    expect(await screen.findByRole('heading', { name: 'Series de ventas' })).toBeInTheDocument();
    expect(screen.getByText('$85.00')).toBeInTheDocument();
    expect(screen.getByText('Series de ventas por hora; importe bruto en MXN')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getAllByText('Parcial')).toHaveLength(2);
    expect(screen.getByText('24/11/26 00:00 (UTC-08:00)')).toBeInTheDocument();
    expect(screen.getByText('24/11/26 01:00 (UTC-08:00)')).toBeInTheDocument();
    expect(screen.getByText('$40.00')).toBeInTheDocument();
    expect(screen.getByText('$45.00')).toBeInTheDocument();
  });

  test('shows the exact zero state without inventing data', async () => {
    server.use(
      http.get('/api/v1/admin/dashboard/sales-series', () => HttpResponse.json({ data: zero })),
    );
    renderSeries({ from: zero.period.from, to: zero.period.to, method: 'CASH' });
    expect(await screen.findByText('No hay ventas registradas en las series de este periodo.')).toBeInTheDocument();
    expect(screen.getAllByText('$0.00').length).toBeGreaterThan(0);
    expect(screen.getByText('Sin ventas')).toBeInTheDocument();
  });

  test('distinguishes both repeated 01:00 hours across the fall DST transition', async () => {
    server.use(
      http.get('/api/v1/admin/dashboard/sales-series', () => HttpResponse.json({ data: fallDst })),
    );
    renderSeries({ from: fallDst.period.from, to: fallDst.period.to });
    expect(await screen.findByText('01/11/26 01:00 (UTC-07:00)')).toBeInTheDocument();
    expect(screen.getByText('01/11/26 01:00 (UTC-08:00)')).toBeInTheDocument();
    expect(screen.getAllByText('Hora repetida')).toHaveLength(2);
  });

  test('shows a 23-hour day, its change label and the exact large amount', async () => {
    server.use(
      http.get('/api/v1/admin/dashboard/sales-series', () => HttpResponse.json({ data: springDay })),
    );
    renderSeries({ from: springDay.period.from, to: springDay.period.to, method: 'STRIPE' });
    fireEvent.click(screen.getByRole('button', { name: 'Día' }));
    expect((await screen.findAllByText('$90,071,992,547,409.95')).length).toBeGreaterThan(0);
    expect(screen.getByText('23 h')).toBeInTheDocument();
    expect(screen.getByText(/Cambio de horario/)).toBeInTheDocument();
    expect(screen.getByText(/Método STRIPE/)).toBeInTheDocument();
  });

  test('reports an unavailable series without replacing it with zeros', async () => {
    server.use(
      http.get('/api/v1/admin/dashboard/sales-series', () =>
        HttpResponse.json({ title: 'No disponible', code: 'DEPENDENCY_UNAVAILABLE' }, { status: 503 }),
      ),
    );
    renderSeries();
    expect(await screen.findByRole('alert')).toHaveTextContent(/no están disponibles/);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
  });

  test('reports an unverifiable DTO without falling back to partial data', async () => {
    server.use(
      http.get('/api/v1/admin/dashboard/sales-series', () =>
        HttpResponse.json({ data: { ...partial, bucketCount: '9' } }),
      ),
    );
    renderSeries({ from: partial.period.from, to: partial.period.to });
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se puede verificar/);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  test('discards an older hour response after switching to day', async () => {
    const queries: URLSearchParams[] = [];
    server.use(
      http.get('/api/v1/admin/dashboard/sales-series', async ({ request }) => {
        const query = new URL(request.url).searchParams;
        queries.push(query);
        if (query.get('granularity') === 'hour') {
          await delay(120);
          return HttpResponse.json({ data: salesSeriesForUrl(request.url, (index) => ({ totalCents: index === 0 ? '1000' : '0' })) });
        }
        return HttpResponse.json({ data: salesSeriesForUrl(request.url, () => ({ totalCents: '2000' })) });
      }),
    );
    renderSeries();
    expect(await screen.findByText('Consultando series del periodo…')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Día' }));
    expect((await screen.findAllByText('$20.00')).length).toBeGreaterThan(0);
    await new Promise((resolve) => setTimeout(resolve, 160));
    expect(screen.queryByText('$10.00')).not.toBeInTheDocument();
    expect(queries.at(-1)?.get('granularity')).toBe('day');
  });

  test('never polls automatically and refreshes only when requested', async () => {
    let calls = 0;
    server.use(
      http.get('/api/v1/admin/dashboard/sales-series', ({ request }) => {
        calls += 1;
        return HttpResponse.json({ data: salesSeriesForUrl(request.url) });
      }),
    );
    renderSeries();
    await screen.findByRole('table');
    expect(calls).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(calls).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar series' }));
    await waitFor(() => expect(calls).toBe(2));
  });

  test('reuses the summary period and method, and series updates leave other panels untouched', async () => {
    const summaryQueries: URLSearchParams[] = [];
    const salesQueries: URLSearchParams[] = [];
    const seriesQueries: URLSearchParams[] = [];
    let cashRequests = 0;
    server.use(
      http.get('/api/v1/admin/dashboard/summary', ({ request }) => {
        summaryQueries.push(new URL(request.url).searchParams);
        return HttpResponse.json({ data: summaryFor(request.url) });
      }),
      http.get('/api/v1/cash-sessions/current', () => {
        cashRequests += 1;
        return HttpResponse.json({ data: cashSession });
      }),
      http.get('/api/v1/sales', ({ request }) => {
        salesQueries.push(new URL(request.url).searchParams);
        return HttpResponse.json({
          data: [{
            id: '9',
            saleNumber: 'V000009',
            orderId: '8',
            paymentId: '7',
            totalCents: '4500',
            soldAt: '2026-11-24T18:00:00.000Z',
            method: 'CASH',
          }],
          page: { limit: 5, nextCursor: null },
        });
      }),
      http.get('/api/v1/admin/dashboard/sales-series', ({ request }) => {
        seriesQueries.push(new URL(request.url).searchParams);
        return HttpResponse.json({ data: salesSeriesForUrl(request.url) });
      }),
    );
    renderDashboard();
    expect(await screen.findByText('Ventas registradas')).toBeInTheDocument();
    expect(await screen.findByText('V000009')).toBeInTheDocument();
    expect(await screen.findByText('Empleado #3')).toBeInTheDocument();
    await screen.findByRole('table', { name: /Series de ventas por hora/ });
    expect(seriesQueries[0].get('from')).toBe(todayFrom);
    expect(seriesQueries[0].get('to')).toBe(todayTo);
    expect(seriesQueries[0].get('granularity')).toBe('hour');
    expect(seriesQueries[0].has('method')).toBe(false);
    const summaryCalls = summaryQueries.length;
    const salesCalls = salesQueries.length;

    fireEvent.click(screen.getByRole('button', { name: 'Actualizar series' }));
    await waitFor(() => expect(seriesQueries.length).toBe(2));
    expect(summaryQueries.length).toBe(summaryCalls);
    expect(salesQueries.length).toBe(salesCalls);
    expect(cashRequests).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Día' }));
    await waitFor(() => expect(seriesQueries.at(-1)?.get('granularity')).toBe('day'));
    expect(summaryQueries.length).toBe(summaryCalls);
    expect(salesQueries.length).toBe(salesCalls);
    expect(cashRequests).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Últimos 7 días' }));
    await waitFor(() => expect(seriesQueries.at(-1)?.get('from')).toBe('2026-11-18T08:00:00.000Z'));
    fireEvent.change(screen.getByLabelText('Método de pago'), { target: { value: 'STRIPE' } });
    await waitFor(() => expect(seriesQueries.at(-1)?.get('method')).toBe('STRIPE'));
    expect(cashRequests).toBe(1);
  });

  test('formats 20+ digit ticket, unit and bucket counts exactly with BigInt', async () => {
    const huge = '123456789012345678901';
    const expected = BigInt(huge).toLocaleString('es-MX');
    expect(formatSeriesCount(huge)).toBe(expected);
    expect(formatSeriesCount('9007199254740993')).toBe(
      BigInt('9007199254740993').toLocaleString('es-MX'),
    );
    const fixture = {
      generatedAt: '2026-11-24T18:30:00.000Z',
      currency: 'MXN',
      period: { from: todayFrom, to: '2026-11-24T09:00:00.000Z', timeZone: 'America/Tijuana' },
      method: null,
      granularity: 'hour',
      bucketCount: '1',
      totals: { totalCents: '1', ticketCount: huge, unitsSold: huge },
      buckets: [{
        start: todayFrom,
        end: '2026-11-24T09:00:00.000Z',
        localStart: '2026-11-24T00:00:00-08:00',
        effectiveFrom: todayFrom,
        effectiveTo: '2026-11-24T09:00:00.000Z',
        partial: false,
        totalCents: '1',
        ticketCount: huge,
        unitsSold: huge,
      }],
    };
    server.use(
      http.get('/api/v1/admin/dashboard/sales-series', () => HttpResponse.json({ data: fixture })),
    );
    renderSeries({ from: fixture.period.from, to: fixture.period.to });
    expect((await screen.findAllByText(expected)).length).toBeGreaterThanOrEqual(2);
  });

  test('renders a 20+ digit totalCents exactly instead of rounding it', async () => {
    const hugeCents = '123456789012345678901';
    const fixture = {
      generatedAt: '2026-11-24T18:30:00.000Z',
      currency: 'MXN',
      period: { from: todayFrom, to: '2026-11-24T09:00:00.000Z', timeZone: 'America/Tijuana' },
      method: null,
      granularity: 'hour',
      bucketCount: '1',
      totals: { totalCents: hugeCents, ticketCount: '1', unitsSold: '1' },
      buckets: [{
        start: todayFrom,
        end: '2026-11-24T09:00:00.000Z',
        localStart: '2026-11-24T00:00:00-08:00',
        effectiveFrom: todayFrom,
        effectiveTo: '2026-11-24T09:00:00.000Z',
        partial: false,
        totalCents: hugeCents,
        ticketCount: '1',
        unitsSold: '1',
      }],
    };
    server.use(
      http.get('/api/v1/admin/dashboard/sales-series', () => HttpResponse.json({ data: fixture })),
    );
    renderSeries({ from: fixture.period.from, to: fixture.period.to });
    const amounts = await screen.findAllByText('$1,234,567,890,123,456,789.01');
    expect(amounts.length).toBeGreaterThanOrEqual(2);
  });

  test('switches from hour to day when the period dynamically exceeds 31 days', async () => {
    const queries: URLSearchParams[] = [];
    const smallFrom = '2026-11-24T08:00:00.000Z';
    const smallTo = '2026-11-25T08:00:00.000Z';
    const bigFrom = '2026-10-01T08:00:00.000Z';
    const bigTo = '2026-11-02T08:00:00.000Z';
    server.use(
      http.get('/api/v1/admin/dashboard/sales-series', ({ request }) => {
        queries.push(new URL(request.url).searchParams);
        return HttpResponse.json({ data: salesSeriesForUrl(request.url) });
      }),
    );
    const view = renderSeries({ from: smallFrom, to: smallTo });
    await screen.findByRole('table', { name: /Series de ventas por hora/ });
    expect(queries.at(-1)?.get('granularity')).toBe('hour');
    view.rerender(
      <SalesSeries from={bigFrom} to={bigTo} method="ALL" />,
    );
    expect(
      await screen.findByRole('table', { name: /Series de ventas por día/ }),
    ).toBeInTheDocument();
    expect(queries.at(-1)?.get('granularity')).toBe('day');
    expect(screen.getByRole('button', { name: 'Hora' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Día' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('uses daily granularity for periods above the hourly contract limit', async () => {
    const queries: URLSearchParams[] = [];
    const from = '2026-01-01T08:00:00.000Z';
    const to = '2026-03-02T08:00:00.000Z';
    server.use(
      http.get('/api/v1/admin/dashboard/sales-series', ({ request }) => {
        queries.push(new URL(request.url).searchParams);
        return HttpResponse.json({ data: salesSeriesForUrl(request.url) });
      }),
    );
    renderSeries({ from, to });
    expect(
      await screen.findByRole('table', { name: /Series de ventas por día/ }),
    ).toBeInTheDocument();
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.every((query) => query.get('granularity') === 'day')).toBe(true);
    const hour = screen.getByRole('button', { name: 'Hora' });
    expect(hour).toBeDisabled();
    expect(hour).toHaveAttribute('aria-describedby', 'dashboard-series-hour-limit');
    expect(screen.getByText(/máximo de series por hora/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Día' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('shows a semi-open period and effective boundaries with seconds and milliseconds', async () => {
    const from = '2026-11-24T08:15:30.250Z';
    const to = '2026-11-24T09:00:00.000Z';
    const fixture = {
      generatedAt: '2026-11-24T18:30:00.000Z',
      currency: 'MXN',
      period: { from, to, timeZone: 'America/Tijuana' },
      method: null,
      granularity: 'hour',
      bucketCount: '1',
      totals: { totalCents: '100', ticketCount: '1', unitsSold: '1' },
      buckets: [{
        start: '2026-11-24T08:00:00.000Z',
        end: '2026-11-24T09:00:00.000Z',
        localStart: '2026-11-24T00:00:00-08:00',
        effectiveFrom: from,
        effectiveTo: to,
        partial: true,
        totalCents: '100',
        ticketCount: '1',
        unitsSold: '1',
      }],
    };
    server.use(
      http.get('/api/v1/admin/dashboard/sales-series', () => HttpResponse.json({ data: fixture })),
    );
    renderSeries({ from, to });
    expect((await screen.findAllByText(/hasta antes de/)).length).toBeGreaterThan(0);
    expect(screen.getByText(/desde 08:15:30\.250 UTC/)).toBeInTheDocument();
    expect(screen.getByText(/hasta antes de 09:00 UTC/)).toBeInTheDocument();
    expect(screen.getByText('Parcial')).toBeInTheDocument();
  });

  test.each([
    [400, /no es válido/],
    [401, /sesión venció/],
    [403, /administración/],
    [429, /Demasiadas/],
  ])('reports a %i series error without rendering a table', async (status, message) => {
    server.use(
      http.get('/api/v1/admin/dashboard/sales-series', () =>
        HttpResponse.json({ title: 'Error', status }, { status }),
      ),
    );
    renderSeries();
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByRole('table', { name: /Series de ventas/ })).not.toBeInTheDocument();
  });

  test('aborts the in-flight series request when unmounted', async () => {
    let calls = 0;
    const abort = vi.spyOn(AbortController.prototype, 'abort');
    server.use(
      http.get('/api/v1/admin/dashboard/sales-series', async () => {
        calls += 1;
        await delay(120);
        return HttpResponse.json({
          data: salesSeriesForUrl('http://local/?from=2026-11-24T08:00:00.000Z&to=2026-11-24T09:00:00.000Z&granularity=hour'),
        });
      }),
    );
    const view = renderSeries({ to: '2026-11-24T09:00:00.000Z' });
    await waitFor(() => expect(calls).toBe(1));
    view.unmount();
    expect(abort).toHaveBeenCalled();
    abort.mockRestore();
  });

  test('a failed series keeps the summary, cash and latest sales visible', async () => {
    server.use(
      http.get('/api/v1/admin/dashboard/summary', ({ request }) =>
        HttpResponse.json({ data: summaryFor(request.url) }),
      ),
      http.get('/api/v1/cash-sessions/current', () => HttpResponse.json({ data: cashSession })),
      http.get('/api/v1/sales', () =>
        HttpResponse.json({
          data: [{
            id: '9',
            saleNumber: 'V000009',
            orderId: '8',
            paymentId: '7',
            totalCents: '4500',
            soldAt: '2026-11-24T18:00:00.000Z',
            method: 'CASH',
          }],
          page: { limit: 5, nextCursor: null },
        }),
      ),
      http.get('/api/v1/admin/dashboard/sales-series', () =>
        HttpResponse.json({ title: 'No disponible' }, { status: 503 }),
      ),
    );
    renderDashboard();
    expect((await screen.findAllByText('$12,345.00')).length).toBeGreaterThan(0);
    expect(await screen.findByText('Empleado #3')).toBeInTheDocument();
    expect(await screen.findByText('V000009')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(/no están disponibles/);
    expect(screen.queryByRole('table', { name: /series de ventas/i })).not.toBeInTheDocument();
  });
});

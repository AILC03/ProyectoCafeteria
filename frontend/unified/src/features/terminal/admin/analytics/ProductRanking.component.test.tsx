import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { delay, HttpResponse, http } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { server } from '../../../../test/server';
import { noMovementForUrl } from '../../../../test/noMovementFixture';
import {
  canonicalRanking,
  literalOrderProductIds,
  literalOrderRanking,
  productRankingForUrl,
  tieRankingItems,
  twelveMovementItems,
  zeroRanking,
} from '../../../../test/rankingFixture';
import { salesSeriesForUrl } from '../../../../test/seriesFixture';
import { DashboardSummary } from '../dashboard/DashboardSummary';
import { ProductRanking } from './ProductRanking';

const now = () => new Date('2026-11-24T20:00:00.000Z');
const todayFrom = '2026-11-24T08:00:00.000Z';
const todayTo = '2026-11-25T08:00:00.000Z';
const localInstant = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Tijuana',
  dateStyle: 'medium',
  timeStyle: 'short',
});

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

const sale = {
  id: '9',
  saleNumber: 'V000009',
  orderId: '8',
  paymentId: '7',
  totalCents: '4500',
  soldAt: '2026-11-24T18:00:00.000Z',
  method: 'CASH',
};

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

function renderRanking(
  props: { from?: string; to?: string; method?: 'ALL' | 'CASH' | 'STRIPE' } = {},
) {
  return render(
    <ProductRanking
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

beforeEach(() => {
  server.use(
    http.get('/api/v1/cash-sessions/current', () => HttpResponse.json({ data: null })),
    http.get('/api/v1/sales', () =>
      HttpResponse.json({ data: [], page: { limit: 5, nextCursor: null } }),
    ),
    http.get('/api/v1/admin/dashboard/sales-series', ({ request }) =>
      HttpResponse.json({ data: salesSeriesForUrl(request.url) }),
    ),
    http.get('/api/v1/admin/dashboard/no-movement-products', ({ request }) =>
      HttpResponse.json({ data: noMovementForUrl(request.url, []) }),
    ),
  );
});

describe('product-ranking panel', () => {
  test('requests the default units/top/5 and renders exact metadata and table', async () => {
    const queries: URLSearchParams[] = [];
    server.use(
      http.get('/api/v1/admin/dashboard/product-ranking', ({ request }) => {
        queries.push(new URL(request.url).searchParams);
        return HttpResponse.json({ data: canonicalRanking });
      }),
    );
    renderRanking();
    expect(await screen.findByRole('heading', { name: 'Ranking de productos' })).toBeInTheDocument();
    expect(await screen.findByRole('table', { name: /Ranking de productos por unidades/ })).toBeInTheDocument();
    expect(queries).toHaveLength(1);
    expect(queries[0].get('metric')).toBe('units');
    expect(queries[0].get('direction')).toBe('top');
    expect(queries[0].get('top')).toBe('5');
    expect(queries[0].has('method')).toBe(false);
    expect(screen.getByText(/Mostrando 3 de 3 productos con movimiento/)).toBeInTheDocument();
    expect(screen.getByText(/no son la suma de las filas visibles/)).toBeInTheDocument();
    expect(screen.getByText('$210.00')).toBeInTheDocument();
    expect(screen.getByText('ID 10')).toBeInTheDocument();

    // P-2: generatedAt, effective period, method and top are visible.
    const updated = screen.getByText(/Ranking actualizado:/);
    expect(updated.querySelector('time')).toHaveAttribute('datetime', '2026-11-24T18:30:00.000Z');
    expect(updated.querySelector('time')).toHaveTextContent(
      localInstant.format(new Date('2026-11-24T18:30:00.000Z')),
    );
    expect(screen.getByText(/Periodo consultado:/)).toHaveTextContent(
      `Periodo consultado: desde ${localInstant.format(
        new Date(todayFrom),
      )} hasta antes de ${localInstant.format(new Date(todayTo))} (America/Tijuana). Método: Todos los métodos.`,
    );
    expect(screen.getByRole('table', { name: /Ranking de productos/ })).toHaveAccessibleName(
      'Ranking de productos por unidades vendidas en orden descendente (más vendidos); top 5; importe bruto en MXN',
    );
  });

  test('changes metric, direction and top with labelled native selectors', async () => {
    const queries: URLSearchParams[] = [];
    server.use(
      http.get('/api/v1/admin/dashboard/product-ranking', ({ request }) => {
        queries.push(new URL(request.url).searchParams);
        return HttpResponse.json({ data: productRankingForUrl(request.url, twelveMovementItems) });
      }),
    );
    renderRanking();
    await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('Métrica del ranking'), { target: { value: 'amount' } });
    fireEvent.change(screen.getByLabelText('Dirección del ranking'), { target: { value: 'bottom' } });
    fireEvent.change(screen.getByLabelText('Cantidad de productos'), { target: { value: '10' } });
    await waitFor(() => expect(queries.at(-1)?.get('metric')).toBe('amount'));
    expect(queries.at(-1)?.get('direction')).toBe('bottom');
    expect(queries.at(-1)?.get('top')).toBe('10');
    expect(
      await screen.findByRole('table', {
        name: /Ranking de productos por importe bruto en orden ascendente/,
      }),
    ).toBeInTheDocument();
  });

  test('requests and renders top 20 without padding (P-3)', async () => {
    const queries: URLSearchParams[] = [];
    server.use(
      http.get('/api/v1/admin/dashboard/product-ranking', ({ request }) => {
        queries.push(new URL(request.url).searchParams);
        return HttpResponse.json({ data: productRankingForUrl(request.url, twelveMovementItems) });
      }),
    );
    renderRanking();
    await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('Cantidad de productos'), { target: { value: '20' } });
    await waitFor(() => expect(queries.at(-1)?.get('top')).toBe('20'));
    const table = await screen.findByRole('table', { name: /top 20/ });
    expect(within(table).getAllByRole('rowheader')).toHaveLength(12);
    expect(screen.getByText(/Mostrando 12 de 12 productos con movimiento/)).toBeInTheDocument();
    expect(screen.queryByText(/conjunto recortado/)).not.toBeInTheDocument();
  });

  test('sends and labels the CASH and STRIPE methods (P-3)', async () => {
    const queries: URLSearchParams[] = [];
    server.use(
      http.get('/api/v1/admin/dashboard/product-ranking', ({ request }) => {
        queries.push(new URL(request.url).searchParams);
        return HttpResponse.json({ data: productRankingForUrl(request.url) });
      }),
    );
    const cash = renderRanking({ method: 'CASH' });
    await screen.findByRole('table');
    await waitFor(() => expect(queries.at(-1)?.get('method')).toBe('CASH'));
    expect(screen.getByText(/Método: Efectivo\./)).toBeInTheDocument();
    cash.unmount();

    renderRanking({ method: 'STRIPE' });
    await waitFor(() => expect(queries.at(-1)?.get('method')).toBe('STRIPE'));
    expect(await screen.findByRole('table', { name: /Ranking de productos/ })).toBeInTheDocument();
    expect(screen.getByText(/Método: Tarjeta\./)).toBeInTheDocument();
  });

  test('keeps the literal contract order for equal names (R-2)', async () => {
    const queries: URLSearchParams[] = [];
    server.use(
      http.get('/api/v1/admin/dashboard/product-ranking', ({ request }) => {
        queries.push(new URL(request.url).searchParams);
        return HttpResponse.json({ data: literalOrderRanking });
      }),
    );
    renderRanking({ method: 'CASH' });
    const table = await screen.findByRole('table', { name: /orden descendente/ });
    expect(queries.at(-1)?.get('method')).toBe('CASH');
    const rows = within(table).getAllByRole('rowheader').map((node) => node.textContent ?? '');
    expect(rows.map((text) => /ID (\d+)/.exec(text)?.[1])).toEqual([...literalOrderProductIds]);
    expect(screen.getByText(/Método: Efectivo\./)).toBeInTheDocument();
  });

  test.each([
    ['401 session', 401, 'UNAUTHENTICATED', /Tu sesión venció/],
    ['403 generic role', 403, 'FORBIDDEN', /Sólo administración/],
    ['403 PIN change', 403, 'PIN_CHANGE_REQUIRED', /cambiar tu NIP/],
    ['403 origin', 403, 'ORIGIN_NOT_ALLOWED', /origen de la solicitud no está permitido/],
  ])('shows a safe message without a partial table or loop: %s (P-1)', async (_name, status, code, message) => {
    let calls = 0;
    server.use(
      http.get('/api/v1/admin/dashboard/product-ranking', () => {
        calls += 1;
        return HttpResponse.json({ title: 'Error', status, code }, { status });
      }),
    );
    renderRanking();
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByRole('table', { name: /Ranking de productos/ })).not.toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(calls).toBe(1);
  });

  test('propagates DashboardSummary preset and method changes to the ranking query (R-3)', async () => {
    const rankingQueries: URLSearchParams[] = [];
    server.use(
      http.get('/api/v1/admin/dashboard/summary', ({ request }) =>
        HttpResponse.json({ data: summaryFor(request.url) }),
      ),
      http.get('/api/v1/admin/dashboard/product-ranking', ({ request }) => {
        rankingQueries.push(new URL(request.url).searchParams);
        return HttpResponse.json({ data: productRankingForUrl(request.url) });
      }),
    );
    renderDashboard();
    await screen.findByRole('table', { name: /Ranking de productos/ });
    await waitFor(() => expect(rankingQueries.at(-1)?.get('from')).toBe(todayFrom));
    expect(rankingQueries.at(-1)?.get('to')).toBe(todayTo);
    expect(rankingQueries.at(-1)?.has('method')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Últimos 7 días' }));
    await waitFor(() =>
      expect(rankingQueries.at(-1)?.get('from')).toBe('2026-11-18T08:00:00.000Z'),
    );
    expect(rankingQueries.at(-1)?.get('to')).toBe(todayTo);

    fireEvent.change(screen.getByLabelText('Método de pago'), { target: { value: 'CASH' } });
    await waitFor(() => expect(rankingQueries.at(-1)?.get('method')).toBe('CASH'));
    expect(rankingQueries.at(-1)?.get('from')).toBe('2026-11-18T08:00:00.000Z');

    fireEvent.change(screen.getByLabelText('Método de pago'), { target: { value: 'STRIPE' } });
    await waitFor(() => expect(rankingQueries.at(-1)?.get('method')).toBe('STRIPE'));

    fireEvent.change(screen.getByLabelText('Método de pago'), { target: { value: 'ALL' } });
    await waitFor(() => expect(rankingQueries.at(-1)?.has('method')).toBe(false));
  });

  test('renders the received DOM order unchanged for ties and equal names', async () => {
    server.use(
      http.get('/api/v1/admin/dashboard/product-ranking', ({ request }) =>
        HttpResponse.json({ data: productRankingForUrl(request.url, tieRankingItems) }),
      ),
    );
    renderRanking();
    await screen.findByRole('table');
    const headers = screen.getAllByRole('rowheader').map((node) => node.textContent);
    expect(headers[0]).toContain('Café');
    expect(headers[0]).toContain('ID 10');
    expect(headers[1]).toContain('Café');
    expect(headers[1]).toContain('ID 12');
    expect(headers[2]).toContain('Zeta');
    expect(headers[3]).toContain('Ávila');
    expect(screen.getAllByText('Café')).toHaveLength(2);
  });

  test('shows complete totals before the cut instead of summing visible rows', async () => {
    server.use(
      http.get('/api/v1/admin/dashboard/product-ranking', ({ request }) =>
        HttpResponse.json({ data: productRankingForUrl(request.url, twelveMovementItems) }),
      ),
    );
    renderRanking();
    await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('Cantidad de productos'), { target: { value: '10' } });
    await screen.findByText(/Mostrando 10 de 12 productos con movimiento/);
    expect(screen.getByText('Unidades del conjunto')).toBeInTheDocument();
    expect(screen.getByText('78')).toBeInTheDocument();
    expect(screen.getByText('$78.00')).toBeInTheDocument();
    expect(screen.getByText(/conjunto recortado/)).toBeInTheDocument();
  });

  test('shows the zero state without inventing rows', async () => {
    server.use(
      http.get('/api/v1/admin/dashboard/product-ranking', () =>
        HttpResponse.json({ data: zeroRanking }),
      ),
    );
    renderRanking();
    expect(
      await screen.findByText('No hay productos con movimiento para el ranking de este periodo.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Mostrando 0 de 0 productos con movimiento/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  test('reports unavailable, 429 and invalid DTOs without falling back to data', async () => {
    server.use(
      http.get('/api/v1/admin/dashboard/product-ranking', () =>
        HttpResponse.json({ title: 'No disponible', code: 'DEPENDENCY_UNAVAILABLE' }, { status: 503 }),
      ),
    );
    const first = renderRanking();
    expect(await screen.findByRole('alert')).toHaveTextContent(/no está disponible/);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    first.unmount();

    server.use(
      http.get('/api/v1/admin/dashboard/product-ranking', () =>
        HttpResponse.json({ title: 'Límite', code: 'RATE_LIMITED' }, { status: 429 }),
      ),
    );
    const second = renderRanking();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Demasiadas/);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    second.unmount();

    server.use(
      http.get('/api/v1/admin/dashboard/product-ranking', () =>
        HttpResponse.json({ data: { ...canonicalRanking, top: '10' } }),
      ),
    );
    renderRanking();
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se puede verificar/);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  test('does not loop after a 429 and keeps a manual retry button', async () => {
    let calls = 0;
    server.use(
      http.get('/api/v1/admin/dashboard/product-ranking', () => {
        calls += 1;
        return HttpResponse.json({ title: 'Límite' }, { status: 429 });
      }),
    );
    renderRanking();
    expect(await screen.findByRole('button', { name: 'Reintentar ranking' })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(calls).toBe(1);
  });

  test('discards an older response after changing a filter', async () => {
    const queries: URLSearchParams[] = [];
    server.use(
      http.get('/api/v1/admin/dashboard/product-ranking', async ({ request }) => {
        const query = new URL(request.url).searchParams;
        queries.push(query);
        if (query.get('metric') === 'units') {
          await delay(120);
          return HttpResponse.json({ data: productRankingForUrl(request.url) });
        }
        return HttpResponse.json({
          data: productRankingForUrl(request.url, [
            { productId: '99', name: 'Producto de importe', unitsSold: '1', totalCents: '9999' },
          ]),
        });
      }),
    );
    renderRanking();
    expect(await screen.findByText('Consultando ranking del periodo…')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Métrica del ranking'), { target: { value: 'amount' } });
    expect(await screen.findByText('Producto de importe')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 160));
    expect(screen.queryByText('Latte')).not.toBeInTheDocument();
    expect(queries.at(-1)?.get('metric')).toBe('amount');
  });

  test('never polls automatically and refreshes only when requested', async () => {
    let calls = 0;
    server.use(
      http.get('/api/v1/admin/dashboard/product-ranking', ({ request }) => {
        calls += 1;
        return HttpResponse.json({ data: productRankingForUrl(request.url) });
      }),
    );
    renderRanking();
    await screen.findByRole('table');
    expect(calls).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(calls).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar ranking' }));
    await waitFor(() => expect(calls).toBe(2));
  });

  test('aborts the in-flight request when unmounted', async () => {
    let calls = 0;
    const abort = vi.spyOn(AbortController.prototype, 'abort');
    server.use(
      http.get('/api/v1/admin/dashboard/product-ranking', async () => {
        calls += 1;
        await delay(120);
        return HttpResponse.json({ data: canonicalRanking });
      }),
    );
    const view = renderRanking();
    await waitFor(() => expect(calls).toBe(1));
    view.unmount();
    expect(abort).toHaveBeenCalled();
    abort.mockRestore();
  });

  test('a ranking failure keeps summary, series, cash and latest sales visible', async () => {
    server.use(
      http.get('/api/v1/admin/dashboard/summary', ({ request }) =>
        HttpResponse.json({ data: summaryFor(request.url) }),
      ),
      http.get('/api/v1/cash-sessions/current', () => HttpResponse.json({ data: cashSession })),
      http.get('/api/v1/sales', () =>
        HttpResponse.json({ data: [sale], page: { limit: 5, nextCursor: null } }),
      ),
      http.get('/api/v1/admin/dashboard/product-ranking', () =>
        HttpResponse.json({ title: 'No disponible' }, { status: 503 }),
      ),
    );
    renderDashboard();
    expect((await screen.findAllByText('$12,345.00')).length).toBeGreaterThan(0);
    expect(await screen.findByText('Empleado #3')).toBeInTheDocument();
    expect(await screen.findByText('V000009')).toBeInTheDocument();
    expect(await screen.findByRole('table', { name: /Series de ventas/ })).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(/ranking no está disponible/);
    expect(screen.queryByRole('table', { name: /Ranking de productos/ })).not.toBeInTheDocument();
  });

  test('the ranking still loads when the summary fails', async () => {
    server.use(
      http.get('/api/v1/admin/dashboard/summary', () =>
        HttpResponse.json({ title: 'No disponible' }, { status: 503 }),
      ),
      http.get('/api/v1/admin/dashboard/product-ranking', ({ request }) =>
        HttpResponse.json({ data: productRankingForUrl(request.url) }),
      ),
    );
    renderDashboard();
    expect(await screen.findByRole('alert')).toHaveTextContent(/resumen/);
    expect(await screen.findByRole('table', { name: /Ranking de productos/ })).toBeInTheDocument();
    expect(screen.getByText('Latte')).toBeInTheDocument();
  });

  test('keeps the two ranking tables independent of the series table', async () => {
    server.use(
      http.get('/api/v1/admin/dashboard/summary', ({ request }) =>
        HttpResponse.json({ data: summaryFor(request.url) }),
      ),
      http.get('/api/v1/admin/dashboard/product-ranking', ({ request }) =>
        HttpResponse.json({ data: productRankingForUrl(request.url) }),
      ),
    );
    renderDashboard();
    expect(
      await screen.findByRole('table', { name: /Series de ventas/ }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('table', { name: /Ranking de productos/ }),
    ).toBeInTheDocument();
    const rankingTable = screen.getByRole('table', { name: /Ranking de productos/ });
    expect(within(rankingTable).getByText('ID 10')).toBeInTheDocument();
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { delay, HttpResponse, http } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test } from 'vitest';
import { server } from '../../../../test/server';
import { productRankingForUrl } from '../../../../test/rankingFixture';
import { salesSeriesForUrl } from '../../../../test/seriesFixture';
import { DashboardSummary } from './DashboardSummary';

const now = () => new Date('2026-11-24T20:00:00.000Z');

beforeEach(() => {
  server.use(
    http.get('/api/v1/cash-sessions/current', () => HttpResponse.json({ data: null })),
    http.get('/api/v1/sales', () =>
      HttpResponse.json({ data: [], page: { limit: 5, nextCursor: null } }),
    ),
    http.get('/api/v1/admin/dashboard/sales-series', ({ request }) =>
      HttpResponse.json({ data: salesSeriesForUrl(request.url) }),
    ),
    http.get('/api/v1/admin/dashboard/product-ranking', ({ request }) =>
      HttpResponse.json({ data: productRankingForUrl(request.url) }),
    ),
  );
});

function summaryFor(url: string, overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  };
}

function simpleSummary(url: string, total: string) {
  const base = summaryFor(url);
  return {
    ...base,
    totalCents: total,
    ticketCount: '1',
    averageTicketCents: total,
    unitsSold: '1',
    paymentMix: { cashCents: total, stripeCents: '0' },
    comparison: {
      totalCents: { previous: '0', change: total, changePercent: null },
      ticketCount: { previous: '0', change: '1', changePercent: null },
      averageTicketCents: { previous: '0', change: total, changePercent: null },
      unitsSold: { previous: '0', change: '1', changePercent: null },
    },
  };
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardSummary now={now} />
    </MemoryRouter>,
  );
}

describe('Inicio administrative summary', () => {
  test('renders the integrated cards, comparison and payment mix for Today', async () => {
    const queries: URLSearchParams[] = [];
    server.use(
      http.get('/api/v1/admin/dashboard/summary', ({ request }) => {
        queries.push(new URL(request.url).searchParams);
        return HttpResponse.json({ data: summaryFor(request.url) });
      }),
    );
    renderDashboard();
    expect(await screen.findByText('Ventas registradas')).toBeInTheDocument();
    expect(screen.getByText('$12,345.00')).toBeInTheDocument();
    expect(screen.getByText(/\+23\.45 %/)).toBeInTheDocument();
    expect(screen.getByText('Mezcla por importe')).toBeInTheDocument();
    expect(screen.getByText('$8,000.00')).toBeInTheDocument();
    expect(screen.getByText('$4,345.00')).toBeInTheDocument();
    expect(screen.getByText(/Actualizado:/)).toBeInTheDocument();
    expect(queries).toHaveLength(1);
    expect(queries[0].get('from')).toBe('2026-11-24T08:00:00.000Z');
    expect(queries[0].get('to')).toBe('2026-11-25T08:00:00.000Z');
  });

  test('switches presets and method without keeping stale data', async () => {
    const queries: URLSearchParams[] = [];
    server.use(
      http.get('/api/v1/admin/dashboard/summary', ({ request }) => {
        queries.push(new URL(request.url).searchParams);
        return HttpResponse.json({ data: summaryFor(request.url) });
      }),
    );
    renderDashboard();
    await screen.findByText('Ventas registradas');
    fireEvent.click(screen.getByRole('button', { name: 'Últimos 7 días' }));
    await waitFor(() => expect(queries.at(-1)?.get('from')).toBe('2026-11-18T08:00:00.000Z'));
    fireEvent.change(screen.getByLabelText('Método de pago'), { target: { value: 'CASH' } });
    await waitFor(() => expect(queries.at(-1)?.get('method')).toBe('CASH'));
  });

  test('ignores an older response after changing the period', async () => {
    server.use(
      http.get('/api/v1/admin/dashboard/summary', async ({ request }) => {
        const from = new URL(request.url).searchParams.get('from');
        if (from === '2026-11-24T08:00:00.000Z') {
          await delay(100);
          return HttpResponse.json({ data: simpleSummary(request.url, '1000') });
        }
        return HttpResponse.json({ data: simpleSummary(request.url, '2000') });
      }),
    );
    renderDashboard();
    expect(await screen.findByText('Consultando resumen del periodo…')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Últimos 7 días' }));
    expect((await screen.findAllByText('$20.00')).length).toBeGreaterThan(0);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(screen.queryByText('$10.00')).not.toBeInTheDocument();
  });

  test('refreshes only when requested and never polls automatically', async () => {
    let calls = 0;
    server.use(
      http.get('/api/v1/admin/dashboard/summary', ({ request }) => {
        calls += 1;
        return HttpResponse.json({ data: simpleSummary(request.url, '2000') });
      }),
    );
    renderDashboard();
    await screen.findAllByText('$20.00');
    expect(calls).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar resumen' }));
    await waitFor(() => expect(calls).toBe(2));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(calls).toBe(2);
  });

  test('applies a custom inclusive range and rejects an inverted range', async () => {
    const queries: URLSearchParams[] = [];
    server.use(
      http.get('/api/v1/admin/dashboard/summary', ({ request }) => {
        queries.push(new URL(request.url).searchParams);
        return HttpResponse.json({ data: summaryFor(request.url) });
      }),
    );
    renderDashboard();
    await screen.findByText('Ventas registradas');
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-11-02' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar rango' }));
    await waitFor(() => {
      expect(queries.at(-1)?.get('from')).toBe('2026-11-01T07:00:00.000Z');
      expect(queries.at(-1)?.get('to')).toBe('2026-11-03T08:00:00.000Z');
    });
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-03-02' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-03-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar rango' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/posterior/);
  });

  test('shows an explicit empty state and Sin comparación for zero sales', async () => {
    server.use(
      http.get('/api/v1/admin/dashboard/summary', ({ request }) => {
        const base = summaryFor(request.url);
        return HttpResponse.json({
          data: {
            ...base,
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
          },
        });
      }),
    );
    renderDashboard();
    expect(await screen.findByText('No hay ventas registradas en este periodo.')).toBeInTheDocument();
    expect(screen.getAllByText(/Sin comparación/).length).toBeGreaterThan(0);
  });

  test('shows current cash independently and lists latest sales with filters', async () => {
    let cashRequests = 0;
    const saleQueries: URLSearchParams[] = [];
    server.use(
      http.get('/api/v1/cash-sessions/current', () => {
        cashRequests += 1;
        return HttpResponse.json({
          data: {
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
          },
        });
      }),
      http.get('/api/v1/sales', ({ request }) => {
        saleQueries.push(new URL(request.url).searchParams);
        return HttpResponse.json({
          data: [
            {
              id: '9',
              saleNumber: 'V000009',
              orderId: '8',
              paymentId: '7',
              totalCents: '4500',
              soldAt: '2026-11-24T18:00:00.000Z',
              method: 'CASH',
            },
          ],
          page: { limit: 5, nextCursor: null },
        });
      }),
    );
    renderDashboard();
    expect(await screen.findByText('Caja actual')).toBeInTheDocument();
    expect(screen.getByText('Empleado #3')).toBeInTheDocument();
    expect(screen.getByText('$1,000.00')).toBeInTheDocument();
    expect(screen.getByText('$1,045.00')).toBeInTheDocument();
    expect(await screen.findByText('V000009')).toBeInTheDocument();
    expect(saleQueries[0].get('method')).toBeNull();
    expect(saleQueries[0].get('order')).toBe('desc');
    fireEvent.click(screen.getByRole('button', { name: 'Últimos 7 días' }));
    await waitFor(() => expect(saleQueries.at(-1)?.get('from')).toBe('2026-11-18T08:00:00.000Z'));
    expect(cashRequests).toBe(1);
  });

  test('shows no open cash session without treating it as an error', async () => {
    server.use(
      http.get('/api/v1/admin/dashboard/summary', ({ request }) =>
        HttpResponse.json({ data: summaryFor(request.url) }),
      ),
    );
    renderDashboard();
    expect(await screen.findByText('Sin caja abierta.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('opens and closes a protected ticket from the latest sales list', async () => {
    const sale = {
      id: '9',
      saleNumber: 'V000009',
      orderId: '8',
      paymentId: '7',
      totalCents: '4500',
      soldAt: '2026-11-24T18:00:00.000Z',
      method: 'STRIPE' as const,
    };
    server.use(
      http.get('/api/v1/admin/dashboard/summary', ({ request }) =>
        HttpResponse.json({ data: summaryFor(request.url) }),
      ),
      http.get('/api/v1/sales', () =>
        HttpResponse.json({ data: [sale], page: { limit: 5, nextCursor: null } }),
      ),
      http.get('/api/v1/sales/9/ticket', () =>
        HttpResponse.json({
          data: {
            saleId: '9',
            saleNumber: 'V000009',
            orderFolio: 'A000009',
            soldAt: '2026-11-24T18:00:00.000Z',
            currency: 'MXN',
            totalCents: '4500',
            cashReceivedCents: null,
            changeCents: null,
            items: [
              {
                productName: 'Café',
                quantity: 1,
                unitPriceCents: '4500',
                lineTotalCents: '4500',
              },
            ],
            registration: null,
          },
        }),
      ),
    );
    renderDashboard();
    const trigger = await screen.findByRole('button', { name: 'Ver ticket V000009' });
    fireEvent.click(trigger);
    expect(await screen.findByRole('heading', { name: 'Ticket reimpreso' })).toHaveFocus();
    expect(screen.getByText('Ticket V000009')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar ticket' }));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Ticket reimpreso' })).not.toBeInTheDocument(),
    );
    expect(trigger).toHaveFocus();
  });

  test('discards an in-flight ticket when filters change', async () => {
    server.use(
      http.get('/api/v1/admin/dashboard/summary', ({ request }) =>
        HttpResponse.json({ data: summaryFor(request.url) }),
      ),
      http.get('/api/v1/sales', () =>
        HttpResponse.json({
          data: [
            {
              id: '9',
              saleNumber: 'V000009',
              orderId: '8',
              paymentId: '7',
              totalCents: '4500',
              soldAt: '2026-11-24T18:00:00.000Z',
              method: 'STRIPE',
            },
          ],
          page: { limit: 5, nextCursor: null },
        }),
      ),
      http.get('/api/v1/sales/9/ticket', async () => {
        await delay(100);
        return HttpResponse.json({
          data: {
            saleId: '9',
            saleNumber: 'V000009',
            orderFolio: 'A000009',
            soldAt: '2026-11-24T18:00:00.000Z',
            currency: 'MXN',
            totalCents: '4500',
            cashReceivedCents: null,
            changeCents: null,
            items: [],
            registration: null,
          },
        });
      }),
    );
    renderDashboard();
    fireEvent.click(await screen.findByRole('button', { name: 'Ver ticket V000009' }));
    fireEvent.click(screen.getByRole('button', { name: 'Últimos 7 días' }));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(screen.queryByRole('heading', { name: 'Ticket reimpreso' })).not.toBeInTheDocument();
    expect(screen.queryByText('Recuperando ticket…')).not.toBeInTheDocument();
  });

  test('reports a ticket read failure without charging or issuing access', async () => {
    server.use(
      http.get('/api/v1/admin/dashboard/summary', ({ request }) =>
        HttpResponse.json({ data: summaryFor(request.url) }),
      ),
      http.get('/api/v1/sales', () =>
        HttpResponse.json({
          data: [
            {
              id: '9',
              saleNumber: 'V000009',
              orderId: '8',
              paymentId: '7',
              totalCents: '4500',
              soldAt: '2026-11-24T18:00:00.000Z',
              method: 'CASH',
            },
          ],
          page: { limit: 5, nextCursor: null },
        }),
      ),
      http.get('/api/v1/sales/9/ticket', () =>
        HttpResponse.json({ title: 'No encontrado' }, { status: 404 }),
      ),
    );
    renderDashboard();
    fireEvent.click(await screen.findByRole('button', { name: 'Ver ticket V000009' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/no existe/);
    expect(screen.queryByRole('heading', { name: 'Ticket reimpreso' })).not.toBeInTheDocument();
  });

  test('does not keep an old open cash state after a failed refresh', async () => {
    let fail = false;
    server.use(
      http.get('/api/v1/admin/dashboard/summary', ({ request }) =>
        HttpResponse.json({ data: summaryFor(request.url) }),
      ),
      http.get('/api/v1/cash-sessions/current', () =>
        fail
          ? HttpResponse.json({ title: 'No disponible' }, { status: 503 })
          : HttpResponse.json({
              data: {
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
              },
            }),
      ),
    );
    renderDashboard();
    expect(await screen.findByText('Empleado #3')).toBeInTheDocument();
    fail = true;
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar resumen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/No fue posible consultar la caja/);
    expect(screen.queryByText('Abierta')).not.toBeInTheDocument();
    expect(screen.queryByText('Empleado #3')).not.toBeInTheDocument();
  });

  test('keeps sales and cash independent when cash fails', async () => {
    server.use(
      http.get('/api/v1/admin/dashboard/summary', ({ request }) =>
        HttpResponse.json({ data: summaryFor(request.url) }),
      ),
      http.get('/api/v1/cash-sessions/current', () =>
        HttpResponse.json({ title: 'No disponible' }, { status: 503 }),
      ),
    );
    renderDashboard();
    expect((await screen.findAllByText('$12,345.00')).length).toBeGreaterThan(0);
    expect(await screen.findByRole('alert')).toHaveTextContent(/No fue posible consultar la caja/);
    expect(screen.getByText('No hay ventas en este periodo.')).toBeInTheDocument();
    expect(screen.queryByText('Sin caja abierta.')).not.toBeInTheDocument();
  });

  test('shows an API error and an unverifiable response without inventing data', async () => {
    server.use(
      http.get('/api/v1/admin/dashboard/summary', () =>
        HttpResponse.json({ title: 'No autorizado', status: 403 }, { status: 403 }),
      ),
    );
    renderDashboard();
    expect(await screen.findByRole('alert')).toHaveTextContent(/administración/);
    expect(screen.queryByText('Ventas registradas')).not.toBeInTheDocument();

    server.use(
      http.get('/api/v1/admin/dashboard/summary', () =>
        HttpResponse.json({ data: { totalCents: '1' } }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se puede verificar/);
  });
});

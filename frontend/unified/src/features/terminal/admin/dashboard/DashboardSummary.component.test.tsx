import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { delay, HttpResponse, http } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { server } from '../../../../test/server';
import { DashboardSummary } from './DashboardSummary';

const now = () => new Date('2026-11-24T20:00:00.000Z');

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

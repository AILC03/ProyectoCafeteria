import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Request } from '@playwright/test';
import { categoryParticipationForUrl } from '../src/test/categoryFixture';
import { noMovementForUrl } from '../src/test/noMovementFixture';
import {
  largeRankingItems,
  over19DigitItems,
  productRankingForUrl,
  twelveMovementItems,
} from '../src/test/rankingFixture';
import { salesSeriesForUrl } from '../src/test/seriesFixture';

const administrator = {
  id: '1',
  name: 'Ana',
  role: 'ADMINISTRADOR',
  accountType: 'STAFF',
  mustChangePin: false,
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

type Variant =
  | 'ok'
  | 'zero'
  | 'large'
  | 'over19'
  | 'invalid'
  | '429'
  | 'ranking-down'
  | 'summary-down';

function dashboardSummary(url: string) {
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
    totalCents: '4500',
    ticketCount: '1',
    averageTicketCents: '4500',
    unitsSold: '1',
    paymentMix: { cashCents: '4500', stripeCents: '0' },
    comparison: {
      totalCents: { previous: '0', change: '4500', changePercent: null },
      ticketCount: { previous: '0', change: '1', changePercent: null },
      averageTicketCents: { previous: '0', change: '4500', changePercent: null },
      unitsSold: { previous: '0', change: '1', changePercent: null },
    },
  };
}

async function mock(
  context: BrowserContext,
  variant: Variant = 'ok',
): Promise<{
  writes: string[];
  rankingQueries: URLSearchParams[];
  rankingRequests: Request[];
  rankingCalls: () => number;
}> {
  const writes: string[] = [];
  const rankingQueries: URLSearchParams[] = [];
  const rankingRequests: Request[] = [];
  let rankingCalls = 0;
  await context.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (data: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (path === '/api/v1/auth/me') return json({ data: administrator });
    if (path === '/api/v1/auth/csrf') return json({ data: { csrfToken: 'e2e-ranking-csrf' } });
    if (request.method() !== 'GET') {
      writes.push(`${request.method()} ${path}`);
      return json({}, 404);
    }
    if (path === '/api/v1/admin/dashboard/summary') {
      if (variant === 'summary-down') {
        return json({ title: 'No disponible', code: 'DEPENDENCY_UNAVAILABLE' }, 503);
      }
      return json({ data: dashboardSummary(request.url()) });
    }
    if (path === '/api/v1/admin/dashboard/sales-series') {
      return json({ data: salesSeriesForUrl(request.url()) });
    }
    if (path === '/api/v1/admin/dashboard/product-ranking') {
      rankingCalls += 1;
      rankingRequests.push(request);
      const query = new URL(request.url()).searchParams;
      rankingQueries.push(query);
      if (variant === '429') {
        return json({ title: 'Límite', code: 'RATE_LIMITED' }, 429);
      }
      if (variant === 'ranking-down') {
        return json({ title: 'No disponible', code: 'DEPENDENCY_UNAVAILABLE' }, 503);
      }
      if (variant === 'invalid') {
        return json({ data: { ...productRankingForUrl(request.url(), twelveMovementItems), top: '10' } });
      }
      const items =
        variant === 'zero'
          ? []
          : variant === 'large'
            ? largeRankingItems
            : variant === 'over19'
              ? over19DigitItems
              : twelveMovementItems;
      return json({ data: productRankingForUrl(request.url(), items) });
    }
    if (path === '/api/v1/admin/dashboard/no-movement-products') {
      return json({ data: noMovementForUrl(request.url(), []) });
    }
    if (path === '/api/v1/admin/dashboard/category-participation') {
      return json({ data: categoryParticipationForUrl(request.url()) });
    }
    if (path === '/api/v1/cash-sessions/current') return json({ data: null });
    if (path === '/api/v1/sales') {
      return json({ data: [sale], page: { limit: 5, nextCursor: null } });
    }
    return json({ code: 'NOT_FOUND' }, 404);
  });
  return { writes, rankingQueries, rankingRequests, rankingCalls: () => rankingCalls };
}

test.describe('TASK-DA-E2-06 product ranking panel', () => {
  test('renders the accessible default ranking with complete metadata', async ({ page, context }) => {
    const state = await mock(context);
    await page.goto('/terminal/administracion');
    await expect(page.getByRole('heading', { name: 'Ranking de productos' })).toBeVisible();
    const table = page.getByRole('table', { name: /Ranking de productos por unidades/ });
    await expect(table).toBeVisible();
    await expect(table.getByRole('caption')).toHaveText(
      'Ranking de productos por unidades vendidas en orden descendente (más vendidos); top 5; importe bruto en MXN',
    );
    await expect(table.getByRole('rowheader')).toHaveCount(5);
    await expect(page.getByText(/Mostrando 5 de 12 productos con movimiento/)).toBeVisible();
    await expect(page.getByText('Unidades del conjunto')).toBeVisible();
    await expect(page.getByText('78', { exact: true })).toBeVisible();
    await expect(page.getByText('$78.00')).toBeVisible();
    await expect(table.getByText('ID 12')).toBeVisible();
    expect(state.rankingQueries[0].get('metric')).toBe('units');
    expect(state.rankingQueries[0].get('direction')).toBe('top');
    expect(state.rankingQueries[0].get('top')).toBe('5');
    expect(state.rankingQueries[0].has('method')).toBe(false);
    expect(state.writes).toEqual([]);
  });

  test('changes metric, direction and top with the keyboard and passes axe', async ({ page, context }) => {
    const state = await mock(context);
    await page.goto('/terminal/administracion');
    const table = page.getByRole('table', { name: /Ranking de productos/ });
    await expect(table).toBeVisible();

    const metric = page.getByLabel('Métrica del ranking');
    await metric.focus();
    await page.keyboard.press('ArrowDown');
    await expect(metric).toHaveValue('amount');

    const direction = page.getByLabel('Dirección del ranking');
    await direction.focus();
    await page.keyboard.press('ArrowDown');
    await expect(direction).toHaveValue('bottom');

    const top = page.getByLabel('Cantidad de productos');
    await top.focus();
    await page.keyboard.press('ArrowDown');
    await expect(top).toHaveValue('10');

    await expect(
      page.getByRole('table', { name: /por importe bruto en orden ascendente/ }),
    ).toBeVisible();
    await expect(page.getByText(/Mostrando 10 de 12 productos con movimiento/)).toBeVisible();
    await expect(table.getByRole('rowheader')).toHaveCount(10);
    expect(state.rankingQueries.at(-1)?.get('metric')).toBe('amount');
    expect(state.rankingQueries.at(-1)?.get('direction')).toBe('bottom');
    expect(state.rankingQueries.at(-1)?.get('top')).toBe('10');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
    expect(await page.getByRole('main').count()).toBe(1);
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
    expect(state.writes).toEqual([]);
  });

  test('shows the zero state and never fills the top with invented rows', async ({ page, context }) => {
    await mock(context, 'zero');
    await page.goto('/terminal/administracion');
    await expect(
      page.getByText('No hay productos con movimiento para el ranking de este periodo.'),
    ).toBeVisible();
    await expect(page.getByText(/Mostrando 0 de 0 productos con movimiento/)).toBeVisible();
    await expect(page.getByRole('table', { name: /Ranking de productos/ })).toHaveCount(0);
  });

  test('renders exact values above 2^53 without Number rounding', async ({ page, context }) => {
    await mock(context, 'large');
    await page.goto('/terminal/administracion');
    const table = page.getByRole('table', { name: /Ranking de productos/ });
    await expect(table).toBeVisible();
    await expect(table.getByText('ID 9007199254740993')).toBeVisible();
    await expect(table.getByText('9,007,199,254,740,993')).toBeVisible();
    await expect(table.getByText('$90,071,992,547,409.95')).toBeVisible();
  });

  test('renders product ids and amounts with more than 19 digits', async ({ page, context }) => {
    await mock(context, 'over19');
    await page.goto('/terminal/administracion');
    const table = page.getByRole('table', { name: /Ranking de productos/ });
    await expect(table).toBeVisible();
    await expect(table.getByText('ID 123456789012345678901')).toBeVisible();
    await expect(table.getByText('123,456,789,012,345,678,901')).toBeVisible();
    await expect(table.getByText('$1,234,567,890,123,456,789.01')).toBeVisible();
  });

  test('reports an invalid DTO without rendering a ranking table', async ({ page, context }) => {
    await mock(context, 'invalid');
    await page.goto('/terminal/administracion');
    await expect(page.getByRole('alert')).toContainText('La respuesta del ranking no se puede verificar');
    await expect(page.getByRole('table', { name: /Ranking de productos/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Reintentar ranking' })).toBeVisible();
  });

  test('reports 429 once without a retry loop (P-4)', async ({ page, context }) => {
    const state = await mock(context, '429');
    await page.goto('/terminal/administracion');
    await expect(page.getByRole('alert')).toContainText('Demasiadas consultas');
    const initialCalls = state.rankingCalls();
    // React StrictMode is enabled in `main.tsx` and double-invokes effects in the
    // Vite dev server, so the first effect's request is aborted by its cleanup.
    // The transport can therefore observe at most two initial requests, but the
    // panel must keep exactly one non-aborted request (`request.failure()` is null
    // once a route has fulfilled it, and reports `net::ERR_ABORTED` otherwise).
    expect(initialCalls).toBeGreaterThanOrEqual(1);
    expect(initialCalls).toBeLessThanOrEqual(2);
    const activeCalls = () =>
      state.rankingRequests.filter((request) => request.failure() === null).length;
    expect(activeCalls()).toBe(1);
    await page.waitForTimeout(250);
    expect(state.rankingCalls()).toBe(initialCalls);
    expect(activeCalls()).toBe(1);
    await expect(page.getByRole('button', { name: 'Reintentar ranking' })).toBeVisible();
  });

  test('keeps summary, series, cash and sales when only the ranking fails', async ({ page, context }) => {
    await mock(context, 'ranking-down');
    await page.goto('/terminal/administracion');
    await expect(page.getByText('$45.00').first()).toBeVisible();
    await expect(page.getByRole('table', { name: /Series de ventas/ })).toBeVisible();
    await expect(page.getByText('Sin caja abierta.')).toBeVisible();
    await expect(page.getByText('V000009')).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('El ranking no está disponible');
    await expect(page.getByRole('table', { name: /Ranking de productos/ })).toHaveCount(0);
  });

  test('keeps the ranking visible when the summary is unavailable', async ({ page, context }) => {
    await mock(context, 'summary-down');
    await page.goto('/terminal/administracion');
    await expect(page.getByRole('alert')).toContainText('resumen');
    await expect(page.getByRole('table', { name: /Ranking de productos/ })).toBeVisible();
    await expect(page.getByText('V000009')).toBeVisible();
  });

  test('captures stable V-VIS snapshots for the ranking panel', async ({ page, context }) => {
    await mock(context);
    await page.clock.setFixedTime(new Date('2026-11-24T20:00:00.000Z'));
    await page.goto('/terminal/administracion');
    await expect(page.getByRole('table', { name: /Ranking de productos/ })).toBeVisible();
    for (const [width, height] of [
      [1280, 900],
      [768, 1024],
      [390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.locator('.dashboard-ranking').scrollIntoViewIfNeeded();
      await page.screenshot({
        path: test.info().outputPath(`dashboard-ranking-${width}x${height}.png`),
      });
    }
  });
});

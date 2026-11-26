import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext } from '@playwright/test';
import { categoryParticipationForUrl } from '../src/test/categoryFixture';
import { productRankingForUrl } from '../src/test/rankingFixture';
import { noMovementForUrl } from '../src/test/noMovementFixture';
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
  method: 'STRIPE',
};

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
    paymentMix: { cashCents: '0', stripeCents: '4500' },
    comparison: {
      totalCents: { previous: '0', change: '4500', changePercent: null },
      ticketCount: { previous: '0', change: '1', changePercent: null },
      averageTicketCents: { previous: '0', change: '4500', changePercent: null },
      unitsSold: { previous: '0', change: '1', changePercent: null },
    },
  };
}

async function mock(context: BrowserContext, seriesStatus = 200) {
  const writes: string[] = [];
  await context.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (data: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (path === '/api/v1/auth/me') return json({ data: administrator });
    if (path === '/api/v1/auth/csrf') return json({ data: { csrfToken: 'e2e-series-csrf' } });
    if (request.method() !== 'GET') {
      writes.push(`${request.method()} ${path}`);
      return json({}, 404);
    }
    if (path === '/api/v1/admin/dashboard/summary') {
      return json({ data: dashboardSummary(request.url()) });
    }
    if (path === '/api/v1/admin/dashboard/sales-series') {
      if (seriesStatus !== 200) {
        return json({ title: 'No disponible', code: 'DEPENDENCY_UNAVAILABLE' }, seriesStatus);
      }
      return json({
        data: salesSeriesForUrl(request.url(), (index) =>
          index === 0
            ? { totalCents: '1000', ticketCount: '1', unitsSold: '1' }
            : { totalCents: '0', ticketCount: '0', unitsSold: '0' },
        ),
      });
    }
    if (path === '/api/v1/cash-sessions/current') return json({ data: null });
    if (path === '/api/v1/admin/dashboard/product-ranking') {
      return json({ data: productRankingForUrl(request.url()) });
    }
    if (path === '/api/v1/admin/dashboard/no-movement-products') {
      return json({ data: noMovementForUrl(request.url(), []) });
    }
    if (path === '/api/v1/admin/dashboard/category-participation') {
      return json({ data: categoryParticipationForUrl(request.url()) });
    }
    if (path === '/api/v1/sales') {
      return json({ data: [sale], page: { limit: 5, nextCursor: null } });
    }
    if (path === '/api/v1/sales/9/ticket') {
      return json({
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
    }
    return json({ title: 'No encontrado' }, 404);
  });
  return writes;
}

test.describe('TASK-DA-E2-02 sales series panel', () => {
  test('renders exact series, accessible table, DST labels and keyboard granularity', async ({ page, context }) => {
    const writes = await mock(context);
    await page.goto('/terminal/administracion');
    await expect(page.getByRole('heading', { name: 'Series de ventas' })).toBeVisible();
    const hourTable = page.getByRole('table', { name: /Series de ventas por hora/ });
    await expect(hourTable).toBeVisible();
    await expect(hourTable.getByRole('caption')).toHaveText(
      'Series de ventas por hora; importe bruto en MXN',
    );
    await expect(hourTable.getByRole('columnheader', { name: 'Importe' })).toBeVisible();
    await expect(hourTable.getByText('$10.00').first()).toBeVisible();
    await expect(page.getByText(/hasta antes de/).first()).toBeVisible();

    await page.getByLabel('Desde').fill('2026-11-01');
    await page.getByLabel('Hasta').fill('2026-11-02');
    await page.getByRole('button', { name: 'Aplicar rango' }).click();
    await expect(hourTable.getByText('01/11/26 01:00 (UTC-07:00)')).toBeVisible();
    await expect(hourTable.getByText('01/11/26 01:00 (UTC-08:00)')).toBeVisible();
    await expect(hourTable.getByText('Hora repetida').first()).toBeVisible();

    const dayButton = page.getByRole('button', { name: 'Día', exact: true });
    await dayButton.focus();
    await page.keyboard.press('Enter');
    await expect(dayButton).toHaveAttribute('aria-pressed', 'true');
    const dayTable = page.getByRole('table', { name: /Series de ventas por día/ });
    await expect(dayTable).toBeVisible();
    await expect(dayTable.getByText('25 h')).toBeVisible();
    await expect(dayTable.getByText(/Cambio de horario/)).toBeVisible();

    await page.getByLabel('Desde').fill('2026-11-01');
    await page.getByLabel('Hasta').fill('2026-11-14');
    await page.getByRole('button', { name: 'Aplicar rango' }).click();
    await page.getByRole('button', { name: 'Hora', exact: true }).click();
    await expect(hourTable).toBeVisible();
    const chart = page.locator('.dashboard-series-chart');
    await expect(chart).toBeVisible();
    const chartOverflows = await chart.evaluate(
      (node) => node.scrollWidth > node.clientWidth && node.clientWidth > 0,
    );
    expect(chartOverflows).toBe(true);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    expect(writes).toEqual([]);
  });

  test('keeps summary, cash and latest sales when only series is unavailable', async ({ page, context }) => {
    const writes = await mock(context, 503);
    await page.goto('/terminal/administracion');
    await expect(page.getByRole('heading', { name: 'Series de ventas' })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('Las series no están disponibles');
    await expect(page.getByText('$45.00').first()).toBeVisible();
    await expect(page.getByText('V000009')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reintentar series' })).toBeVisible();
    await expect(page.getByRole('table', { name: /Series de ventas/ })).toHaveCount(0);
    expect(writes).toEqual([]);
  });
});

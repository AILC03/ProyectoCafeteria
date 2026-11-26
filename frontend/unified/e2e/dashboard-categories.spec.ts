import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page, type Request } from '@playwright/test';
import {
  categoryParticipationForUrl,
  freeCategoryItems,
} from '../src/test/categoryFixture';
import { noMovementForUrl } from '../src/test/noMovementFixture';
import { productRankingForUrl } from '../src/test/rankingFixture';
import { salesSeriesForUrl } from '../src/test/seriesFixture';

const administrator = {
  id: '1',
  name: 'Ana',
  role: 'ADMINISTRADOR',
  accountType: 'STAFF',
  mustChangePin: false,
};
const cashier = { id: '2', name: 'Caja', role: 'CAJERO', accountType: 'STAFF', mustChangePin: false };

const sale = {
  id: '9',
  saleNumber: 'V000009',
  orderId: '8',
  paymentId: '7',
  totalCents: '4500',
  soldAt: '2026-11-24T18:00:00.000Z',
  method: 'CASH',
};

type Variant = 'ok' | 'zero' | 'base-zero' | 'invalid' | 'categories-down' | 'summary-down';

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
  actor = administrator,
): Promise<{
  writes: string[];
  categoryQueries: URLSearchParams[];
  categoryRequests: Request[];
}> {
  const writes: string[] = [];
  const categoryQueries: URLSearchParams[] = [];
  const categoryRequests: Request[] = [];
  await context.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (data: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (path === '/api/v1/auth/me') return json({ data: actor });
    if (path === '/api/v1/auth/csrf') return json({ data: { csrfToken: 'e2e-categories-csrf' } });
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
      return json({ data: productRankingForUrl(request.url()) });
    }
    if (path === '/api/v1/admin/dashboard/no-movement-products') {
      return json({ data: noMovementForUrl(request.url(), []) });
    }
    if (path === '/api/v1/admin/dashboard/category-participation') {
      categoryRequests.push(request);
      const query = new URL(request.url()).searchParams;
      categoryQueries.push(query);
      if (variant === 'categories-down') {
        return json({ title: 'No disponible', code: 'DEPENDENCY_UNAVAILABLE' }, 503);
      }
      if (variant === 'zero') {
        return json({ data: categoryParticipationForUrl(request.url(), []) });
      }
      if (variant === 'base-zero') {
        return json({ data: categoryParticipationForUrl(request.url(), freeCategoryItems) });
      }
      if (variant === 'invalid') {
        const data = categoryParticipationForUrl(request.url());
        return json({ data: { ...data, totalCategories: '9' } });
      }
      return json({ data: categoryParticipationForUrl(request.url()) });
    }
    if (path === '/api/v1/cash-sessions/current') return json({ data: null });
    if (path === '/api/v1/sales') {
      return json({ data: [sale], page: { limit: 5, nextCursor: null } });
    }
    return json({ code: 'NOT_FOUND' }, 404);
  });
  return { writes, categoryQueries, categoryRequests };
}

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
}

test.describe('TASK-DA-E2-14 category participation panel', () => {
  test('renders the visible warning, denominator, inactive category and exact server shares', async ({
    page,
    context,
  }) => {
    const state = await mock(context);
    await page.goto('/terminal/administracion');
    await expect(
      page.getByRole('heading', { name: 'Participación por categorías' }),
    ).toBeVisible();
    const warning = page.getByRole('note', {
      name: 'Categoría vigente y reclasificación histórica',
    });
    await expect(warning).toBeVisible();
    await expect(warning).toContainText('Las ventas se agrupan por la categoría actual');
    await expect(warning).toContainText('el total no cambia');

    const table = page.getByRole('table', { name: /Participación por categoría actual/ });
    await expect(table).toBeVisible();
    await expect(table.getByRole('rowheader')).toHaveCount(3);
    await expect(table.getByText('Cafés')).toBeVisible();
    await expect(table.getByText('ID 3')).toBeVisible();
    await expect(table.getByText('Inactiva')).toBeVisible();
    await expect(table.getByText('Panadería')).toBeVisible();
    const shares = await table
      .getByRole('row')
      .evaluateAll((rows) =>
        rows.slice(1).map((row) => row.lastElementChild?.textContent ?? ''),
      );
    expect(shares).toEqual(['66.67 %', '25.00 %', '8.33 %']);
    await expect(page.getByText(/no se recalculan ni se normalizan a 100 %/)).toBeVisible();
    await expect(page.getByText('$45.00').first()).toBeVisible();
    await expect(page.getByRole('table', { name: /Series de ventas por/ })).toBeVisible();
    await expect(page.getByRole('table', { name: /Ranking de productos/ })).toBeVisible();

    expect(state.categoryQueries[0].get('metric')).toBe('units');
    expect([...state.categoryQueries[0].keys()]).toEqual(['from', 'to', 'metric']);
    expect(state.categoryQueries[0].has('category')).toBe(false);
    expect(state.categoryQueries[0].has('categoryId')).toBe(false);
    expect(state.writes).toEqual([]);
    await expectNoViolations(page);
  });

  test('metric, method and period changes propagate without a category filter', async ({
    page,
    context,
  }) => {
    const state = await mock(context);
    await page.goto('/terminal/administracion');
    const table = page.getByRole('table', { name: /Participación por categoría actual/ });
    await expect(table).toBeVisible();

    await page.getByLabel('Métrica de participación').selectOption('amount');
    await expect.poll(() => state.categoryQueries.at(-1)?.get('metric')).toBe('amount');
    await expect(table.getByRole('row').nth(1).locator('td').last()).toHaveText('72.22 %');
    await expect(page.getByText(/Métrica: importe bruto\./)).toBeVisible();

    await page.getByLabel('Método de pago').selectOption('CASH');
    await expect.poll(() => state.categoryQueries.at(-1)?.get('method')).toBe('CASH');
    await expect(
      page.locator('.dashboard-categories').getByText(/Método: Efectivo\./),
    ).toBeVisible();

    const initialFrom = state.categoryQueries.at(-1)?.get('from');
    await page.getByRole('button', { name: 'Últimos 7 días' }).click();
    await expect
      .poll(() => state.categoryQueries.at(-1)?.get('from'))
      .not.toBe(initialFrom);
    const afterPeriod = state.categoryQueries.at(-1)!;
    expect(afterPeriod.get('method')).toBe('CASH');
    expect(afterPeriod.get('metric')).toBe('amount');
    expect(afterPeriod.has('category')).toBe(false);
    expect(afterPeriod.has('categoryId')).toBe(false);
  });

  test('B02-style keyboard focus and native horizontal scroll for the table at 390 px', async ({
    page,
    context,
  }) => {
    await mock(context);
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('/terminal/administracion');
    await expect(
      page.getByRole('table', { name: /Participación por categoría actual/ }),
    ).toBeVisible();
    await page.getByLabel('Métrica de participación').focus();
    await page.keyboard.press('Tab');
    const region = page.getByRole('region', {
      name: 'Tabla desplazable de participación por categorías',
      exact: true,
    });
    await expect(region).toBeFocused();
    await expect(region).toHaveCSS('outline-style', 'solid');
    await expect(region).toHaveCSS('outline-width', '3px');
    expect(await region.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
    await region.press('ArrowRight');
    await expect.poll(() => region.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    ).toBeLessThanOrEqual(0);
    await expectNoViolations(page);
  });

  test('shows an explicit zero state without a table', async ({ page, context }) => {
    await mock(context, 'zero');
    await page.goto('/terminal/administracion');
    await expect(
      page.getByText('No hay categorías con movimiento en el rango y método seleccionados.'),
    ).toBeVisible();
    await expect(
      page.getByRole('table', { name: /Participación por categoría actual/ }),
    ).toHaveCount(0);
    await expect(page.getByText(/Denominador de la métrica/).first()).toBeVisible();
  });

  test('shows "sin base" when the selected amount denominator is zero', async ({
    page,
    context,
  }) => {
    await mock(context, 'base-zero');
    await page.goto('/terminal/administracion');
    const table = page.getByRole('table', { name: /Participación por categoría actual/ });
    await expect(table).toBeVisible();
    await page.getByLabel('Métrica de participación').selectOption('amount');
    await expect(page.getByText(/Sin base:/)).toBeVisible();
    const shares = await table
      .getByRole('row')
      .evaluateAll((rows) =>
        rows.slice(1).map((row) => row.lastElementChild?.textContent ?? ''),
      );
    expect(shares).toEqual(['sin base', 'sin base']);
    await expect(table.getByText('0.00 %')).toHaveCount(0);
    await expectNoViolations(page);
  });

  test('reports an unavailable panel without hiding the other panels and without retrying', async ({
    page,
    context,
  }) => {
    const state = await mock(context, 'categories-down');
    await page.goto('/terminal/administracion');
    await expect(page.getByText('$45.00').first()).toBeVisible();
    await expect(page.getByRole('table', { name: /Series de ventas por/ })).toBeVisible();
    await expect(page.getByRole('table', { name: /Ranking de productos/ })).toBeVisible();
    await expect(page.getByRole('table', { name: /Productos sin movimiento/ })).toHaveCount(0);
    await expect(page.getByRole('alert')).toContainText(
      'La participación por categorías no está disponible',
    );
    await expect(
      page.getByRole('table', { name: /Participación por categoría actual/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Reintentar participación' }),
    ).toBeVisible();
    const calls = state.categoryRequests.length;
    await page.waitForTimeout(250);
    expect(state.categoryRequests.length).toBe(calls);
    expect(state.writes).toEqual([]);
  });

  test('reports an invalid DTO without rendering rows', async ({ page, context }) => {
    await mock(context, 'invalid');
    await page.goto('/terminal/administracion');
    await expect(page.getByRole('alert')).toContainText(
      'La respuesta de participación por categorías no se puede verificar',
    );
    await expect(
      page.getByRole('table', { name: /Participación por categoría actual/ }),
    ).toHaveCount(0);
  });

  test('does not request participation before the administrative guard allows it', async ({
    page,
    context,
  }) => {
    const state = await mock(context, 'ok', cashier);
    await page.goto('/terminal/administracion');
    await expect(page.getByRole('heading', { name: 'Acceso no disponible' })).toBeVisible();
    await page.waitForTimeout(150);
    expect(state.categoryRequests).toEqual([]);
  });

  test('captures stable V-VIS snapshots and checks axe at 768 px for the category panel', async ({
    page,
    context,
  }) => {
    await mock(context);
    await page.clock.setFixedTime(new Date('2026-11-24T20:00:00.000Z'));
    await page.goto('/terminal/administracion');
    await expect(
      page.getByRole('table', { name: /Participación por categoría actual/ }),
    ).toBeVisible();
    for (const [width, height] of [
      [1280, 900],
      [768, 1024],
      [390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.locator('.dashboard-categories').scrollIntoViewIfNeeded();
      if (width === 768) await expectNoViolations(page);
      await page.screenshot({
        path: test.info().outputPath(`dashboard-categories-${width}x${height}.png`),
      });
    }
  });
});

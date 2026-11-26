import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Request } from '@playwright/test';
import {
  manyNoMovementItems,
  noMovementCursorFor,
  noMovementForUrl,
} from '../src/test/noMovementFixture';
import { productRankingForUrl } from '../src/test/rankingFixture';
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

type Variant = 'ok' | 'zero' | 'invalid' | 'no-movement-down' | 'summary-down';

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
  noMovementQueries: URLSearchParams[];
  noMovementRequests: Request[];
}> {
  const writes: string[] = [];
  const noMovementQueries: URLSearchParams[] = [];
  const noMovementRequests: Request[] = [];
  await context.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (data: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (path === '/api/v1/auth/me') return json({ data: administrator });
    if (path === '/api/v1/auth/csrf') return json({ data: { csrfToken: 'e2e-no-movement-csrf' } });
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
      noMovementRequests.push(request);
      const query = new URL(request.url()).searchParams;
      noMovementQueries.push(query);
      if (variant === 'no-movement-down') {
        return json({ title: 'No disponible', code: 'DEPENDENCY_UNAVAILABLE' }, 503);
      }
      if (variant === 'zero') {
        return json({ data: noMovementForUrl(request.url(), []) });
      }
      if (variant === 'invalid') {
        const data = noMovementForUrl(request.url(), manyNoMovementItems);
        return json({ data: { ...data, page: { ...data.page, limit: '10' } } });
      }
      return json({ data: noMovementForUrl(request.url(), manyNoMovementItems) });
    }
    if (path === '/api/v1/cash-sessions/current') return json({ data: null });
    if (path === '/api/v1/sales') {
      return json({ data: [sale], page: { limit: 5, nextCursor: null } });
    }
    return json({ code: 'NOT_FOUND' }, 404);
  });
  return { writes, noMovementQueries, noMovementRequests };
}

test.describe('TASK-DA-E2-10 no-movement products panel', () => {
  test('renders the separated label, universe cut, exact range/method and multipage list', async ({
    page,
    context,
  }) => {
    const state = await mock(context);
    await page.goto('/terminal/administracion');
    await expect(page.getByRole('heading', { name: 'Activos sin movimiento' })).toBeVisible();
    await expect(
      page.getByText('Sin movimiento en el rango y método seleccionados'),
    ).toBeVisible();
    await expect(page.getByText(/No afirma ausencia global de ventas/)).toBeVisible();

    const table = page.getByRole('table', { name: /Productos sin movimiento/ });
    await expect(table).toBeVisible();
    await expect(table.getByRole('rowheader')).toHaveCount(20);
    await expect(table.getByText('Activo 01')).toBeVisible();
    await expect(table.getByText('No disponible').first()).toBeVisible();
    await expect(page.getByText(/Corte del universo:/)).toBeVisible();
    await expect(page.getByText(/no dados de baja/)).toBeVisible();
    await expect(page.getByText(/createdAt < to/)).toHaveCount(0);
    const panel = page.locator('.dashboard-no-movement');
    await expect(panel.getByText(/Total del conjunto sin movimiento/)).toContainText('25');
    await expect(panel.getByText(/Periodo consultado:/)).toContainText(
      'Método: Todos los métodos.',
    );
    expect(state.noMovementQueries[0].get('limit')).toBe('20');
    expect(state.noMovementQueries[0].has('cursor')).toBe(false);
    expect(state.noMovementQueries[0].has('method')).toBe(false);
    expect(state.writes).toEqual([]);

    const more = page.getByRole('button', { name: 'Cargar más' });
    await more.focus();
    await page.keyboard.press('Enter');
    await expect(table.getByRole('rowheader')).toHaveCount(25);
    await expect(page.getByText('No hay más productos.')).toBeVisible();
    expect(state.noMovementQueries.at(-1)?.get('cursor')).toBe(noMovementCursorFor(20));
    const ids = await table.getByRole('rowheader').evaluateAll((nodes) =>
      nodes.map((node) => /ID (\d+)/.exec(node.textContent ?? '')?.[1]),
    );
    expect(new Set(ids).size).toBe(25);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
    expect(await page.getByRole('main').count()).toBe(1);
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
    expect(state.writes).toEqual([]);
  });

  test('changing the period, method and page size restarts the cursor and updates the echo', async ({
    page,
    context,
  }) => {
    const state = await mock(context);
    await page.goto('/terminal/administracion');
    const table = page.getByRole('table', { name: /Productos sin movimiento/ });
    await expect(table).toBeVisible();
    await page.getByRole('button', { name: 'Cargar más' }).click();
    await expect(table.getByRole('rowheader')).toHaveCount(25);
    expect(state.noMovementQueries.at(-1)?.get('cursor')).toBe(noMovementCursorFor(20));

    const initialFrom = state.noMovementQueries.at(-1)?.get('from');
    await page.getByRole('button', { name: 'Últimos 7 días' }).click();
    await expect
      .poll(() => state.noMovementQueries.at(-1)?.get('from'))
      .not.toBe(initialFrom);
    const afterPeriod = state.noMovementQueries.at(-1)!;
    expect(afterPeriod.has('cursor')).toBe(false);

    await page.getByLabel('Método de pago').selectOption('CASH');
    await expect(
      page.locator('.dashboard-no-movement').getByText(/Periodo consultado:/),
    ).toContainText('Método: Efectivo.');
    const afterMethod = state.noMovementQueries.at(-1)!;
    expect(afterMethod.get('method')).toBe('CASH');
    expect(afterMethod.has('cursor')).toBe(false);

    await page.getByLabel('Productos por página').selectOption('10');
    await expect.poll(() => state.noMovementQueries.at(-1)?.get('limit')).toBe('10');
    await expect(table.getByRole('rowheader')).toHaveCount(10);
    const afterLimit = state.noMovementQueries.at(-1)!;
    expect(afterLimit.get('limit')).toBe('10');
    expect(afterLimit.has('cursor')).toBe(false);
  });

  test('shows the zero state without claiming global absence of sales', async ({ page, context }) => {
    await mock(context, 'zero');
    await page.goto('/terminal/administracion');
    await expect(
      page.getByText(/No hay productos sin movimiento en el rango y método seleccionados/),
    ).toBeVisible();
    await expect(page.getByText(/No es una afirmación de ausencia global de ventas/)).toBeVisible();
    await expect(page.getByText(/Total del conjunto sin movimiento/)).toContainText(
      'Mostrando 0 de 0',
    );
    await expect(page.getByRole('table', { name: /Productos sin movimiento/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cargar más' })).toHaveCount(0);
  });

  test('reports an unavailable list without hiding the other panels and without retrying', async ({
    page,
    context,
  }) => {
    const state = await mock(context, 'no-movement-down');
    await page.goto('/terminal/administracion');
    await expect(page.getByText('$45.00').first()).toBeVisible();
    await expect(page.getByRole('table', { name: /Series de ventas/ })).toBeVisible();
    await expect(page.getByRole('table', { name: /Ranking de productos/ })).toBeVisible();
    await expect(page.getByText('Sin caja abierta.')).toBeVisible();
    await expect(page.getByText('V000009')).toBeVisible();
    await expect(page.getByRole('alert')).toContainText(
      'La lista de productos sin movimiento no está disponible',
    );
    await expect(page.getByRole('table', { name: /Productos sin movimiento/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Reintentar lista' })).toBeVisible();
    const calls = state.noMovementRequests.length;
    await page.waitForTimeout(250);
    expect(state.noMovementRequests.length).toBe(calls);
    expect(state.writes).toEqual([]);
  });

  test('reports an invalid DTO without rendering rows', async ({ page, context }) => {
    await mock(context, 'invalid');
    await page.goto('/terminal/administracion');
    await expect(page.getByRole('alert')).toContainText(
      'La respuesta de la lista no se puede verificar',
    );
    await expect(page.getByRole('table', { name: /Productos sin movimiento/ })).toHaveCount(0);
  });

  test('captures stable V-VIS snapshots for the no-movement panel', async ({ page, context }) => {
    await mock(context);
    await page.clock.setFixedTime(new Date('2026-11-24T20:00:00.000Z'));
    await page.goto('/terminal/administracion');
    await expect(page.getByRole('table', { name: /Productos sin movimiento/ })).toBeVisible();
    for (const [width, height] of [
      [1280, 900],
      [768, 1024],
      [390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.locator('.dashboard-no-movement').scrollIntoViewIfNeeded();
      await page.screenshot({
        path: test.info().outputPath(`dashboard-no-movement-${width}x${height}.png`),
      });
    }
  });
});

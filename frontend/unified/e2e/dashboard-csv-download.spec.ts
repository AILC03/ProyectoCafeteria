import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
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

function csvResponse(filename: string) {
  return {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
    body: '#meta,export,sales-export\r\n#meta,schemaVersion,1\r\n',
  };
}

type Mocks = { csvRequests: string[]; writes: string[] };

type MockOptions = {
  salesExportStatus?: number;
  /** Awaited by the first sales-export request, letting a test hold it open. */
  holdSalesExport?: () => Promise<void>;
};

async function mock(context: BrowserContext, options: MockOptions = {}): Promise<Mocks> {
  const { salesExportStatus = 200, holdSalesExport } = options;
  const csvRequests: string[] = [];
  const writes: string[] = [];
  let heldSalesExport = false;
  await context.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (data: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });

    if (path === '/api/v1/auth/me') return json({ data: administrator });
    if (path === '/api/v1/auth/csrf') return json({ data: { csrfToken: 'e2e-csv-csrf' } });
    if (request.method() !== 'GET') {
      writes.push(`${request.method()} ${path}`);
      return json({}, 404);
    }
    if (path === '/api/v1/admin/dashboard/summary') {
      return json({ data: dashboardSummary(request.url()) });
    }
    if (path === '/api/v1/admin/dashboard/sales-series') {
      return json({ data: salesSeriesForUrl(request.url(), () => ({
        totalCents: '1000',
        ticketCount: '1',
        unitsSold: '1',
      })) });
    }
    if (path === '/api/v1/admin/dashboard/product-ranking') {
      return json({ data: productRankingForUrl(request.url()) });
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
    if (path.endsWith('-export.csv')) {
      csvRequests.push(`${path}${url.search}`);
      if (path === '/api/v1/admin/dashboard/sales-export.csv' && salesExportStatus !== 200) {
        return json(
          { title: 'Too many requests', status: salesExportStatus, code: 'RATE_LIMITED' },
          salesExportStatus,
        );
      }
      if (
        path === '/api/v1/admin/dashboard/sales-export.csv' &&
        holdSalesExport !== undefined &&
        !heldSalesExport
      ) {
        heldSalesExport = true;
        await holdSalesExport();
      }
      try {
        return await route.fulfill(csvResponse(`download-${path.split('/').pop()}`));
      } catch {
        // The user may cancel while the response is held; the browser aborts
        // the request and the route can no longer be fulfilled.
        return undefined;
      }
    }
    return json({ title: 'No encontrado' }, 404);
  });
  return { csvRequests, writes };
}

async function downloadFromButton(page: Page, name: string) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name, exact: true }).click(),
  ]);
  const filename = download.suggestedFilename();
  const filePath = await download.path();
  const body = filePath === null ? '' : await readFile(filePath, 'utf8');
  return { filename, body };
}

test.describe('TASK-DA-E2-CSV-02 CSV downloads', () => {
  test('downloads all five datasets with the visible filters, keyboard and no writes', async ({ page, context }) => {
    const mocks = await mock(context);
    await page.goto('/terminal/administracion');

    await expect(page.getByRole('button', { name: 'Descargar ventas (CSV)' })).toBeVisible();

    // Keyboard activation on the sales download.
    const salesButton = page.getByRole('button', { name: 'Descargar ventas (CSV)' });
    await salesButton.focus();
    await expect(salesButton).toBeFocused();
    const [keyboardDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.keyboard.press('Enter'),
    ]);
    expect(keyboardDownload.suggestedFilename()).toBe('download-sales-export.csv');
    await expect(page.getByText(/Descarga iniciada: download-sales-export\.csv/)).toBeVisible();

    // Method filter is carried into the next authenticated request.
    await page.getByLabel('Método de pago').selectOption('CASH');
    const cash = await downloadFromButton(page, 'Descargar ventas (CSV)');
    expect(cash.filename).toBe('download-sales-export.csv');
    expect(cash.body).toContain('#meta,export,sales-export');

    // Series follow their visible granularity.
    await page.getByRole('button', { name: 'Día', exact: true }).click();
    const series = await downloadFromButton(page, 'Descargar series (CSV)');
    expect(series.filename).toBe('download-sales-series-export.csv');

    // Ranking follows metric, direction and top.
    await page.getByLabel('Métrica del ranking').selectOption('amount');
    await page.getByLabel('Cantidad de productos').selectOption('10');
    const ranking = await downloadFromButton(page, 'Descargar ranking (CSV)');
    expect(ranking.filename).toBe('download-product-ranking-export.csv');

    // No-movement export exists independently and does not paginate.
    const noMovement = await downloadFromButton(page, 'Descargar sin movimiento (CSV)');
    expect(noMovement.filename).toBe('download-no-movement-products-export.csv');

    // Category participation follows its metric.
    await page.getByLabel('Métrica de participación').selectOption('amount');
    const categories = await downloadFromButton(page, 'Descargar participación (CSV)');
    expect(categories.filename).toBe('download-category-participation-export.csv');

    const salesQueries = mocks.csvRequests.filter((url) => url.includes('/sales-export.csv'));
    expect(salesQueries.some((url) => url.includes('method=CASH'))).toBe(true);
    const seriesQuery = mocks.csvRequests.find((url) => url.includes('/sales-series-export.csv'))!;
    expect(new URLSearchParams(seriesQuery.split('?')[1]).get('granularity')).toBe('day');
    const rankingQuery = mocks.csvRequests.find((url) => url.includes('/product-ranking-export.csv'))!;
    const rankingParams = new URLSearchParams(rankingQuery.split('?')[1]);
    expect(rankingParams.get('metric')).toBe('amount');
    expect(rankingParams.get('direction')).toBe('top');
    expect(rankingParams.get('top')).toBe('10');
    const noMovementQuery = mocks.csvRequests.find((url) => url.includes('/no-movement-products-export.csv'))!;
    expect(new URLSearchParams(noMovementQuery.split('?')[1]).has('limit')).toBe(false);
    expect(new URLSearchParams(noMovementQuery.split('?')[1]).has('cursor')).toBe(false);
    const categoriesQuery = mocks.csvRequests.find((url) => url.includes('/category-participation-export.csv'))!;
    expect(new URLSearchParams(categoriesQuery.split('?')[1]).get('metric')).toBe('amount');

    for (const query of mocks.csvRequests) {
      expect(query).not.toContain('token=');
      expect(query).not.toContain('access_token=');
      expect(query).not.toContain('jwt=');
    }
    expect(mocks.writes).toEqual([]);
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    expect(await page.evaluate(() => sessionStorage.length)).toBe(0);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('shows a sanitized error and never downloads a Problem Details response', async ({ page, context }) => {
    const mocks = await mock(context, { salesExportStatus: 429 });
    const downloads: string[] = [];
    page.on('download', (download) => downloads.push(download.suggestedFilename()));

    await page.goto('/terminal/administracion');
    await page.getByRole('button', { name: 'Descargar ventas (CSV)' }).click();

    await expect(page.getByRole('alert')).toContainText('Demasiadas consultas. Inténtalo más tarde.');
    expect(downloads).toEqual([]);
    expect(mocks.csvRequests).toHaveLength(1);
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
  });

  test('keeps every panel rendered and disables exports for the 1999-12-31 range', async ({
    page,
    context,
  }) => {
    const mocks = await mock(context);
    const downloads: string[] = [];
    page.on('download', (download) => downloads.push(download.suggestedFilename()));

    await page.goto('/terminal/administracion');
    await expect(page.getByRole('button', { name: 'Descargar ventas (CSV)' })).toBeVisible();

    await page.getByLabel('Desde').fill('1999-12-31');
    await page.getByLabel('Hasta').fill('1999-12-31');
    await page.getByRole('button', { name: 'Aplicar rango' }).click();

    await expect(page.getByText('1999-12-31 a 1999-12-31')).toBeVisible();
    for (const heading of [
      'Resumen del periodo',
      'Series de ventas',
      'Ranking de productos',
      'Activos sin movimiento',
      'Participación por categorías',
    ]) {
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    }
    for (const name of [
      'Descargar ventas (CSV)',
      'Descargar series (CSV)',
      'Descargar ranking (CSV)',
      'Descargar sin movimiento (CSV)',
      'Descargar participación (CSV)',
    ]) {
      await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
    }
    await expect(
      page.getByText(
        'La exportación no está disponible para rangos anteriores al 1 de enero de 2000.',
      ),
    ).toHaveCount(5);

    // No export request is fired for an unsupported range and nothing downloads.
    expect(mocks.csvRequests).toEqual([]);
    expect(downloads).toEqual([]);
  });

  test('cancels an in-flight export by keyboard, announces it and allows a retry', async ({ page, context }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    const downloads: string[] = [];
    page.on('download', (download) => downloads.push(download.suggestedFilename()));

    const mocks = await mock(context, {
      holdSalesExport: async () => {
        started();
        await gate;
      },
    });

    await page.goto('/terminal/administracion');
    await page.getByRole('button', { name: 'Descargar ventas (CSV)' }).click();
    await startedPromise;
    await expect(page.getByText('Descargando las ventas del periodo.')).toBeVisible();

    // The cancel action is reachable and operable with the keyboard.
    const cancel = page.getByRole('button', { name: 'Cancelar descarga' });
    await cancel.focus();
    await expect(cancel).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.getByText('Descarga cancelada; no se guardó ningún archivo.')).toBeVisible();
    expect(downloads).toEqual([]);
    expect(mocks.csvRequests).toHaveLength(1);
    release();
    await expect(page.getByRole('button', { name: 'Cancelar descarga' })).toHaveCount(0);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Descargar ventas (CSV)' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('download-sales-export.csv');
    expect(mocks.csvRequests).toHaveLength(2);
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  });
});

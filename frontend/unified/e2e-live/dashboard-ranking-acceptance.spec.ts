import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  request as playwrightRequest,
  test,
  type APIResponse,
  type Page,
  type Response,
} from '@playwright/test';
import { formatMxnCents } from '../src/shared/utils/money';
import { createCustomPeriod } from '../src/features/terminal/admin/dashboard/periods';

const BASE_URL = 'http://localhost:5173';
const RANKING_PATH = '/api/v1/admin/dashboard/product-ranking';
const SUMMARY_PATH = '/api/v1/admin/dashboard/summary';
const SALES_SUMMARY_PATH = '/api/v1/sales/summary';

const liveReady =
  process.env.E2E_LIVE === '1' &&
  typeof process.env.E2E_LIVE_MANIFEST === 'string' &&
  process.env.E2E_LIVE_MANIFEST.length > 0;

test.skip(
  !liveReady,
  'Suite live omitida: define E2E_LIVE=1 y E2E_LIVE_MANIFEST. No cuenta como evidencia ejecutada.',
);

type Credentials = { username: string; password: string };
type RankingItem = {
  position?: string;
  productId: string;
  name: string;
  nameSource?: 'current' | 'snapshot';
  unitsSold: string;
  totalCents: string;
};
type RankingData = {
  generatedAt: string;
  currency: 'MXN';
  period: { from: string; to: string; timeZone: string };
  method: 'CASH' | 'STRIPE' | null;
  metric: 'units' | 'amount';
  direction: 'top' | 'bottom';
  top: string;
  matchedProductCount: string;
  matchedTotals: { unitsSold: string; totalCents: string };
  truncated: boolean;
  items: RankingItem[];
};
type Manifest = {
  dataset: string;
  main: { from: string; to: string; fromDate: string };
  users: { admin: Credentials; cashier: Credentials; prep: Credentials };
  expected: {
    unitsTop: {
      matchedProductCount: string;
      totals: { unitsSold: string; totalCents: string };
      items: Array<Pick<RankingItem, 'productId' | 'name' | 'unitsSold' | 'totalCents'>>;
    };
    amountTop: { items: Array<Pick<RankingItem, 'productId' | 'name' | 'unitsSold' | 'totalCents'>> };
    bottomUnits: { items: Array<Pick<RankingItem, 'productId' | 'unitsSold'>> };
    cash: { unitsSold: string; totalCents: string; matchedProductCount: string };
    stripe: { unitsSold: string; totalCents: string; matchedProductCount: string };
    summary: {
      totalCents: string;
      ticketCount: string;
      unitsSold: string;
      paymentMix: { cashCents: string; stripeCents: string };
    };
    salesSummary: {
      count: string;
      totalCents: string;
      cashCents: string;
      stripeCents: string;
    };
  };
};
type SummaryData = {
  totalCents: string;
  ticketCount: string;
  unitsSold: string;
  paymentMix: { cashCents: string; stripeCents: string };
};
type SalesSummary = { count: string; totalCents: string; cashCents: string; stripeCents: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function loadManifest(): Manifest {
  const path = process.env.E2E_LIVE_MANIFEST;
  if (!path) throw new Error('Falta E2E_LIVE_MANIFEST.');
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (
    !isRecord(parsed) ||
    !isRecord(parsed.main) ||
    typeof parsed.main.from !== 'string' ||
    typeof parsed.main.to !== 'string' ||
    !isRecord(parsed.users) ||
    !isRecord(parsed.expected)
  ) {
    throw new Error('El manifiesto live E2-07 no tiene la estructura esperada.');
  }
  return parsed as Manifest;
}

const manifest: Manifest | null = liveReady ? loadManifest() : null;

function liveManifest(): Manifest {
  if (manifest === null) throw new Error('Manifiesto live no disponible.');
  return manifest;
}

function pathOf(url: string): string {
  return new URL(url).pathname;
}

function query(params: ReadonlyArray<readonly [string, string]>): string {
  const search = new URLSearchParams();
  for (const [key, value] of params) search.append(key, value);
  return `?${search.toString()}`;
}

function rankingMatches(
  response: Response,
  expected: {
    from: string;
    to: string;
    metric: 'units' | 'amount';
    direction: 'top' | 'bottom';
    top: string;
    method?: 'CASH' | 'STRIPE' | null;
  },
): boolean {
  if (pathOf(response.url()) !== RANKING_PATH) return false;
  const search = new URL(response.url()).searchParams;
  return (
    search.get('from') === expected.from &&
    search.get('to') === expected.to &&
    search.get('metric') === expected.metric &&
    search.get('direction') === expected.direction &&
    search.get('top') === expected.top &&
    (expected.method === undefined
      ? true
      : expected.method === null
        ? search.get('method') === null
        : search.get('method') === expected.method)
  );
}

async function jsonData<T>(response: APIResponse | Response): Promise<T> {
  const payload = (await response.json()) as { data?: T };
  if (!isRecord(payload) || !('data' in payload)) {
    throw new Error('Respuesta sin envoltura de datos.');
  }
  return payload.data as T;
}

async function loginStaff(page: Page, credentials: Credentials): Promise<void> {
  await page.goto('/terminal/acceso');
  await expect(page.getByRole('heading', { name: 'Acceso a terminal' })).toBeVisible();
  await page.getByLabel('Usuario').fill(credentials.username);
  await page.getByLabel('Contraseña').fill(credentials.password);
  await page.getByRole('button', { name: 'Iniciar sesión como personal' }).click();
  const outcome = await Promise.race([
    page
      .waitForURL((url) => !url.pathname.endsWith('/terminal/acceso'), { timeout: 15_000 })
      .then(() => 'ok' as const),
    page.getByRole('alert').waitFor({ state: 'visible' }).then(() => 'error' as const),
  ]).catch(() => 'error' as const);
  if (outcome === 'error' || page.url().endsWith('/terminal/acceso')) {
    const message = await page.getByRole('alert').textContent().catch(() => null);
    await page.goto('about:blank').catch(() => undefined);
    throw new Error(`Inicio de sesión de personal falló${message ? `: ${message}` : ''}.`);
  }
  await expect(page.getByRole('heading', { name: 'Acceso no disponible' })).toHaveCount(0);
}

async function openAdminDashboard(page: Page): Promise<void> {
  await page.goto('/terminal/administracion');
  await expect(page.getByRole('heading', { name: 'Resumen del periodo' })).toBeVisible();
}

function rankingPanel(page: Page) {
  return page.getByRole('heading', { name: 'Ranking de productos' }).locator('xpath=ancestor::section[1]');
}

async function applyCustomRange(page: Page, startDate: string, endDate: string): Promise<void> {
  await page.getByLabel('Desde').fill(startDate);
  await page.getByLabel('Hasta').fill(endDate);
  await page.getByRole('button', { name: 'Aplicar rango' }).click();
}

function assertIntegrity(ranking: RankingData): void {
  expect(ranking.currency).toBe('MXN');
  expect(ranking.period.timeZone).toBe('America/Tijuana');
  expect(BigInt(ranking.matchedProductCount)).toBeGreaterThanOrEqual(BigInt(ranking.items.length));
  expect(ranking.truncated).toBe(
    BigInt(ranking.matchedProductCount) > BigInt(ranking.items.length),
  );
  let units = 0n;
  let cents = 0n;
  for (const [index, item] of ranking.items.entries()) {
    expect(BigInt(item.unitsSold)).toBeGreaterThan(0n);
    expect(item.position).toBe(String(index + 1));
    expect(item.productId).toMatch(/^[1-9][0-9]*$/);
    units += BigInt(item.unitsSold);
    cents += BigInt(item.totalCents);
  }
  expect(units).toBeLessThanOrEqual(BigInt(ranking.matchedTotals.unitsSold));
  expect(cents).toBeLessThanOrEqual(BigInt(ranking.matchedTotals.totalCents));
}

function expectPrivateHeaders(response: Response | APIResponse): void {
  expect(response.headers()['cache-control']).toContain('no-store');
  expect(response.headers()['referrer-policy']).toBe('no-referrer');
}

function formatViolations(
  violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations'],
): string {
  return violations
    .map((violation) => {
      const targets = violation.nodes.map((node) => node.target.join(' ')).join(' | ');
      return `- [${violation.impact ?? 'unknown'}] ${violation.id}: ${violation.help} (${targets})`;
    })
    .join('\n');
}

async function expectNoA11yViolations(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    results.violations,
    `Violaciones de accesibilidad en ${label}:\n${formatViolations(results.violations)}`,
  ).toEqual([]);
}

test.describe('DA-001 E2-07 — aceptación real de ranking', () => {
  test('día principal: ranking units/top/5 concilia con resumen y API real', async ({ page }) => {
    const data = liveManifest();
    const { from, to, fromDate } = data.main;
    await loginStaff(page, data.users.admin);
    await openAdminDashboard(page);

    const summaryPromise = page.waitForResponse(
      (response) =>
        pathOf(response.url()) === SUMMARY_PATH &&
        new URL(response.url()).searchParams.get('from') === from,
    );
    const rankingPromise = page.waitForResponse((response) =>
      rankingMatches(response, { from, to, metric: 'units', direction: 'top', top: '5', method: null }),
    );
    await applyCustomRange(page, fromDate, fromDate);
    const [summaryResponse, rankingResponse] = await Promise.all([summaryPromise, rankingPromise]);
    expect(rankingResponse.status()).toBe(200);
    expectPrivateHeaders(rankingResponse);

    const ranking = await jsonData<RankingData>(rankingResponse);
    assertIntegrity(ranking);
    expect(ranking.period).toMatchObject({ from, to, timeZone: 'America/Tijuana' });
    expect(ranking.method).toBeNull();
    expect(ranking.metric).toBe('units');
    expect(ranking.direction).toBe('top');
    expect(ranking.top).toBe('5');
    expect(ranking.matchedProductCount).toBe(data.expected.unitsTop.matchedProductCount);
    expect(ranking.matchedTotals).toEqual(data.expected.unitsTop.totals);
    expect(
      ranking.items.map(({ productId, name, unitsSold, totalCents }) => ({
        productId,
        name,
        unitsSold,
        totalCents,
      })),
    ).toEqual(data.expected.unitsTop.items);

    const summary = await jsonData<SummaryData>(summaryResponse);
    expect(summary.totalCents).toBe(ranking.matchedTotals.totalCents);
    expect(summary.unitsSold).toBe(ranking.matchedTotals.unitsSold);
    expect(summary.ticketCount).toBe(data.expected.summary.ticketCount);
    expect(summary.paymentMix).toEqual(data.expected.summary.paymentMix);

    const salesSummaryResponse = await page.request.get(
      `${SALES_SUMMARY_PATH}${query([
        ['from', from],
        ['to', to],
      ])}`,
    );
    expect(salesSummaryResponse.status()).toBe(200);
    const salesSummary = await jsonData<SalesSummary>(salesSummaryResponse);
    expect(salesSummary).toEqual(data.expected.salesSummary);

    const panel = rankingPanel(page);
    await expect(panel.getByRole('table')).toBeVisible();
    await expect(panel.getByRole('table').locator('caption')).toContainText('top 5');
    await expect(panel.getByRole('table').locator('tbody tr')).toHaveCount(5);
    await expect(panel.getByText('Mostrando 5 de 5 productos con movimiento')).toBeVisible();
    await expect(panel.getByText(formatMxnCents(ranking.matchedTotals.totalCents))).toBeVisible();
    for (const item of ranking.items) {
      const row = panel.getByRole('row', { name: new RegExp(item.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
      await expect(row).toContainText(`ID ${item.productId}`);
      await expect(row).toContainText(formatMxnCents(item.totalCents));
    }
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
  });

  test('amount/top/10, bottom units y método CASH/STRIPE usan la API real', async ({ page }) => {
    const data = liveManifest();
    const { from, to, fromDate } = data.main;
    await loginStaff(page, data.users.admin);
    await openAdminDashboard(page);
    await applyCustomRange(page, fromDate, fromDate);
    await rankingPanel(page).getByRole('table').waitFor();

    const amountPromise = page.waitForResponse((response) =>
      rankingMatches(response, { from, to, metric: 'amount', direction: 'top', top: '10', method: null }),
    );
    await page.getByLabel('Métrica del ranking').selectOption('amount');
    await page.getByLabel('Cantidad de productos').selectOption('10');
    const amount = await jsonData<RankingData>(await amountPromise);
    assertIntegrity(amount);
    expect(amount.metric).toBe('amount');
    expect(amount.top).toBe('10');
    expect(amount.matchedProductCount).toBe('5');
    expect(amount.truncated).toBe(false);
    expect(
      amount.items.map(({ productId, name, unitsSold, totalCents }) => ({
        productId,
        name,
        unitsSold,
        totalCents,
      })),
    ).toEqual(data.expected.amountTop.items);

    const bottomPromise = page.waitForResponse((response) =>
      rankingMatches(response, { from, to, metric: 'units', direction: 'bottom', top: '5', method: null }),
    );
    await page.getByLabel('Métrica del ranking').selectOption('units');
    await page.getByLabel('Dirección del ranking').selectOption('bottom');
    await page.getByLabel('Cantidad de productos').selectOption('5');
    const bottom = await jsonData<RankingData>(await bottomPromise);
    assertIntegrity(bottom);
    expect(bottom.items.map(({ productId, unitsSold }) => ({ productId, unitsSold }))).toEqual(
      data.expected.bottomUnits.items,
    );
    expect(bottom.items.every((item) => BigInt(item.unitsSold) > 0n)).toBe(true);

    for (const [method, expected] of [
      ['CASH', data.expected.cash],
      ['STRIPE', data.expected.stripe],
    ] as const) {
      const methodPromise = page.waitForResponse((response) =>
        rankingMatches(response, {
          from,
          to,
          metric: 'units',
          direction: 'bottom',
          top: '5',
          method,
        }),
      );
      await page.getByLabel('Método de pago').selectOption(method);
      const byMethod = await jsonData<RankingData>(await methodPromise);
      assertIntegrity(byMethod);
      expect(byMethod.method).toBe(method);
      expect(byMethod.matchedProductCount).toBe(expected.matchedProductCount);
      expect(byMethod.matchedTotals).toEqual({
        unitsSold: expected.unitsSold,
        totalCents: expected.totalCents,
      });
    }
  });

  test('cero, roles, cabeceras y accesibilidad con datos reales', async ({ page, browser }) => {
    const data = liveManifest();
    await loginStaff(page, data.users.admin);
    await openAdminDashboard(page);

    const zeroPeriod = createCustomPeriod('2020-01-01', '2020-01-01');
    const zeroPromise = page.waitForResponse((response) =>
      rankingMatches(response, {
        from: zeroPeriod.from,
        to: zeroPeriod.to,
        metric: 'units',
        direction: 'top',
        top: '5',
        method: null,
      }),
    );
    await applyCustomRange(page, '2020-01-01', '2020-01-01');
    const zero = await jsonData<RankingData>(await zeroPromise);
    expect(zero.matchedProductCount).toBe('0');
    expect(zero.items).toEqual([]);
    expect(zero.matchedTotals).toEqual({ unitsSold: '0', totalCents: '0' });
    await expect(
      rankingPanel(page).getByText('No hay productos con movimiento para el ranking de este periodo.'),
    ).toBeVisible();

    const mainFrom = data.main.from;
    const mainTo = data.main.to;
    const rankingPath = `${RANKING_PATH}${query([
      ['from', mainFrom],
      ['to', mainTo],
      ['metric', 'units'],
      ['direction', 'top'],
      ['top', '5'],
    ])}`;
    const invalid = await page.request.get(
      `${RANKING_PATH}${query([
        ['from', mainFrom],
        ['to', mainTo],
        ['metric', 'units'],
        ['direction', 'top'],
        ['top', '05'],
      ])}`,
    );
    expect(invalid.status()).toBe(400);
    expectPrivateHeaders(invalid);

    for (const role of ['cashier', 'prep'] as const) {
      const context = await browser.newContext({ baseURL: BASE_URL });
      const rolePage = await context.newPage();
      const adminRequests: string[] = [];
      rolePage.on('request', (request) => {
        if (new URL(request.url()).pathname.startsWith('/api/v1/admin/')) {
          adminRequests.push(`${request.method()} ${new URL(request.url()).pathname}`);
        }
      });
      try {
        await loginStaff(rolePage, data.users[role]);
        await rolePage.goto('/terminal/administracion');
        await expect(rolePage.getByRole('heading', { name: 'Acceso no disponible' })).toBeVisible();
        expect(adminRequests).toEqual([]);
        const forbidden = await rolePage.request.get(rankingPath);
        expect(forbidden.status()).toBe(403);
        expectPrivateHeaders(forbidden);
      } finally {
        await context.close();
      }
    }
    const anonymous = await playwrightRequest.newContext({ baseURL: BASE_URL });
    try {
      const unauthorized = await anonymous.get(rankingPath);
      expect(unauthorized.status()).toBe(401);
      expectPrivateHeaders(unauthorized);
    } finally {
      await anonymous.dispose();
    }

    await applyCustomRange(page, data.main.fromDate, data.main.fromDate);
    await rankingPanel(page).getByRole('table').waitFor();
    await expectNoA11yViolations(page, '/terminal/administracion con ranking real');
  });

  test('teclado y carrera: la última selección prevalece sin estado de carga', async ({ page }) => {
    const data = liveManifest();
    const { from, to, fromDate } = data.main;
    await loginStaff(page, data.users.admin);
    await openAdminDashboard(page);
    await applyCustomRange(page, fromDate, fromDate);
    await rankingPanel(page).getByRole('table').waitFor();

    const metric = page.getByLabel('Métrica del ranking');
    await metric.focus();
    await metric.press('ArrowDown');
    await expect(metric).toHaveValue('amount');
    await page.getByRole('button', { name: 'Actualizar ranking' }).waitFor({ state: 'visible' });

    const finalPromise = page.waitForResponse((response) =>
      rankingMatches(response, { from, to, metric: 'units', direction: 'top', top: '5', method: null }),
    );
    await page.getByLabel('Cantidad de productos').selectOption('20');
    await page.getByLabel('Cantidad de productos').selectOption('10');
    await page.getByLabel('Cantidad de productos').selectOption('5');
    await page.getByLabel('Métrica del ranking').selectOption('units');
    const final = await jsonData<RankingData>(await finalPromise);
    assertIntegrity(final);
    await expect(rankingPanel(page).getByRole('table')).toBeVisible();
    await expect(
      rankingPanel(page).getByRole('status').filter({ hasText: 'Consultando ranking' }),
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Actualizar ranking' })).toBeEnabled();
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
  });
});

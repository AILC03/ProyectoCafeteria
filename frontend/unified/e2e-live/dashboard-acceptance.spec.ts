import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  request as playwrightRequest,
  test,
  type APIResponse,
  type Locator,
  type Page,
  type Response,
} from '@playwright/test';
import { formatMxnCents } from '../src/shared/utils/money';
import {
  createCustomPeriod,
  createPresetPeriod,
  formatInteger,
  formatPercentChange,
  type PeriodRange,
} from '../src/features/terminal/admin/dashboard/periods';

const BASE_URL = 'http://localhost:5173';
const SUMMARY_PATH = '/api/v1/admin/dashboard/summary';
const CASH_PATH = '/api/v1/cash-sessions/current';

const liveReady =
  process.env.E2E_LIVE === '1' &&
  typeof process.env.E2E_LIVE_MANIFEST === 'string' &&
  process.env.E2E_LIVE_MANIFEST.length > 0;

// Skips the whole file cleanly when the live environment is not explicitly
// requested. Skipped tests are not executed evidence.
test.skip(
  !liveReady,
  'Suite live omitida: define E2E_LIVE=1 y E2E_LIVE_MANIFEST. No cuenta como evidencia ejecutada.',
);

type Credentials = { username: string; password: string };
type ComparisonMetric = { previous: string; change: string; changePercent: string | null };
type ExpectedSummary = {
  totalCents: string;
  ticketCount: string;
  unitsSold: string;
  averageTicketCents: string;
  paymentMix: { cashCents: string; stripeCents: string };
  comparison: {
    totalCents: ComparisonMetric;
    ticketCount: ComparisonMetric;
    averageTicketCents: ComparisonMetric;
    unitsSold: ComparisonMetric;
  };
};
type Manifest = {
  from: string;
  to: string;
  users: { admin: Credentials; cashier: Credentials; prep: Credentials };
  expected: ExpectedSummary;
  cash: {
    sessionId: string;
    openingAmountCents: string;
    cashSalesCents: string;
    expectedCashCents: string;
  };
};
type SummaryData = {
  generatedAt: string;
  currency: 'MXN';
  period: { from: string; to: string; timeZone: string };
  totalCents: string;
  ticketCount: string;
  averageTicketCents: string;
  unitsSold: string;
  paymentMix: { cashCents: string; stripeCents: string };
  comparison: ExpectedSummary['comparison'];
};
type Sale = {
  id: string;
  saleNumber: string;
  totalCents: string;
  soldAt: string;
  method: 'CASH' | 'STRIPE';
};
type SalesSummary = {
  count: string;
  totalCents: string;
  cashCents: string;
  stripeCents: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function loadManifest(): Manifest {
  const path = process.env.E2E_LIVE_MANIFEST;
  if (path === undefined || path.length === 0) {
    throw new Error('Falta E2E_LIVE_MANIFEST.');
  }
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (
    !isRecord(parsed) ||
    typeof parsed.from !== 'string' ||
    typeof parsed.to !== 'string' ||
    !isRecord(parsed.users) ||
    !isRecord(parsed.expected) ||
    !isRecord(parsed.cash)
  ) {
    throw new Error('El manifiesto live no tiene la estructura esperada.');
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

function summaryResponse(response: Response): boolean {
  return pathOf(response.url()) === SUMMARY_PATH;
}

async function jsonData<T>(response: APIResponse): Promise<T> {
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
    // Leave the form before a failing assertion can persist the password in
    // Playwright's error-context snapshot.
    await page.goto('about:blank').catch(() => undefined);
    throw new Error(`Inicio de sesión de personal falló${message ? `: ${message}` : ''}.`);
  }
  await expect(page.getByRole('heading', { name: 'Acceso no disponible' })).toHaveCount(0);
}

/** Reads a `<dt>`/`<dd>` pair without depending on CSS classes. */
function definitionValue(page: Page, term: string): Locator {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return page
    .locator('dt', { hasText: new RegExp(`^${escaped}$`) })
    .locator('xpath=following-sibling::dd');
}

function cashSection(page: Page): Locator {
  return page.getByRole('heading', { name: 'Caja actual' }).locator('..');
}

function assertLocalMidnight(iso: string): void {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Tijuana',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const value = (type: string): string => parts.find((part) => part.type === type)?.value ?? '';
  expect(Number(value('hour'))).toBe(0);
  expect(Number(value('minute'))).toBe(0);
  expect(Number(value('second'))).toBe(0);
}

async function openAdminDashboard(page: Page): Promise<Response> {
  const summary = page.waitForResponse(summaryResponse);
  await page.goto('/terminal/administracion');
  await expect(page.getByRole('heading', { name: 'Resumen del periodo' })).toBeVisible();
  return summary;
}

function assertSummaryMatchesManifest(summary: SummaryData, expected: ExpectedSummary): void {
  expect(summary.totalCents).toBe(expected.totalCents);
  expect(summary.ticketCount).toBe(expected.ticketCount);
  expect(summary.unitsSold).toBe(expected.unitsSold);
  expect(summary.averageTicketCents).toBe(expected.averageTicketCents);
  expect(summary.paymentMix).toEqual(expected.paymentMix);
  expect(summary.comparison).toEqual(expected.comparison);
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
  const contrastIncomplete = results.incomplete.filter((result) => result.id === 'color-contrast');
  expect(
    contrastIncomplete,
    `Contraste no verificable automáticamente en ${label}:\n${formatViolations(contrastIncomplete)}`,
  ).toEqual([]);
}

test.describe('DA-001 E1-09 — aceptación contra backend real', () => {
  test('concilia resumen, caja y privacidad contra el backend real', async ({ page }) => {
    const data = liveManifest();
    const cashRequests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname === CASH_PATH) cashRequests.push(request.url());
    });

    await loginStaff(page, data.users.admin);
    const summaryResponseBody = await openAdminDashboard(page);

    // J: the real summary response is private.
    expect(summaryResponseBody.status()).toBe(200);
    expect(summaryResponseBody.headers()['cache-control']).toContain('no-store');
    expect(summaryResponseBody.headers()['referrer-policy']).toBe('no-referrer');

    // A/B: the dashboard uses the manifest period and the backend values.
    const summaryUrl = new URL(summaryResponseBody.url());
    expect(summaryUrl.searchParams.get('from')).toBe(data.from);
    expect(summaryUrl.searchParams.get('to')).toBe(data.to);
    expect(summaryUrl.searchParams.get('method')).toBeNull();
    const summary = await jsonData<SummaryData>(summaryResponseBody);
    expect(summary.period.from).toBe(data.from);
    expect(summary.period.to).toBe(data.to);
    assertSummaryMatchesManifest(summary, data.expected);

    await expect(definitionValue(page, 'Ventas registradas')).toContainText(
      formatMxnCents(summary.totalCents),
    );
    await expect(definitionValue(page, 'Ventas registradas')).toContainText(
      formatMxnCents(summary.comparison.totalCents.change),
    );
    await expect(definitionValue(page, 'Ventas registradas')).toContainText(
      formatPercentChange(summary.comparison.totalCents.changePercent),
    );
    await expect(definitionValue(page, 'Tickets')).toContainText(formatInteger(summary.ticketCount));
    await expect(definitionValue(page, 'Tickets')).toContainText(
      formatPercentChange(summary.comparison.ticketCount.changePercent),
    );
    await expect(definitionValue(page, 'Ticket promedio')).toContainText(
      formatMxnCents(summary.averageTicketCents),
    );
    await expect(definitionValue(page, 'Unidades vendidas')).toContainText(
      formatInteger(summary.unitsSold),
    );
    await expect(definitionValue(page, 'Efectivo')).toContainText(
      formatMxnCents(summary.paymentMix.cashCents),
    );
    await expect(definitionValue(page, 'Tarjeta registrada')).toContainText(
      formatMxnCents(summary.paymentMix.stripeCents),
    );

    // B: common metrics are reconcilable with /sales/summary using the exact
    // from/to sent by the dashboard and the same authenticated session.
    const salesSummaryResponse = await page.request.get(
      `/api/v1/sales/summary?from=${encodeURIComponent(data.from)}&to=${encodeURIComponent(data.to)}`,
    );
    expect(salesSummaryResponse.status()).toBe(200);
    const salesSummary = await jsonData<SalesSummary>(salesSummaryResponse);
    expect(salesSummary.totalCents).toBe(summary.totalCents);
    expect(salesSummary.count).toBe(summary.ticketCount);
    expect(salesSummary.cashCents).toBe(summary.paymentMix.cashCents);
    expect(salesSummary.stripeCents).toBe(summary.paymentMix.stripeCents);
    expect(salesSummary.totalCents).toBe(data.expected.totalCents);
    expect(salesSummary.count).toBe(data.expected.ticketCount);
    expect(salesSummary.cashCents).toBe(data.expected.paymentMix.cashCents);
    expect(salesSummary.stripeCents).toBe(data.expected.paymentMix.stripeCents);

    // D: current cash is independent from the selected period/method.
    await expect(definitionValue(page, 'Fondo inicial')).toContainText(
      formatMxnCents(data.cash.openingAmountCents),
    );
    await expect(definitionValue(page, 'Ventas en efectivo')).toContainText(
      formatMxnCents(data.cash.cashSalesCents),
    );
    await expect(definitionValue(page, 'Esperado')).toContainText(
      formatMxnCents(data.cash.expectedCashCents),
    );
    await expect(definitionValue(page, 'Estado')).toContainText('Abierta');
    const cashTextBefore = await cashSection(page).innerText();
    const cashRequestsBefore = cashRequests.length;

    const nextSummary = page.waitForResponse(
      (response) =>
        summaryResponse(response) &&
        new URL(response.url()).searchParams.get('from') ===
          createPresetPeriod('last7', new Date()).from,
    );
    await page.getByRole('button', { name: 'Últimos 7 días' }).click();
    await nextSummary;
    await expect(page.getByRole('button', { name: 'Actualizar resumen' })).toBeEnabled();

    const stripeSummary = page.waitForResponse(
      (response) =>
        summaryResponse(response) &&
        new URL(response.url()).searchParams.get('method') === 'STRIPE',
    );
    await page.getByLabel('Método de pago').selectOption('STRIPE');
    await stripeSummary;
    await expect(page.getByRole('button', { name: 'Actualizar resumen' })).toBeEnabled();

    expect(cashRequests).toHaveLength(cashRequestsBefore);
    expect(await cashSection(page).innerText()).toBe(cashTextBefore);

    // I: no browser storage and no secret in the URL.
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    expect(page.url()).not.toContain(data.users.admin.password);
    expect(page.url()).not.toContain('password=');
  });

  test('últimas ventas y ticket reimpreso concilian con la API real', async ({ page }) => {
    const data = liveManifest();
    const mutations: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
        mutations.push(`${request.method()} ${url.pathname}`);
      }
    });

    await loginStaff(page, data.users.admin);
    const dashboardResponse = await openAdminDashboard(page);
    const dashboardUrl = new URL(dashboardResponse.url());
    const from = dashboardUrl.searchParams.get('from');
    const to = dashboardUrl.searchParams.get('to');
    expect(from).toBe(data.from);
    expect(to).toBe(data.to);
    if (from === null || to === null) throw new Error('El resumen real no expuso from/to.');

    // E: latest sales (max 5, descending) must match the same authenticated
    // session and the exact real from/to used by the dashboard. The body is
    // read from a new API request, never from a stale browser response.
    const salesResponse = await page.request.get(
      `/api/v1/sales?order=desc&limit=5&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
    expect(salesResponse.status()).toBe(200);
    const salesPayload = await jsonData<Sale[]>(salesResponse);
    const expectedTickets = Number(data.expected.ticketCount);
    if (!Number.isSafeInteger(expectedTickets) || expectedTickets <= 0) {
      throw new Error(
        'El manifiesto live debe declarar expected.ticketCount > 0 para validar últimas ventas y ticket.',
      );
    }
    const expectedLatestSales = Math.min(5, expectedTickets);
    expect(
      salesPayload.length,
      `El dataset live debe devolver ${expectedLatestSales} venta(s) recientes para ${expectedTickets} ticket(s); ` +
        'un conjunto vacío no acredita últimas ventas ni ticket.',
    ).toBe(expectedLatestSales);
    for (let index = 1; index < salesPayload.length; index += 1) {
      expect(Date.parse(salesPayload[index - 1]!.soldAt)).toBeGreaterThanOrEqual(
        Date.parse(salesPayload[index]!.soldAt),
      );
    }
    // The DTO contract requires `^V[0-9]{6,}$`. The live fixture must produce
    // contract-valid rows; otherwise the UI cannot render them and E/F cannot
    // be treated as accepted evidence.
    const invalidNumbers = salesPayload.filter((sale) => !/^V[0-9]{6,}$/.test(sale.saleNumber));
    if (invalidNumbers.length > 0) {
      throw new Error(
        `Dataset live fuera de contrato: ${invalidNumbers.length} venta(s) no cumplen ^V[0-9]{6,}$. ` +
          'La UI rechaza la respuesta y no se pueden validar últimas ventas ni ticket.',
      );
    }

    const salesTable = page.getByRole('table', { name: 'Últimas ventas' });
    const rows = salesTable.locator('tbody tr');
    await expect(rows).toHaveCount(salesPayload.length);
    for (let index = 0; index < salesPayload.length; index += 1) {
      const row = rows.nth(index);
      const sale = salesPayload[index]!;
      await expect(row.getByRole('cell').first()).toHaveText(sale.saleNumber);
      await expect(
        row.getByRole('button', { name: `Ver ticket ${sale.saleNumber}` }),
      ).toBeVisible();
    }

    // F: one click opens the reprinted ticket, without any charging write or
    // ticket-access request. The QR is never captured or logged.
    const firstSale = salesPayload[0]!;
    const ticketTrigger = page.getByRole('button', {
      name: `Ver ticket ${firstSale.saleNumber}`,
    });
    const mutationsBeforeTicket = mutations.length;
    const ticketResponse = page.waitForResponse(
      (response) =>
        pathOf(response.url()) === `/api/v1/sales/${firstSale.id}/ticket` &&
        response.request().method() === 'GET',
    );
    await ticketTrigger.click();
    expect((await ticketResponse).status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Ticket reimpreso' })).toBeVisible();
    await expect(page.getByRole('heading', { name: `Ticket ${firstSale.saleNumber}` })).toBeVisible();
    const ticketRegion = page.getByRole('region', { name: 'Ticket reimpreso' });
    await expect(
      ticketRegion.getByText(`Total: ${formatMxnCents(firstSale.totalCents)}`, { exact: true }),
    ).toBeVisible();

    const ticketMutations = mutations.slice(mutationsBeforeTicket);
    expect(ticketMutations).toEqual([]);
    expect(ticketMutations.some((entry) => entry.includes('/ticket-access'))).toBe(false);
    expect(ticketMutations.some((entry) => entry.startsWith('POST /api/v1/payments'))).toBe(false);

    await page.getByRole('button', { name: 'Cerrar ticket' }).click();
    await expect(page.getByRole('heading', { name: 'Ticket reimpreso' })).toBeHidden();
    await expect(ticketTrigger).toBeFocused();
  });

  test('periodos y método usan límites UTC coherentes y el filtro vigente prevalece', async ({
    page,
  }) => {
    const data = liveManifest();
    await loginStaff(page, data.users.admin);
    const initialSummary = await openAdminDashboard(page);
    expect(initialSummary.status()).toBe(200);

    const last7Response = page.waitForResponse(
      (response) =>
        summaryResponse(response) &&
        new URL(response.url()).searchParams.get('from') ===
          createPresetPeriod('last7', new Date()).from,
    );
    await page.getByRole('button', { name: 'Últimos 7 días' }).click();
    const last7 = await last7Response;
    const last7Data = await jsonData<SummaryData>(last7);
    const expected7: PeriodRange = createPresetPeriod('last7', new Date(last7Data.generatedAt));
    expect(last7Data.period).toMatchObject({ from: expected7.from, to: expected7.to });
    const last7Url = new URL(last7.url());
    expect(last7Url.searchParams.get('from')).toBe(expected7.from);
    expect(last7Url.searchParams.get('to')).toBe(expected7.to);
    assertLocalMidnight(last7Data.period.from);
    assertLocalMidnight(last7Data.period.to);
    await expect(definitionValue(page, 'Ventas registradas')).toContainText(
      formatMxnCents(last7Data.totalCents),
    );

    const stripeResponse = page.waitForResponse(
      (response) =>
        summaryResponse(response) &&
        new URL(response.url()).searchParams.get('method') === 'STRIPE',
    );
    await page.getByLabel('Método de pago').selectOption('STRIPE');
    const stripe = await stripeResponse;
    const stripeData = await jsonData<SummaryData>(stripe);
    expect(new URL(stripe.url()).searchParams.get('from')).toBe(expected7.from);
    expect(new URL(stripe.url()).searchParams.get('to')).toBe(expected7.to);
    await expect(definitionValue(page, 'Ventas registradas')).toContainText(
      formatMxnCents(stripeData.totalCents),
    );
    await expect(definitionValue(page, 'Efectivo')).toContainText(
      formatMxnCents(stripeData.paymentMix.cashCents),
    );
    await expect(definitionValue(page, 'Tarjeta registrada')).toContainText(
      formatMxnCents(stripeData.paymentMix.stripeCents),
    );

    // Changing the preset keeps the active method: the newest request wins.
    const last30Response = page.waitForResponse(
      (response) =>
        summaryResponse(response) &&
        new URL(response.url()).searchParams.get('method') === 'STRIPE' &&
        new URL(response.url()).searchParams.get('from') ===
          createPresetPeriod('last30', new Date()).from,
    );
    await page.getByRole('button', { name: 'Últimos 30 días' }).click();
    const last30 = await last30Response;
    const last30Data = await jsonData<SummaryData>(last30);
    const expected30: PeriodRange = createPresetPeriod('last30', new Date(last30Data.generatedAt));
    expect(last30Data.period).toMatchObject({ from: expected30.from, to: expected30.to });
    expect(new URL(last30.url()).searchParams.get('method')).toBe('STRIPE');
    assertLocalMidnight(last30Data.period.from);
    assertLocalMidnight(last30Data.period.to);
    await expect(definitionValue(page, 'Ventas registradas')).toContainText(
      formatMxnCents(last30Data.totalCents),
    );
  });

  test('rango vacío sin comparación y accesibilidad WCAG A/AA con datos reales', async ({ page }) => {
    const data = liveManifest();
    await loginStaff(page, data.users.admin);
    const summary = await openAdminDashboard(page);
    expect(summary.status()).toBe(200);
    const summaryData = await jsonData<SummaryData>(summary);
    await expect(definitionValue(page, 'Ventas registradas')).toContainText(
      formatMxnCents(summaryData.totalCents),
    );

    await expectNoA11yViolations(page, '/terminal/administracion (datos reales)');

    const emptyRange = createCustomPeriod('2020-01-01', '2020-01-02');
    const emptyResponse = page.waitForResponse(
      (response) =>
        summaryResponse(response) &&
        new URL(response.url()).searchParams.get('from') === emptyRange.from &&
        new URL(response.url()).searchParams.get('to') === emptyRange.to,
    );
    await page.getByLabel('Desde').fill('2020-01-01');
    await page.getByLabel('Hasta').fill('2020-01-02');
    await page.getByRole('button', { name: 'Aplicar rango' }).click();
    const empty = await emptyResponse;
    expect(empty.status()).toBe(200);
    const emptyData = await jsonData<SummaryData>(empty);
    expect(emptyData.totalCents).toBe('0');
    expect(emptyData.ticketCount).toBe('0');
    expect(emptyData.averageTicketCents).toBe('0');
    expect(emptyData.unitsSold).toBe('0');
    expect(emptyData.paymentMix).toEqual({ cashCents: '0', stripeCents: '0' });
    for (const metric of Object.values(emptyData.comparison)) {
      expect(metric.changePercent).toBeNull();
      expect(metric.change).toBe('0');
    }
    expect(emptyData.period.from).toBe(emptyRange.from);
    expect(emptyData.period.to).toBe(emptyRange.to);
    assertLocalMidnight(emptyData.period.from);
    assertLocalMidnight(emptyData.period.to);

    await expect(page.getByText('No hay ventas registradas en este periodo.')).toBeVisible();
    await expect(definitionValue(page, 'Ventas registradas')).toContainText('$0.00');
    await expect(definitionValue(page, 'Tickets')).toContainText('0');
    await expect(definitionValue(page, 'Unidades vendidas')).toContainText('0');
    await expect(page.getByText(/Sin comparación/)).toHaveCount(4);
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
  });

  test('CAJERO y PREPARACION no acceden a administración y el resumen responde 403/401', async ({
    browser,
  }) => {
    const data = liveManifest();
    const summaryPath = `${SUMMARY_PATH}?from=${encodeURIComponent(data.from)}&to=${encodeURIComponent(data.to)}`;

    for (const role of ['cashier', 'prep'] as const) {
      const context = await browser.newContext({ baseURL: BASE_URL });
      const page = await context.newPage();
      const administrativeRequests: string[] = [];
      page.on('request', (request) => {
        const url = new URL(request.url());
        if (url.pathname.startsWith('/api/v1/admin/')) {
          administrativeRequests.push(`${request.method()} ${url.pathname}`);
        }
      });

      await loginStaff(page, data.users[role]);
      await page.goto('/terminal/administracion');
      await expect(page.getByRole('heading', { name: 'Acceso no disponible' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Administración' })).toHaveCount(0);
      expect(administrativeRequests).toEqual([]);

      const forbidden = await page.request.get(summaryPath);
      expect(forbidden.status()).toBe(403);
      await context.close();
    }

    const anonymous = await playwrightRequest.newContext({ baseURL: BASE_URL });
    try {
      const unauthorized = await anonymous.get(summaryPath);
      expect(unauthorized.status()).toBe(401);
    } finally {
      await anonymous.dispose();
    }
  });
});

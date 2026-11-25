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
import { createCustomPeriod } from '../src/features/terminal/admin/dashboard/periods';

const BASE_URL = 'http://localhost:5173';
const SERIES_PATH = '/api/v1/admin/dashboard/sales-series';
const SUMMARY_PATH = '/api/v1/admin/dashboard/summary';
const SALES_SUMMARY_PATH = '/api/v1/sales/summary';

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
type Manifest = {
  dataset: string;
  origin: string;
  main: { from: string; to: string; fromDate: string; toDateExclusive: string };
  users: { admin: Credentials; cashier: Credentials; prep: Credentials };
  expected: {
    summary: {
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
    salesSummary: {
      count: string;
      totalCents: string;
      cashCents: string;
      stripeCents: string;
    };
  };
};

type SeriesTotals = { totalCents: string; ticketCount: string; unitsSold: string };
type SeriesBucket = SeriesTotals & {
  start: string;
  end: string;
  localStart: string;
  effectiveFrom: string;
  effectiveTo: string;
  partial: boolean;
};
type SeriesData = {
  generatedAt: string;
  currency: 'MXN';
  period: { from: string; to: string; timeZone: 'America/Tijuana' };
  method: 'CASH' | 'STRIPE' | null;
  granularity: 'hour' | 'day';
  bucketCount: string;
  totals: SeriesTotals;
  buckets: SeriesBucket[];
};
type SummaryData = {
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
type SalesSummary = { count: string; totalCents: string; cashCents: string; stripeCents: string };
type SeriesExpectation = {
  from: string;
  to: string;
  granularity: 'hour' | 'day';
  method?: 'CASH' | 'STRIPE' | null;
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
    !isRecord(parsed.main) ||
    typeof parsed.main.from !== 'string' ||
    typeof parsed.main.to !== 'string' ||
    typeof parsed.main.fromDate !== 'string' ||
    typeof parsed.main.toDateExclusive !== 'string' ||
    !isRecord(parsed.users) ||
    !isRecord(parsed.users.admin) ||
    !isRecord(parsed.users.cashier) ||
    !isRecord(parsed.users.prep) ||
    !isRecord(parsed.expected) ||
    !isRecord(parsed.expected.summary) ||
    !isRecord(parsed.expected.summary.comparison) ||
    !isRecord(parsed.expected.salesSummary)
  ) {
    throw new Error('El manifiesto live E2-03 no tiene la estructura esperada.');
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

function localDateOf(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Tijuana',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const value = (type: string): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function inclusiveEndDate(exclusiveTo: string): string {
  return localDateOf(new Date(Date.parse(exclusiveTo) - 1).toISOString());
}

function formatSeriesCount(value: string): string {
  return BigInt(value).toLocaleString('es-MX');
}

function seriesMatches(response: Response, expected: SeriesExpectation): boolean {
  if (pathOf(response.url()) !== SERIES_PATH) return false;
  const search = new URL(response.url()).searchParams;
  if (search.get('from') !== expected.from) return false;
  if (search.get('to') !== expected.to) return false;
  if (search.get('granularity') !== expected.granularity) return false;
  const method = search.get('method');
  if (expected.method === undefined) return true;
  return expected.method === null ? method === null : method === expected.method;
}

function summaryMatches(
  response: Response,
  from: string,
  to: string,
  method?: 'CASH' | 'STRIPE' | null,
): boolean {
  if (pathOf(response.url()) !== SUMMARY_PATH) return false;
  const search = new URL(response.url()).searchParams;
  if (search.get('from') !== from || search.get('to') !== to) return false;
  if (method === undefined) return true;
  const value = search.get('method');
  return method === null ? value === null : value === method;
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
    // Leave the form before a failing assertion can persist the password in
    // Playwright's error-context snapshot.
    await page.goto('about:blank').catch(() => undefined);
    throw new Error(`Inicio de sesión de personal falló${message ? `: ${message}` : ''}.`);
  }
  await expect(page.getByRole('heading', { name: 'Acceso no disponible' })).toHaveCount(0);
}

async function openAdminDashboard(page: Page): Promise<void> {
  await page.goto('/terminal/administracion');
  await expect(page.getByRole('heading', { name: 'Resumen del periodo' })).toBeVisible();
}

function seriesPanel(page: Page): Locator {
  return page
    .getByRole('heading', { name: 'Series de ventas' })
    .locator('xpath=ancestor::section[1]');
}

/** Reads a `<dt>`/`<dd>` pair inside the series panel without depending on CSS classes. */
function seriesDefinition(page: Page, term: string): Locator {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return seriesPanel(page)
    .locator('dt', { hasText: new RegExp(`^${escaped}$`) })
    .locator('xpath=following-sibling::dd');
}

function seriesTable(page: Page): Locator {
  return page.getByRole('region', { name: 'Tabla de series de ventas' });
}

async function applyCustomRange(page: Page, startDate: string, endDate: string): Promise<void> {
  await page.getByLabel('Desde').fill(startDate);
  await page.getByLabel('Hasta').fill(endDate);
  await page.getByRole('button', { name: 'Aplicar rango' }).click();
}

function assertSeriesIntegrity(series: SeriesData): void {
  expect(series.currency).toBe('MXN');
  expect(series.period.timeZone).toBe('America/Tijuana');
  expect(BigInt(series.bucketCount)).toBe(BigInt(series.buckets.length));
  expect(series.buckets.length).toBeGreaterThan(0);

  let totalCents = 0n;
  let ticketCount = 0n;
  let unitsSold = 0n;
  for (let index = 0; index < series.buckets.length; index += 1) {
    const bucket = series.buckets[index]!;
    if (index > 0) {
      const previous = series.buckets[index - 1]!;
      expect(bucket.start, `buckets[${index}] debe iniciar donde termina el anterior`).toBe(
        previous.end,
      );
      expect(bucket.effectiveFrom, `cobertura efectiva discontinua en ${index}`).toBe(
        previous.effectiveTo,
      );
    } else {
      expect(bucket.effectiveFrom).toBe(series.period.from);
    }
    expect(bucket.partial).toBe(
      bucket.start !== bucket.effectiveFrom || bucket.end !== bucket.effectiveTo,
    );
    totalCents += BigInt(bucket.totalCents);
    ticketCount += BigInt(bucket.ticketCount);
    unitsSold += BigInt(bucket.unitsSold);
  }
  expect(series.buckets[series.buckets.length - 1]!.effectiveTo).toBe(series.period.to);
  expect(totalCents).toBe(BigInt(series.totals.totalCents));
  expect(ticketCount).toBe(BigInt(series.totals.ticketCount));
  expect(unitsSold).toBe(BigInt(series.totals.unitsSold));
}

function assertSeriesTotals(series: SeriesData, totals: SeriesTotals): void {
  expect(series.totals).toEqual(totals);
}

async function readSeries(response: Response): Promise<SeriesData> {
  expect(response.status()).toBe(200);
  return jsonData<SeriesData>(response);
}

async function fetchSeries(
  page: Page,
  params: ReadonlyArray<readonly [string, string]>,
): Promise<SeriesData> {
  const response = await page.request.get(`${SERIES_PATH}${query(params)}`);
  expect(response.status()).toBe(200);
  return jsonData<SeriesData>(response);
}

/** Asserts the private-cache headers on responses emitted by the series route. */
function expectPrivateHeaders(response: APIResponse | Response, label: string): void {
  const headers = response.headers();
  expect(headers['cache-control'] ?? '', `${label}: Cache-Control`).toContain('no-store');
  expect(headers['referrer-policy'] ?? '', `${label}: Referrer-Policy`).toBe('no-referrer');
}

async function fetchSalesSummary(
  page: Page,
  from: string,
  to: string,
  method: 'CASH' | 'STRIPE',
): Promise<SalesSummary> {
  const response = await page.request.get(
    `${SALES_SUMMARY_PATH}${query([
      ['from', from],
      ['to', to],
      ['method', method],
    ])}`,
  );
  expect(response.status()).toBe(200);
  return jsonData<SalesSummary>(response);
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

test.describe('DA-001 E2-03 — aceptación real de series', () => {
  test('día principal: concilia series, resumen y ventas, y refleja método y granularidad', async ({
    page,
  }) => {
    const data = liveManifest();
    const { from, to, fromDate } = data.main;
    const untilDate = inclusiveEndDate(to);

    await loginStaff(page, data.users.admin);
    await openAdminDashboard(page);

    const summaryPromise = page.waitForResponse((response) =>
      summaryMatches(response, from, to, null),
    );
    const seriesPromise = page.waitForResponse((response) =>
      seriesMatches(response, { from, to, granularity: 'hour', method: null }),
    );
    await applyCustomRange(page, fromDate, untilDate);
    const [summaryResponse, seriesResponse] = await Promise.all([
      summaryPromise,
      seriesPromise,
    ]);

    // J: the real series response is private.
    expect(seriesResponse.status()).toBe(200);
    expectPrivateHeaders(seriesResponse, 'series 200');

    const series = await readSeries(seriesResponse);
    expect(series.period).toMatchObject({ from, to, timeZone: 'America/Tijuana' });
    expect(series.granularity).toBe('hour');
    expect(series.method).toBeNull();
    expect(series.bucketCount).toBe('24');
    expect(series.buckets).toHaveLength(24);
    expect(series.buckets[0]!.localStart).toBe('2026-11-24T00:00:00-08:00');
    expect(series.buckets[23]!.localStart).toBe('2026-11-24T23:00:00-08:00');
    assertSeriesIntegrity(series);
    assertSeriesTotals(series, {
      totalCents: data.expected.summary.totalCents,
      ticketCount: data.expected.summary.ticketCount,
      unitsSold: data.expected.summary.unitsSold,
    });

    // B: the full administrative summary uses the same real bounds and session.
    expect(summaryResponse.status()).toBe(200);
    const summary = await jsonData<SummaryData>(summaryResponse);
    expect(summary.totalCents).toBe(series.totals.totalCents);
    expect(summary.ticketCount).toBe(series.totals.ticketCount);
    expect(summary.unitsSold).toBe(series.totals.unitsSold);
    // R-7: the server-provided average and comparison are read, never recomputed.
    expect(summary.averageTicketCents).toBe(data.expected.summary.averageTicketCents);
    expect(summary.comparison).toEqual(data.expected.summary.comparison);

    // B: common money/ticket totals are reconcilable with /sales/summary under
    // the exact real from/to of the series request and the same session.
    const salesSummaryResponse = await page.request.get(
      `${SALES_SUMMARY_PATH}${query([
        ['from', from],
        ['to', to],
      ])}`,
    );
    expect(salesSummaryResponse.status()).toBe(200);
    const salesSummary = await jsonData<SalesSummary>(salesSummaryResponse);
    expect(salesSummary.totalCents).toBe(series.totals.totalCents);
    expect(salesSummary.count).toBe(series.totals.ticketCount);
    expect(salesSummary.cashCents).toBe(data.expected.summary.paymentMix.cashCents);
    expect(salesSummary.stripeCents).toBe(data.expected.summary.paymentMix.stripeCents);
    expect(salesSummary.totalCents).toBe(data.expected.salesSummary.totalCents);
    expect(salesSummary.count).toBe(data.expected.salesSummary.count);

    // A: the accessible table and metrics show the server values verbatim.
    await expect(seriesTable(page)).toBeVisible();
    await expect(
      page.getByRole('table', { name: /Series de ventas por hora/ }),
    ).toBeVisible();
    await expect(seriesTable(page).locator('tbody tr')).toHaveCount(24);
    await expect(seriesDefinition(page, 'Importe de series')).toHaveText(
      formatMxnCents(series.totals.totalCents),
    );
    await expect(seriesDefinition(page, 'Tickets')).toHaveText(
      formatSeriesCount(series.totals.ticketCount),
    );
    await expect(seriesDefinition(page, 'Unidades vendidas')).toHaveText(
      formatSeriesCount(series.totals.unitsSold),
    );
    await expect(seriesDefinition(page, 'Bloques de la serie')).toHaveText('24');

    const stripeSummaryPromise = page.waitForResponse((response) =>
      summaryMatches(response, from, to, 'STRIPE'),
    );
    const stripeSeriesPromise = page.waitForResponse((response) =>
      seriesMatches(response, { from, to, granularity: 'hour', method: 'STRIPE' }),
    );
    await page.getByLabel('Método de pago').selectOption('STRIPE');
    const [stripeSummaryResponse, stripeSeriesResponse] = await Promise.all([
      stripeSummaryPromise,
      stripeSeriesPromise,
    ]);
    const stripe = await readSeries(stripeSeriesResponse);
    expect(stripe.method).toBe('STRIPE');
    assertSeriesIntegrity(stripe);
    assertSeriesTotals(stripe, { totalCents: '5000', ticketCount: '2', unitsSold: '3' });
    const stripeSummary = await jsonData<SummaryData>(stripeSummaryResponse);
    expect(stripeSummary.totalCents).toBe(stripe.totals.totalCents);
    expect(stripeSummary.ticketCount).toBe(stripe.totals.ticketCount);
    expect(stripeSummary.unitsSold).toBe(stripe.totals.unitsSold);
    // B-1: reconcile the STRIPE slice against /sales/summary with the same bounds.
    const stripeSales = await fetchSalesSummary(page, from, to, 'STRIPE');
    expect(stripeSales.totalCents).toBe(stripe.totals.totalCents);
    expect(stripeSales.count).toBe(stripe.totals.ticketCount);
    await expect(seriesDefinition(page, 'Importe de series')).toHaveText(
      formatMxnCents(stripe.totals.totalCents),
    );
    await expect(seriesPanel(page).getByText('Método STRIPE.')).toBeVisible();

    const cashSummaryPromise = page.waitForResponse((response) =>
      summaryMatches(response, from, to, 'CASH'),
    );
    const cashSeriesPromise = page.waitForResponse((response) =>
      seriesMatches(response, { from, to, granularity: 'hour', method: 'CASH' }),
    );
    await page.getByLabel('Método de pago').selectOption('CASH');
    const [cashSummaryResponse, cashSeriesResponse] = await Promise.all([
      cashSummaryPromise,
      cashSeriesPromise,
    ]);
    const cash = await readSeries(cashSeriesResponse);
    expect(cash.method).toBe('CASH');
    assertSeriesIntegrity(cash);
    assertSeriesTotals(cash, { totalCents: '4000', ticketCount: '1', unitsSold: '2' });
    const cashSummary = await jsonData<SummaryData>(cashSummaryResponse);
    expect(cashSummary.totalCents).toBe(cash.totals.totalCents);
    expect(cashSummary.ticketCount).toBe(cash.totals.ticketCount);
    expect(cashSummary.unitsSold).toBe(cash.totals.unitsSold);
    // B-1: reconcile the CASH slice against /sales/summary with the same bounds.
    const cashSales = await fetchSalesSummary(page, from, to, 'CASH');
    expect(cashSales.totalCents).toBe(cash.totals.totalCents);
    expect(cashSales.count).toBe(cash.totals.ticketCount);
    await expect(seriesDefinition(page, 'Importe de series')).toHaveText(
      formatMxnCents(cash.totals.totalCents),
    );
    await expect(seriesPanel(page).getByText('Método CASH.')).toBeVisible();

    // Change back to all methods and switch to day: one 24 h bucket, same
    // totals without any frontend recomputation.
    const allSummaryPromise = page.waitForResponse((response) =>
      summaryMatches(response, from, to, null),
    );
    const daySeriesPromise = page.waitForResponse((response) =>
      seriesMatches(response, { from, to, granularity: 'day', method: null }),
    );
    await page.getByLabel('Método de pago').selectOption('ALL');
    await page.getByRole('button', { name: 'Día', exact: true }).click();
    await allSummaryPromise;
    const day = await readSeries(await daySeriesPromise);
    expect(day.granularity).toBe('day');
    expect(day.method).toBeNull();
    expect(day.bucketCount).toBe('1');
    expect(day.buckets).toHaveLength(1);
    expect(Date.parse(day.buckets[0]!.end) - Date.parse(day.buckets[0]!.start)).toBe(
      24 * 60 * 60 * 1000,
    );
    expect(day.buckets[0]!.partial).toBe(false);
    assertSeriesIntegrity(day);
    assertSeriesTotals(day, {
      totalCents: '9000',
      ticketCount: '3',
      unitsSold: '5',
    });
    await expect(page.getByRole('button', { name: 'Día', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('table', { name: /Series de ventas por día/ })).toBeVisible();
    await expect(seriesTable(page).locator('tbody tr')).toHaveCount(1);
    await expect(seriesDefinition(page, 'Importe de series')).toHaveText(
      formatMxnCents(day.totals.totalCents),
    );
    await expect(seriesDefinition(page, 'Bloques de la serie')).toHaveText('1');
  });

  test('DST de otoño y primavera: horas repetidas, día de 23/25 h y totales reales', async ({
    page,
  }) => {
    const data = liveManifest();
    await loginStaff(page, data.users.admin);
    await openAdminDashboard(page);

    // Autumn: [2026-11-01T07Z, 2026-11-02T08Z) is a 25 h local day.
    const autumn = createCustomPeriod('2026-11-01', '2026-11-01');
    const autumnHourPromise = page.waitForResponse((response) =>
      seriesMatches(response, {
        from: autumn.from,
        to: autumn.to,
        granularity: 'hour',
        method: null,
      }),
    );
    await applyCustomRange(page, '2026-11-01', '2026-11-01');
    const autumnHour = await readSeries(await autumnHourPromise);
    expect(autumnHour.buckets).toHaveLength(25);
    expect(autumnHour.bucketCount).toBe('25');
    assertSeriesIntegrity(autumnHour);
    assertSeriesTotals(autumnHour, { totalCents: '300', ticketCount: '2', unitsSold: '2' });
    const repeated = autumnHour.buckets.filter((bucket) =>
      bucket.localStart.startsWith('2026-11-01T01:00:00'),
    );
    expect(repeated.map((bucket) => bucket.localStart)).toEqual([
      '2026-11-01T01:00:00-07:00',
      '2026-11-01T01:00:00-08:00',
    ]);
    // R-3: each repeated hour keeps its own real bucket values, no local sum.
    const firstRepeat = autumnHour.buckets.find(
      (bucket) => bucket.localStart === '2026-11-01T01:00:00-07:00',
    );
    const secondRepeat = autumnHour.buckets.find(
      (bucket) => bucket.localStart === '2026-11-01T01:00:00-08:00',
    );
    expect(firstRepeat, 'primer 01:00 (-07:00)').toMatchObject({
      totalCents: '100',
      ticketCount: '1',
      unitsSold: '1',
    });
    expect(secondRepeat, 'segundo 01:00 (-08:00)').toMatchObject({
      totalCents: '200',
      ticketCount: '1',
      unitsSold: '1',
    });

    const autumnRows = seriesTable(page).locator('tbody tr');
    await expect(autumnRows).toHaveCount(25);
    const repeatedRows = autumnRows.filter({ hasText: /01\/11\/26 01:00/ });
    await expect(repeatedRows).toHaveCount(2);
    await expect(repeatedRows.nth(0).locator('td').nth(2)).toContainText('Hora repetida');
    await expect(repeatedRows.nth(1).locator('td').nth(2)).toContainText('Hora repetida');

    const autumnDayPromise = page.waitForResponse((response) =>
      seriesMatches(response, {
        from: autumn.from,
        to: autumn.to,
        granularity: 'day',
        method: null,
      }),
    );
    await page.getByRole('button', { name: 'Día', exact: true }).click();
    const autumnDay = await readSeries(await autumnDayPromise);
    expect(autumnDay.buckets).toHaveLength(1);
    expect(Date.parse(autumnDay.buckets[0]!.end) - Date.parse(autumnDay.buckets[0]!.start)).toBe(
      25 * 60 * 60 * 1000,
    );
    assertSeriesIntegrity(autumnDay);
    assertSeriesTotals(autumnDay, { totalCents: '300', ticketCount: '2', unitsSold: '2' });
    await expect(autumnRows).toHaveCount(1);
    await expect(autumnRows.first().locator('td').nth(0)).toHaveText('25 h');
    await expect(autumnRows.first().locator('td').nth(2)).toContainText('Cambio de horario');

    // Spring: [2026-03-08T08Z, 2026-03-09T07Z) is a 23 h local day.
    const spring = createCustomPeriod('2026-03-08', '2026-03-08');
    const springHourPromise = page.waitForResponse((response) =>
      seriesMatches(response, {
        from: spring.from,
        to: spring.to,
        granularity: 'hour',
        method: null,
      }),
    );
    await applyCustomRange(page, '2026-03-08', '2026-03-08');
    await page.getByRole('button', { name: 'Hora', exact: true }).click();
    const springHour = await readSeries(await springHourPromise);
    expect(springHour.buckets).toHaveLength(23);
    expect(springHour.bucketCount).toBe('23');
    expect(springHour.buckets.some((bucket) => bucket.localStart.includes('T02:00:00'))).toBe(
      false,
    );
    assertSeriesIntegrity(springHour);
    assertSeriesTotals(springHour, { totalCents: '300', ticketCount: '1', unitsSold: '1' });

    const springDayPromise = page.waitForResponse((response) =>
      seriesMatches(response, {
        from: spring.from,
        to: spring.to,
        granularity: 'day',
        method: null,
      }),
    );
    await page.getByRole('button', { name: 'Día', exact: true }).click();
    const springDay = await readSeries(await springDayPromise);
    expect(springDay.buckets).toHaveLength(1);
    expect(Date.parse(springDay.buckets[0]!.end) - Date.parse(springDay.buckets[0]!.start)).toBe(
      23 * 60 * 60 * 1000,
    );
    assertSeriesIntegrity(springDay);
    assertSeriesTotals(springDay, { totalCents: '300', ticketCount: '1', unitsSold: '1' });
    const springRows = seriesTable(page).locator('tbody tr');
    await expect(springRows).toHaveCount(1);
    await expect(springRows.first().locator('td').nth(0)).toHaveText('23 h');
    await expect(springRows.first().locator('td').nth(2)).toContainText('Cambio de horario');
  });

  test('bordes por API autenticada: parciales, precisión, máximo, mínimo, cero y rechazos', async ({
    page,
  }) => {
    const data = liveManifest();
    await loginStaff(page, data.users.admin);

    // S03: partial S03 edges are clipped, effective ranges stay contiguous.
    const partial = await fetchSeries(page, [
      ['from', '2026-11-25T08:15:00.000Z'],
      ['to', '2026-11-25T09:15:00.000Z'],
      ['granularity', 'hour'],
    ]);
    expect(partial.buckets).toHaveLength(2);
    expect(partial.buckets.every((bucket) => bucket.partial)).toBe(true);
    expect(partial.buckets[0]!.effectiveFrom).toBe(partial.period.from);
    expect(partial.buckets[0]!.effectiveTo).toBe(partial.buckets[1]!.effectiveFrom);
    expect(partial.buckets[1]!.effectiveTo).toBe(partial.period.to);
    assertSeriesIntegrity(partial);
    assertSeriesTotals(partial, { totalCents: '8500', ticketCount: '2', unitsSold: '3' });

    // Precision: a sale at to - 1 µs is included; neighbouring instants are not.
    const precision = await fetchSeries(page, [
      ['from', '2026-11-26T08:00:00.000Z'],
      ['to', '2026-11-26T11:00:00.000Z'],
      ['granularity', 'hour'],
    ]);
    assertSeriesIntegrity(precision);
    assertSeriesTotals(precision, { totalCents: '100', ticketCount: '1', unitsSold: '1' });
    const precisionBucket = precision.buckets.find(
      (bucket) => bucket.start === '2026-11-26T10:00:00.000Z',
    );
    expect(precisionBucket, 'bucket 10:00 con la única venta').toMatchObject({
      totalCents: '100',
      ticketCount: '1',
      unitsSold: '1',
    });
    // R-5: bracket the µs sale with real 1 ms windows. The left window ends one
    // millisecond too early, the centre window contains only the sale at
    // to - 1 µs, and the right window starts after both the sale and the
    // separate boundary sale that the frozen dataset also contains at 11:00.
    const beforePrecision = await fetchSeries(page, [
      ['from', '2026-11-26T10:59:59.998Z'],
      ['to', '2026-11-26T10:59:59.999Z'],
      ['granularity', 'hour'],
    ]);
    assertSeriesIntegrity(beforePrecision);
    assertSeriesTotals(beforePrecision, { totalCents: '0', ticketCount: '0', unitsSold: '0' });
    const centrePrecision = await fetchSeries(page, [
      ['from', '2026-11-26T10:59:59.999Z'],
      ['to', '2026-11-26T11:00:00.000Z'],
      ['granularity', 'hour'],
    ]);
    assertSeriesIntegrity(centrePrecision);
    assertSeriesTotals(centrePrecision, { totalCents: '100', ticketCount: '1', unitsSold: '1' });
    const afterPrecision = await fetchSeries(page, [
      ['from', '2026-11-26T11:00:00.001Z'],
      ['to', '2026-11-26T11:01:00.000Z'],
      ['granularity', 'hour'],
    ]);
    assertSeriesIntegrity(afterPrecision);
    assertSeriesTotals(afterPrecision, { totalCents: '0', ticketCount: '0', unitsSold: '0' });

    // S10: maximum accepted hour range: 744 h -> 745 natural buckets.
    const started = Date.now();
    const maximum = await fetchSeries(page, [
      ['from', '2026-01-01T00:30:00.000Z'],
      ['to', '2026-02-01T00:30:00.000Z'],
      ['granularity', 'hour'],
    ]);
    const elapsedMs = Date.now() - started;
    // Cost evidence only, not an SLA or a performance acceptance threshold.
    console.log(
      `[E2-03] consulta real de 745 buckets: ${elapsedMs} ms (coste observado, no SLA).`,
    );
    expect(maximum.bucketCount).toBe('745');
    expect(maximum.buckets).toHaveLength(745);
    assertSeriesIntegrity(maximum);
    assertSeriesTotals(maximum, { totalCents: '0', ticketCount: '0', unitsSold: '0' });

    // S04-F1: minimum UTC instant is rejected without truncation one ms before.
    const belowMinimum = await page.request.get(
      `${SERIES_PATH}${query([
        ['from', '2000-01-01T07:59:59.999Z'],
        ['to', '2000-01-02T08:00:00.000Z'],
        ['granularity', 'day'],
      ])}`,
    );
    expect(belowMinimum.status()).toBe(400);
    // R-2: route-level rejections from this handler also carry private headers.
    expectPrivateHeaders(belowMinimum, '400 series');
    const boundary = await fetchSeries(page, [
      ['from', '2000-01-01T08:00:00.000Z'],
      ['to', '2000-01-02T08:00:00.000Z'],
      ['granularity', 'day'],
    ]);
    expect(boundary.buckets).toHaveLength(1);
    expect(boundary.buckets[0]!.localStart).toBe('2000-01-01T00:00:00-08:00');
    expect(boundary.buckets[0]!.partial).toBe(false);
    assertSeriesIntegrity(boundary);

    // Zero: a valid empty day still returns one explicit zero bucket.
    const zero = await fetchSeries(page, [
      ['from', '2020-01-01T08:00:00.000Z'],
      ['to', '2020-01-02T08:00:00.000Z'],
      ['granularity', 'day'],
    ]);
    expect(zero.buckets).toHaveLength(1);
    assertSeriesIntegrity(zero);
    assertSeriesTotals(zero, { totalCents: '0', ticketCount: '0', unitsSold: '0' });

    const from = data.main.from;
    const to = data.main.to;
    const rejections: ReadonlyArray<{ label: string; path: string }> = [
      {
        label: 'sin granularidad',
        path: `${SERIES_PATH}${query([
          ['from', from],
          ['to', to],
        ])}`,
      },
      {
        label: 'granularidad inválida',
        path: `${SERIES_PATH}${query([
          ['from', from],
          ['to', to],
          ['granularity', 'week'],
        ])}`,
      },
      {
        label: 'extra metric',
        path: `${SERIES_PATH}${query([
          ['from', from],
          ['to', to],
          ['granularity', 'day'],
          ['metric', 'totalCents'],
        ])}`,
      },
      {
        label: 'from repetido',
        path: `${SERIES_PATH}?from=${encodeURIComponent(from)}&from=${encodeURIComponent(
          from,
        )}&to=${encodeURIComponent(to)}&granularity=day`,
      },
      {
        label: 'from como array',
        path: `${SERIES_PATH}?from%5B%5D=${encodeURIComponent(
          from,
        )}&to=${encodeURIComponent(to)}&granularity=day`,
      },
      {
        label: 'offset extra',
        path: `${SERIES_PATH}${query([
          ['from', from],
          ['to', to],
          ['granularity', 'day'],
          ['offset', '0'],
        ])}`,
      },
      {
        label: 'cuatro decimales',
        path: `${SERIES_PATH}${query([
          ['from', '2026-11-24T08:00:00.0000Z'],
          ['to', to],
          ['granularity', 'day'],
        ])}`,
      },
      {
        label: 'from >= to',
        path: `${SERIES_PATH}${query([
          ['from', from],
          ['to', from],
          ['granularity', 'day'],
        ])}`,
      },
      {
        label: 'hour > 744 h',
        path: `${SERIES_PATH}${query([
          ['from', '2026-01-01T00:00:00.000Z'],
          ['to', '2026-02-01T00:00:00.001Z'],
          ['granularity', 'hour'],
        ])}`,
      },
      {
        label: 'day > 366 días',
        path: `${SERIES_PATH}${query([
          ['from', '2026-01-01T00:00:00.000Z'],
          ['to', '2027-01-02T00:00:00.001Z'],
          ['granularity', 'day'],
        ])}`,
      },
    ];
    for (const rejection of rejections) {
      const response = await page.request.get(rejection.path);
      expect(response.status(), rejection.label).toBe(400);
      expect(
        response.headers()['content-type'] ?? '',
        `${rejection.label} debe devolver problem+json`,
      ).toContain('application/problem+json');
    }

    const bodyResponse = await page.request.fetch(
      `${SERIES_PATH}${query([
        ['from', from],
        ['to', to],
        ['granularity', 'day'],
      ])}`,
      { method: 'GET', data: 'non-empty-body' },
    );
    expect(bodyResponse.status(), 'GET con body no vacío').toBe(400);
  });

  test('roles y privacidad: ADMINISTRADOR 200, CAJERO/PREPARACION 403, anónimo 401', async ({
    browser,
  }) => {
    const data = liveManifest();
    const seriesPath = `${SERIES_PATH}${query([
      ['from', data.main.from],
      ['to', data.main.to],
      ['granularity', 'hour'],
    ])}`;

    const adminContext = await browser.newContext({ baseURL: BASE_URL });
    const adminPage = await adminContext.newPage();
    try {
      await loginStaff(adminPage, data.users.admin);
      await openAdminDashboard(adminPage);
      const adminSeries = await adminPage.request.get(seriesPath);
      expect(adminSeries.status()).toBe(200);
      expect(await adminPage.evaluate(() => localStorage.length)).toBe(0);
      expect(adminPage.url()).not.toContain(data.users.admin.password);
    } finally {
      await adminContext.close();
    }

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

      try {
        await loginStaff(page, data.users[role]);
        await page.goto('/terminal/administracion');
        await expect(page.getByRole('heading', { name: 'Acceso no disponible' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Administración' })).toHaveCount(0);
        expect(administrativeRequests).toEqual([]);

        const forbidden = await page.request.get(seriesPath);
        expect(forbidden.status()).toBe(403);
        // R-2: the authorization rejection keeps the private headers.
        expectPrivateHeaders(forbidden, `403 ${role}`);
        expect(await page.evaluate(() => localStorage.length)).toBe(0);
      } finally {
        await context.close();
      }
    }

    const anonymous = await playwrightRequest.newContext({ baseURL: BASE_URL });
    try {
      const unauthorized = await anonymous.get(seriesPath);
      expect(unauthorized.status()).toBe(401);
      // R-2: the anonymous 401 is asserted here as requested; global rejections
      // issued before the series router are not generalized.
      expectPrivateHeaders(unauthorized, '401 anónimo');
    } finally {
      await anonymous.dispose();
    }
  });

  test('accesibilidad WCAG 2.1 A/AA con series reales y alternativa tabular', async ({ page }) => {
    const data = liveManifest();
    await loginStaff(page, data.users.admin);
    await openAdminDashboard(page);

    const seriesPromise = page.waitForResponse((response) =>
      seriesMatches(response, {
        from: data.main.from,
        to: data.main.to,
        granularity: 'hour',
        method: null,
      }),
    );
    await applyCustomRange(page, data.main.fromDate, inclusiveEndDate(data.main.to));
    const series = await readSeries(await seriesPromise);

    await expect(seriesTable(page)).toBeVisible();
    await expect(seriesTable(page).locator('tbody tr')).toHaveCount(series.buckets.length);
    await expect(seriesPanel(page).getByText(/la tabla siguiente contiene los mismos datos exactos/i)).toBeVisible();
    await expect(seriesPanel(page).getByRole('status').filter({ hasText: 'Consultando series' })).toHaveCount(0);

    await expectNoA11yViolations(page, '/terminal/administracion con series reales');
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
  });

  test('teclado: Hora y Día se activan con Enter/Espacio y conservan el foco', async ({
    page,
  }) => {
    const data = liveManifest();
    await loginStaff(page, data.users.admin);
    await openAdminDashboard(page);

    const initialPromise = page.waitForResponse((response) =>
      seriesMatches(response, {
        from: data.main.from,
        to: data.main.to,
        granularity: 'hour',
        method: null,
      }),
    );
    await applyCustomRange(page, data.main.fromDate, inclusiveEndDate(data.main.to));
    await readSeries(await initialPromise);

    const hourButton = page.getByRole('button', { name: 'Hora', exact: true });
    const dayButton = page.getByRole('button', { name: 'Día', exact: true });
    await expect(hourButton).toHaveAttribute('aria-pressed', 'true');

    // R-1: keyboard activation of the day granularity with the real response.
    const dayPromise = page.waitForResponse((response) =>
      seriesMatches(response, {
        from: data.main.from,
        to: data.main.to,
        granularity: 'day',
        method: null,
      }),
    );
    await dayButton.focus();
    await dayButton.press('Enter');
    const day = await readSeries(await dayPromise);
    expect(day.granularity).toBe('day');
    await expect(dayButton).toHaveAttribute('aria-pressed', 'true');
    await expect(hourButton).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('table', { name: /Series de ventas por día/ })).toBeVisible();
    await expect(dayButton).toBeFocused();

    // R-1: Space activates the hour granularity and focus stays on the button.
    const hourPromise = page.waitForResponse((response) =>
      seriesMatches(response, {
        from: data.main.from,
        to: data.main.to,
        granularity: 'hour',
        method: null,
      }),
    );
    await hourButton.focus();
    await hourButton.press(' ');
    const hour = await readSeries(await hourPromise);
    expect(hour.granularity).toBe('hour');
    await expect(hourButton).toHaveAttribute('aria-pressed', 'true');
    await expect(dayButton).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('table', { name: /Series de ventas por hora/ })).toBeVisible();
    await expect(hourButton).toBeFocused();
  });

  test('carreras y cancelación: la última selección prevalece sin estado de carga', async ({
    page,
  }) => {
    const data = liveManifest();
    const { from, to, fromDate } = data.main;
    const untilDate = inclusiveEndDate(to);
    await loginStaff(page, data.users.admin);
    await openAdminDashboard(page);

    const initialPromise = page.waitForResponse((response) =>
      seriesMatches(response, { from, to, granularity: 'hour', method: null }),
    );
    await applyCustomRange(page, fromDate, untilDate);
    await readSeries(await initialPromise);

    const abortedSeries: string[] = [];
    page.on('requestfailed', (request) => {
      if (pathOf(request.url()) === SERIES_PATH) {
        abortedSeries.push(request.failure()?.errorText ?? 'sin detalle');
      }
    });

    // A real 745-bucket request is kept in flight so the rapid clicks below
    // genuinely cancel it; no response from this setup range is asserted.
    const largeRangeRequest = page.waitForRequest((request) => {
      if (pathOf(request.url()) !== SERIES_PATH) return false;
      return new URL(request.url()).searchParams.get('granularity') === 'hour';
    });
    await applyCustomRange(page, '2026-01-01', '2026-01-31');
    await largeRangeRequest;
    await page.evaluate(() => {
      const day = Array.from(document.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Día',
      );
      day?.click();
    });
    await page.getByRole('button', { name: 'Hora', exact: true }).click();
    await page.getByRole('button', { name: 'Últimos 7 días' }).click();

    // R-4: the final waiter is created immediately before the last action so it
    // cannot resolve with an intermediate response from the earlier clicks.
    const finalPromise = page.waitForResponse((response) =>
      seriesMatches(response, { from, to, granularity: 'hour', method: null }),
    );
    await applyCustomRange(page, fromDate, untilDate);

    const finalSeries = await readSeries(await finalPromise);
    assertSeriesIntegrity(finalSeries);
    assertSeriesTotals(finalSeries, { totalCents: '9000', ticketCount: '3', unitsSold: '5' });

    // R-4: the rapid changes really cancel in-flight series requests (observed
    // through the browser, without mocks or interception).
    expect(abortedSeries.length, 'debe abortarse al menos una petición de series').toBeGreaterThan(0);
    expect(
      abortedSeries.some((text) => /abort|cancel/i.test(text)),
      `cancelaciones observadas: ${abortedSeries.join(', ')}`,
    ).toBe(true);

    await expect(page.getByRole('button', { name: 'Hora', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: 'Día', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(seriesDefinition(page, 'Importe de series')).toHaveText(
      formatMxnCents(finalSeries.totals.totalCents),
    );
    await expect(seriesDefinition(page, 'Tickets')).toHaveText(
      formatSeriesCount(finalSeries.totals.ticketCount),
    );
    await expect(seriesTable(page).locator('tbody tr')).toHaveCount(finalSeries.buckets.length);
    await expect(
      page.getByRole('table', { name: /Series de ventas por hora/ }),
    ).toBeVisible();
    await expect(seriesPanel(page).getByRole('status').filter({ hasText: 'Consultando series' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Actualizar series' })).toBeEnabled();
  });
});

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { _electron as electron } from 'playwright';
import {
  expect,
  request as playwrightRequest,
  test,
  type APIResponse,
  type Page,
  type Response,
} from '@playwright/test';

const ORIGIN = 'http://localhost:5173';
const ENDPOINT = '/api/v1/admin/dashboard/category-participation';
const SUMMARY_ENDPOINT = '/api/v1/admin/dashboard/summary';
const SALES_SUMMARY_ENDPOINT = '/api/v1/sales/summary';
const enabled = process.env.E2E_LIVE === '1' && Boolean(process.env.E2E_LIVE_MANIFEST);
test.skip(!enabled, 'Live no habilitado: no cuenta como evidencia.');

type Credentials = { username: string; password: string };
type CustomerCredentials = { identifier: string; pin: string };
type OracleItem = {
  categoryId: string;
  name: string;
  isActive: boolean;
  unitsSold: string;
  totalCents: string;
  shareUnits: string;
  shareAmount: string;
};
type Scenario = {
  id: string;
  from: string;
  to: string;
  method: 'CASH' | 'STRIPE' | null;
  expectStatus: 200 | 500;
  startDate?: string;
  endDate?: string;
  summary?: {
    ticketCount: string;
    totalCents: string;
    lineCents: string;
    unitsSold: string;
    cashCents: string;
    stripeCents: string;
  };
  itemsUnits?: OracleItem[];
  itemsAmount?: OracleItem[];
};
type Fixture = {
  product_id: string;
  name: string;
  category_id: string;
  category_name: string;
  is_active: boolean;
  deleted_at: string | null;
  originalCategoryId: string;
  sales: Array<{
    soldAt: string;
    method: string;
    totalCents: string;
    quantity: string;
    lineTotalCents: string;
  }>;
};
type Manifest = {
  dataset: string;
  users: {
    admin: Credentials;
    cashier: Credentials;
    prep: Credentials;
    manager: Credentials;
    customer: CustomerCredentials;
    pinChange: CustomerCredentials;
  };
  fixtures: Fixture[];
  scenarios: Scenario[];
  captureDir: string;
};
type ParsedDto = {
  generatedAt: string;
  currency: string;
  period: { from: string; to: string; timeZone: string };
  method: 'CASH' | 'STRIPE' | null;
  metric: 'units' | 'amount';
  denominator: { unitsSold: string; totalCents: string };
  totalCategories: string;
  items: Array<{
    categoryId: string;
    name: string;
    isActive: boolean;
    unitsSold: string;
    totalCents: string;
    sharePercent: string;
  }>;
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function loadManifest(): Manifest {
  const filename = process.env.E2E_LIVE_MANIFEST;
  if (!filename) throw new Error('Falta manifiesto E2-15.');
  const value: unknown = JSON.parse(readFileSync(filename, 'utf8'));
  if (
    !record(value) ||
    typeof value.dataset !== 'string' ||
    !record(value.users) ||
    typeof value.captureDir !== 'string' ||
    !Array.isArray(value.scenarios) ||
    !Array.isArray(value.fixtures)
  ) {
    throw new Error('Manifiesto E2-15 inválido (sin volcar contenido privado).');
  }
  for (const role of ['admin', 'cashier', 'prep', 'manager']) {
    const credentials = value.users[role];
    if (
      !record(credentials) ||
      typeof credentials.username !== 'string' ||
      typeof credentials.password !== 'string'
    )
      throw new Error('Falta usuario QA requerido.');
  }
  for (const role of ['customer', 'pinChange']) {
    const credentials = value.users[role];
    if (
      !record(credentials) ||
      typeof credentials.identifier !== 'string' ||
      typeof credentials.pin !== 'string'
    )
      throw new Error('Falta cliente QA requerido (sin contenido privado).');
  }
  for (const item of value.fixtures) {
    if (
      !record(item) ||
      typeof item.product_id !== 'string' ||
      typeof item.name !== 'string' ||
      typeof item.category_id !== 'string' ||
      typeof item.is_active !== 'boolean' ||
      !Array.isArray(item.sales)
    )
      throw new Error('Hechos SQL de fixture inválidos.');
  }
  for (const scenario of value.scenarios) {
    if (
      !record(scenario) ||
      typeof scenario.id !== 'string' ||
      typeof scenario.from !== 'string' ||
      typeof scenario.to !== 'string' ||
      ![null, 'CASH', 'STRIPE'].includes(scenario.method as string | null) ||
      ![200, 500].includes(scenario.expectStatus as number)
    )
      throw new Error('Escenario de oráculo inválido.');
  }
  return value as Manifest;
}
const manifest = enabled ? loadManifest() : null;
function data(): Manifest {
  if (!manifest) throw new Error('Live deshabilitado.');
  return manifest;
}
function scenario(id = 'main', method: Scenario['method'] = null): Scenario {
  const found = data().scenarios.find((item) => item.id === id && item.method === method);
  if (!found) throw new Error(`Falta escenario SQL ${id}/${method ?? 'ALL'}.`);
  return found;
}
function fixture(name: string): Fixture {
  const found = data().fixtures.find((item) => item.name === name);
  if (!found) throw new Error(`Falta fixture sintético ${name}.`);
  return found;
}
function expectedItems(s: Scenario, metric: 'units' | 'amount') {
  const source = metric === 'units' ? s.itemsUnits : s.itemsAmount;
  if (!source) throw new Error(`Faltan ítems ${metric} del escenario ${s.id}.`);
  return source.map((item) => ({
    categoryId: item.categoryId,
    name: item.name,
    isActive: item.isActive,
    unitsSold: item.unitsSold,
    totalCents: item.totalCents,
    sharePercent: metric === 'units' ? item.shareUnits : item.shareAmount,
  }));
}
function expectedDenominator(s: Scenario) {
  if (!s.summary) throw new Error(`Falta resumen del escenario ${s.id}.`);
  return { unitsSold: s.summary.unitsSold, totalCents: s.summary.totalCents };
}
function query(
  s: Scenario,
  metric: 'units' | 'amount',
  extras: ReadonlyArray<readonly [string, string]> = [],
): string {
  const params = new URLSearchParams({ from: s.from, to: s.to, metric });
  if (s.method) params.set('method', s.method);
  for (const [key, value] of extras) params.append(key, value);
  return `${ENDPOINT}?${params}`;
}
function summaryQuery(s: Scenario): string {
  const params = new URLSearchParams({ from: s.from, to: s.to });
  if (s.method) params.set('method', s.method);
  return `?${params}`;
}
function privateHeaders(response: APIResponse | Response): void {
  expect(response.headers()['cache-control']).toContain('no-store');
  expect(response.headers()['referrer-policy']).toBe('no-referrer');
}
async function dto(
  response: APIResponse | Response,
  s: Scenario,
  metric: 'units' | 'amount' = 'units',
) {
  expect(response.status()).toBe(200);
  privateHeaders(response);
  const payload: unknown = await response.json();
  expect(record(payload)).toBe(true);
  if (!record(payload) || !record(payload.data)) throw new Error('DTO sin envoltura.');
  expect(Object.keys(payload)).toEqual(['data']);
  const result = payload.data;
  expect(Object.keys(result).sort()).toEqual(
    [
      'generatedAt',
      'currency',
      'period',
      'method',
      'metric',
      'denominator',
      'totalCategories',
      'items',
    ].sort(),
  );
  expect(result.generatedAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  expect(result.currency).toBe('MXN');
  expect(result.period).toEqual({
    from: new Date(s.from).toISOString(),
    to: new Date(s.to).toISOString(),
    timeZone: 'America/Tijuana',
  });
  expect(result.method).toBe(s.method);
  expect(result.metric).toBe(metric);
  const denominator = expectedDenominator(s);
  expect(result.denominator).toEqual(denominator);
  const items = expectedItems(s, metric);
  expect(result.totalCategories).toBe(String(items.length));
  expect(result.items).toEqual(items);
  const dtoItems = result.items as unknown[];
  for (const item of dtoItems) {
    if (!record(item)) throw new Error('Ítem inválido.');
    expect(item.sharePercent).toMatch(/^(100\.00|(0|[1-9][0-9]?)\.[0-9]{2})$/);
    expect(item.categoryId).toMatch(/^[1-9][0-9]*$/);
    expect(item.unitsSold).toMatch(/^(0|[1-9][0-9]*)$/);
    expect(item.totalCents).toMatch(/^(0|[1-9][0-9]*)$/);
  }
  // Inclusive residual bound: Σ shares differs from 100.00 by at most 0.005 × n points.
  if (items.length > 0) {
    const selectedBase =
      metric === 'units'
        ? BigInt(expectedDenominator(s).unitsSold)
        : BigInt(expectedDenominator(s).totalCents);
    if (selectedBase > 0n) {
      const shareCentesimas = items.reduce((acc, item) => {
        const [whole, fraction] = item.sharePercent.split('.');
        return acc + BigInt(whole!) * 100n + BigInt(fraction!);
      }, 0n);
      const difference =
        shareCentesimas > 10000n ? shareCentesimas - 10000n : 10000n - shareCentesimas;
      expect(difference * 2n).toBeLessThanOrEqual(BigInt(items.length));
    }
  }
  return result as unknown as ParsedDto;
}
async function problem(response: APIResponse, status = 400, code = 'VALIDATION_ERROR') {
  expect(response.status()).toBe(status);
  privateHeaders(response);
  expect(response.headers()['content-type']).toContain('application/problem+json');
  const body: unknown = await response.json();
  expect(record(body)).toBe(true);
  if (!record(body)) throw new Error('Problem Details inválido.');
  expect(body).toMatchObject({ status, code });
  for (const field of ['type', 'title', 'detail', 'instance', 'requestId']) {
    expect(typeof body[field]).toBe('string');
  }
  for (const forbidden of ['stack', 'sql', 'password']) expect(body).not.toHaveProperty(forbidden);
}
async function login(page: Page, credentials: Credentials): Promise<void> {
  await page.goto(`${ORIGIN}/terminal/acceso`);
  await page.getByLabel('Usuario').fill(credentials.username);
  await page.getByLabel('Contraseña').fill(credentials.password);
  await page.getByRole('button', { name: 'Iniciar sesión como personal' }).click();
  try {
    await page.waitForURL((url) => !url.pathname.endsWith('/terminal/acceso'), {
      timeout: 15_000,
    });
  } catch {
    await page.goto('about:blank');
    throw new Error('Login QA falló; no se registran credenciales ni alertas privadas.');
  }
}
function panel(page: Page) {
  return page.getByRole('region', { name: 'Participación por categorías', exact: true });
}
function matchesCategory(response: Response, s: Scenario, metric: 'units' | 'amount'): boolean {
  const url = new URL(response.url());
  return (
    url.pathname === ENDPOINT &&
    url.searchParams.get('from') === s.from &&
    url.searchParams.get('to') === s.to &&
    url.searchParams.get('metric') === metric &&
    url.searchParams.get('method') === s.method
  );
}
async function applyRange(page: Page, s: Scenario, metric: 'units' | 'amount' = 'units') {
  if (!s.startDate || !s.endDate) throw new Error(`Faltan fechas locales ${s.id}.`);
  const response = page.waitForResponse((r) => matchesCategory(r, s, metric));
  await page.getByLabel('Desde').fill(s.startDate);
  await page.getByLabel('Hasta').fill(s.endDate);
  await page.getByRole('button', { name: 'Aplicar rango' }).click();
  return dto(await response, s, metric);
}
async function open(page: Page, s: Scenario, metric: 'units' | 'amount' = 'units') {
  await login(page, data().users.admin);
  await page.goto(`${ORIGIN}/terminal/administracion`);
  await expect(page.getByRole('heading', { name: 'Resumen del periodo' })).toBeVisible();
  await applyRange(page, s, 'units');
  if (metric !== 'units') {
    const response = page.waitForResponse((r) => matchesCategory(r, s, metric));
    await page.getByLabel('Métrica de participación').selectOption(metric);
    await dto(await response, s, metric);
  }
}
async function assertRows(
  page: Page,
  s: Scenario,
  metric: 'units' | 'amount',
  baseZero = false,
): Promise<void> {
  const items = expectedItems(s, metric);
  const rows = panel(page).locator('tbody tr');
  await expect(rows).toHaveCount(items.length);
  for (const [index, item] of items.entries()) {
    const row = rows.nth(index);
    await expect(row.locator('th')).toContainText(item.name);
    await expect(row.locator('th')).toContainText(`ID ${item.categoryId}`);
    await expect(row.locator('td').nth(0)).toHaveText(item.isActive ? 'Activa' : 'Inactiva');
    await expect(row.locator('td').nth(3)).toHaveText(
      baseZero ? 'sin base' : `${item.sharePercent} %`,
    );
  }
}

test.describe('DA-001 E2-15 — participación por categorías live (sin intercepción)', () => {
  test('R01/R09/R10/R11: DTO, ambos métricas y tres métodos concilian el oráculo SQL', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await login(page, data().users.admin);
    for (const s of data().scenarios.filter((item) => item.expectStatus === 200)) {
      for (const metric of ['units', 'amount'] as const)
        await dto(await page.request.get(query(s, metric)), s, metric);
    }
    const main = scenario();
    expect(main.summary?.totalCents).toBe('143600');
    expect(main.summary?.unitsSold).toBe('29');
    const cash = scenario('main', 'CASH');
    const stripe = scenario('main', 'STRIPE');
    expect(BigInt(cash.summary!.totalCents) + BigInt(stripe.summary!.totalCents)).toBe(
      BigInt(main.summary!.totalCents),
    );
    expect(BigInt(cash.summary!.unitsSold) + BigInt(stripe.summary!.unitsSold)).toBe(
      BigInt(main.summary!.unitsSold),
    );
  });

  test('R09: conciliación completa con resumen administrativo y /sales/summary (CAJERO)', async ({
    page,
    browser,
  }) => {
    test.setTimeout(150_000);
    await login(page, data().users.admin);
    const cashierContext = await browser.newContext({ baseURL: ORIGIN });
    try {
      const cashierPage = await cashierContext.newPage();
      await login(cashierPage, data().users.cashier);
      for (const s of data().scenarios.filter(
        (item) => item.expectStatus === 200 && item.summary,
      )) {
        const admin = await page.request.get(`${SUMMARY_ENDPOINT}${summaryQuery(s)}`);
        expect(admin.status()).toBe(200);
        privateHeaders(admin);
        const adminPayload: unknown = await admin.json();
        if (!record(adminPayload) || !record(adminPayload.data))
          throw new Error('Resumen administrativo inválido.');
        expect(adminPayload.data).toMatchObject({
          totalCents: s.summary!.totalCents,
          ticketCount: s.summary!.ticketCount,
          unitsSold: s.summary!.unitsSold,
          paymentMix: { cashCents: s.summary!.cashCents, stripeCents: s.summary!.stripeCents },
        });
        const sales = await cashierPage.request.get(`${SALES_SUMMARY_ENDPOINT}${summaryQuery(s)}`);
        expect(sales.status()).toBe(200);
        privateHeaders(sales);
        const salesPayload: unknown = await sales.json();
        if (!record(salesPayload) || !record(salesPayload.data))
          throw new Error('Resumen de ventas inválido.');
        expect(salesPayload.data).toMatchObject({
          count: s.summary!.ticketCount,
          totalCents: s.summary!.totalCents,
          cashCents: s.summary!.cashCents,
          stripeCents: s.summary!.stripeCents,
        });
      }
      const legacy = scenario();
      for (const [key, value] of [
        ['category', '2'],
        ['categoryId', '2'],
      ] as const) {
        const params = new URLSearchParams({ from: legacy.from, to: legacy.to });
        params.set(key, value);
        await problem(await cashierPage.request.get(`${SALES_SUMMARY_ENDPOINT}?${params}`));
      }
    } finally {
      await cashierContext.close();
    }
  });

  test('R05/R06: reclasificación real después de la venta, total intacto y UI', async ({ page }) => {
    const moved = fixture('QA E215 Reclass moved');
    const control = fixture('QA E215 Reclass control');
    expect(moved.originalCategoryId).toBe('1');
    expect(moved.category_id).toBe('3');
    expect(moved.sales).toEqual([
      {
        soldAt: '2026-02-02T09:00:00.000000Z',
        method: 'CASH',
        totalCents: '9000',
        quantity: '2',
        lineTotalCents: '9000',
      },
    ]);
    expect(control.category_id).toBe('1');
    const s = scenario('reclass');
    expect(s.itemsUnits).toEqual([
      {
        categoryId: '3',
        name: 'Alimentos (demo)',
        isActive: true,
        unitsSold: '2',
        totalCents: '9000',
        shareUnits: '66.67',
        shareAmount: '90.00',
      },
      {
        categoryId: '1',
        name: 'Café (demo)',
        isActive: true,
        unitsSold: '1',
        totalCents: '1000',
        shareUnits: '33.33',
        shareAmount: '10.00',
      },
    ]);
    expect(s.summary?.totalCents).toBe('10000');
    await open(page, s);
    await expect(
      panel(page).getByRole('note', { name: 'Categoría vigente y reclasificación histórica' }),
    ).toBeVisible();
    await expect(panel(page)).toContainText(
      'Las ventas se agrupan por la categoría actual del producto.',
    );
    await assertRows(page, s, 'units');
    const movedRow = panel(page)
      .locator('tbody tr')
      .filter({ hasText: 'Alimentos (demo)' });
    const controlRow = panel(page).locator('tbody tr').filter({ hasText: 'Café (demo)' });
    await expect(movedRow.locator('td').nth(3)).toHaveText('66.67 %');
    await expect(controlRow.locator('td').nth(3)).toHaveText('33.33 %');
    await expect(panel(page).locator('tbody tr')).toHaveCount(2);
  });

  test('R13: categoría inactiva con movimiento se incluye y se marca', async ({ page }) => {
    const inactive = fixture('Producto categoría inactiva');
    expect(inactive.category_name).toBe('Categoría inactiva');
    expect(inactive.is_active).toBe(false);
    expect(inactive.deleted_at).toBeNull();
    expect(inactive.sales[0]?.totalCents).toBe('1500');
    const s = scenario('inactive');
    expect(s.itemsUnits?.some((item) => item.categoryId === '4' && !item.isActive)).toBe(true);
    await open(page, s);
    await assertRows(page, s, 'units');
    const inactiveRow = panel(page).locator('tbody tr').filter({ hasText: 'Categoría inactiva' });
    await expect(inactiveRow.locator('td').nth(0)).toHaveText('Inactiva');
    await expect(inactiveRow.locator('td').nth(3)).toHaveText('50.00 %');
  });

  test('R12/R13: base cero con ítems, sin base y residuo 99.99 sin normalizar', async ({ page }) => {
    const zeroAmount = scenario('zero-amount');
    expect(zeroAmount.summary?.unitsSold).toBe('3');
    expect(zeroAmount.summary?.totalCents).toBe('0');
    expect(zeroAmount.itemsAmount?.every((item) => item.shareAmount === '0.00')).toBe(true);
    await open(page, zeroAmount, 'amount');
    await expect(panel(page).locator('.dashboard-categories-base-zero')).toContainText(
      'el denominador de la métrica seleccionada es cero',
    );
    await assertRows(page, zeroAmount, 'amount', true);
    const amountResponse = await page.request.get(query(zeroAmount, 'amount'));
    const amountDto = await dto(amountResponse, zeroAmount, 'amount');
    expect(amountDto.denominator.totalCents).toBe('0');
    expect(amountDto.items).toHaveLength(2);

    const unitsBack = page.waitForResponse((r) => matchesCategory(r, zeroAmount, 'units'));
    await page.getByLabel('Métrica de participación').selectOption('units');
    await dto(await unitsBack, zeroAmount, 'units');

    const thirds = scenario('thirds');
    const changed = page.waitForResponse((r) => matchesCategory(r, thirds, 'units'));
    await page.getByLabel('Desde').fill(thirds.startDate!);
    await page.getByLabel('Hasta').fill(thirds.endDate!);
    await page.getByRole('button', { name: 'Aplicar rango' }).click();
    await dto(await changed, thirds, 'units');
    await assertRows(page, thirds, 'units');
    const shares = expectedItems(thirds, 'units').map((item) => item.sharePercent);
    expect(shares).toEqual(['33.33', '33.33', '33.33']);
    const centesimas = shares.reduce((acc, value) => {
      const [whole, fraction] = value.split('.');
      return acc + BigInt(whole!) * 100n + BigInt(fraction!);
    }, 0n);
    expect(centesimas).toBe(9999n);
    await expect(panel(page).locator('tbody')).not.toContainText('100.00 %');
    await expect(panel(page)).toContainText('no se recalculan ni se normalizan a 100 %');
  });

  test('R13/R15: cero real, empates, mayúsculas, acentos y orden SQL repetible', async ({
    page,
  }) => {
    const zero = scenario('zero');
    await open(page, zero);
    await expect(panel(page).getByRole('status')).toContainText(
      'No hay categorías con movimiento',
    );
    await expect(panel(page).getByRole('table')).toHaveCount(0);
    const zeroDto = await dto(await page.request.get(query(zero, 'units')), zero, 'units');
    expect(zeroDto.items).toEqual([]);
    expect(zeroDto.denominator).toEqual({ unitsSold: '0', totalCents: '0' });
    expect(zeroDto.totalCategories).toBe('0');

    const ties = scenario('ties');
    const order = expectedItems(ties, 'units').map((item) => `${item.name}#${item.categoryId}`);
    expect(order).toEqual([
      'QA E215 A#6',
      'QA E215 B#7',
      'QA E215 Empate#8',
      'QA E215 Empate#9',
      'QA E215 a#10',
      'QA E215 Á#11',
    ]);
    const changed = page.waitForResponse((r) => matchesCategory(r, ties, 'units'));
    await page.getByLabel('Desde').fill(ties.startDate!);
    await page.getByLabel('Hasta').fill(ties.endDate!);
    await page.getByRole('button', { name: 'Aplicar rango' }).click();
    await dto(await changed, ties, 'units');
    await assertRows(page, ties, 'units');
    await dto(await page.request.get(query(ties, 'units')), ties, 'units');
    await dto(await page.request.get(query(ties, 'amount')), ties, 'amount');
  });

  test('R03/R17: µs, from inclusivo, to−1µs, to exclusivo, mínimo y 366 días', async ({
    page,
  }) => {
    await login(page, data().users.admin);
    for (const id of ['micro-left', 'micro-center', 'micro-right'] as const) {
      const s = scenario(id);
      for (const metric of ['units', 'amount'] as const) {
        const result = await dto(await page.request.get(query(s, metric)), s, metric);
        if (id === 'micro-left') expect(result.items).toEqual([]);
        else {
          expect(result.denominator.unitsSold).toBe('1');
          expect(result.items).toHaveLength(1);
          expect(result.items[0]!.categoryId).toBe('2');
          expect(result.items[0]!.unitsSold).toBe('1');
        }
      }
    }
    const max = scenario('maximum');
    const maxUs = Date.parse(max.to) - Date.parse(max.from);
    expect(maxUs).toBe(366 * 86_400_000);
    await dto(await page.request.get(query(max, 'units')), max, 'units');
    const over = {
      ...max,
      to: new Date(Date.parse(max.to) + 1).toISOString(),
    };
    await problem(await page.request.get(query(over, 'units')));
    const min = scenario('min-boundary');
    await dto(await page.request.get(query(min, 'units')), min, 'units');
    await problem(
      await page.request.get(
        query({ ...min, from: '2000-01-01T07:59:59.999Z' }, 'units'),
      ),
    );
    const main = scenario();
    const exclusive = scenario('main-from-exclusive');
    const mainDto = await dto(await page.request.get(query(main, 'amount')), main, 'amount');
    const exclusiveDto = await dto(
      await page.request.get(query(exclusive, 'amount')),
      exclusive,
      'amount',
    );
    expect(BigInt(mainDto.denominator.totalCents)).toBeGreaterThan(
      BigInt(exclusiveDto.denominator.totalCents),
    );
  });

  test('R02/R04/R17: entrada estricta, extras, repetidos, arrays, body y errores reales', async ({
    page,
  }) => {
    await login(page, data().users.admin);
    const s = scenario();
    const base = query(s, 'units');
    for (const extras of [
      [['category', '2']],
      [['categoryId', '2']],
      [['top', '5']],
      [['limit', '10']],
      [['cursor', 'x']],
      [['includeInactive', 'true']],
      [['direction', 'asc']],
      [['from', s.from]],
      [['from[]', s.from]],
      [['metric', 'both']],
      [['method', 'cash']],
      [['method', '']],
      [['method', 'null']],
      [['metric', '']],
    ] as const)
      await problem(await page.request.get(query(s, 'units', extras)));
    for (const [key, value] of [
      ['category', '2'],
      ['categoryId', '2'],
    ] as const) {
      const legacy = new URLSearchParams({ from: s.from, to: s.to });
      legacy.set(key, value);
      await problem(await page.request.get(`${SUMMARY_ENDPOINT}?${legacy}`));
    }
    await problem(
      await page.request.get(`${ENDPOINT}?from=${encodeURIComponent(s.from)}&to=${encodeURIComponent(s.to)}`),
    );
    for (const [from, to] of [
      ['2000-01-01T07:59:59.999Z', '2000-01-02T08:00:00.000Z'],
      [s.from, s.from],
      [s.to, s.from],
      ['2025-11-25T08:00:00.000Z', '2026-11-26T08:00:00.001Z'],
      ['2026-02-30T08:00:00Z', s.to],
      ['2026-11-24T08:00:00+00:00', s.to],
    ])
      await problem(await page.request.get(query({ ...s, from, to }, 'units')));
    for (const field of ['from', 'to'] as const) {
      for (const decimals of ['0000', '00000', '000000']) {
        await problem(
          await page.request.get(
            query({ ...s, [field]: s[field].replace('.000Z', `.${decimals}Z`) }, 'units'),
          ),
        );
      }
    }
    for (const decimals of ['', '.0', '.00', '.000']) {
      const normalized = {
        ...s,
        from: s.from.replace('.000Z', `${decimals}Z`),
        to: s.to.replace('.000Z', `${decimals}Z`),
      };
      const result = await dto(await page.request.get(query(normalized, 'units')), normalized);
      expect(result.period.from).toBe(new Date(normalized.from).toISOString());
    }
    await problem(await page.request.get(base, { data: { metric: 'units' } }));
    await problem(await page.request.get(base, { data: [] }));
    await problem(
      await page.request.get(`http://localhost:3000${base}`, {
        headers: { Origin: 'https://not-allowed.invalid' },
      }),
      403,
      'ORIGIN_NOT_ALLOWED',
    );
  });

  test('R14: categoría borrada con movimiento produce 500 saneado y fallo parcial real', async ({
    page,
  }) => {
    await login(page, data().users.admin);
    const deleted = fixture('QA E211 deleted category product');
    expect(deleted.deleted_at).not.toBeNull();
    expect(deleted.sales[0]?.soldAt).toBe('2010-06-01T09:00:00.000000Z');
    const s = scenario('deleted-category');
    for (const metric of ['units', 'amount'] as const)
      await problem(await page.request.get(query(s, metric)), 500, 'INTERNAL_ERROR');
    await page.goto(`${ORIGIN}/terminal/administracion`);
    await expect(page.getByRole('heading', { name: 'Resumen del periodo' })).toBeVisible();
    const response = page.waitForResponse((r) => matchesCategory(r, s, 'units'));
    await page.getByLabel('Desde').fill(s.startDate!);
    await page.getByLabel('Hasta').fill(s.endDate!);
    await page.getByRole('button', { name: 'Aplicar rango' }).click();
    const failed = await response;
    expect(failed.status()).toBe(500);
    privateHeaders(failed);
    await expect(panel(page).getByRole('alert')).toContainText(
      'No fue posible consultar la participación por categorías.',
    );
    await expect(panel(page).getByRole('button', { name: 'Reintentar participación' })).toBeVisible();
    await expect(panel(page).getByRole('table')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Resumen del periodo' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Mezcla por importe' })).toBeVisible();
  });

  test('R17: 401 y 403 de todos los roles sin GET administrativos', async ({ browser }) => {
    test.setTimeout(120_000);
    const anonymous = await playwrightRequest.newContext({ baseURL: ORIGIN });
    try {
      await problem(await anonymous.get(query(scenario(), 'units')), 401, 'UNAUTHENTICATED');
    } finally {
      await anonymous.dispose();
    }
    for (const role of ['cashier', 'prep'] as const) {
      const context = await browser.newContext({ baseURL: ORIGIN });
      try {
        const page = await context.newPage();
        const reads: string[] = [];
        page.on('request', (request) => {
          const pathname = new URL(request.url()).pathname;
          if (pathname.startsWith('/api/v1/admin/')) reads.push(pathname);
        });
        await login(page, data().users[role]);
        await page.goto('/terminal/administracion');
        await expect(page.getByRole('heading', { name: 'Acceso no disponible' })).toBeVisible();
        expect(reads).toEqual([]);
        await problem(await page.request.get(query(scenario(), 'units')), 403, 'FORBIDDEN');
      } finally {
        await context.close();
      }
    }
    for (const role of ['customer', 'manager', 'pinChange'] as const) {
      const context = await browser.newContext({ baseURL: ORIGIN });
      try {
        const bootstrap = await context.request.get('/api/v1/auth/csrf');
        if (bootstrap.status() !== 200) throw new Error('QA CSRF bootstrap falló.');
        const payload: unknown = await bootstrap.json();
        if (!record(payload) || !record(payload.data) || typeof payload.data.csrfToken !== 'string')
          throw new Error('QA CSRF inválido; contenido no registrado.');
        const logged = await context.request.post(
          `/api/v1/auth/login/${role === 'manager' ? 'staff' : 'customer'}`,
          {
            headers: { Origin: ORIGIN, 'X-CSRF-Token': payload.data.csrfToken },
            data:
              role === 'manager'
                ? data().users.manager
                : role === 'customer'
                  ? data().users.customer
                  : data().users.pinChange,
          },
        );
        if (logged.status() !== 200)
          throw new Error(`Login QA ${role} falló; contenido privado no registrado.`);
        await problem(
          await context.request.get(query(scenario(), 'units')),
          403,
          role === 'pinChange' ? 'PIN_CHANGE_REQUIRED' : 'FORBIDDEN',
        );
        const page = await context.newPage();
        const reads: string[] = [];
        page.on('request', (request) => {
          const pathname = new URL(request.url()).pathname;
          if (pathname.startsWith('/api/v1/admin/')) reads.push(pathname);
        });
        const resolvedActor = page.waitForResponse(
          (response) => new URL(response.url()).pathname === '/api/v1/auth/me',
        );
        await page.goto(`${ORIGIN}/terminal/administracion`);
        expect((await resolvedActor).status()).toBe(role === 'pinChange' ? 403 : 200);
        await expect(
          page.getByRole('heading', {
            name: role === 'pinChange' ? 'Cambio de NIP obligatorio' : 'Acceso no disponible',
          }),
        ).toBeVisible();
        await expect(panel(page)).toHaveCount(0);
        await expect(page.getByText('Comprobando sesión…')).toHaveCount(0);
        expect(reads).toEqual([]);
        expect(await page.evaluate(() => localStorage.length)).toBe(0);
      } finally {
        await context.close();
      }
    }
  });

  test('C-UI: teclado, foco, carrera/cancelación y logout sin datos privados', async ({ page }) => {
    await open(page, scenario());
    const metric = page.getByLabel('Métrica de participación');
    await metric.focus();
    const amountResponse = page.waitForResponse((r) => matchesCategory(r, scenario(), 'amount'));
    await metric.press('ArrowDown');
    await dto(await amountResponse, scenario(), 'amount');
    await assertRows(page, scenario(), 'amount');
    await metric.focus();
    const unitsResponse = page.waitForResponse((r) => matchesCategory(r, scenario(), 'units'));
    await metric.press('ArrowUp');
    await dto(await unitsResponse, scenario(), 'units');

    const requested: string[] = [];
    const failed: string[] = [];
    const completed: string[] = [];
    page.on('request', (r) => {
      if (new URL(r.url()).pathname === ENDPOINT) requested.push(r.url());
    });
    page.on('requestfailed', (r) => {
      if (new URL(r.url()).pathname === ENDPOINT) failed.push(r.failure()?.errorText ?? 'failed');
    });
    page.on('response', (r) => {
      if (new URL(r.url()).pathname === ENDPOINT) completed.push(r.url());
    });
    const final = page.waitForResponse((r) => matchesCategory(r, scenario(), 'units'));
    await metric.selectOption('amount');
    await page.getByLabel('Método de pago').selectOption('CASH');
    await metric.selectOption('units');
    await page.getByLabel('Método de pago').selectOption('ALL');
    const finalResponse = await final;
    await dto(finalResponse, scenario(), 'units');
    await assertRows(page, scenario(), 'units');
    expect(requested.length).toBeGreaterThan(1);
    expect(failed.length, 'Al menos una cancelación real observada sin intercepción.').toBeGreaterThan(0);
    expect(
      failed.some((text) => /ERR_ABORTED|cancel/i.test(text)),
      `Aborto real esperado (ERR_ABORTED/cancelled); observados: ${failed.join(', ') || 'ninguno'}.`,
    ).toBe(true);
    expect(
      completed.at(-1),
      'La última respuesta lógica completada debe ser la aplicada por la UI.',
    ).toBe(finalResponse.url());
    console.info(
      `E2-15 carrera: ${requested.length} solicitudes; ${failed.length} requestfailed observados (${failed.join(', ')}); ${completed.length} respuestas completadas.`,
    );

    const start = performance.now();
    await dto(
      await page.request.get(query(scenario('maximum'), 'units')),
      scenario('maximum'),
      'units',
    );
    console.info(
      `E2-15 coste HTTP observado: ${Math.round(performance.now() - start)} ms, 366 días, 59 productos/26 ventas QA; no SLA.`,
    );
    await page.getByRole('button', { name: /Cerrar sesión/i }).click();
    await expect(panel(page)).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    await problem(await page.request.get(query(scenario(), 'units')), 401, 'UNAUTHENTICATED');
  });

  test('C-VIS/REAL: axe, teclado y capturas sanitizadas 1280/768/390', async ({ page }) => {
    await open(page, scenario());
    for (const width of [1280, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await assertRows(page, scenario(), 'units');
      if (width === 390) {
        const metric = page.getByLabel('Métrica de participación');
        const region = page.getByRole('region', {
          name: 'Tabla desplazable de participación por categorías',
          exact: true,
        });
        await metric.focus();
        await page.keyboard.press('Tab');
        await expect(region).toBeFocused();
        await expect(region).toHaveCSS('outline-width', '3px');
        expect(await region.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
        await region.press('ArrowRight');
        await expect.poll(() => region.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
        await region.press('ArrowLeft');
        await expect.poll(() => region.evaluate((node) => node.scrollLeft)).toBe(0);
      }
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(
        results.violations.map(({ id, impact, nodes }) => ({
          width,
          id,
          impact,
          targets: nodes.map((node) => node.target),
        })),
      ).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      if (width === 390) {
        const skip = page.locator('.skip-link');
        const skipState = await skip.evaluate((node) => {
          const rect = node.getBoundingClientRect();
          return {
            focused: document.activeElement === node,
            bottom: rect.bottom,
            transform: getComputedStyle(node).transform,
          };
        });
        console.info(
          `E2-15 captura ${width}: skip-link focused=${skipState.focused} bottom=${skipState.bottom} transform=${skipState.transform}`,
        );
        expect(skipState.focused).toBe(false);
        expect(skipState.bottom).toBeLessThanOrEqual(0);
        // Avoid Playwright's fixed-element stitching artifact in tall element
        // captures: a 390x1600 viewport fits this panel without scrolling.
        await page.setViewportSize({ width, height: 1600 });
        await expect(panel(page).getByRole('table')).toBeVisible();
      }
      await panel(page).screenshot({
        path: path.join(data().captureDir, `categories-${width}.png`),
        animations: 'disabled',
      });
    }
  });

  test('C-VIS/REAL: Electron real con aislamiento y captura sanitizada', async () => {
    test.setTimeout(90_000);
    const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const userDataDir = mkdtempSync(path.join(data().captureDir, 'electron-profile-'));
    const env: Record<string, string> = { FRONTEND_ORIGIN: ORIGIN };
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE' && key !== 'FRONTEND_ORIGIN') {
        env[key] = value;
      }
    }
    const app = await electron.launch({
      args: [`--user-data-dir=${userDataDir}`, appRoot],
      cwd: appRoot,
      env,
    });
    try {
      const page = await app.firstWindow();
      await page.waitForLoadState();
      await open(page, scenario());
      await expect
        .poll(() => page.evaluate(() => window.cafeteriaDesktop?.terminalOnly))
        .toBe(true);
      const preferences = await app.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        if (!window) throw new Error('Sin ventana Electron.');
        window.setSize(1280, 900);
        const contents = window.webContents as unknown as {
          getLastWebPreferences(): {
            nodeIntegration?: boolean;
            contextIsolation?: boolean;
            sandbox?: boolean;
            webSecurity?: boolean;
          };
        };
        const prefs = contents.getLastWebPreferences();
        return {
          nodeIntegration: prefs.nodeIntegration,
          contextIsolation: prefs.contextIsolation,
          sandbox: prefs.sandbox,
          webSecurity: prefs.webSecurity,
        };
      });
      expect(preferences).toEqual({
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      });
      await assertRows(page, scenario(), 'units');
      await page.getByLabel('Métrica de participación').focus();
      await panel(page).screenshot({
        path: path.join(data().captureDir, 'categories-electron-1280.png'),
        animations: 'disabled',
      });
      console.info(
        'E2-15 Electron: terminalOnly, nodeIntegration=false, contextIsolation/sandbox/webSecurity=true; no acredita HTTPS/distribución.',
      );
    } finally {
      await app.close();
      rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test.skip('R18a/C-UI: 413/429/503 reales, DTO inválido live, expiración/refresh y multipestaña', () => {
    /* Caos, revocación y expiración no autorizados; no se heredan excepciones previas. */
  });
});

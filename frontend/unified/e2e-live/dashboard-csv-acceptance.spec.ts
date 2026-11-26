import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { _electron as electron } from 'playwright';
import {
  expect,
  request as playwrightRequest,
  test,
  type APIResponse,
  type Download,
  type Page,
  type Response,
} from '@playwright/test';

const ORIGIN = 'http://localhost:5173';
const SUMMARY_ENDPOINT = '/api/v1/admin/dashboard/summary';
const SALES_SUMMARY_ENDPOINT = '/api/v1/sales/summary';
const SALES_ENDPOINT = '/api/v1/sales';
const ENDPOINTS = {
  sales: '/api/v1/admin/dashboard/sales-export.csv',
  series: '/api/v1/admin/dashboard/sales-series-export.csv',
  ranking: '/api/v1/admin/dashboard/product-ranking-export.csv',
  'no-movement': '/api/v1/admin/dashboard/no-movement-products-export.csv',
  categories: '/api/v1/admin/dashboard/category-participation-export.csv',
} as const;
const enabled = process.env.E2E_LIVE === '1' && Boolean(process.env.E2E_LIVE_MANIFEST);
test.skip(!enabled, 'Live no habilitado: no cuenta como evidencia.');

type Credentials = { username: string; password: string };
type CustomerCredentials = { identifier: string; pin: string };
type Kind = keyof typeof ENDPOINTS;
type Method = 'CASH' | 'STRIPE' | null;
type ExportMeta = Array<[string, string | null]>;
type CsvExpectation = {
  id: string;
  kind: Kind;
  from: string;
  to: string;
  method: Method;
  granularity?: 'hour' | 'day';
  metric?: 'units' | 'amount';
  direction?: 'top' | 'bottom';
  top?: string;
  filename: string;
  columns: string[];
  metadata: ExportMeta;
  rows: string[][];
  facts?: { refunds?: Array<{ saleId: string; refundCents: string }> };
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
  captureDir: string;
  exportsDir: string;
  exports: {
    sales: CsvExpectation[];
    series: CsvExpectation[];
    ranking: CsvExpectation[];
    noMovement: CsvExpectation[];
    categories: CsvExpectation[];
  };
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function loadManifest(): Manifest {
  const filename = process.env.E2E_LIVE_MANIFEST;
  if (!filename) throw new Error('Falta manifiesto CSV-03.');
  const value: unknown = JSON.parse(readFileSync(filename, 'utf8'));
  if (
    !record(value) ||
    typeof value.dataset !== 'string' ||
    !record(value.users) ||
    typeof value.captureDir !== 'string' ||
    typeof value.exportsDir !== 'string' ||
    !record(value.exports)
  )
    throw new Error('Manifiesto CSV-03 inválido (sin volcar contenido privado).');
  for (const role of ['admin', 'cashier', 'prep', 'manager']) {
    const credentials = value.users[role];
    if (!record(credentials) || typeof credentials.username !== 'string' || typeof credentials.password !== 'string')
      throw new Error('Falta usuario QA requerido.');
  }
  for (const role of ['customer', 'pinChange']) {
    const credentials = value.users[role];
    if (!record(credentials) || typeof credentials.identifier !== 'string' || typeof credentials.pin !== 'string')
      throw new Error('Falta cliente QA requerido (sin contenido privado).');
  }
  for (const kind of Object.keys(ENDPOINTS) as Kind[]) {
    const group = value.exports[kind === 'no-movement' ? 'noMovement' : kind];
    if (!Array.isArray(group)) throw new Error(`Faltan expectativas ${kind}.`);
    for (const item of group) {
      if (
        !record(item) ||
        typeof item.id !== 'string' ||
        typeof item.from !== 'string' ||
        typeof item.to !== 'string' ||
        ![null, 'CASH', 'STRIPE'].includes(item.method as string | null) ||
        typeof item.filename !== 'string' ||
        !Array.isArray(item.columns) ||
        !Array.isArray(item.metadata) ||
        !Array.isArray(item.rows)
      )
        throw new Error(`Expectativa ${kind} inválida.`);
    }
  }
  return value as Manifest;
}
const manifest = enabled ? loadManifest() : null;
function data(): Manifest {
  if (!manifest) throw new Error('Live deshabilitado.');
  return manifest;
}
function expectation(kind: Kind, id: string): CsvExpectation {
  const key = kind === 'no-movement' ? 'noMovement' : kind;
  const found = (data().exports as unknown as Record<string, CsvExpectation[]>)[key]?.find(
    (item) => item.id === id,
  );
  if (!found) throw new Error(`Falta expectativa ${kind}/${id}.`);
  return found;
}
function baseParams(item: CsvExpectation): URLSearchParams {
  const params = new URLSearchParams({ from: item.from, to: item.to });
  if (item.method) params.set('method', item.method);
  if (item.kind === 'series') params.set('granularity', item.granularity!);
  if (item.kind === 'ranking') {
    params.set('metric', item.metric!);
    params.set('direction', item.direction!);
    params.set('top', item.top!);
  }
  if (item.kind === 'categories') params.set('metric', item.metric!);
  return params;
}
function query(item: CsvExpectation): string {
  return `${ENDPOINTS[item.kind]}?${baseParams(item)}`;
}

type ParsedCsv = {
  metadata: Array<[string, string]>;
  header: string[];
  rows: string[][];
};
/**
 * Independent, dependency-free CSV reader. It enforces UTF-8 BOM, CRLF record
 * separators outside quotes, RFC 4180 quotes and the metadata prefix.
 */
function parseCsv(raw: Buffer): ParsedCsv {
  expect([...raw.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const text = raw.subarray(3).toString('utf8');
  const records: string[][] = [];
  let fields: string[] = [];
  let field = '';
  let inQuotes = false;
  let justClosedQuote = false;
  let index = 0;
  const pushField = () => {
    fields.push(field);
    field = '';
  };
  const pushRecord = () => {
    pushField();
    records.push(fields);
    fields = [];
  };
  while (index < text.length) {
    const character = text[index]!;
    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        justClosedQuote = true;
        index += 1;
        continue;
      }
      field += character;
      index += 1;
      continue;
    }
    if (justClosedQuote) {
      if (character === ',') {
        pushField();
        justClosedQuote = false;
        index += 1;
        continue;
      }
      if (character === '\r') {
        if (text[index + 1] !== '\n') throw new Error('CR sin LF tras campo entre comillas.');
        pushRecord();
        justClosedQuote = false;
        index += 2;
        continue;
      }
      throw new Error('Carácter tras comilla de cierre RFC 4180.');
    }
    if (character === '"') {
      if (field.length !== 0) throw new Error('Comilla dentro de campo sin comillas.');
      inQuotes = true;
      index += 1;
      continue;
    }
    if (character === ',') {
      pushField();
      index += 1;
      continue;
    }
    if (character === '\r') {
      if (text[index + 1] !== '\n') throw new Error('CR sin LF fuera de comillas.');
      pushRecord();
      index += 2;
      continue;
    }
    if (character === '\n') throw new Error('LF aislado fuera de comillas.');
    field += character;
    index += 1;
  }
  if (inQuotes) throw new Error('Comilla de cierre ausente.');
  if (justClosedQuote) throw new Error('Archivo sin CRLF final.');
  if (field.length > 0 || fields.length > 0) throw new Error('Archivo sin terminador CRLF final.');
  expect(records.length).toBeGreaterThanOrEqual(2);
  let cursor = 0;
  const metadata: Array<[string, string]> = [];
  while (cursor < records.length && records[cursor]![0] === '#meta') {
    const row = records[cursor]!;
    expect(row, '#meta debe tener tres columnas').toHaveLength(3);
    metadata.push([row[1]!, row[2]!]);
    cursor += 1;
  }
  expect(metadata.length).toBeGreaterThan(0);
  const header = records[cursor]!;
  expect(header.length).toBeGreaterThan(0);
  const rows = records.slice(cursor + 1);
  for (const [index, row] of rows.entries())
    expect(row, `fila ${index + 1} debe tener ${header.length} columnas`).toHaveLength(header.length);
  return { metadata, header, rows };
}
function assertMetadata(actual: Array<[string, string]>, expected: ExportMeta): void {
  expect(actual.map(([key]) => key)).toEqual(expected.map(([key]) => key));
  for (const [index, [key, value]] of expected.entries()) {
    if (key === 'generatedAt') {
      expect(actual[index]![1]).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    } else {
      expect(actual[index]![1], `metadato ${key}`).toBe(value);
    }
  }
}
function assertExport(raw: Buffer, item: CsvExpectation): ParsedCsv {
  const parsed = parseCsv(raw);
  expect(parsed.header).toEqual(item.columns);
  expect(parsed.rows).toEqual(item.rows);
  assertMetadata(parsed.metadata, item.metadata);
  const metadata = new Map(parsed.metadata);
  expect(metadata.get('rowCount')).toBe(String(parsed.rows.length));
  expect(metadata.get('contentKind')).toBe('data');
  expect(metadata.get('containsImage')).toBe('false');
  return parsed;
}
function privateHeaders(response: APIResponse | Response): void {
  expect(response.headers()['cache-control']).toContain('no-store');
  expect(response.headers()['referrer-policy']).toBe('no-referrer');
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
}
function assertCsvHeaders(response: APIResponse | Response, filename: string): void {
  expect(response.status()).toBe(200);
  privateHeaders(response);
  expect(response.headers()['content-type']).toMatch(/^text\/csv;\s*charset=utf-8$/i);
  expect(response.headers()['content-disposition']).toBe(`attachment; filename="${filename}"`);
  expect(filename).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]*\.csv$/);
}
async function login(page: Page, credentials: Credentials): Promise<void> {
  await page.goto(`${ORIGIN}/terminal/acceso`);
  await page.getByLabel('Usuario').fill(credentials.username);
  await page.getByLabel('Contraseña').fill(credentials.password);
  await page.getByRole('button', { name: 'Iniciar sesión como personal' }).click();
  try {
    await page.waitForURL((url) => !url.pathname.endsWith('/terminal/acceso'), { timeout: 15_000 });
  } catch {
    await page.goto('about:blank');
    throw new Error('Login QA falló; no se registran credenciales ni alertas privadas.');
  }
}
async function applyMainPeriod(page: Page, item = expectation('sales', 'main-all')): Promise<void> {
  const wait = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === SUMMARY_ENDPOINT &&
      url.searchParams.get('from') === item.from &&
      url.searchParams.get('to') === item.to &&
      url.searchParams.get('method') === item.method
    );
  });
  await page.getByLabel('Desde').fill('2026-11-24');
  await page.getByLabel('Hasta').fill('2026-11-24');
  await page.getByRole('button', { name: 'Aplicar rango' }).click();
  const response = await wait;
  expect(response.status()).toBe(200);
  privateHeaders(response);
  await expect(page.getByRole('button', { name: 'Descargar ventas (CSV)', exact: true })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Últimas ventas' })).toBeVisible();
}
async function openDashboard(page: Page): Promise<void> {
  await login(page, data().users.admin);
  await page.goto(`${ORIGIN}/terminal/administracion`);
  await expect(page.getByRole('heading', { name: 'Resumen del periodo' })).toBeVisible();
  await applyMainPeriod(page);
}
async function downloadViaButton(
  page: Page,
  item: CsvExpectation,
  label: string,
  save: boolean,
): Promise<{ response: Response; download: Download; raw: Buffer; file: string | null }> {
  const endpoint = ENDPOINTS[item.kind];
  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname === endpoint && response.request().method() === 'GET',
  );
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: label, exact: true }).click();
  const [response, download] = await Promise.all([responsePromise, downloadPromise]);
  assertCsvHeaders(response, item.filename);
  expect(download.suggestedFilename()).toBe(item.filename);
  const downloadPath = await download.path();
  if (downloadPath === null) throw new Error('La descarga no dejó archivo temporal.');
  const raw = readFileSync(downloadPath);
  assertExport(raw, item);
  let file: string | null = null;
  if (save) {
    mkdirSync(data().exportsDir, { recursive: true });
    file = path.join(data().exportsDir, item.filename);
    writeFileSync(file, raw);
  }
  return { response, download, raw, file };
}
async function directExport(page: Page, item: CsvExpectation): Promise<ParsedCsv> {
  const response = await page.request.get(query(item));
  assertCsvHeaders(response, item.filename);
  const raw = await response.body();
  return assertExport(raw, item);
}
async function anonymousContext() {
  return playwrightRequest.newContext({ baseURL: ORIGIN });
}
async function problem(
  response: APIResponse,
  status = 400,
  code = 'VALIDATION_ERROR',
): Promise<void> {
  expect(response.status()).toBe(status);
  privateHeaders(response);
  expect(response.headers()['content-type']).toContain('application/problem+json');
  const body: unknown = await response.json();
  expect(record(body)).toBe(true);
  if (!record(body)) throw new Error('Problem Details inválido.');
  expect(body).toMatchObject({ status, code });
  for (const field of ['type', 'title', 'detail', 'instance', 'requestId'])
    expect(typeof body[field]).toBe('string');
  for (const forbidden of ['stack', 'sql', 'password']) expect(body).not.toHaveProperty(forbidden);
}
async function apiLogin(
  context: Awaited<ReturnType<typeof anonymousContext>>,
  role: 'manager' | 'customer' | 'pinChange',
): Promise<void> {
  const bootstrap = await context.get('/api/v1/auth/csrf');
  if (bootstrap.status() !== 200) throw new Error('QA CSRF bootstrap falló.');
  const payload: unknown = await bootstrap.json();
  if (!record(payload) || !record(payload.data) || typeof payload.data.csrfToken !== 'string')
    throw new Error('QA CSRF inválido; contenido no registrado.');
  const logged = await context.post(
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
}
async function summaryData(page: Page, item: CsvExpectation) {
  const params = new URLSearchParams({ from: item.from, to: item.to });
  if (item.method) params.set('method', item.method);
  const response = await page.request.get(`${SUMMARY_ENDPOINT}?${params}`);
  expect(response.status()).toBe(200);
  privateHeaders(response);
  const payload: unknown = await response.json();
  if (!record(payload) || !record(payload.data)) throw new Error('Resumen administrativo inválido.');
  return payload.data;
}
async function listAllSales(context: Awaited<ReturnType<typeof anonymousContext>>, item: CsvExpectation) {
  const rows: Array<Record<string, unknown>> = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const params = new URLSearchParams({ from: item.from, to: item.to, limit: '2' });
    if (item.method) params.set('method', item.method);
    if (cursor) params.set('cursor', cursor);
    const response = await context.get(`${SALES_ENDPOINT}?${params}`);
    expect(response.status()).toBe(200);
    privateHeaders(response);
    const payload: unknown = await response.json();
    if (!record(payload) || !Array.isArray(payload.data) || !record(payload.page))
      throw new Error('Listado de ventas inválido.');
    for (const row of payload.data) {
      if (!record(row)) throw new Error('Venta inválida.');
      rows.push(row);
    }
    cursor = typeof payload.page.nextCursor === 'string' ? payload.page.nextCursor : null;
    pages += 1;
    if (pages > 50) throw new Error('Paginación de ventas no termina.');
  } while (cursor !== null);
  return { rows, pages };
}

test.describe('DA-001 CSV-03 — aceptación real de exportaciones (sin intercepción)', () => {
  test('CSV-R01/R02/R04/R21/R22/R34/R36: cinco descargas reales, conciliación y copias sanitizadas', async ({ page, browser }) => {
    test.setTimeout(180_000);
    await openDashboard(page);
    const sales = expectation('sales', 'main-all');
    const series = expectation('series', 'main-hour-all');
    const ranking = expectation('ranking', 'main-units-top5');
    const noMovement = expectation('no-movement', 'main-all');
    const categories = expectation('categories', 'main-units');
    const downloads = [
      { item: sales, label: 'Descargar ventas (CSV)' },
      { item: series, label: 'Descargar series (CSV)' },
      { item: ranking, label: 'Descargar ranking (CSV)' },
      { item: noMovement, label: 'Descargar sin movimiento (CSV)' },
      { item: categories, label: 'Descargar participación (CSV)' },
    ];
    for (const { item, label } of downloads) {
      const result = await downloadViaButton(page, item, label, true);
      const bytes = statSync(result.file!).size;
      console.info(
        `CSV-03 ${item.kind}: ${item.filename}; ${bytes} bytes; ${result.raw.subarray(0, 3).toString('hex')} BOM; ${item.rows.length} filas.`,
      );
    }

    // Ventas: filas completas, orden y conciliación con los endpoints de origen.
    const summary = await summaryData(page, sales);
    expect(summary).toMatchObject({
      totalCents: '143600',
      ticketCount: '7',
      unitsSold: '29',
      paymentMix: { cashCents: '49000', stripeCents: '94600' },
    });
    const cashierContext = await browser.newContext({ baseURL: ORIGIN });
    try {
      const cashierPage = await cashierContext.newPage();
      await login(cashierPage, data().users.cashier);
      const params = new URLSearchParams({ from: sales.from, to: sales.to });
      const salesSummaryResponse = await cashierPage.request.get(
        `${SALES_SUMMARY_ENDPOINT}?${params}`,
      );
      expect(salesSummaryResponse.status()).toBe(200);
      privateHeaders(salesSummaryResponse);
      const salesSummaryPayload: unknown = await salesSummaryResponse.json();
      if (!record(salesSummaryPayload) || !record(salesSummaryPayload.data))
        throw new Error('Resumen de ventas inválido.');
      expect(salesSummaryPayload.data).toMatchObject({
        count: '7',
        totalCents: '143600',
        cashCents: '49000',
        stripeCents: '94600',
      });
      const listed = await listAllSales(cashierContext.request, sales);
      expect(listed.pages).toBeGreaterThan(1);
      expect(listed.rows).toHaveLength(7);
      const csvById = new Map(sales.rows.map((row) => [row[0]!, row]));
      for (const row of listed.rows) {
        const csvRow = csvById.get(String(row.id));
        expect(csvRow, `venta ${String(row.id)} presente en CSV`).toBeDefined();
        expect(csvRow![1]).toBe(row.saleNumber);
        expect(csvRow![6]).toBe(row.method);
        expect(csvRow![9]).toBe(String(row.totalCents));
        const soldAt = String(row.soldAt);
        expect(csvRow![4]!.replace(/(\.\d{3})\d{3}Z$/, '$1Z')).toBe(
          new Date(soldAt).toISOString(),
        );
      }
      expect(sales.facts?.refunds?.length).toBeGreaterThan(0);
      const refunded = sales.facts!.refunds![0]!;
      const refundedRow = csvById.get(refunded.saleId);
      expect(refundedRow, 'la venta reembolsada sigue exportada').toBeDefined();
      expect(refundedRow![9]).toBe('100');
      expect(refundedRow![5]).toMatch(/\.\d{6}[+-]\d\d:\d\d$/);
    } finally {
      await cashierContext.close();
    }

    // Series: suma de buckets = metadatos = resumen; existe al menos un bucket vacío.
    const seriesTotals = new Map(series.metadata);
    expect(series.rows.filter((row) => row[7] === '0' && row[8] === '0' && row[9] === '0').length).toBeGreaterThan(0);
    expect(series.rows.reduce((sum, row) => sum + BigInt(row[7]!), 0n)).toBe(
      BigInt(seriesTotals.get('totals.totalCents')!),
    );
    expect(series.rows.reduce((sum, row) => sum + BigInt(row[8]!), 0n)).toBe(
      BigInt(seriesTotals.get('totals.ticketCount')!),
    );
    expect(series.rows.reduce((sum, row) => sum + BigInt(row[9]!), 0n)).toBe(
      BigInt(seriesTotals.get('totals.unitsSold')!),
    );
    expect(seriesTotals.get('totals.totalCents')).toBe('143600');
    expect(seriesTotals.get('totals.ticketCount')).toBe('7');
    expect(seriesTotals.get('totals.unitsSold')).toBe('29');

    // Ranking: exactamente top N y metadatos del conjunto completo previo al corte.
    expect(ranking.rows).toHaveLength(5);
    expect(ranking.metadata).toContainEqual(['matchedProductCount', '6']);
    expect(ranking.metadata).toContainEqual(['truncated', 'true']);
    const rankingResponse = await page.request.get(
      `/api/v1/admin/dashboard/product-ranking?${new URLSearchParams({
        from: ranking.from,
        to: ranking.to,
        metric: 'units',
        direction: 'top',
        top: '5',
      })}`,
    );
    expect(rankingResponse.status()).toBe(200);
    privateHeaders(rankingResponse);
    const rankingPayload: unknown = await rankingResponse.json();
    if (!record(rankingPayload) || !record(rankingPayload.data) || !Array.isArray(rankingPayload.data.items))
      throw new Error('Ranking inválido.');
    expect(
      (rankingPayload.data.items as Array<Record<string, unknown>>).map((item) => ({
        productId: item.productId,
        name: item.name,
        nameSource: item.nameSource,
        unitsSold: item.unitsSold,
        totalCents: item.totalCents,
      })),
    ).toEqual(
      ranking.rows.map((row) => ({
        productId: row[1],
        name: row[2],
        nameSource: row[3],
        unitsSold: row[4],
        totalCents: row[5],
      })),
    );

    // Sin movimiento: conjunto completo > una página, conciliado con el endpoint.
    expect(noMovement.rows.length).toBeGreaterThan(20);
    expect(noMovement.metadata).toContainEqual(['totalNoMovementProducts', '47']);
    const noMovementResponse = await page.request.get(
      `/api/v1/admin/dashboard/no-movement-products?${new URLSearchParams({ from: noMovement.from, to: noMovement.to, limit: '50' })}`,
    );
    expect(noMovementResponse.status()).toBe(200);
    privateHeaders(noMovementResponse);
    const noMovementPayload: unknown = await noMovementResponse.json();
    if (!record(noMovementPayload) || !record(noMovementPayload.data) || !Array.isArray(noMovementPayload.data.items))
      throw new Error('Sin movimiento inválido.');
    expect(noMovementPayload.data.totalNoMovementProducts).toBe('47');
    const apiRows = (noMovementPayload.data.items as Array<Record<string, unknown>>).map((item) => {
      const category = item.category as { id: string; name: string };
      return [String(item.productId), String(item.name), category.id, category.name, String(item.isAvailable), String(item.createdAt)];
    });
    expect(apiRows).toEqual(noMovement.rows.map((row) => row.slice(0, 6)));

    // Categorías: sharePercent del backend y conciliación con el endpoint.
    const categoriesResponse = await page.request.get(
      `/api/v1/admin/dashboard/category-participation?${new URLSearchParams({ from: categories.from, to: categories.to, metric: 'units' })}`,
    );
    expect(categoriesResponse.status()).toBe(200);
    privateHeaders(categoriesResponse);
    const categoriesPayload: unknown = await categoriesResponse.json();
    if (!record(categoriesPayload) || !record(categoriesPayload.data) || !Array.isArray(categoriesPayload.data.items))
      throw new Error('Categorías inválidas.');
    expect(
      categoriesPayload.data.items.map((item: Record<string, unknown>) => [
        item.categoryId, item.name, String(item.isActive), item.unitsSold, item.totalCents, item.sharePercent,
      ]),
    ).toEqual(categories.rows);
  });

  test('CSV-R02/R08/R09/R10/R11/R13/R14/R16/R17/R25: variantes, cero y series vacías', async ({ page }) => {
    test.setTimeout(180_000);
    await login(page, data().users.admin);
    for (const item of data().exports.sales.slice(1)) await directExport(page, item);
    for (const item of data().exports.series.slice(1)) await directExport(page, item);
    for (const item of data().exports.ranking.slice(1)) await directExport(page, item);
    for (const item of data().exports.noMovement.slice(1)) await directExport(page, item);
    for (const item of data().exports.categories.slice(1)) await directExport(page, item);

    const zeroSales = expectation('sales', 'zero');
    expect(zeroSales.rows).toHaveLength(0);
    const zeroRanking = expectation('ranking', 'zero-units-top5');
    expect(zeroRanking.rows).toHaveLength(0);
    const zeroMovement = expectation('no-movement', 'zero');
    expect(zeroMovement.rows).toHaveLength(0);
    const zeroCategories = expectation('categories', 'zero-units');
    expect(zeroCategories.rows).toHaveLength(0);

    const zeroSeries = expectation('series', 'zero-hour');
    expect(zeroSeries.rows.length).toBeGreaterThanOrEqual(1);
    expect(zeroSeries.rows.every((row) => row[7] === '0' && row[8] === '0' && row[9] === '0')).toBe(true);

    const inactive = expectation('categories', 'inactive-units');
    expect(inactive.rows.some((row) => row[2] === 'false')).toBe(true);
    const thirds = expectation('categories', 'thirds-units');
    expect(thirds.rows.map((row) => row[5])).toEqual(['33.33', '33.33', '33.33']);
    const thirdsCentesimas = thirds.rows.reduce((sum, row) => {
      const [whole, fraction] = row[5]!.split('.');
      return sum + BigInt(whole!) * 100n + BigInt(fraction!);
    }, 0n);
    expect(thirdsCentesimas).toBe(9999n);
    const zeroAmount = expectation('categories', 'zero-amount');
    expect(zeroAmount.rows.every((row) => row[5] === '0.00')).toBe(true);

    const top10 = expectation('ranking', 'main-units-top10');
    expect(top10.rows).toHaveLength(6);
    expect(top10.metadata).toContainEqual(['truncated', 'false']);
    const top5 = expectation('ranking', 'main-units-top5');
    expect(top5.rows).toHaveLength(5);
    expect(top5.metadata).toContainEqual(['truncated', 'true']);
    const cash = expectation('sales', 'main-cash');
    const stripe = expectation('sales', 'main-stripe');
    expect(BigInt(cash.metadata.find(([key]) => key === 'totals.totalCents')![1]!) +
      BigInt(stripe.metadata.find(([key]) => key === 'totals.totalCents')![1]!)).toBe(143600n);
  });

  test('CSV-R22/R23/R24/R27/R32/R34: parser independiente, fechas, antifórmulas, IDs y PII', async () => {
    const files = [
      expectation('sales', 'main-all'),
      expectation('series', 'main-hour-all'),
      expectation('ranking', 'main-units-top5'),
      expectation('no-movement', 'main-all'),
      expectation('categories', 'main-units'),
    ];
    const integer = /^(0|[1-9][0-9]*)$/;
    const textColumns: Record<Kind, number[]> = {
      sales: [1, 6, 7],
      series: [3],
      ranking: [2, 3],
      'no-movement': [1, 3],
      categories: [1],
    };
    let dangerousCells = 0;
    for (const item of files) {
      const raw = readFileSync(path.join(data().exportsDir, item.filename));
      const parsed = parseCsv(raw);
      expect(parsed.rows).toHaveLength(item.rows.length);
      expect(parsed.header).toEqual(item.columns);
      for (const [rowIndex, row] of parsed.rows.entries()) {
        for (const [columnIndex, value] of row.entries()) {
          if (textColumns[item.kind].includes(columnIndex)) {
            if (/^[=+\-@\t\r\n]/.test(value) || /^ +[=+\-@]/.test(value)) {
              throw new Error(`Celda de texto sin neutralizar en ${item.filename} fila ${rowIndex + 1}.`);
            }
            if (/^'[=+\-@\t\r\n]/.test(value) || /^' +[=+\-@]/.test(value)) dangerousCells += 1;
            expect(value).not.toMatch(/@/);
            expect(value).not.toMatch(/\+?\d{10,}/);
          } else {
            expect(value, `${item.filename} columna ${columnIndex + 1} no debe llevar prefijo`).not.toMatch(/^'/);
          }
        }
      }
      if (['sales', 'no-movement'].includes(item.kind)) {
        for (const row of parsed.rows) {
          const utcIndex = item.kind === 'sales' ? 4 : 5;
          const localIndex = item.kind === 'sales' ? 5 : 6;
          expect(row[utcIndex]).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/);
          expect(row[localIndex]).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}[+-]\d\d:\d\d$/);
          expect(row[0]).toMatch(integer);
        }
      }
      if (item.kind === 'series') {
        for (const row of parsed.rows) {
          expect(row[1]).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
          expect(row[2]).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
          expect(row[3]).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/);
          expect(row[4]).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
          expect(row[5]).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
          expect(row[6]).toMatch(/^(true|false)$/);
          for (const index of [7, 8, 9]) expect(row[index]).toMatch(integer);
        }
      }
      if (item.kind === 'ranking') {
        for (const row of parsed.rows) {
          expect(row[0]).toMatch(/^[1-9][0-9]*$/);
          expect(row[1]).toMatch(integer);
          expect(row[3]).toMatch(/^(current|snapshot)$/);
          expect(row[4]).toMatch(integer);
          expect(row[5]).toMatch(integer);
        }
      }
      if (item.kind === 'categories') {
        for (const row of parsed.rows) {
          expect(row[0]).toMatch(/^[1-9][0-9]*$/);
          expect(row[2]).toMatch(/^(true|false)$/);
          expect(row[3]).toMatch(integer);
          expect(row[4]).toMatch(integer);
          expect(row[5]).toMatch(/^(100\.00|(0|[1-9][0-9]?)\.[0-9]{2})$/);
        }
      }
      if (item.kind === 'sales') {
        for (const row of parsed.rows) {
          expect(row[1]).toMatch(/^V[0-9]{6,}$/);
          expect(row[2]).toMatch(integer);
          expect(row[3]).toMatch(integer);
          expect(row[6]).toMatch(/^(CASH|STRIPE)$/);
          expect(row[8]).toBe('MXN');
          expect(row[9]).toMatch(integer);
          expect(row[10]).toMatch(integer);
          expect(row[11]).toMatch(integer);
        }
      }
    }
    console.info(
      `CSV-03 integridad: 5 archivos, BOM/CRLF/RFC 4180 verificados; celdas con prefijo de fórmula neutralizadas observadas=${dangerousCells}; PII textual=0.`,
    );
  });

  test('CSV-R06/R19/R20/R26: negativos reales 400/401/403, precedencia y Origin', async ({ page, browser }) => {
    test.setTimeout(180_000);
    await login(page, data().users.admin);
    const samples = [
      expectation('sales', 'main-all'),
      expectation('series', 'main-hour-all'),
      expectation('ranking', 'main-units-top5'),
      expectation('no-movement', 'main-all'),
      expectation('categories', 'main-units'),
    ];
    for (const item of samples) {
      const params = baseParams(item);
      const base = `${ENDPOINTS[item.kind]}?${params}`;
      await problem(await page.request.get(`${base}&token=abc`));
      await problem(await page.request.get(`${base}&access_token=abc`));
      await problem(await page.request.get(`${base}&jwt=abc`));
      await problem(await page.request.get(`${base}&limit=1`));
      await problem(await page.request.get(`${base}&cursor=x`));
      const repeated = new URLSearchParams(params);
      repeated.append('from', item.from);
      await problem(await page.request.get(`${ENDPOINTS[item.kind]}?${repeated}`));
      const array = new URLSearchParams(params);
      array.set('from[]', item.from);
      await problem(await page.request.get(`${ENDPOINTS[item.kind]}?${array}`));
      const reversed = new URLSearchParams(params);
      reversed.set('from', item.to);
      reversed.set('to', item.from);
      await problem(await page.request.get(`${ENDPOINTS[item.kind]}?${reversed}`));
      const old = new URLSearchParams(params);
      old.set('from', '2000-01-01T07:59:59.999Z');
      await problem(await page.request.get(`${ENDPOINTS[item.kind]}?${old}`));
      const four = new URLSearchParams(params);
      four.set('from', item.from.replace('.000Z', '.0000Z'));
      await problem(await page.request.get(`${ENDPOINTS[item.kind]}?${four}`));
      await problem(await page.request.get(base, { data: { extra: true } }));
    }
    // Precedencia D31: 401 sin sesión, 403 con rol no autorizado, 400 con ADMINISTRADOR.
    const salesBase = `${ENDPOINTS.sales}?${baseParams(expectation('sales', 'main-all'))}`;
    const anonymous = await anonymousContext();
    try {
      await problem(await anonymous.get(`${salesBase}&token=abc`), 401, 'UNAUTHENTICATED');
      for (const item of samples)
        await problem(await anonymous.get(query(item)), 401, 'UNAUTHENTICATED');
    } finally {
      await anonymous.dispose();
    }
    for (const role of ['cashier', 'prep'] as const) {
      const context = await browser.newContext({ baseURL: ORIGIN });
      try {
        const rolePage = await context.newPage();
        await login(rolePage, data().users[role]);
        for (const item of samples)
          await problem(await rolePage.request.get(query(item)), 403, 'FORBIDDEN');
        await problem(await rolePage.request.get(`${salesBase}&token=abc`), 403, 'FORBIDDEN');
      } finally {
        await context.close();
      }
    }
    for (const role of ['manager', 'customer', 'pinChange'] as const) {
      const context = await anonymousContext();
      try {
        await apiLogin(context, role);
        for (const item of samples)
          await problem(
            await context.get(query(item)),
            403,
            role === 'pinChange' ? 'PIN_CHANGE_REQUIRED' : 'FORBIDDEN',
          );
      } finally {
        await context.dispose();
      }
    }
    const direct = `http://localhost:3000${salesBase}`;
    await problem(
      await page.request.get(direct, { headers: { Origin: 'https://not-allowed.invalid' } }),
      403,
      'ORIGIN_NOT_ALLOWED',
    );
    console.info(
      'CSV-03 negativos: 400 (token/extra/rango/precisión/repetido/array/body), 401, 403 de CAJERO/PREPARACION/GERENTE/CLIENTE/PIN y Origin; topes >X no reproducibles sin sembrar volumen no autorizado.',
    );
  });

  test.skip('CSV-R07/R15/R18: tope de filas real', () => {
    // No reproducible con el dataset autorizado: 26 ventas, 59 productos y 11
    // categorías, frente a 20 000/2 000/1 000. Sembrar volumen para forzarlo no
    // está autorizado. La cobertura es de integración/unitarias (CSV-01).
  });

  test('CSV-R27/R28/R36: teclado, foco, descarga única y estado visible', async ({ page }) => {
    test.setTimeout(120_000);
    await openDashboard(page);
    const button = page.getByRole('button', { name: 'Descargar ventas (CSV)', exact: true });
    const status = page.locator('.dashboard-sales-heading .dashboard-download-status');
    await expect(status).toHaveText('');
    await button.focus();
    await expect(button).toBeFocused();
    const responsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === ENDPOINTS.sales &&
        response.request().method() === 'GET',
    );
    const downloadPromise = page.waitForEvent('download');
    await button.press('Enter');
    const [response, download] = await Promise.all([responsePromise, downloadPromise]);
    assertCsvHeaders(response, expectation('sales', 'main-all').filename);
    expect(download.suggestedFilename()).toBe(expectation('sales', 'main-all').filename);
    await expect(status).toContainText('Descarga iniciada:');
    await expect(status).toContainText(expectation('sales', 'main-all').filename);
    await expect(button).toBeFocused();
    await expect(page.getByText('La exportación CSV incluye todas las ventas filtradas del periodo, no solo las 5 visibles.')).toBeVisible();
    console.info('CSV-03 teclado: Enter descargó una vez, estado anunciado y foco conservado en el botón.');
  });

  test('C-VIS/REAL: capturas 1280/768/390 y axe WCAG 2.1 A/AA', async ({ page }) => {
    test.setTimeout(180_000);
    await openDashboard(page);
    for (const width of [1280, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByRole('button', { name: 'Descargar ventas (CSV)', exact: true })).toBeVisible();
      const responsePromise = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === ENDPOINTS.sales &&
          response.request().method() === 'GET',
      );
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Descargar ventas (CSV)', exact: true }).click();
      await Promise.all([responsePromise, downloadPromise]);
      await expect(
        page.locator('.dashboard-sales-heading .dashboard-download-status'),
      ).toContainText('Descarga iniciada:');
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
      await page.locator('.dashboard-sales-heading').screenshot({
        path: path.join(data().captureDir, `csv-03-downloads-${width}.png`),
        animations: 'disabled',
      });
    }
    console.info('CSV-03 visual: capturas de botón/estado a 1280/768/390 y axe sin violaciones.');
  });

  test('C-VIS/REAL: Electron real con aislamiento, teclado y descarga efectiva', async () => {
    test.setTimeout(120_000);
    const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const downloadDir = mkdtempSync(path.join(data().captureDir, 'electron-csv-'));
    const userDataDir = mkdtempSync(path.join(data().captureDir, 'electron-profile-'));
    const env: Record<string, string> = { FRONTEND_ORIGIN: ORIGIN };
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE' && key !== 'FRONTEND_ORIGIN') env[key] = value;
    }
    const app = await electron.launch({
      args: [`--user-data-dir=${userDataDir}`, appRoot],
      cwd: appRoot,
      env,
    });
    try {
      const page = await app.firstWindow();
      await page.waitForLoadState();
      await openDashboard(page);
      await expect
        .poll(() => page.evaluate(() => window.cafeteriaDesktop?.terminalOnly))
        .toBe(true);
      const preferences = await app.evaluate(({ BrowserWindow, session }, target) => {
        const window = BrowserWindow.getAllWindows()[0];
        if (!window) throw new Error('Sin ventana Electron.');
        window.setSize(1280, 900);
        session.defaultSession.setDownloadPath(target);
        session.defaultSession.on('will-download', (_event, item) => {
          item.setSavePath(`${target}\\${item.getFilename()}`);
        });
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
      }, downloadDir);
      expect(preferences).toEqual({
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      });
      const button = page.getByRole('button', { name: 'Descargar ventas (CSV)', exact: true });
      await button.focus();
      await expect(button).toBeFocused();
      const responsePromise = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === ENDPOINTS.sales &&
          response.request().method() === 'GET',
      );
      await button.press('Enter');
      const response = await responsePromise;
      assertCsvHeaders(response, expectation('sales', 'main-all').filename);
      await expect.poll(
        () => readdirSync(downloadDir).filter((file) => file.endsWith('.csv')).length,
        { timeout: 15_000 },
      ).toBe(1);
      const [saved] = readdirSync(downloadDir).filter((file) => file.endsWith('.csv'));
      expect(saved).toBe(expectation('sales', 'main-all').filename);
      const raw = readFileSync(path.join(downloadDir, saved!));
      assertExport(raw, expectation('sales', 'main-all'));
      await expect(
        page.locator('.dashboard-sales-heading .dashboard-download-status'),
      ).toContainText('Descarga iniciada:');
      const capture = path.join(data().captureDir, 'csv-03-electron-1280.png');
      copyFileSync(path.join(downloadDir, saved!), path.join(data().exportsDir, 'electron-sales-main.csv'));
      await page.locator('.dashboard-sales-heading').screenshot({ path: capture, animations: 'disabled' });
      console.info(
        `CSV-03 Electron: terminalOnly, nodeIntegration=false, contextIsolation/sandbox/webSecurity=true; descarga real ${saved}; sin acreditar HTTPS/distribución.`,
      );
    } finally {
      await app.close();
      rmSync(userDataDir, { recursive: true, force: true });
      rmSync(downloadDir, { recursive: true, force: true });
    }
  });
});

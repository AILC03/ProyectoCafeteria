import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { _electron as electron } from 'playwright';
import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type APIResponse,
  type Page,
  type Response,
} from '@playwright/test';
import type {
  DashboardNoMovement,
  NoMovementItem,
} from '../src/features/terminal/admin/analytics/noMovementApi';

const ORIGIN = 'http://localhost:5173';
const ENDPOINT = '/api/v1/admin/dashboard/no-movement-products';
const enabled = process.env.E2E_LIVE === '1' && Boolean(process.env.E2E_LIVE_MANIFEST);
test.skip(!enabled, 'Live no habilitado: no cuenta como evidencia.');

type Credentials = { username: string; password: string };
type CustomerCredentials = { identifier: string; pin: string };
type Fixture = {
  productId: string;
  name: string;
  createdAt: string;
  categoryDeleted: boolean;
  categoryActive: boolean;
  sales: Array<{
    soldAt: string;
    method: string;
    status: string;
    totalCents: string;
    refundCents: string;
  }>;
};
type Scenario = {
  id: string;
  from: string;
  to: string;
  method: 'CASH' | 'STRIPE' | null;
  startDate?: string;
  endDate?: string;
  items: NoMovementItem[];
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
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function loadManifest(): Manifest {
  const filename = process.env.E2E_LIVE_MANIFEST;
  if (!filename) throw new Error('Falta manifiesto E2-11.');
  const value: unknown = JSON.parse(readFileSync(filename, 'utf8'));
  if (
    !record(value) ||
    typeof value.dataset !== 'string' ||
    !record(value.users) ||
    typeof value.captureDir !== 'string' ||
    !Array.isArray(value.scenarios) ||
    !Array.isArray(value.fixtures)
  ) {
    throw new Error('Manifiesto E2-11 inválido (sin volcar contenido privado).');
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
      typeof item.productId !== 'string' ||
      !/^[1-9][0-9]*$/.test(item.productId) ||
      typeof item.name !== 'string' ||
      typeof item.createdAt !== 'string' ||
      typeof item.categoryDeleted !== 'boolean' ||
      typeof item.categoryActive !== 'boolean' ||
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
      !Array.isArray(scenario.items)
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
function fixture(suffix: string): Fixture {
  const found = data().fixtures.find((item) => item.name === `QA E211 ${suffix}`);
  if (!found) throw new Error(`Falta fixture sintético ${suffix}.`);
  return found;
}
function query(s: Scenario, extras: ReadonlyArray<readonly [string, string]> = []): string {
  const params = new URLSearchParams({ from: s.from, to: s.to });
  if (s.method) params.set('method', s.method);
  for (const [key, value] of extras) params.append(key, value);
  return `${ENDPOINT}?${params}`;
}
function privateHeaders(response: APIResponse | Response): void {
  expect(response.headers()['cache-control']).toContain('no-store');
  expect(response.headers()['referrer-policy']).toBe('no-referrer');
}
async function dto(
  response: APIResponse | Response,
  s: Scenario,
  limit: '10' | '20' | '50' = '20',
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
      'universe',
      'totalNoMovementProducts',
      'page',
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
  expect(result.universe).toEqual({
    asOf: new Date(s.to).toISOString(),
    includesUnavailable: true,
    definition:
      'product-not-deleted+category-active+category-not-deleted+created-before-asOf+availability-ignored+current-catalog-state',
  });
  expect(result.totalNoMovementProducts).toMatch(/^(0|[1-9][0-9]*)$/);
  if (!record(result.page) || !Array.isArray(result.items)) throw new Error('Página inválida.');
  expect(Object.keys(result.page).sort()).toEqual(['limit', 'nextCursor']);
  expect(result.page.limit).toBe(limit);
  if (result.page.nextCursor !== null)
    expect(result.page.nextCursor).toMatch(/^[A-Za-z0-9_-]{1,2048}$/);
  expect(result.items.length).toBeLessThanOrEqual(Number(limit));
  for (const item of result.items) {
    if (!record(item)) throw new Error('Ítem inválido.');
    expect(Object.keys(item).sort()).toEqual(
      ['productId', 'name', 'category', 'isAvailable', 'createdAt'].sort(),
    );
    expect(item.productId).toMatch(/^[1-9][0-9]*$/);
    expect(item.createdAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/);
    expect(typeof item.isAvailable).toBe('boolean');
  }
  return result as DashboardNoMovement;
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
  return page.getByRole('region', {
    name: 'Activos sin movimiento',
    exact: true,
  });
}
function matches(response: Response, s: Scenario, limit = '20', cursor = false): boolean {
  const url = new URL(response.url());
  return (
    url.pathname === ENDPOINT &&
    url.searchParams.get('from') === s.from &&
    url.searchParams.get('to') === s.to &&
    url.searchParams.get('method') === s.method &&
    url.searchParams.get('limit') === limit &&
    url.searchParams.has('cursor') === cursor
  );
}
async function open(page: Page): Promise<void> {
  await login(page, data().users.admin);
  await page.goto(`${ORIGIN}/terminal/administracion`);
  await expect(page.getByRole('heading', { name: 'Resumen del periodo' })).toBeVisible();
  const s = scenario();
  if (!s.startDate || !s.endDate) throw new Error('Faltan fechas locales principales.');
  const response = page.waitForResponse((r) => matches(r, s));
  await page.getByLabel('Desde').fill(s.startDate);
  await page.getByLabel('Hasta').fill(s.endDate);
  await page.getByRole('button', { name: 'Aplicar rango' }).click();
  await dto(await response, s);
  await expect(panel(page).getByRole('table')).toBeVisible();
}
async function complete(request: APIRequestContext, s: Scenario, limit: '10' | '20' | '50') {
  const items: NoMovementItem[] = [];
  const cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const extra: Array<[string, string]> = [['limit', limit]];
    if (cursor) extra.push(['cursor', cursor]);
    const page = await dto(await request.get(query(s, extra)), s, limit);
    expect(page.totalNoMovementProducts).toBe(String(s.items.length));
    expect(page.items).toEqual(s.items.slice(items.length, items.length + Number(limit)));
    items.push(...page.items);
    cursor = page.page.nextCursor;
    if (cursor) {
      expect(cursors.has(cursor)).toBe(false);
      cursors.add(cursor);
    }
    // Prevent loops without silently truncating the expected complete universe.
    expect(cursors.size).toBeLessThanOrEqual(s.items.length + 1);
  } while (cursor);
  expect(items).toEqual(s.items);
  expect(new Set(items.map((item) => item.productId)).size).toBe(items.length);
}
async function assertRows(page: Page, items: NoMovementItem[]): Promise<void> {
  const rows = panel(page).locator('tbody tr');
  await expect(rows).toHaveCount(items.length);
  for (const [index, item] of items.entries()) {
    const row = rows.nth(index);
    await expect(row.locator('th')).toContainText(`ID ${item.productId}`);
    await expect(row.locator('th')).toContainText(item.name);
    await expect(row.locator('td').nth(0)).toContainText(item.category.name);
    await expect(row.locator('td').nth(1)).toHaveText(
      item.isAvailable ? 'Disponible' : 'No disponible',
    );
    await expect(row.locator('time')).toHaveAttribute('datetime', item.createdAt);
  }
}

test.describe('DA-001 E2-11 — sin movimiento live (sin intercepción)', () => {
  test('RF-13: universo SQL del dataset disponible por rango, método y todos los límites', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await login(page, data().users.admin);
    for (const s of data().scenarios) {
      for (const limit of ['10', '20', '50'] as const) await complete(page.request, s, limit);
    }
    const s = scenario();
    const defaultPage = await dto(await page.request.get(query(s)), s);
    expect(defaultPage.page.limit).toBe('20');
    expect(defaultPage.items).toEqual(s.items.slice(0, 20));
    expect(s.items.length).toBeGreaterThan(20);
    expect(s.items.some((item) => !item.isAvailable)).toBe(true);
    // A method with no sales returns eligible products, NOT an empty list (R18 ambiguity).
    expect(scenario('no-sales', 'STRIPE').items.length).toBeGreaterThan(0);
    const start = performance.now();
    await complete(page.request, scenario('maximum'), '10');
    console.info(
      `E2-11 coste HTTP observado: ${Math.round(performance.now() - start)} ms, rango 366 días, dataset QA ampliado v1; no SLA.`,
    );
  });

  test('R13–R15 C-UI: paginación UI completa, método y límite reinician cursor', async ({
    page,
  }) => {
    await open(page);
    const s = scenario();
    await assertRows(page, s.items.slice(0, 20));
    const next = page.waitForResponse((r) => matches(r, s, '20', true));
    await panel(page).getByRole('button', { name: 'Cargar más', exact: true }).click();
    await dto(await next, s);
    await assertRows(page, s.items);
    await expect(panel(page).getByText('No hay más productos.', { exact: true })).toBeVisible();
    const cash = scenario('main', 'CASH');
    const changed = page.waitForResponse((r) => matches(r, cash));
    await page.getByLabel('Método de pago').selectOption('CASH');
    await dto(await changed, cash);
    await assertRows(page, cash.items.slice(0, 20));
    const limitChanged = page.waitForResponse((r) => matches(r, cash, '10'));
    await page.getByLabel('Productos por página').selectOption('10');
    await dto(await limitChanged, cash, '10');
    await assertRows(page, cash.items.slice(0, 10));
    await expect(panel(page)).toContainText('Corte del universo:');
    await expect(panel(page)).toContainText('No afirma ausencia global de ventas');
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
  });

  test('R16–R19: entrada estricta, precisión, cursores y Problem Details reales', async ({
    page,
  }) => {
    await login(page, data().users.admin);
    const s = scenario();
    const base = query(s);
    for (const extras of [
      [['limit', '010']],
      [['limit', '+20']],
      [['limit', '20.0']],
      [['limit', '5']],
      [['limit', '100']],
      [['limit', '']],
      [['method', 'cash']],
      [['method', 'null']],
      [['method', '']],
      [['top', '5']],
      [['category', '2']],
      [['offset', '1']],
      [['from', s.from]],
      [['from[]', s.from]],
      [['limit[]', '10']],
      [['cursor', '%%%']],
      [['cursor', 'a'.repeat(2049)]],
      [['cursor', Buffer.from('{"scope":"sales"}').toString('base64url')]],
    ] as const)
      await problem(await page.request.get(query(s, extras)));
    for (const [from, to] of [
      ['2000-01-01T07:59:59.999Z', '2000-01-02T08:00:00.000Z'],
      [s.from, s.from],
      [s.to, s.from],
      ['2025-11-25T08:00:00.000Z', '2026-11-26T08:00:00.001Z'],
      ['2026-02-30T08:00:00Z', s.to],
      ['2026-11-24T08:00:00+00:00', s.to],
    ])
      await problem(await page.request.get(query({ ...s, from, to })));
    for (const field of ['from', 'to'] as const) {
      for (const decimals of ['0000', '00000', '000000']) {
        await problem(
          await page.request.get(
            query({
              ...s,
              [field]: s[field].replace('.000Z', `.${decimals}Z`),
            }),
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
      expect((await dto(await page.request.get(query(normalized)), normalized)).items).toEqual(
        s.items.slice(0, 20),
      );
    }
    await problem(await page.request.get(base, { data: { extra: true } }));
    const first = await dto(await page.request.get(query(s, [['limit', '10']])), s, '10');
    const cursor = first.page.nextCursor;
    expect(cursor).not.toBeNull();
    if (!cursor) throw new Error('Dataset no acredita cursor.');
    for (const changed of [
      { ...s, method: 'CASH' as const },
      { ...s, from: '2026-11-24T08:00:00.001Z' },
    ])
      await problem(
        await page.request.get(
          query(changed, [
            ['limit', '10'],
            ['cursor', cursor],
          ]),
        ),
      );
    await problem(
      await page.request.get(
        query(s, [
          ['limit', '20'],
          ['cursor', cursor],
        ]),
      ),
    );
    const decoded: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!record(decoded)) throw new Error('Cursor de prueba no es objeto.');
    for (const mutation of [
      { extra: true },
      { scope: 'sales' },
      { productId: '0' },
      { name: '\u0000' },
      { definition: 'other' },
    ]) {
      const bad = Buffer.from(JSON.stringify({ ...decoded, ...mutation })).toString('base64url');
      await problem(
        await page.request.get(
          query(s, [
            ['limit', '10'],
            ['cursor', bad],
          ]),
        ),
      );
    }
    // Terminal cursor: preserve the valid scope/filters but move to the last existing key.
    // Deliberate test-only decoding; production UI must always treat cursors as opaque.
    const last = s.items.at(-1);
    if (!last) throw new Error('Falta última fila.');
    const terminal = Buffer.from(
      JSON.stringify({
        ...decoded,
        name: last.name,
        productId: last.productId,
      }),
    ).toString('base64url');
    const end = await dto(
      await page.request.get(
        query(s, [
          ['limit', '10'],
          ['cursor', terminal],
        ]),
      ),
      s,
      '10',
    );
    expect(end.items).toEqual([]);
    expect(end.totalNoMovementProducts).toBe(String(s.items.length));
    expect(end.page.nextCursor).toBeNull();
    const compatible = {
      ...s,
      from: s.from.replace('.000Z', 'Z'),
      to: s.to.replace('.000Z', 'Z'),
    };
    const second = await dto(
      await page.request.get(
        query(compatible, [
          ['limit', '10'],
          ['cursor', cursor],
        ]),
      ),
      compatible,
      '10',
    );
    expect(second.items).toEqual(s.items.slice(10, 20));
    // Vite's proxy rewrites Origin; verify the global rejection directly, using the same localhost cookie jar.
    await problem(
      await page.request.get(`http://localhost:3000${base}`, {
        headers: { Origin: 'https://not-allowed.invalid' },
      }),
      403,
      'ORIGIN_NOT_ALLOWED',
    );
  });

  test('R19: 401 y roles QA 403, guarda sin solicitudes administrativas', async ({ browser }) => {
    const anonymous = await playwrightRequest.newContext({ baseURL: ORIGIN });
    try {
      await problem(await anonymous.get(query(scenario())), 401, 'UNAUTHENTICATED');
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
        await problem(await page.request.get(query(scenario())), 403, 'FORBIDDEN');
      } finally {
        await context.close();
      }
    }
  });

  test('R18 C-UI: cero real e intervalo inválido sin consultas nuevas', async ({ page }) => {
    await open(page);
    const empty = scenario('zero');
    const response = page.waitForResponse((r) => matches(r, empty));
    await page.getByLabel('Desde').fill('2000-01-01');
    await page.getByLabel('Hasta').fill('2000-01-01');
    await page.getByRole('button', { name: 'Aplicar rango' }).click();
    const result = await dto(await response, empty);
    expect(result.items).toEqual([]);
    expect(result.totalNoMovementProducts).toBe('0');
    await expect(panel(page).getByRole('status')).toContainText('No hay productos sin movimiento');
    await expect(panel(page).getByRole('table')).toHaveCount(0);
    const reads: string[] = [];
    page.on('request', (r) => {
      if (new URL(r.url()).pathname === ENDPOINT) reads.push(r.url());
    });
    await page.getByLabel('Desde').fill('2026-11-25');
    await page.getByLabel('Hasta').fill('2026-11-24');
    await page.getByRole('button', { name: 'Aplicar rango' }).click();
    await expect(page.locator('#dashboard-filter-error')).toBeVisible();
    expect(reads).toEqual([]);
  });

  test('C-UI: teclado, carrera con carga de página y logout limpian datos privados', async ({
    page,
  }) => {
    await open(page);
    const s = scenario();
    const requested: string[] = [];
    const failed: string[] = [];
    page.on('request', (r) => {
      if (new URL(r.url()).pathname === ENDPOINT) requested.push(r.url());
    });
    page.on('requestfailed', (r) => {
      if (new URL(r.url()).pathname === ENDPOINT) failed.push(r.failure()?.errorText ?? 'failed');
    });
    await panel(page).getByRole('button', { name: 'Cargar más', exact: true }).focus();
    await page.keyboard.press('Enter');
    const final = page.waitForResponse((r) => matches(r, scenario('main', 'STRIPE'), '10'));
    await page.getByLabel('Método de pago').selectOption('CASH');
    await page.getByLabel('Productos por página').selectOption('50');
    await page.getByLabel('Método de pago').selectOption('STRIPE');
    await page.getByLabel('Productos por página').selectOption('10');
    await dto(await final, scenario('main', 'STRIPE'), '10');
    await assertRows(page, scenario('main', 'STRIPE').items.slice(0, 10));
    await expect(panel(page).getByRole('button', { name: 'Actualizar lista' })).toBeEnabled();
    expect(requested.length).toBeGreaterThan(1);
    expect(requested.some((url) => new URL(url).searchParams.has('cursor'))).toBe(true);
    expect(
      failed.length,
      'Al menos una cancelación real observada, sin intercepción.',
    ).toBeGreaterThan(0);
    console.info(
      `E2-11 carrera: ${requested.length} solicitudes; ${failed.length} requestfailed observados (no se infiere aborto si cero).`,
    );
    const refresh = panel(page).getByRole('button', {
      name: 'Actualizar lista',
    });
    await refresh.focus();
    const refreshed = page.waitForResponse((r) => matches(r, scenario('main', 'STRIPE'), '10'));
    await refresh.press('Space');
    await dto(await refreshed, scenario('main', 'STRIPE'), '10');
    await expect
      .soft(refresh, 'B01: actualizar por teclado conserva foco después de consultar.')
      .toBeFocused();
    // Observe the real shared session lifecycle; never manipulate cookies or session DB.
    await page.getByRole('button', { name: /Cerrar sesión/i }).click();
    await expect(panel(page)).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    await problem(await page.request.get(query(s)), 401, 'UNAUTHENTICATED');
  });

  test('C-VIS/REAL: axe y capturas sanitizadas por viewport 1280/768/390', async ({ page }) => {
    await open(page);
    for (const width of [1280, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await assertRows(page, scenario().items.slice(0, 20));
      if (width === 390) {
        for (const [name, precedingSelect] of [
          ['Tabla desplazable del ranking de productos', 'Cantidad de productos'],
          ['Tabla desplazable de activos sin movimiento', 'Productos por página'],
        ] as const) {
          const region = page.getByRole('region', { name, exact: true });
          await page.getByLabel(precedingSelect).focus();
          await page.keyboard.press('Tab');
          await expect(region).toBeFocused();
          await expect(region).toHaveCSS('outline-width', '3px');
          expect(await region.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
          await region.press('ArrowRight');
          await expect.poll(() => region.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
          await region.press('ArrowLeft');
          await expect.poll(() => region.evaluate((node) => node.scrollLeft)).toBe(0);
        }
      }
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect
        .soft(
          results.violations.map(({ id, impact, nodes }) => ({
            width,
            id,
            impact,
            targets: nodes.map((node) => node.target),
          })),
        )
        .toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      // Capture a real, deterministic focus state; never hide the skip link with CSS.
      const skipLink = page.locator('.skip-link');
      await skipLink.focus();
      await expect(skipLink).toBeFocused();
      expect(
        await skipLink.evaluate((node) => node.getBoundingClientRect().top),
      ).toBeGreaterThanOrEqual(0);
      await page.getByLabel('Productos por página').focus();
      await expect(page.getByLabel('Productos por página')).toBeFocused();
      const skipState = await page.locator('.skip-link').evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return {
          focused: document.activeElement === node,
          bottom: rect.bottom,
          transform: getComputedStyle(node).transform,
        };
      });
      expect(skipState.focused).toBe(false);
      expect(skipState.bottom).toBeLessThanOrEqual(0);
      console.info(
        `E2-11 captura ${width}: skip-link sin foco y fuera del viewport (${skipState.transform}).`,
      );
      // Only this panel contains QA catalog data: exclude actor/session, sales, QR and shell.
      await panel(page).screenshot({
        path: path.join(data().captureDir, `no-movement-${width}.png`),
        animations: 'disabled',
      });
    }
  });

  test('C-VIS/REAL: Electron real con aislamiento, tabla y captura sanitizada', async () => {
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
      await open(page);
      await expect
        .poll(() => page.evaluate(() => window.cafeteriaDesktop?.terminalOnly))
        .toBe(true);
      const preferences = await app.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        if (!window) throw new Error('Sin ventana Electron.');
        window.setSize(1280, 900);
        // Runtime Electron introspection API is present but absent from its public WebContents type.
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
      await assertRows(page, scenario().items.slice(0, 20));
      await page.getByLabel('Productos por página').focus();
      await panel(page).screenshot({
        path: path.join(data().captureDir, 'no-movement-electron-1280.png'),
        animations: 'disabled',
      });
      console.info(
        'E2-11 Electron: terminalOnly, nodeIntegration=false, contextIsolation/sandbox/webSecurity=true; no acredita HTTPS/distribución.',
      );
    } finally {
      await app.close();
      rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test('R11: reembolso total sintético conserva movimiento live', async ({ page }) => {
    await login(page, data().users.admin);
    const refunded = fixture('refunded');
    expect(refunded.sales).toEqual([
      {
        soldAt: '2026-11-24T15:00:00.000000Z',
        method: 'STRIPE',
        status: 'SUCCEEDED',
        totalCents: '100',
        refundCents: '100',
      },
    ]);
    for (const method of [null, 'CASH', 'STRIPE'] as const) {
      const s = scenario('main', method);
      await complete(page.request, s, '10');
      expect(s.items.some((item) => item.productId === refunded.productId)).toBe(method === 'CASH');
    }
  });
  test('R15: nombres iguales, mayúsculas y acentos live, orden SQL y UI', async ({ page }) => {
    await open(page);
    const s = scenario();
    const names = ['A', 'B', 'Same', 'Same', 'a', 'Á'].map((suffix) => `QA E211 ${suffix}`);
    const ordered = s.items.filter((item) => names.includes(item.name));
    expect(ordered.map((item) => item.name)).toEqual(names);
    const ties = ordered.filter((item) => item.name === 'QA E211 Same');
    expect(ties).toHaveLength(2);
    expect(BigInt(ties[0]!.productId) < BigInt(ties[1]!.productId)).toBe(true);
    await complete(page.request, s, '10');
    await complete(page.request, s, '10');
    const response = page.waitForResponse((r) => matches(r, s, '50'));
    await page.getByLabel('Productos por página').selectOption('50');
    await dto(await response, s, '50');
    await assertRows(page, s.items);
  });
  test('R03/R05/R09/R17: categoría borrada, alta y venta to−1 µs/to exacto live', async ({
    page,
  }) => {
    await login(page, data().users.admin);
    const high = fixture('high microsecond');
    const at = fixture('cohort exactly to');
    const soldHigh = fixture('sold microsecond');
    const soldAt = fixture('sold exactly to');
    const deleted = fixture('deleted category product');
    expect(high.createdAt).toBe('2026-11-26T07:59:59.999999Z');
    expect(at.createdAt).toBe('2026-11-26T08:00:00.000000Z');
    expect(soldHigh.sales[0]?.soldAt).toBe('2026-11-26T07:59:59.999999Z');
    expect(soldAt.sales[0]?.soldAt).toBe('2026-11-26T08:00:00.000000Z');
    // Active=true deliberately isolates deleted_at from is_active, within DB constraints.
    expect(deleted.categoryDeleted && deleted.categoryActive).toBe(true);
    for (const id of ['micro-left', 'micro-center', 'micro-right']) {
      const s = scenario(id);
      await complete(page.request, s, '10');
      const has = (item: Fixture) => s.items.some((row) => row.productId === item.productId);
      expect(has(high)).toBe(id !== 'micro-left');
      expect(has(at)).toBe(id === 'micro-right');
      expect(has(soldHigh)).toBe(id !== 'micro-center');
      expect(has(soldAt)).toBe(id !== 'micro-right');
      expect(has(deleted)).toBe(false);
    }
  });
  test('R19: CLIENTE/GERENTE/PIN obligatorio live con cuentas QA nuevas', async ({ browser }) => {
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
            data: data().users[role],
          },
        );
        if (logged.status() !== 200)
          throw new Error(`Login QA ${role} falló; contenido privado no registrado.`);
        await problem(
          await context.request.get(query(scenario())),
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
        await expect(page.getByRole('heading', { name: 'Resumen del periodo' })).toHaveCount(0);
        await expect(page.getByText('Comprobando sesión…')).toHaveCount(0);
        expect(reads).toEqual([]);
        expect(await page.evaluate(() => localStorage.length)).toBe(0);
      } finally {
        await context.close();
      }
    }
  });
  // No silent inheritance of E2-03's exception; chaos/session writes remain unauthorized.
  test.skip('R20 C-UI: 413/429/500/503, fallo parcial y DTO inválido live', () => {
    /* No authorized chaos; mocks do not count here. */
  });
  test.skip('RF-19: expiración/refresh y sustitución entre pestañas live', () => {
    /* Logout is tested; expiry/revocation is not induced. */
  });
});

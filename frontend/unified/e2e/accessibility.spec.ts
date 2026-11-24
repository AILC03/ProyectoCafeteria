import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

type MockActor = {
  id: string;
  name: string;
  role: string;
  accountType: string;
  mustChangePin: boolean;
};

const CAJERO: MockActor = { id: '2', name: 'Cajero Uno', role: 'CAJERO', accountType: 'STAFF', mustChangePin: false };
const ADMINISTRADOR: MockActor = { id: '3', name: 'Admin Tres', role: 'ADMINISTRADOR', accountType: 'STAFF', mustChangePin: false };

const category = { id: '1', name: 'Bebidas' };
const product = {
  id: '10',
  categoryId: '1',
  name: 'Latte',
  description: 'Espresso con leche vaporizada',
  basePriceCents: '6500',
  imageUrl: null,
  isAvailable: true,
};

const salesSummary = { count: '1', totalCents: '6500', cashCents: '6500', stripeCents: '0' };

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
    totalCents: '6500',
    ticketCount: '1',
    averageTicketCents: '6500',
    unitsSold: '1',
    paymentMix: { cashCents: '6500', stripeCents: '0' },
    comparison: {
      totalCents: { previous: '0', change: '6500', changePercent: null },
      ticketCount: { previous: '0', change: '1', changePercent: null },
      averageTicketCents: { previous: '0', change: '6500', changePercent: null },
      unitsSold: { previous: '0', change: '1', changePercent: null },
    },
  };
}

/**
 * Mocks every API call the audited pages need. `actor === null` behaves like a
 * visitor without a session. No real backend, tokens or secrets are involved.
 */
async function mockApi(context: BrowserContext, actor: MockActor | null) {
  await context.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (data: unknown, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(data),
    });
    const unauthenticated = () => json({ code: 'UNAUTHENTICATED' }, 401);

    if (path === '/api/v1/auth/me' && request.method() === 'GET') {
      return actor === null ? unauthenticated() : json({ data: actor });
    }
    if (path === '/api/v1/auth/refresh' && request.method() === 'POST') {
      return actor === null ? unauthenticated() : json({ data: { user: actor, csrfToken: 'e2e-a11y-csrf' } });
    }
    if (path === '/api/v1/auth/csrf' && request.method() === 'GET') {
      return json({ data: { csrfToken: 'e2e-a11y-csrf' } });
    }

    if (path === '/api/v1/categories' && request.method() === 'GET') {
      return json({ data: [category], page: { limit: 100, nextCursor: null } });
    }
    if (path === '/api/v1/products' && request.method() === 'GET') {
      return json({ data: [product], page: { limit: 100, nextCursor: null } });
    }
    if (path === '/api/v1/admin/dashboard/summary' && request.method() === 'GET') {
      return json({ data: dashboardSummary(request.url()) });
    }
    if (path === '/api/v1/sales/summary' && request.method() === 'GET') {
      return json({ data: salesSummary });
    }
    if (path === '/api/v1/cash-sessions/current' && request.method() === 'GET') {
      return json({ data: null });
    }

    return json({ code: 'NOT_FOUND' }, 404);
  });
}

function formatViolations(violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations']): string {
  return violations
    .map((violation) => {
      const targets = violation.nodes.map((node) => node.target.join(' ')).join(' | ');
      return `- [${violation.impact ?? 'unknown'}] ${violation.id}: ${violation.help} (${targets})`;
    })
    .join('\n');
}

async function expectNoA11yViolations(page: Page, pageLabel: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    results.violations,
    `Violaciones de accesibilidad en ${pageLabel}:\n${formatViolations(results.violations)}`,
  ).toEqual([]);
  const contrastIncomplete = results.incomplete.filter((result) => result.id === 'color-contrast');
  expect(
    contrastIncomplete,
    `Contraste no verificable automáticamente en ${pageLabel}:\n${formatViolations(contrastIncomplete)}`,
  ).toEqual([]);
}

test.describe('Automated accessibility (axe-core, WCAG 2.1 A/AA)', () => {
  test('client menu has no WCAG A/AA violations for a visitor', async ({ page, context }) => {
    await mockApi(context, null);
    await page.goto('/cliente/menu');
    await expect(page.getByRole('heading', { name: 'Menú' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Latte' })).toBeVisible();
    await expectNoA11yViolations(page, '/cliente/menu (visitante)');
  });

  test('terminal staff access form has no WCAG A/AA violations', async ({ page, context }) => {
    await mockApi(context, null);
    await page.goto('/terminal/acceso');
    await expect(page.getByRole('heading', { name: 'Acceso a terminal' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Iniciar sesión como personal' })).toBeVisible();
    await expectNoA11yViolations(page, '/terminal/acceso (visitante)');
  });

  test('terminal access page with a CAJERO session has no WCAG A/AA violations', async ({ page, context }) => {
    await mockApi(context, CAJERO);
    await page.goto('/terminal/acceso');
    await expect(page.getByRole('heading', { name: 'Sesión de personal activa' })).toBeVisible();
    await expectNoA11yViolations(page, '/terminal/acceso (CAJERO)');
  });

  test('POS has no WCAG A/AA violations with a CAJERO session', async ({ page, context }) => {
    await mockApi(context, CAJERO);
    await page.goto('/terminal/pos');
    await expect(page.getByRole('heading', { name: 'Punto de venta' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Personalizar Latte' })).toBeVisible();
    await expectNoA11yViolations(page, '/terminal/pos (CAJERO)');
  });

  test('administration dashboard has no WCAG A/AA violations with an ADMINISTRADOR session', async ({ page, context }) => {
    await mockApi(context, ADMINISTRADOR);
    await page.goto('/terminal/administracion');
    await expect(page.getByRole('heading', { name: 'Administración' })).toBeVisible();
    await expect(page.getByText('$65.00').first()).toBeVisible();
    await expectNoA11yViolations(page, '/terminal/administracion (ADMINISTRADOR)');
  });
});

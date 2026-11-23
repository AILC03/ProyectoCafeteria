import { expect, test, type BrowserContext } from '@playwright/test';

const actor = { id: '2', name: 'Cajero Uno', role: 'CAJERO', accountType: 'STAFF', mustChangePin: false };
const sale = { id: '9', saleNumber: 'V000009', orderId: '7', paymentId: '8', totalCents: '6500', soldAt: '2099-01-01T12:00:00.000Z', method: 'CASH' };
const summary = { count: '1', totalCents: '6500', cashCents: '6500', stripeCents: '0' };
const token = 's'.repeat(43);
const ticket = {
  saleId: '9', saleNumber: 'V000009', orderFolio: 'A000007', soldAt: '2099-01-01T12:00:00.000Z',
  currency: 'MXN', totalCents: '6500', cashReceivedCents: '7000', changeCents: '500',
  items: [{ productName: 'Latte', quantity: 1, unitPriceCents: '6500', lineTotalCents: '6500' }],
  registration: { purpose: 'CUSTOMER_REGISTRATION', token, qrPayload: `cafeteria:register:${token}`, expiresAt: '2099-01-02T12:00:00.000Z' },
};

type Mode = 'success' | 'empty' | 'forbidden' | 'not-found' | 'paged' | 'stripe';

const stripeSale = { ...sale, id: '10', saleNumber: 'V000010', totalCents: '3500', method: 'STRIPE' };
const stripeTicket = { ...ticket, saleId: '10', saleNumber: 'V000010', totalCents: '3500', cashReceivedCents: null, changeCents: null, registration: null };

async function mock(context: BrowserContext, mode: Mode) {
  const posts: string[] = [];
  const cursors: Array<string | null> = [];
  const queries: URL[] = [];
  let ticketGets = 0;
  let ticketAccessCalls = 0;
  await context.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });

    if (request.method() !== 'GET') {
      posts.push(`${request.method()} ${path}`);
      return json({}, 200);
    }
    if (path === '/api/v1/auth/me') return json({ data: actor });
    if (path === '/api/v1/sales/summary') {
      queries.push(url);
      return mode === 'forbidden'
        ? json({ code: 'FORBIDDEN' }, 403)
        : json({ data: mode === 'empty' ? { count: '0', totalCents: '0', cashCents: '0', stripeCents: '0' } : mode === 'stripe' ? { count: '1', totalCents: '3500', cashCents: '0', stripeCents: '3500' } : summary });
    }
    if (path === '/api/v1/sales') {
      queries.push(url);
      cursors.push(url.searchParams.get('cursor'));
      if (mode === 'forbidden') return json({ code: 'FORBIDDEN' }, 403);
      if (mode === 'empty') return json({ data: [], page: { limit: 20, nextCursor: null } });
      return json({
        data: [mode === 'stripe' ? stripeSale : sale],
        page: { limit: 20, nextCursor: mode === 'paged' && url.searchParams.get('cursor') === null ? 'opaque-2' : null },
      });
    }
    if (path === '/api/v1/sales/9/ticket' || path === '/api/v1/sales/10/ticket') {
      ticketGets += 1;
      if (mode === 'not-found') return json({ code: 'NOT_FOUND' }, 404);
      return json({ data: path.endsWith('/10/ticket') ? stripeTicket : ticket });
    }
    if (path === '/api/v1/sales/9/ticket-access') {
      ticketAccessCalls += 1;
      return json({ code: 'NOT_FOUND' }, 404);
    }
    return json({ code: 'NOT_FOUND' }, 404);
  });
  return { posts, cursors, queries, ticketCount: () => ticketGets, ticketAccessCount: () => ticketAccessCalls };
}

test.describe('TASK-17 operational history', () => {
  test('lists sales and reprints by keyboard without charging or exposing the token', async ({ page, context }) => {
    const api = await mock(context, 'success');
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/terminal/historial');
    await expect(page.getByRole('heading', { name: 'Historial y ventas' })).toBeVisible();
    await expect(page.getByText('V000009')).toBeVisible();
    await expect(page.getByText('$65.00').first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Historial' })).toHaveAttribute('href', '/terminal/historial');

    const reprint = page.getByRole('button', { name: 'Reimprimir ticket V000009' });
    await reprint.focus();
    await expect(reprint).toBeFocused();
    await page.keyboard.press('Enter');
    const reprinted = page.getByRole('heading', { name: 'Ticket reimpreso' });
    await expect(reprinted).toBeVisible();
    await expect(reprinted).toBeFocused();
    await expect(page.getByRole('heading', { name: 'Ticket V000009' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText(token);
    await expect(page.locator('body')).not.toContainText('cafeteria:register');
    expect(api.posts).toEqual([]);
    expect(api.ticketAccessCount()).toBe(0);
    expect(api.ticketCount()).toBe(1);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('table', { name: 'Ventas operativas' })).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Ticket V000009' })).toBeVisible();
    await page.emulateMedia({ media: 'screen' });
  });

  test('shows an empty state without a ticket action', async ({ page, context }) => {
    await mock(context, 'empty');
    await page.goto('/terminal/historial');
    await expect(page.getByText(/No hay ventas en el rango seleccionado/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Reimprimir ticket/ })).toHaveCount(0);
  });

  test('shows a denied message for 403 without private data', async ({ page, context }) => {
    await mock(context, 'forbidden');
    await page.goto('/terminal/historial');
    await expect(page.getByRole('alert')).toContainText(/Sólo caja y administración/);
    await expect(page.getByText('V000009')).toHaveCount(0);
  });

  test('reports a missing sale on reprint without another charge', async ({ page, context }) => {
    const api = await mock(context, 'not-found');
    await page.goto('/terminal/historial');
    await page.getByRole('button', { name: 'Reimprimir ticket V000009' }).click();
    await expect(page.getByRole('alert')).toContainText(/la venta no existe/);
    await expect(page.getByRole('heading', { name: 'Ticket reimpreso' })).toHaveCount(0);
    expect(api.posts).toEqual([]);
  });

  test('moves pages only with opaque cursors', async ({ page, context }) => {
    const api = await mock(context, 'paged');
    await page.goto('/terminal/historial');
    await expect(page.getByText('V000009')).toBeVisible();
    const initialCount = api.cursors.length;
    expect(initialCount).toBeGreaterThan(0);
    expect(api.cursors.every((cursor) => cursor === null)).toBe(true);
    await page.getByRole('button', { name: 'Página siguiente' }).click();
    await expect(page.getByText('Página 2')).toBeVisible();
    expect(api.cursors.slice(initialCount)).toEqual(['opaque-2']);
    await page.getByRole('button', { name: 'Página anterior' }).click();
    await expect(page.getByText('Página 1')).toBeVisible();
    expect(api.cursors.slice(initialCount + 1)).toEqual([null]);
  });

  test('reprints a STRIPE ticket without cash amounts or a new charge', async ({ page, context }) => {
    const api = await mock(context, 'stripe');
    await page.goto('/terminal/historial');
    await expect(page.getByText('V000010')).toBeVisible();
    await page.getByRole('button', { name: 'Reimprimir ticket V000010' }).click();
    await expect(page.getByRole('heading', { name: 'Ticket reimpreso' })).toBeVisible();
    await expect(page.getByText(/Total:/)).toContainText('$35.00');
    await expect(page.getByText(/Recibido:/)).toHaveCount(0);
    await expect(page.getByText(/Cambio:/)).toHaveCount(0);
    expect(api.posts).toEqual([]);
    expect(api.ticketCount()).toBe(1);
  });

  test('sends exact filter parameters and keeps summary free of limit and cursor', async ({ page, context }) => {
    const api = await mock(context, 'success');
    await page.goto('/terminal/historial');
    await page.getByLabel('Desde').fill('2026-01-01');
    await page.getByLabel('Hasta').fill('2026-01-02');
    await page.getByLabel('Método').selectOption('STRIPE');
    await page.getByLabel('Por página').selectOption('10');
    await page.getByRole('button', { name: 'Aplicar filtros' }).click();
    await expect.poll(() => api.queries.some((query) => query.pathname.endsWith('/sales')
      && query.searchParams.get('from') === '2026-01-01T00:00:00.000Z'
      && query.searchParams.get('to') === '2026-01-03T00:00:00.000Z'
      && query.searchParams.get('method') === 'STRIPE'
      && query.searchParams.get('limit') === '10')).toBe(true);
    const summaryQuery = api.queries.filter((query) => query.pathname.endsWith('/summary')).at(-1);
    expect(summaryQuery).toBeDefined();
    expect([...summaryQuery!.searchParams.keys()]).toEqual(['from', 'to', 'method']);
    expect(summaryQuery!.searchParams.get('limit')).toBeNull();
    expect(summaryQuery!.searchParams.get('cursor')).toBeNull();
  });
});

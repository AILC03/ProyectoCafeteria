import { expect, test, type BrowserContext } from '@playwright/test';

type Actor = { id: string; name: string; role: string; accountType: string; mustChangePin: boolean };
type Mode = 'success' | 'empty' | 'paged' | 'conflict' | 'availability' | 'unverifiable' | 'forbidden';

const preparacion: Actor = { id: '3', name: 'Cocina Uno', role: 'PREPARACION', accountType: 'STAFF', mustChangePin: false };
const cajero: Actor = { id: '2', name: 'Cajero Uno', role: 'CAJERO', accountType: 'STAFF', mustChangePin: false };
const cliente: Actor = { id: '1', name: 'Cliente', role: 'CLIENTE', accountType: 'CUSTOMER', mustChangePin: false };
const summary = { id: '7', folio: 'A000007', guestName: 'Ana', status: 'EN_PREPARACION', createdAt: '2099-01-01T12:00:00.000Z' };
const item = {
  id: '11', productId: '10', productName: 'Latte', basePriceCents: '6000', unitPriceCents: '6500',
  quantity: 1, lineTotalCents: '6500',
  options: [{ optionValueId: '5', groupName: 'Tamaño', optionName: 'Grande', surchargeCents: '500' }],
};
const order = {
  id: '7', folio: 'A000007', source: 'CASHIER', status: 'EN_PREPARACION', paymentMethod: 'CASH',
  totalCents: '6500', customerId: null, guestName: 'Ana',
  paymentExpiresAt: '2099-01-01T12:30:00.000Z', paidAt: '2099-01-01T12:05:00.000Z',
  readyAt: null, readyByEmployeeId: null, createdAt: '2099-01-01T12:00:00.000Z', items: [item],
};
const readyOrder = { ...order, status: 'LISTO', readyAt: '2099-01-01T12:10:00.000Z', readyByEmployeeId: '3' };
const catalogProduct = {
  id: '10', categoryId: '1', name: 'Latte', description: null,
  basePriceCents: '6500', imageUrl: null, isAvailable: true,
};
const adminProduct = {
  ...catalogProduct, imagePublicId: null, imageVersion: null, deletedAt: null,
  createdAt: '2099-01-01T12:00:00.000Z', updatedAt: '2099-01-01T12:00:00.000Z',
};

type Mutation = { method: string; path: string; body: unknown };

async function mock(context: BrowserContext, mode: Mode, actor: Actor) {
  const mutations: Mutation[] = [];
  const cursors: Array<string | null> = [];
  await context.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });

    if (path === '/api/v1/auth/me') return json({ data: actor });
    if (path === '/api/v1/auth/csrf') return json({ data: { csrfToken: 'e2e-csrf' } });

    if (request.method() !== 'GET') {
      let body: unknown = null;
      try { body = await request.postDataJSON(); } catch { body = null; }
      mutations.push({ method: request.method(), path, body });
      if (path === '/api/v1/orders/7/ready') {
        if (mode === 'conflict') return json({ status: 409, code: 'ORDER_CONFLICT', title: 'Conflicto', detail: 'La orden ya no está en preparación.' }, 409);
        return json({ data: readyOrder });
      }
      if (path === '/api/v1/products/10/availability') {
        if (mode === 'unverifiable') return json({ data: { ...adminProduct, isAvailable: false, surprise: true } });
        if (mode === 'forbidden') return json({ status: 403, code: 'FORBIDDEN', title: 'Denegado' }, 403);
        return json({ data: { ...adminProduct, isAvailable: (body as { isAvailable?: boolean })?.isAvailable === true } });
      }
      return json({}, 200);
    }

    if (path === '/api/v1/preparation/orders') {
      const cursor = url.searchParams.get('cursor');
      cursors.push(cursor);
      if (mode === 'forbidden') return json({ status: 403, code: 'FORBIDDEN', title: 'Denegado' }, 403);
      if (mode === 'empty') return json({ data: [], page: { limit: 20, nextCursor: null } });
      return json({
        data: [summary],
        page: { limit: 20, nextCursor: mode === 'paged' && cursor === null ? 'opaque-2' : null },
      });
    }
    if (path === '/api/v1/orders/7') return json({ data: order });
    if (path === '/api/v1/products') {
      return json({ data: [catalogProduct], page: { limit: 100, nextCursor: null } });
    }
    return json({ status: 404, code: 'NOT_FOUND', title: 'No encontrado' }, 404);
  });
  return { mutations, cursors };
}

test.describe('TASK-18 kitchen and availability', () => {
  test('lists the queue, rechecks status and marks LISTO by keyboard without other writes', async ({ page, context }) => {
    const api = await mock(context, 'success', preparacion);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/terminal/cocina');
    await expect(page.getByRole('heading', { name: 'Cola de cocina' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Orden A000007' })).toBeVisible();
    await expect(page.getByText('Grande')).toBeVisible();
    await expect(page.getByText('$65.00')).toBeVisible();

    const ready = page.getByRole('button', { name: 'Marcar orden A000007 como LISTO' });
    await ready.focus();
    await expect(ready).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: 'marcada como LISTO' })).toContainText('marcada como LISTO');
    await expect(page.getByRole('heading', { name: 'Orden A000007' })).toHaveCount(0);
    expect(api.mutations).toHaveLength(1);
    expect(api.mutations[0]).toEqual({ method: 'POST', path: '/api/v1/orders/7/ready', body: {} });

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('a state conflict reports the failure and refreshes without replaying the mutation', async ({ page, context }) => {
    const api = await mock(context, 'conflict', preparacion);
    await page.goto('/terminal/cocina');
    await page.getByRole('button', { name: 'Marcar orden A000007 como LISTO' }).click();
    await expect(page.getByRole('alert')).toContainText('ya no está en preparación');
    await expect.poll(() => api.mutations.length).toBe(1);
    await expect(page.getByRole('heading', { name: 'Orden A000007' })).toBeVisible();
    expect(api.mutations[0].method).toBe('POST');
  });

  test('moves pages only with explicit opaque cursors and blocks rapid double clicks', async ({ page, context }) => {
    const api = await mock(context, 'paged', preparacion);
    await page.goto('/terminal/cocina');
    await expect(page.getByRole('heading', { name: 'Orden A000007' })).toBeVisible();
    // StrictMode may repeat the initial effect in dev; only explicit cursors matter here.
    expect(api.cursors.filter((cursor) => cursor !== null)).toEqual([]);
    const next = page.getByRole('button', { name: 'Página siguiente' });
    await next.click();
    await expect(page.getByRole('button', { name: 'Página siguiente' })).toBeDisabled();
    await next.dispatchEvent('click');
    expect(api.cursors.filter((cursor) => cursor !== null)).toEqual(['opaque-2']);
    await expect(page.getByText('Página 2')).toBeVisible();
  });

  test('never exposes kitchen or availability to unauthorised actors', async ({ browser }) => {
    for (const [path, actor] of [
      ['/terminal/cocina', cliente],
      ['/terminal/disponibilidad', preparacion],
    ] as const) {
      const context = await browser.newContext();
      const api = await mock(context, 'forbidden', actor);
      const page = await context.newPage();
      await page.goto(path);
      await expect(page.getByRole('heading', { name: 'Acceso no disponible' })).toBeVisible();
      expect(api.mutations).toEqual([]);
      expect(api.cursors).toEqual([]);
      await context.close();
    }
  });

  test('CAJERO changes availability only from the verified API response', async ({ page, context }) => {
    const api = await mock(context, 'availability', cajero);
    await page.goto('/terminal/disponibilidad');
    await page.getByRole('button', { name: 'Agotar Latte' }).click();
    await expect(page.getByRole('status')).toContainText('agotado');
    await expect(page.getByRole('button', { name: 'Habilitar Latte' })).toBeVisible();
    expect(api.mutations).toHaveLength(1);
    expect(api.mutations[0]).toEqual({ method: 'PATCH', path: '/api/v1/products/10/availability', body: { isAvailable: false } });
    const stored = await page.evaluate(() => localStorage.length);
    expect(stored).toBe(0);
  });

  test('an unverifiable availability response keeps the previous local state', async ({ page, context }) => {
    await mock(context, 'unverifiable', cajero);
    await page.goto('/terminal/disponibilidad');
    await page.getByRole('button', { name: 'Agotar Latte' }).click();
    await expect(page.getByRole('alert')).toContainText('no se puede verificar');
    await expect(page.getByRole('button', { name: 'Agotar Latte' })).toBeVisible();
  });
});

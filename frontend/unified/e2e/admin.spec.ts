import { expect, test, type BrowserContext } from '@playwright/test';

const administrator = { id: '1', name: 'Ana', role: 'ADMINISTRADOR', accountType: 'STAFF', mustChangePin: false };
const cashier = { id: '2', name: 'Caja', role: 'CAJERO', accountType: 'STAFF', mustChangePin: false };
const preparacion = { id: '3', name: 'Cocina', role: 'PREPARACION', accountType: 'STAFF', mustChangePin: false };
const category = { id: '1', name: 'Bebidas', isActive: true, deletedAt: null, createdAt: '2026-01-01T12:00:00.000Z' };
const product = {
  id: '2', categoryId: '1', name: 'Café', description: null, basePriceCents: '4500', imageUrl: null,
  imagePublicId: null, imageVersion: null, isAvailable: true, deletedAt: null,
  createdAt: '2026-01-01T12:00:00.000Z', updatedAt: '2026-01-01T12:00:00.000Z',
};
const employee = { id: '3', name: 'María', username: 'maria_3', role: 'CAJERO', isActive: true };
const group = { id: '4', name: 'Tamaño', pricingScope: 'GLOBAL', deletedAt: null };
const value = { id: '5', optionGroupId: '4', name: 'Grande', globalSurchargeCents: '500', isAvailable: true, deletedAt: null };
const config = { groups: [{ groupId: '4', minSelections: 0, maxSelections: 1, values: [{ valueId: '5' }] }] };

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
    paymentMix: { cashCents: '4500', stripeCents: '0' },
    comparison: {
      totalCents: { previous: '0', change: '4500', changePercent: null },
      ticketCount: { previous: '0', change: '1', changePercent: null },
      averageTicketCents: { previous: '0', change: '4500', changePercent: null },
      unitsSold: { previous: '0', change: '1', changePercent: null },
    },
  };
}

async function mock(context: BrowserContext, actor = administrator) {
  const requests: Array<{ method: string; path: string; body: unknown; csrf: string | null }> = [];
  await context.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (path === '/api/v1/auth/me') return json({ data: actor });
    if (path === '/api/v1/auth/csrf') return json({ data: { csrfToken: 'e2e-admin-csrf' } });
    if (request.method() !== 'GET') {
      const body: unknown = request.postData() ? request.postDataJSON() : null;
      requests.push({ method: request.method(), path, body, csrf: request.headers()['x-csrf-token'] ?? null });
      if (path === '/api/v1/admin/categories') return json({ data: { ...category, id: '8', name: 'Comida' } }, 201);
      if (path === '/api/v1/admin/employees') return json({ data: employee }, 201);
      if (path === '/api/v1/admin/option-groups') return json({ data: group }, 201);
      if (path === '/api/v1/admin/option-groups/4/values') return json({ data: value }, 201);
      if (path.endsWith('/configuration')) return json({ data: config });
      return json({}, 404);
    }
    if (path === '/api/v1/admin/dashboard/summary') {
      return json({ data: dashboardSummary(request.url()) });
    }
    if (path === '/api/v1/sales/summary') return json({ data: { count: '1', totalCents: '4500', cashCents: '4500', stripeCents: '0' } });
    if (path === '/api/v1/admin/categories') return json({ data: [category], page: { limit: 20, nextCursor: null } });
    if (path === '/api/v1/admin/products') return json({ data: [product], page: { limit: 20, nextCursor: null } });
    if (path === '/api/v1/admin/employees') return json({ data: [employee], page: { limit: 20, nextCursor: null } });
    if (path === '/api/v1/admin/option-groups') return json({ data: [group], page: { limit: 20, nextCursor: null } });
    if (path === '/api/v1/admin/option-values') return json({ data: [value], page: { limit: 20, nextCursor: null } });
    if (path === '/api/v1/admin/products/2/configuration') return json({ data: config });
    return json({ status: 404, title: 'No encontrado' }, 404);
  });
  return requests;
}

test.describe('TASK-19 administrative workspace', () => {
  test('administrator reads dashboard and creates a category with CSRF, keyboard and no storage', async ({ page, context }) => {
    const writes = await mock(context);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/terminal/administracion');
    await expect(page.getByRole('heading', { name: 'Administración' })).toBeVisible();
    await expect(page.getByText('$45.00').first()).toBeVisible();
    const categories = page.getByRole('link', { name: 'Categorías' });
    await categories.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Bebidas')).toBeVisible();
    await page.getByRole('textbox', { name: 'Nombre' }).fill('Comida');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'guardado' })).toBeVisible();
    expect(writes).toEqual([{ method: 'POST', path: '/api/v1/admin/categories', body: { name: 'Comida', isActive: true }, csrf: 'e2e-admin-csrf' }]);
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });

  test('configuration only uses API groups and rejects invalid edits before mutation', async ({ page, context }) => {
    const writes = await mock(context);
    await page.goto('/terminal/administracion');
    await page.getByRole('link', { name: 'Productos', exact: true }).click();
    await page.getByRole('button', { name: 'Opciones de Café' }).click();
    const editor = page.getByRole('textbox', { name: 'Grupos, límites y valores (JSON)' });
    await expect(editor).toContainText('groupId');
    await editor.fill('{"groups":[{"groupId":"4","minSelections":2,"maxSelections":1,"values":[]}]}');
    await page.getByRole('button', { name: 'Guardar configuración' }).click();
    await expect(page.getByRole('alert')).toContainText('Configuración no válida');
    expect(writes).toEqual([]);
  });

  test('creates staff only in a contract role and never writes credentials to storage', async ({ page, context }) => {
    const writes = await mock(context);
    await page.goto('/terminal/administracion/personal');
    await expect(page.getByRole('heading', { name: 'Personal', exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Nombre' }).fill('María');
    await page.getByRole('textbox', { name: 'Usuario' }).fill('maria_3');
    await page.getByLabel('Contraseña nueva').fill('secret123');
    await page.getByRole('combobox', { name: 'Rol' }).selectOption('CAJERO');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'guardado' })).toBeVisible();
    expect(writes).toEqual([{ method: 'POST', path: '/api/v1/admin/employees',
      body: { name: 'María', username: 'maria_3', password: 'secret123', role: 'CAJERO' }, csrf: 'e2e-admin-csrf' }]);
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
  });

  test('creates an option group and a value under that group with exact CSRF-protected requests', async ({ page, context }) => {
    const writes = await mock(context);
    await page.goto('/terminal/administracion/grupos');
    await page.getByRole('textbox', { name: 'Nombre' }).fill('Tamaño');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'guardado' })).toBeVisible();
    await page.getByRole('link', { name: 'Valores de opciones' }).click();
    await page.getByRole('textbox', { name: 'ID del grupo de opciones' }).fill('4');
    await page.getByRole('textbox', { name: 'Nombre' }).fill('Grande');
    await page.getByRole('textbox', { name: 'Recargo global en centavos (vacío si es por producto)' }).fill('500');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'guardado' })).toBeVisible();
    expect(writes).toEqual([
      { method: 'POST', path: '/api/v1/admin/option-groups', body: { name: 'Tamaño', pricingScope: 'GLOBAL' }, csrf: 'e2e-admin-csrf' },
      { method: 'POST', path: '/api/v1/admin/option-groups/4/values', body: { name: 'Grande', globalSurchargeCents: '500', isAvailable: true }, csrf: 'e2e-admin-csrf' },
    ]);
  });

  test('replaces a product configuration only with a verified response', async ({ page, context }) => {
    const writes = await mock(context);
    await page.goto('/terminal/administracion/catalogo');
    await page.getByRole('button', { name: 'Opciones de Café' }).click();
    await expect(page.getByRole('textbox', { name: 'Grupos, límites y valores (JSON)' })).toContainText('groupId');
    await page.getByRole('button', { name: 'Guardar configuración' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Configuración guardada' })).toBeVisible();
    expect(writes).toEqual([{ method: 'PUT', path: '/api/v1/admin/products/2/configuration', body: config, csrf: 'e2e-admin-csrf' }]);
  });

  test('CAJERO and PREPARACION cannot call administrative routes', async ({ browser }) => {
    for (const actor of [cashier, preparacion]) {
      const context = await browser.newContext();
      const requests = await mock(context, actor);
      const page = await context.newPage();
      await page.goto('/terminal/administracion');
      await expect(page.getByRole('heading', { name: 'Acceso no disponible' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Administración' })).toHaveCount(0);
      expect(requests).toEqual([]);
      await context.close();
    }
  });
});

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { assertHealthyPage, createIsolatedContext, ORIGINS, waitForVisualStability } from './capture.helpers.ts';
import { SYNTHETIC_ACTORS } from './fixtures.ts';

const category = { id: '1', name: 'Bebidas', isActive: true, deletedAt: null, createdAt: '2026-01-01T12:00:00.000Z' };
const product = { id: '2', categoryId: '1', name: 'Café de origen', description: null, basePriceCents: '4500', imageUrl: null, imagePublicId: null, imageVersion: null, isAvailable: false, deletedAt: null, createdAt: '2026-01-01T12:00:00.000Z', updatedAt: '2026-01-01T12:00:00.000Z' };

for (const viewport of [{ width: 1024, height: 768 }, { width: 1280, height: 800 }]) {
  for (const kind of ['categorias', 'catalogo'] as const) {
    test(`HYB-15 ${kind} ${viewport.width}x${viewport.height} (unapproved)`, async ({ browser }, info) => {
      const context = await createIsolatedContext(browser, {
        viewport, actor: { ...SYNTHETIC_ACTORS.ADMINISTRADOR, id: '1' },
        apiMocks: { extraHandlers: [async (route, pathname, method) => {
          if (method !== 'GET' || !['/api/v1/admin/categories', '/api/v1/admin/products'].includes(pathname)) return false;
          await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: pathname.endsWith('categories') ? [category] : [product], page: { limit: 20, nextCursor: null } }) });
          return true;
        }] },
      });
      try {
        await context.page.goto(`${ORIGINS.unified}/terminal/administracion/${kind}`);
        const collection = context.page.locator(`.admin-collection-${kind === 'categorias' ? 'categories' : 'products'}`);
        await expect(collection.getByRole('heading', { name: kind === 'categorias' ? 'Categorías' : 'Productos', exact: true })).toBeVisible();
        await expect(collection.getByRole('listitem')).toHaveCount(1);
        if (kind === 'catalogo') {
          await expect(collection).toContainText('Sin imagen');
          await expect(collection).toContainText('Agotado');
          await expect(collection).toContainText('$45.00');
          await expect(collection.getByRole('textbox', { name: 'Nombre' })).toBeVisible();
        } else await expect(collection).toContainText('Bebidas');
        await waitForVisualStability(context.page);
        await context.page.screenshot({ path: info.outputPath(`hyb15-${viewport.width}x${viewport.height}-${kind}-unapproved.png`) });
        expect((await new AxeBuilder({ page: context.page }).include('.terminal-admin').analyze()).violations).toEqual([]);
        expect(await context.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
        expect(context.apiMock.handledRequests.every((request) => request.method === 'GET')).toBe(true);
        await assertHealthyPage(context.page, context.monitor, context.apiMock);
      } finally { await context.close(); }
    });
  }
}

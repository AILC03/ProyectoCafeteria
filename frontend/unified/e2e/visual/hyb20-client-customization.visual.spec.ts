import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { assertHealthyPage, createIsolatedContext, ORIGINS, waitForVisualStability } from './capture.helpers.ts';

const catalogProducts = [
  { id: 'prod-1', categoryId: 'cat-1', name: 'Americano Clásico', description: 'Espresso doble con agua caliente.', priceCents: 4500, imageUrl: null, available: true, hasOptions: true },
  { id: 'prod-4', categoryId: 'cat-1', name: 'Espresso Tónico de Temporada', description: 'Edición limitada actualmente agotada.', priceCents: 6800, imageUrl: null, available: false, hasOptions: false },
];

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test(`HYB-20 customization dialog ${viewport.width}x${viewport.height} (unapproved)`, async ({ browser }, info) => {
    const context = await createIsolatedContext(browser, {
      viewport, actor: null,
      apiMocks: { products: catalogProducts },
    });
    try {
      await context.page.goto(`${ORIGINS.unified}/cliente/menu`);
      await expect(context.page.getByRole('button', { name: 'Personalizar Americano Clásico' })).toBeVisible();
      await context.page.getByRole('button', { name: 'Personalizar Americano Clásico' }).click();
      await expect(context.page.getByRole('dialog')).toBeVisible();
      await expect(context.page.getByRole('heading', { name: 'Americano Clásico' })).toBeVisible();
      await expect(context.page.getByRole('button', { name: 'Cerrar' })).toBeVisible();
      await expect(context.page.getByRole('button', { name: 'Disminuir cantidad' })).toBeVisible();
      await expect(context.page.getByRole('button', { name: 'Aumentar cantidad' })).toBeVisible();
      await expect(context.page.getByRole('button', { name: 'Confirmar personalización' })).toBeVisible();
      await expect(context.page.getByText('Precio estimado:')).toBeVisible();
      await waitForVisualStability(context.page);
      await context.page.screenshot({ path: info.outputPath(`hyb20-${viewport.width}x${viewport.height}-dialog-unapproved.png`) });
      expect((await new AxeBuilder({ page: context.page }).include('[role="dialog"]').analyze()).violations).toEqual([]);
      expect(await context.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await assertHealthyPage(context.page, context.monitor, context.apiMock);
    } finally { await context.close(); }
  });

  test(`HYB-20 draft cart empty ${viewport.width}x${viewport.height} (unapproved)`, async ({ browser }, info) => {
    const context = await createIsolatedContext(browser, {
      viewport, actor: null,
      apiMocks: { products: [] },
    });
    try {
      await context.page.goto(`${ORIGINS.unified}/cliente/menu`);
      await expect(context.page.getByRole('heading', { name: 'Menú vacío', exact: true })).toBeVisible();
      await waitForVisualStability(context.page);
      await context.page.screenshot({ path: info.outputPath(`hyb20-${viewport.width}x${viewport.height}-empty-cart-unapproved.png`) });
      expect((await new AxeBuilder({ page: context.page }).include('.client-layout').analyze()).violations).toEqual([]);
      expect(await context.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await assertHealthyPage(context.page, context.monitor, context.apiMock);
    } finally { await context.close(); }
  });
}

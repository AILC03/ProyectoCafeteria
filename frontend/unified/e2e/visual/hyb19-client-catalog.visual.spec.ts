import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { assertHealthyPage, createIsolatedContext, ORIGINS, waitForVisualStability } from './capture.helpers.ts';

const catalogProducts = [
  { id: 'prod-1', categoryId: 'cat-1', name: 'Americano Clásico', description: 'Espresso doble con agua caliente.', priceCents: 4500, imageUrl: null, available: true, hasOptions: true },
  { id: 'prod-4', categoryId: 'cat-1', name: 'Espresso Tónico de Temporada', description: 'Edición limitada actualmente agotada.', priceCents: 6800, imageUrl: null, available: false, hasOptions: false },
];

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test(`HYB-19 catalog available and sold-out ${viewport.width}x${viewport.height} (unapproved)`, async ({ browser }, info) => {
    const context = await createIsolatedContext(browser, {
      viewport, actor: null,
      apiMocks: { products: catalogProducts },
    });
    try {
      await context.page.goto(`${ORIGINS.unified}/cliente/menu`);
      await expect(context.page.getByRole('heading', { name: 'Menú', exact: true })).toBeVisible();
      await expect(context.page.getByRole('button', { name: 'Todas', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(context.page.locator('.catalog-grid article')).toHaveCount(2);
      await expect(context.page.getByText('Americano Clásico')).toBeVisible();
      await expect(context.page.getByText('Disponible', { exact: true })).toBeVisible();
      await expect(context.page.getByText('Sin imagen')).toHaveCount(2);
      await expect(context.page.getByText('Espresso Tónico de Temporada')).toBeVisible();
      await expect(context.page.getByText('Agotado', { exact: true })).toHaveCount(2);
      await expect(context.page.getByRole('button', { name: 'Personalizar Americano Clásico' })).toBeVisible();
      await expect(context.page.getByRole('button', { name: 'Espresso Tónico de Temporada agotado' })).toBeDisabled();
      await waitForVisualStability(context.page);
      await context.page.screenshot({ path: info.outputPath(`hyb19-${viewport.width}x${viewport.height}-catalog-unapproved.png`) });
      expect((await new AxeBuilder({ page: context.page }).include('.client-layout').analyze()).violations).toEqual([]);
      expect(await context.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await assertHealthyPage(context.page, context.monitor, context.apiMock);
    } finally { await context.close(); }
  });

  test(`HYB-19 catalog empty ${viewport.width}x${viewport.height} (unapproved)`, async ({ browser }, info) => {
    const context = await createIsolatedContext(browser, {
      viewport, actor: null,
      apiMocks: { products: [], categories: [] },
    });
    try {
      await context.page.goto(`${ORIGINS.unified}/cliente/menu`);
      await expect(context.page.getByRole('heading', { name: 'Menú vacío', exact: true })).toBeVisible();
      await waitForVisualStability(context.page);
      await context.page.screenshot({ path: info.outputPath(`hyb19-${viewport.width}x${viewport.height}-empty-unapproved.png`) });
      expect((await new AxeBuilder({ page: context.page }).include('.client-layout').analyze()).violations).toEqual([]);
      expect(await context.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await assertHealthyPage(context.page, context.monitor, context.apiMock);
    } finally { await context.close(); }
  });
}

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { assertHealthyPage, createIsolatedContext, ORIGINS, waitForVisualStability } from './capture.helpers.ts';
import { SYNTHETIC_ACTORS } from './fixtures.ts';

for (const viewport of [{ width: 1024, height: 768 }, { width: 1280, height: 800 }]) {
  test(`HYB-08 order panel and POS customization ${viewport.width}x${viewport.height} (unapproved)`, async ({ browser }, info) => {
    const session = await createIsolatedContext(browser, { viewport, actor: SYNTHETIC_ACTORS.CAJERO });
    try {
      await session.page.goto(`${ORIGINS.unified}/terminal/pos`);
      const catalog = session.page.getByRole('region', { name: 'Productos disponibles' });
      await expect(catalog.getByRole('button', { name: /Personalizar.*Americano/ })).toBeVisible();
      await waitForVisualStability(session.page);
      await assertHealthyPage(session.page, session.monitor, session.apiMock);
      await session.page.screenshot({ path: info.outputPath(`hyb08-${viewport.width}x${viewport.height}-panel-unapproved.png`) });
      await catalog.getByRole('button', { name: /Personalizar.*Americano/ }).click();
      const dialog = session.page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveClass(/catalog-dialog-pos/);
      await expect(dialog.getByRole('button', { name: 'Cerrar' })).toBeFocused();
      const accessibility = await new AxeBuilder({ page: session.page }).include('.pos-customization-backdrop').analyze();
      expect(accessibility.violations).toEqual([]);
      await session.page.screenshot({ path: info.outputPath(`hyb08-${viewport.width}x${viewport.height}-dialog-unapproved.png`) });
      await dialog.getByRole('button', { name: 'Confirmar personalización' }).click();
      await expect(session.page.getByRole('region', { name: 'Líneas de la orden' }).getByText(/Americano/)).toBeVisible();
      await expect(session.page.getByRole('button', { name: 'Crear orden pendiente' })).toBeEnabled();
      expect(await session.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    } finally {
      await session.close();
    }
  });
}

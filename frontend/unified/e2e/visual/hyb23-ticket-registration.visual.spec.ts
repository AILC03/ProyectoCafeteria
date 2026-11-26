import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { assertHealthyPage, createIsolatedContext, ORIGINS, waitForVisualStability } from './capture.helpers.ts';
import { VISITOR_ACTOR } from './fixtures.ts';

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test(`HYB-23 registration by ticket ${viewport.width}x${viewport.height} (unapproved)`, async ({ browser }, info) => {
    const context = await createIsolatedContext(browser, { viewport, actor: VISITOR_ACTOR });
    try {
      await context.page.goto(`${ORIGINS.unified}/cliente/registro-ticket`);
      await expect(context.page.getByRole('heading', { name: 'Registro con ticket' })).toBeVisible();
      await expect(context.page.getByLabel('Código de registro')).toBeVisible();
      await expect(context.page.getByLabel('Nombre')).toBeVisible();
      await expect(context.page.getByLabel('Teléfono')).toBeVisible();
      await expect(context.page.getByLabel('NIP de 4 dígitos')).toBeVisible();
      await expect(context.page.getByRole('button', { name: 'Registrar cuenta' })).toBeVisible();
      await waitForVisualStability(context.page);
      await context.page.screenshot({ path: info.outputPath(`hyb23-${viewport.width}x${viewport.height}-registration-unapproved.png`) });
      expect((await new AxeBuilder({ page: context.page }).include('.client-layout').analyze()).violations).toEqual([]);
      expect(await context.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await assertHealthyPage(context.page, context.monitor, context.apiMock);
    } finally { await context.close(); }
  });
}

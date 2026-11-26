import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { assertHealthyPage, createIsolatedContext, ORIGINS, waitForVisualStability } from './capture.helpers.ts';
import { SYNTHETIC_ACTORS } from './fixtures.ts';

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test(`HYB-18 anonymous customer and guest ${viewport.width}x${viewport.height} (unapproved)`, async ({ browser }, info) => {
    const context = await createIsolatedContext(browser, { viewport, actor: null });
    try {
      await context.page.goto(`${ORIGINS.unified}/cliente/iniciar-sesion`);
      await expect(context.page.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible();
      await expect(context.page.getByLabel('Teléfono o número de cliente')).toBeVisible();
      await expect(context.page.getByRole('group', { name: 'NIP de 4 dígitos' })).toBeVisible();
      expect(await context.page.locator('.client-brand img').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
      await waitForVisualStability(context.page);
      await context.page.screenshot({ path: info.outputPath(`hyb18-${viewport.width}x${viewport.height}-login-unapproved.png`) });
      expect((await new AxeBuilder({ page: context.page }).include('.client-layout').analyze()).violations).toEqual([]);
      await context.page.getByRole('button', { name: 'Continuar como invitado' }).click();
      await expect(context.page).toHaveURL(/\/cliente\/menu$/);
      await expect(context.page.getByText(/Invitado:/)).toBeVisible();
      await context.page.getByRole('button', { name: 'Salir de invitado' }).click();
      await expect(context.page).toHaveURL(/\/cliente\/iniciar-sesion$/);
      expect(await context.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await assertHealthyPage(context.page, context.monitor, context.apiMock);
    } finally { await context.close(); }
  });

  test(`HYB-18 authenticated customer shell ${viewport.width}x${viewport.height} (unapproved)`, async ({ browser }, info) => {
    const context = await createIsolatedContext(browser, { viewport, actor: { ...SYNTHETIC_ACTORS.CLIENTE, id: '1' } });
    try {
      await context.page.goto(`${ORIGINS.unified}/cliente/iniciar-sesion`);
      await expect(context.page.getByRole('heading', { name: 'Sesión de cliente activa' })).toBeVisible();
      await expect(context.page.getByRole('banner').getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
      await waitForVisualStability(context.page);
      await context.page.screenshot({ path: info.outputPath(`hyb18-${viewport.width}x${viewport.height}-active-unapproved.png`) });
      expect((await new AxeBuilder({ page: context.page }).include('.client-layout').analyze()).violations).toEqual([]);
      expect(await context.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await assertHealthyPage(context.page, context.monitor, context.apiMock);
    } finally { await context.close(); }
  });
}

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { assertHealthyPage, createIsolatedContext, ORIGINS, waitForVisualStability } from './capture.helpers.ts';
import { SYNTHETIC_ACTORS } from './fixtures.ts';

const employee = { id: '3', name: 'Personal Sintético', username: 'staff_sintetico', role: 'CAJERO', isActive: true };

for (const viewport of [{ width: 1024, height: 768 }, { width: 1280, height: 800 }]) {
  test(`HYB-17 staff list, create and edit ${viewport.width}x${viewport.height} (unapproved)`, async ({ browser }, info) => {
    const context = await createIsolatedContext(browser, {
      viewport, actor: { ...SYNTHETIC_ACTORS.ADMINISTRADOR, id: '1' },
      apiMocks: { extraHandlers: [async (route, pathname, method) => {
        if (pathname !== '/api/v1/admin/employees' || method !== 'GET') return false;
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [employee], page: { limit: 20, nextCursor: null } }) });
        return true;
      }] },
    });
    try {
      await context.page.goto(`${ORIGINS.unified}/terminal/administracion/personal`);
      const panel = context.page.locator('.admin-collection-employees');
      await expect(panel.getByRole('heading', { name: 'Personal', exact: true })).toBeVisible();
      await expect(panel.getByText('Personal Sintético')).toBeVisible();
      await expect(panel.locator('.admin-employee-state')).toHaveText('Activo');
      await expect(panel.getByLabel('Contraseña nueva')).toBeEmpty();
      await expect(panel.locator('select').getByRole('option', { name: /GERENTE/ })).toHaveCount(0);
      await waitForVisualStability(context.page);
      await context.page.screenshot({ path: info.outputPath(`hyb17-${viewport.width}x${viewport.height}-create-unapproved.png`) });
      await panel.getByRole('button', { name: 'Editar' }).click();
      await expect(panel.getByRole('heading', { name: 'Editar Personal Sintético' })).toBeVisible();
      await expect(panel.getByLabel('Motivo de modificación')).toBeVisible();
      await expect(panel.getByLabel('Contraseña nueva')).toHaveCount(0);
      await context.page.screenshot({ path: info.outputPath(`hyb17-${viewport.width}x${viewport.height}-edit-unapproved.png`) });
      expect((await new AxeBuilder({ page: context.page }).include('.terminal-admin').analyze()).violations).toEqual([]);
      expect(await context.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      expect(await context.page.evaluate(() => localStorage.length)).toBe(0);
      await assertHealthyPage(context.page, context.monitor, context.apiMock);
    } finally { await context.close(); }
  });

  test(`HYB-17 cashier denied staff management ${viewport.width}x${viewport.height}`, async ({ browser }, info) => {
    const context = await createIsolatedContext(browser, { viewport, actor: { ...SYNTHETIC_ACTORS.CAJERO, id: '2' } });
    try {
      await context.page.goto(`${ORIGINS.unified}/terminal/administracion/personal`);
      await expect(context.page.getByRole('heading', { name: 'Acceso no disponible' })).toBeVisible();
      await expect(context.page.getByRole('button', { name: 'Guardar' })).toHaveCount(0);
      await waitForVisualStability(context.page);
      await context.page.screenshot({ path: info.outputPath(`hyb17-${viewport.width}x${viewport.height}-denied-unapproved.png`) });
      await assertHealthyPage(context.page, context.monitor, context.apiMock);
    } finally { await context.close(); }
  });
}

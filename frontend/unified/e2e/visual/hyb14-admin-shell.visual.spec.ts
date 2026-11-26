import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { assertHealthyPage, createIsolatedContext, ORIGINS, waitForVisualStability } from './capture.helpers.ts';
import { SYNTHETIC_ACTORS } from './fixtures.ts';

for (const viewport of [{ width: 1024, height: 768 }, { width: 1280, height: 800 }]) {
  test(`HYB-14 API dashboard ${viewport.width}x${viewport.height} (unapproved)`, async ({ browser }, info) => {
    const context = await createIsolatedContext(browser, {
      viewport, actor: { ...SYNTHETIC_ACTORS.ADMINISTRADOR, id: '1' },
      apiMocks: { extraHandlers: [async (route, pathname, method) => {
        if (pathname !== '/api/v1/sales/summary' || method !== 'GET') return false;
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: { count: '3', totalCents: '24500', cashCents: '16500', stripeCents: '8000' } }) });
        return true;
      }] },
    });
    try {
      await context.page.goto(`${ORIGINS.unified}/terminal/administracion`);
      await expect(context.page.getByRole('heading', { name: 'Dashboard y corte' })).toBeVisible();
      await expect(context.page.locator('.admin-dashboard .cash-summary')).toContainText('$245.00');
      await expect(context.page.getByRole('navigation', { name: 'Secciones administrativas' }).getByRole('button', { name: 'Dashboard y corte' })).toHaveAttribute('aria-current', 'page');
      await waitForVisualStability(context.page);
      await context.page.screenshot({ path: info.outputPath(`hyb14-${viewport.width}x${viewport.height}-dashboard-unapproved.png`) });
      expect((await new AxeBuilder({ page: context.page }).include('.terminal-admin').analyze()).violations).toEqual([]);
      expect(await context.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await assertHealthyPage(context.page, context.monitor, context.apiMock);
    } finally { await context.close(); }
  });

  test(`HYB-14 cashier denied administration ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    const context = await createIsolatedContext(browser, { viewport, actor: { ...SYNTHETIC_ACTORS.CAJERO, id: '2' } });
    try {
      await context.page.goto(`${ORIGINS.unified}/terminal/administracion`);
      await expect(context.page.getByRole('heading', { name: 'Dashboard y corte' })).toHaveCount(0);
      await expect(context.page.getByRole('navigation', { name: 'Secciones administrativas' })).toHaveCount(0);
      await assertHealthyPage(context.page, context.monitor, context.apiMock);
    } finally { await context.close(); }
  });
}

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { assertHealthyPage, createIsolatedContext, launchIsolatedElectron, ORIGINS, waitForVisualStability } from './capture.helpers.ts';
import { SYNTHETIC_ACTORS } from './fixtures.ts';

for (const viewport of [{ width: 1024, height: 768 }, { width: 1280, height: 800 }]) {
  test(`HYB-07 POS catalog ${viewport.width}x${viewport.height} (unapproved)`, async ({ browser }, info) => {
    const session = await createIsolatedContext(browser, { viewport, actor: SYNTHETIC_ACTORS.CAJERO });
    try {
      await session.page.goto(`${ORIGINS.unified}/terminal/pos`);
      const catalog = session.page.getByRole('region', { name: 'Productos disponibles' });
      await expect(catalog.getByRole('button', { name: /Personalizar.*Americano/ })).toBeVisible();
      await expect(catalog.getByRole('button', { name: /Personalizar.*Espresso Tónico/ })).toBeDisabled();
      await waitForVisualStability(session.page);
      await assertHealthyPage(session.page, session.monitor, session.apiMock);
      expect(await session.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await session.page.screenshot({ path: info.outputPath(`hyb07-${viewport.width}x${viewport.height}-unapproved.png`) });
      const accessibility = await new AxeBuilder({ page: session.page }).include('.pos-catalog-panel').analyze();
      expect(accessibility.violations).toEqual([]);
      await catalog.getByRole('button', { name: 'Panadería' }).click();
      await expect(catalog.getByRole('button', { name: /Personalizar.*Croissant/ })).toBeVisible();
      await expect(catalog.getByRole('button', { name: /Personalizar.*Americano/ })).toHaveCount(0);
      await catalog.getByRole('searchbox', { name: 'Buscar productos' }).fill('no existe');
      await expect(catalog.getByText('No se encontraron productos')).toBeVisible();
    } finally {
      await session.close();
    }
  });

  test(`HYB-07 catalog product error and empty ${viewport.width}x${viewport.height} (unapproved)`, async ({ browser }, info) => {
    const errorSession = await createIsolatedContext(browser, {
      viewport, actor: SYNTHETIC_ACTORS.CAJERO,
      apiMocks: { extraHandlers: [async (route, pathname, method) => {
        if (pathname !== '/api/v1/products' || method !== 'GET') return false;
        await route.fulfill({ status: 503, contentType: 'application/problem+json', body: JSON.stringify({ code: 'UNAVAILABLE' }) });
        return true;
      }] },
    });
    try {
      await errorSession.page.goto(`${ORIGINS.unified}/terminal/pos`);
      await expect(errorSession.page.getByRole('alert')).toContainText('no está disponible temporalmente');
      await waitForVisualStability(errorSession.page);
      await errorSession.page.screenshot({ path: info.outputPath(`hyb07-${viewport.width}x${viewport.height}-error-unapproved.png`) });
    } finally { await errorSession.close(); }

    const emptySession = await createIsolatedContext(browser, {
      viewport, actor: SYNTHETIC_ACTORS.CAJERO, apiMocks: { products: [] },
    });
    try {
      await emptySession.page.goto(`${ORIGINS.unified}/terminal/pos`);
      await expect(emptySession.page.getByText('No hay productos disponibles en este momento.')).toBeVisible();
      await waitForVisualStability(emptySession.page);
      await emptySession.page.screenshot({ path: info.outputPath(`hyb07-${viewport.width}x${viewport.height}-empty-unapproved.png`) });
    } finally { await emptySession.close(); }
  });
}

test('HYB-07 Electron POS catalog keeps API data', async ({ browser }) => {
  void browser;
  const info = test.info();
  const session = await launchIsolatedElectron({ actor: { ...SYNTHETIC_ACTORS.CAJERO, id: '2' } });
  try {
    await session.page.goto(`${ORIGINS.unified}/terminal/pos`);
    await expect(session.page.getByRole('region', { name: 'Productos disponibles' })).toBeVisible();
    await assertHealthyPage(session.page, session.monitor, session.apiMock);
    await waitForVisualStability(session.page);
    await session.page.screenshot({ path: info.outputPath('hyb07-electron-pos-catalog-unapproved.png') });
  } finally { await session.close(); }
});

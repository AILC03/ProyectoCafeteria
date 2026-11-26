import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  assertHealthyPage,
  createIsolatedContext,
  launchIsolatedElectron,
  ORIGINS,
  waitForVisualStability,
} from './capture.helpers.ts';
import { SYNTHETIC_ACTORS } from './fixtures.ts';

for (const viewport of [{ width: 1024, height: 768 }, { width: 1280, height: 800 }]) {
  test(`HYB-06 anonymous login ${viewport.width}x${viewport.height} (unapproved capture)`, async ({ browser }, info) => {
    const session = await createIsolatedContext(browser, { viewport });
    try {
      await session.page.goto(`${ORIGINS.unified}/terminal/acceso`);
      await expect(session.page.getByLabel('Usuario')).toBeVisible();
      await expect(session.page.getByLabel('Contraseña')).toHaveAttribute('type', 'password');
      await waitForVisualStability(session.page);
      await assertHealthyPage(session.page, session.monitor, session.apiMock);
      const card = session.page.locator('.terminal-staff-login .kiosk-chassis');
      const bounds = await card.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.width).toBeLessThanOrEqual(440);
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
      await session.page.screenshot({ path: info.outputPath(`hyb06-${viewport.width}x${viewport.height}-unapproved.png`) });
      const accessibility = await new AxeBuilder({ page: session.page }).include('.terminal-staff-login').analyze();
      expect(accessibility.violations).toEqual([]);
      await session.page.getByLabel('Usuario').focus();
      expect(await session.page.getByLabel('Usuario').evaluate((input) => getComputedStyle(input).outlineStyle)).not.toBe('none');
      await session.page.getByRole('button', { name: 'Iniciar sesión como personal' }).click();
      await expect(session.page.getByRole('alert')).toContainText('usuario válido');
      await session.page.screenshot({ path: info.outputPath(`hyb06-${viewport.width}x${viewport.height}-invalid-unapproved.png`) });
    } finally {
      await session.close();
    }
  });
}

test('HYB-06 authenticated terminal and Electron display the safe actor action', async ({ browser }) => {
  const browserSession = await createIsolatedContext(browser, { actor: SYNTHETIC_ACTORS.CAJERO });
  try {
    await browserSession.page.goto(`${ORIGINS.unified}/terminal/acceso`);
    await expect(browserSession.page.getByRole('button', { name: 'Cambiar de usuario' })).toBeVisible();
    await expect(browserSession.page.locator('.terminal-staff-login').getByText('Cajero Sintético', { exact: true })).toBeVisible();
  } finally {
    await browserSession.close();
  }

  const desktopSession = await launchIsolatedElectron();
  try {
    await desktopSession.page.goto(`${ORIGINS.unified}/terminal/acceso`);
    await expect(desktopSession.page.getByLabel('Usuario')).toBeVisible();
    expect(await desktopSession.page.evaluate(() => window.cafeteriaDesktop?.terminalOnly)).toBe(true);
    await assertHealthyPage(desktopSession.page, desktopSession.monitor, desktopSession.apiMock);
  } finally {
    await desktopSession.close();
  }
});

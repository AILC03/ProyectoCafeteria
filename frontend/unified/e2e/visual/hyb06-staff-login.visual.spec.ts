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
  test(`HYB-06 active, submitting, logout failure and recoverable session ${viewport.width}x${viewport.height} (unapproved)`, async ({ browser }, info) => {
    const activeSession = await createIsolatedContext(browser, {
      viewport,
      actor: SYNTHETIC_ACTORS.CAJERO,
      apiMocks: { extraHandlers: [async (route, pathname, method) => {
        if (pathname !== '/api/v1/auth/logout' || method !== 'POST') return false;
        await route.fulfill({ status: 503, contentType: 'application/problem+json', body: JSON.stringify({ code: 'DEPENDENCY_UNAVAILABLE' }) });
        return true;
      }] },
    });
    try {
      await activeSession.page.goto(`${ORIGINS.unified}/terminal/acceso`);
      await expect(activeSession.page.getByRole('heading', { name: 'Sesión de personal activa' })).toBeVisible();
      await waitForVisualStability(activeSession.page);
      await activeSession.page.screenshot({ path: info.outputPath(`hyb06-${viewport.width}x${viewport.height}-active-unapproved.png`) });
      await activeSession.page.getByRole('button', { name: 'Cambiar de usuario' }).click();
      await expect(activeSession.page.getByRole('alert')).toContainText('No fue posible cerrar la sesión actual');
      await activeSession.page.screenshot({ path: info.outputPath(`hyb06-${viewport.width}x${viewport.height}-logout-error-unapproved.png`) });
    } finally { await activeSession.close(); }

    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const submittingSession = await createIsolatedContext(browser, {
      viewport,
      apiMocks: { extraHandlers: [async (route, pathname, method) => {
        if (pathname !== '/api/v1/auth/login/staff' || method !== 'POST') return false;
        await gate;
        await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: 'INVALID_CREDENTIALS' }) });
        return true;
      }] },
    });
    try {
      await submittingSession.page.goto(`${ORIGINS.unified}/terminal/acceso`);
      await submittingSession.page.getByLabel('Usuario').fill('cajero1');
      await submittingSession.page.getByLabel('Contraseña').fill('password123');
      await submittingSession.page.getByRole('button', { name: 'Iniciar sesión como personal' }).click();
      await expect(submittingSession.page.getByRole('button', { name: 'Ingresando…' })).toBeDisabled();
      await submittingSession.page.screenshot({ path: info.outputPath(`hyb06-${viewport.width}x${viewport.height}-submitting-unapproved.png`) });
      release();
      await expect(submittingSession.page.getByRole('alert')).toBeVisible();
    } finally { await submittingSession.close(); }

    const recoverableSession = await createIsolatedContext(browser, {
      viewport,
      apiMocks: { extraHandlers: [async (route, pathname, method) => {
        if (pathname !== '/api/v1/auth/me' || method !== 'GET') return false;
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'TEMPORARY' }) });
        return true;
      }] },
    });
    try {
      await recoverableSession.page.goto(`${ORIGINS.unified}/terminal/acceso`);
      await expect(recoverableSession.page.getByText('No fue posible comprobar tu sesión anterior.')).toBeVisible();
      await recoverableSession.page.screenshot({ path: info.outputPath(`hyb06-${viewport.width}x${viewport.height}-recoverable-unapproved.png`) });
    } finally { await recoverableSession.close(); }
  });
}

test('HYB-06 authenticated terminal and Electron display the safe actor action', async ({ browser }, info) => {
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
    await waitForVisualStability(desktopSession.page);
    await desktopSession.page.screenshot({ path: info.outputPath('hyb06-electron-acceso-unapproved.png') });
  } finally {
    await desktopSession.close();
  }
});

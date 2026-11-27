import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { assertHealthyPage, createIsolatedContext, launchIsolatedElectron, ORIGINS, waitForVisualStability } from './capture.helpers.ts';
import { SYNTHETIC_ACTORS } from './fixtures.ts';

const CLIENT_VIEWPORTS = [{ width: 390, height: 844 }, { width: 1280, height: 800 }] as const;
const TERMINAL_VIEWPORTS = [{ width: 1024, height: 768 }, { width: 1280, height: 800 }] as const;

for (const viewport of CLIENT_VIEWPORTS) {
  test(`HYB-24 landing and client status surfaces ${viewport.width}x${viewport.height} (unapproved)`, async ({ browser }, info) => {
    const landing = await createIsolatedContext(browser, { viewport });
    try {
      await landing.page.goto(`${ORIGINS.unified}/`);
      await expect(landing.page.getByRole('heading', { name: 'Aplicación unificada de cafetería' })).toBeVisible();
      await expect(landing.page.getByRole('heading', { name: 'Área de cliente' })).toBeVisible();
      await expect(landing.page.getByRole('heading', { name: 'Terminal' })).toBeVisible();
      await expect(landing.page.getByRole('link', { name: 'Entrar como cliente' })).toHaveAttribute('href', '/cliente/menu');
      await expect(landing.page.getByRole('link', { name: 'Entrar a la terminal' })).toHaveAttribute('href', '/terminal');
      await waitForVisualStability(landing.page);
      await landing.page.screenshot({ path: info.outputPath(`hyb24-${viewport.width}x${viewport.height}-landing-unapproved.png`) });
      expect((await new AxeBuilder({ page: landing.page }).include('.landing-page').analyze()).violations).toEqual([]);
      expect(await landing.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await assertHealthyPage(landing.page, landing.monitor, landing.apiMock);
    } finally { await landing.close(); }

    const denied = await createIsolatedContext(browser, { viewport });
    try {
      await denied.page.goto(`${ORIGINS.unified}/cliente/cuenta`);
      await expect(denied.page.getByRole('heading', { name: 'Acceso no disponible' })).toBeVisible();
      await expect(denied.page.locator('.status-card').getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '/cliente/iniciar-sesion');
      await waitForVisualStability(denied.page);
      await denied.page.screenshot({ path: info.outputPath(`hyb24-${viewport.width}x${viewport.height}-client-denied-unapproved.png`) });
      expect((await new AxeBuilder({ page: denied.page }).include('.client-layout').analyze()).violations).toEqual([]);
      expect(await denied.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await assertHealthyPage(denied.page, denied.monitor, denied.apiMock);
    } finally { await denied.close(); }

    const notFound = await createIsolatedContext(browser, { viewport });
    try {
      await notFound.page.goto(`${ORIGINS.unified}/cliente/ruta-inexistente`);
      await expect(notFound.page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
      await expect(notFound.page.getByRole('link', { name: 'Volver al menú' })).toHaveAttribute('href', '/cliente/menu');
      await waitForVisualStability(notFound.page);
      await notFound.page.screenshot({ path: info.outputPath(`hyb24-${viewport.width}x${viewport.height}-client-404-unapproved.png`) });
      expect((await new AxeBuilder({ page: notFound.page }).include('.client-layout').analyze()).violations).toEqual([]);
      await assertHealthyPage(notFound.page, notFound.monitor, notFound.apiMock);
    } finally { await notFound.close(); }

    const staffInClient = await createIsolatedContext(browser, { viewport, actor: SYNTHETIC_ACTORS.CAJERO });
    try {
      await staffInClient.page.goto(`${ORIGINS.unified}/cliente/menu`);
      const trigger = staffInClient.page.getByRole('button', { name: 'Cambiar a área de cliente' });
      await expect(trigger).toBeVisible();
      await trigger.click();
      const dialog = staffInClient.page.getByRole('dialog', { name: 'Cambiar de sesión' });
      await expect(dialog).toHaveClass(/actor-change-dialog-client/);
      await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();
      await waitForVisualStability(staffInClient.page);
      await staffInClient.page.screenshot({ path: info.outputPath(`hyb24-${viewport.width}x${viewport.height}-actor-dialog-unapproved.png`) });
      expect((await new AxeBuilder({ page: staffInClient.page }).include('[role="dialog"]').analyze()).violations).toEqual([]);
      await staffInClient.page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await assertHealthyPage(staffInClient.page, staffInClient.monitor, staffInClient.apiMock);
    } finally { await staffInClient.close(); }
  });
}

for (const viewport of TERMINAL_VIEWPORTS) {
  test(`HYB-24 terminal denials and 404 ${viewport.width}x${viewport.height} (unapproved)`, async ({ browser }, info) => {
    const anonymous = await createIsolatedContext(browser, { viewport });
    try {
      await anonymous.page.goto(`${ORIGINS.unified}/terminal/pos`);
      await expect(anonymous.page.getByRole('heading', { name: 'Acceso no disponible' })).toBeVisible();
      await expect(anonymous.page.getByRole('link', { name: 'Iniciar sesión en la terminal' })).toHaveAttribute('href', '/terminal/acceso');
      await waitForVisualStability(anonymous.page);
      await anonymous.page.screenshot({ path: info.outputPath(`hyb24-${viewport.width}x${viewport.height}-terminal-denied-anonymous-unapproved.png`) });
      expect((await new AxeBuilder({ page: anonymous.page }).include('.terminal-layout').analyze()).violations).toEqual([]);
      await assertHealthyPage(anonymous.page, anonymous.monitor, anonymous.apiMock);
    } finally { await anonymous.close(); }

    const roleDenied = await createIsolatedContext(browser, { viewport, actor: SYNTHETIC_ACTORS.PREPARACION });
    try {
      await roleDenied.page.goto(`${ORIGINS.unified}/terminal/caja`);
      await expect(roleDenied.page.getByText(/Tu perfil \(PREPARACION\) no tiene acceso/)).toBeVisible();
      await expect(roleDenied.page.getByRole('link', { name: 'Ir a mi inicio' })).toHaveAttribute('href', '/terminal/cocina');
      await waitForVisualStability(roleDenied.page);
      await roleDenied.page.screenshot({ path: info.outputPath(`hyb24-${viewport.width}x${viewport.height}-terminal-denied-role-unapproved.png`) });
      expect((await new AxeBuilder({ page: roleDenied.page }).include('.terminal-layout').analyze()).violations).toEqual([]);
      await assertHealthyPage(roleDenied.page, roleDenied.monitor, roleDenied.apiMock);
    } finally { await roleDenied.close(); }

    const notFound = await createIsolatedContext(browser, { viewport });
    try {
      await notFound.page.goto(`${ORIGINS.unified}/terminal/ruta-inexistente`);
      await expect(notFound.page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
      await expect(notFound.page.getByRole('link', { name: 'Volver a la terminal' })).toHaveAttribute('href', '/terminal');
      await waitForVisualStability(notFound.page);
      await notFound.page.screenshot({ path: info.outputPath(`hyb24-${viewport.width}x${viewport.height}-terminal-404-unapproved.png`) });
      expect((await new AxeBuilder({ page: notFound.page }).include('.terminal-layout').analyze()).violations).toEqual([]);
      await assertHealthyPage(notFound.page, notFound.monitor, notFound.apiMock);
    } finally { await notFound.close(); }
  });
}

for (const viewport of TERMINAL_VIEWPORTS) {
  test(`HYB-24 restricted session and actor-change failure ${viewport.width}x${viewport.height} (unapproved)`, async ({ browser }, info) => {
    const label = `${viewport.width}x${viewport.height}`;
    const restricted = await createIsolatedContext(browser, { viewport, actor: { ...SYNTHETIC_ACTORS.CAJERO, mustChangePin: true } });
    try {
      await restricted.page.goto(`${ORIGINS.unified}/terminal/pos`);
      await expect(restricted.page.getByRole('heading', { name: 'Cambio de NIP obligatorio' })).toBeVisible();
      await expect(restricted.page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
      await waitForVisualStability(restricted.page);
      await restricted.page.screenshot({ path: info.outputPath(`hyb24-${label}-pin-change-unapproved.png`) });
      expect((await new AxeBuilder({ page: restricted.page }).include('.status-page').analyze()).violations).toEqual([]);
      await assertHealthyPage(restricted.page, restricted.monitor, restricted.apiMock);
    } finally { await restricted.close(); }

    const failingLogout = await createIsolatedContext(browser, {
      viewport,
      actor: SYNTHETIC_ACTORS.CAJERO,
      apiMocks: { extraHandlers: [async (route, pathname, method) => {
        if (pathname !== '/api/v1/auth/logout' || method !== 'POST') return false;
        await route.fulfill({ status: 503, contentType: 'application/problem+json', body: JSON.stringify({ code: 'DEPENDENCY_UNAVAILABLE' }) });
        return true;
      }] },
    });
    try {
      await failingLogout.page.goto(`${ORIGINS.unified}/cliente/menu`);
      const trigger = failingLogout.page.getByRole('button', { name: 'Cambiar a área de cliente' });
      await trigger.click();
      const dialog = failingLogout.page.getByRole('dialog', { name: 'Cambiar de sesión' });
      await dialog.getByRole('button', { name: 'Cerrar sesión y continuar' }).click();
      await expect(dialog.getByRole('alert')).toContainText('No fue posible cerrar la sesión actual');
      await waitForVisualStability(failingLogout.page);
      await failingLogout.page.screenshot({ path: info.outputPath(`hyb24-${label}-actor-dialog-error-unapproved.png`) });
      expect((await new AxeBuilder({ page: failingLogout.page }).include('[role="dialog"]').analyze()).violations).toEqual([]);
      await dialog.getByRole('button', { name: 'Cancelar' }).click();
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await assertHealthyPage(failingLogout.page, failingLogout.monitor, failingLogout.apiMock);
    } finally { await failingLogout.close(); }
  });
}

test('HYB-24 landing 1024, global 404 and terminal-destination dialog (unapproved)', async ({ browser }, info) => {
  const landing = await createIsolatedContext(browser, { viewport: { width: 1024, height: 768 } });
  try {
    await landing.page.goto(`${ORIGINS.unified}/`);
    await expect(landing.page.getByRole('heading', { name: 'Aplicación unificada de cafetería' })).toBeVisible();
    await waitForVisualStability(landing.page);
    await landing.page.screenshot({ path: info.outputPath('hyb24-1024x768-landing-unapproved.png') });
    expect((await new AxeBuilder({ page: landing.page }).include('.landing-page').analyze()).violations).toEqual([]);
    expect(await landing.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1024);
  } finally { await landing.close(); }

  const globalNotFound = await createIsolatedContext(browser, { viewport: { width: 1024, height: 768 } });
  try {
    await globalNotFound.page.goto(`${ORIGINS.unified}/ruta-inexistente`);
    await expect(globalNotFound.page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
    await expect(globalNotFound.page.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/');
    await waitForVisualStability(globalNotFound.page);
    await globalNotFound.page.screenshot({ path: info.outputPath('hyb24-1024x768-global-404-unapproved.png') });
    expect((await new AxeBuilder({ page: globalNotFound.page }).include('.status-page').analyze()).violations).toEqual([]);
    await assertHealthyPage(globalNotFound.page, globalNotFound.monitor, globalNotFound.apiMock);
  } finally { await globalNotFound.close(); }

  const customerInClient = await createIsolatedContext(browser, { viewport: { width: 1024, height: 768 }, actor: SYNTHETIC_ACTORS.CLIENTE });
  try {
    await customerInClient.page.goto(`${ORIGINS.unified}/cliente/menu`);
    await customerInClient.page.getByRole('navigation', { name: 'Navegación de cliente' }).getByRole('link', { name: 'Terminal' }).click();
    const dialog = customerInClient.page.getByRole('dialog', { name: 'Cambiar de sesión' });
    await expect(dialog).toHaveClass(/actor-change-dialog-terminal/);
    await waitForVisualStability(customerInClient.page);
    await customerInClient.page.screenshot({ path: info.outputPath('hyb24-1024x768-actor-dialog-terminal-unapproved.png') });
    expect((await new AxeBuilder({ page: customerInClient.page }).include('[role="dialog"]').analyze()).violations).toEqual([]);
    await customerInClient.page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await assertHealthyPage(customerInClient.page, customerInClient.monitor, customerInClient.apiMock);
  } finally { await customerInClient.close(); }
});

test('HYB-24 Electron shows the terminal denial without exposing client routes', async ({ browser }) => {
  void browser;
  const info = test.info();
  const session = await launchIsolatedElectron({ actor: { ...SYNTHETIC_ACTORS.PREPARACION, id: '3' } });
  try {
    await session.page.goto(`${ORIGINS.unified}/terminal/administracion`);
    await expect(session.page.getByRole('heading', { name: 'Acceso no disponible' })).toBeVisible();
    await expect(session.page.getByRole('link', { name: 'Ir a mi inicio' })).toHaveAttribute('href', '/terminal/cocina');
    await expect(session.page.getByRole('link', { name: 'Cliente' })).toHaveCount(0);
    await assertHealthyPage(session.page, session.monitor, session.apiMock);
    await waitForVisualStability(session.page);
    await session.page.screenshot({ path: info.outputPath('hyb24-electron-terminal-denied-unapproved.png') });
  } finally { await session.close(); }
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  _electron as electron,
  type ElectronApplication,
  type Page,
} from 'playwright';
import { expect, test } from '@playwright/test';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TERMINAL_URL = 'http://localhost:5173/terminal';

async function expectTerminalReady(page: Page): Promise<void> {
  await expect.poll(() => page.url()).toBe(TERMINAL_URL);
  await expect(page.getByRole('heading', { level: 1, name: 'Terminal' })).toBeVisible();
}

/** Simulates the anonymous session so the suite never needs the real backend. */
async function mockApi(page: Page): Promise<void> {
  await page.route('http://localhost:5173/api/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/auth/me') {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ title: 'No autenticado', status: 401 }),
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ title: 'No encontrado', status: 404 }),
    });
  });
}

test.describe('Electron terminal wrapper', () => {
  test.setTimeout(90_000);

  let electronApp: ElectronApplication;
  let page: Page;
  let userDataDir: string;

  test.beforeEach(async () => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafeteria-electron-'));
    const env = { ...process.env, FRONTEND_ORIGIN: 'http://localhost:5173' };
    delete env.ELECTRON_RUN_AS_NODE;
    electronApp = await electron.launch({
      args: [`--user-data-dir=${userDataDir}`, appRoot],
      cwd: appRoot,
      env,
    });
    page = await electronApp.firstWindow();
    await page.waitForLoadState('load', { timeout: 60_000 });
    await mockApi(page);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
  });

  test.afterEach(async () => {
    try {
      await electronApp.close();
    } finally {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test('loads /terminal with hardened webPreferences and the desktop indicator', async () => {
    await expectTerminalReady(page);

    await expect
      .poll(() => page.evaluate(() => window.cafeteriaDesktop?.terminalOnly))
      .toBe(true);
    await expect(page.getByRole('link', { name: 'Cliente' })).toHaveCount(0);

    const preferences = await electronApp.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (!window) throw new Error('No Electron window available');
      const prefs = window.webContents.getLastWebPreferences();
      return {
        nodeIntegration: prefs.nodeIntegration,
        contextIsolation: prefs.contextIsolation,
        sandbox: prefs.sandbox,
        webSecurity: prefs.webSecurity,
      };
    });
    expect(preferences).toEqual({
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    });
  });

  test('blocks full navigation to the client area', async () => {
    await expectTerminalReady(page);

    await page
      .evaluate(() => {
        window.location.href = '/cliente/menu';
      })
      .catch(() => {
        // The main process cancels the navigation, destroying the context.
      });

    await expectTerminalReady(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Menú' })).toHaveCount(0);
  });

  test('redirects client-side client routes to /terminal', async () => {
    await expectTerminalReady(page);

    await page.evaluate(() => {
      window.history.pushState({}, '', '/cliente/menu');
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    });

    await expectTerminalReady(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Menú' })).toHaveCount(0);
  });

  test('denies prohibited scheme navigation without leaving /terminal', async () => {
    await expectTerminalReady(page);

    await page
      .evaluate(() => {
        window.location.href = 'file:///C:/Windows/win.ini';
      })
      .catch(() => {
        // The main process denies the navigation and cancels the context.
      });

    // Give the main-process handler time to reject the attempt.
    await page.waitForTimeout(750);
    expect(page.url()).toBe(TERMINAL_URL);
    await expectTerminalReady(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Menú' })).toHaveCount(0);
  });
});

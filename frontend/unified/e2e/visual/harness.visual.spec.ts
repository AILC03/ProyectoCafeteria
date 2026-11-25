import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertCaptureReady, captureSmoke, VISUAL_URLS } from './capture.helpers';
import { expect, test } from './fixtures';

test('anonymous original/unified surfaces use separate, deterministic profiles', async ({ capture }, info) => {
  for (const [surface, selector] of [
    ['clientOriginal', 'body'], ['terminalOriginal', '#root'], ['unified', 'main'],
  ] as const) {
    const { page } = await capture(surface);
    await page.goto(surface === 'unified' ? `${VISUAL_URLS.unified}/terminal` : VISUAL_URLS[surface]);
    await assertCaptureReady(page, surface, selector);
    await captureSmoke(page, surface, info);
    await page.evaluate(() => localStorage.setItem('visual:temporary', 'synthetic'));
    await page.evaluate(() => { document.cookie = 'visual-temporary=synthetic; SameSite=Lax'; });
    const isolated = await capture(surface);
    await isolated.page.goto(surface === 'unified' ? `${VISUAL_URLS.unified}/terminal` : VISUAL_URLS[surface]);
    expect(await isolated.page.evaluate(() => localStorage.getItem('visual:temporary'))).toBeNull();
    expect(await isolated.page.evaluate(() => document.cookie)).not.toContain('visual-temporary');
  }
});

test('rejects an unexpected capture state instead of silently creating a baseline', async ({ capture }) => {
  const { page } = await capture('unified');
  await page.goto(`${VISUAL_URLS.unified}/terminal`);
  await expect(assertCaptureReady(page, 'unified', '[data-not-a-real-surface]')).rejects.toThrow();
  await page.evaluate(() => {
    const broken = document.createElement('img');
    broken.src = '/visual-resource-does-not-exist.png';
    document.body.append(broken);
  });
  await expect(assertCaptureReady(page, 'unified', 'main')).rejects.toThrow('Missing image resource');
});

test('unmocked API and external network cannot reach a live service', async ({ capture }) => {
  const { page } = await capture('unified');
  await page.goto(`${VISUAL_URLS.unified}/terminal`);
  const status = await page.evaluate(async () => (await fetch('/api/v1/__visual_unknown__')).status);
  expect(status).toBe(404);
  const externalStatus = await page.evaluate(async () => {
    try {
      await fetch('https://example.org/visual-should-never-load');
      return 'unexpected success';
    } catch {
      return 'blocked';
    }
  });
  expect(externalStatus).toBe('blocked');
});

test('Electron uses the real preload bridge and an ephemeral profile', async ({ browserName }, info) => {
  expect(browserName).toBe('chromium');
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafeteria-visual-electron-'));
  const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const env = { ...process.env, FRONTEND_ORIGIN: VISUAL_URLS.unified };
  delete env.ELECTRON_RUN_AS_NODE;
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    app = await electron.launch({ args: [`--user-data-dir=${userDataDir}`, appRoot], cwd: appRoot, env });
    const page = await app.firstWindow();
    // Match the existing Electron E2E: do not reload a still-committing first navigation.
    await page.waitForLoadState('load', { timeout: 60_000 });
    await page.route('http://localhost:5173/api/**', async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      await route.fulfill({
        status: pathname === '/api/v1/auth/me' || pathname === '/api/v1/auth/refresh' ? 401 : 404,
        contentType: 'application/json',
        body: JSON.stringify({ code: pathname === '/api/v1/auth/me' ? 'UNAUTHENTICATED' : 'NOT_FOUND' }),
      });
    });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(page).toHaveURL(`${VISUAL_URLS.unified}/terminal`);
    expect(await page.evaluate(() => window.cafeteriaDesktop?.terminalOnly)).toBe(true);
    await assertCaptureReady(page, 'unified', 'main');
    await captureSmoke(page, 'electronTerminal', info);
  } finally {
    if (app) await app.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

import fs from 'node:fs/promises';
import os from 'node:os';
import { expect, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';

export const VISUAL_URLS = {
  unified: 'http://localhost:5173',
  electronTerminal: 'http://localhost:5173',
  clientOriginal: 'http://localhost:5183',
  terminalOriginal: 'http://localhost:5184',
} as const;

export type CaptureContext = 'unified' | 'clientOriginal' | 'terminalOriginal';
export type CaptureLabel = CaptureContext | 'electronTerminal';

/** A fresh in-memory browser profile per surface; never reuse test credentials/storage. */
export async function openCaptureContext(browser: Browser, surface: CaptureContext): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await context.newPage();
  const allowedOrigin = new URL(VISUAL_URLS[surface]).origin;

  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== allowedOrigin) {
      await route.abort(); // No real API, CDN, analytics or outside network for capture fixtures.
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/v1/auth/me' || url.pathname === '/api/v1/auth/refresh') {
        await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: 'UNAUTHENTICATED' }) });
      } else {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'NOT_FOUND' }) });
      }
      return;
    }
    await route.continue();
  });

  return { context, page };
}

export async function assertCaptureReady(page: Page, surface: CaptureContext, selector: string): Promise<void> {
  await expect(page, `Unexpected origin for ${surface}`).toHaveURL(new RegExp(`^${VISUAL_URLS[surface].replaceAll('.', '\\.')}(/|$)`));
  await expect(page.locator(selector), `Missing capture surface ${surface}: ${selector}`).toBeVisible();
  await page.evaluate(async () => { await document.fonts.ready; });
  const brokenImages = await page.locator('img:visible').evaluateAll((images) => images.filter((image) => {
    const img = image as HTMLImageElement;
    return !img.complete || img.naturalWidth === 0;
  }).map((image) => (image as HTMLImageElement).getAttribute('src')));
  expect(brokenImages, `Missing image resource on ${surface}`).toEqual([]);
}

/** Smoke artifacts only: output stays ignored by Git and is never an approved baseline. */
export async function captureSmoke(page: Page, surface: CaptureLabel, info: TestInfo): Promise<void> {
  const viewport = page.viewportSize();
  const png = info.outputPath(`${surface}-smoke.png`);
  await page.screenshot({ path: png, animations: 'disabled' });
  await fs.writeFile(info.outputPath(`${surface}-smoke.json`), JSON.stringify({
    context: surface,
    origin: VISUAL_URLS[surface],
    originalSourceRevision: 'c88d01b',
    viewport,
    dpr: await page.evaluate(() => window.devicePixelRatio),
    os: `${os.platform()} ${os.release()}`,
    approvedBaseline: false,
    warning: 'Synthetic anonymous smoke; external font requests blocked; not comparable visual evidence',
  }, null, 2));
}

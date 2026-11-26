import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  _electron as electron,
  type Browser,
  type BrowserContext,
  type ElectronApplication,
  type Page,
} from 'playwright';
import {
  installApiMocks,
  type SyntheticActor,
  type VisualApiMockController,
  type VisualApiMockOptions,
} from './fixtures.ts';

const helperDir = path.dirname(fileURLToPath(import.meta.url));
export const UNIFIED_ROOT = path.resolve(helperDir, '../..');
export const SMOKE_CAPTURE_DIR = path.resolve(UNIFIED_ROOT, 'test-results/visual-smoke');

export const ORIGINS = {
  unified: 'http://localhost:5173',
  clientes: 'http://localhost:5183',
  empleados: 'http://localhost:5184',
} as const;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const EXTERNAL_FONT_HOSTS = new Set([
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'use.typekit.net',
]);

export type ResourceErrorRecord = {
  url: string;
  method: string;
  reason: string;
  status?: number;
};

export type PageMonitor = {
  pageErrors: string[];
  localResourceErrors: ResourceErrorRecord[];
  externalFontFailures: ResourceErrorRecord[];
};

export type ExpectedPageState = {
  urlPattern?: RegExp;
  visibleHeading?: string | RegExp;
  forbiddenText?: RegExp;
  check?: (page: Page) => Promise<void>;
};

export type SmokeCaptureMetadata = {
  name: string;
  surface: string;
  origin: string;
  viewport: { width: number; height: number };
  role: string;
  state: string;
  runtime: 'chromium' | 'electron';
};

export type SmokeCaptureResult = {
  pngPath: string;
  metaPath: string;
  metadata: SmokeCaptureMetadata & {
    capturedAt: string;
    url: string;
    baselineApproved: false;
    promotedToEvidence: false;
  };
};

export type IsolatedBrowserSession = {
  context: BrowserContext;
  page: Page;
  apiMock: VisualApiMockController;
  monitor: PageMonitor;
  close: () => Promise<void>;
};

export type IsolatedElectronSession = {
  electronApp: ElectronApplication;
  page: Page;
  userDataDir: string;
  apiMock: VisualApiMockController;
  monitor: PageMonitor;
  close: () => Promise<void>;
};

function classifyUrl(rawUrl: string): { isLocal: boolean; isApi: boolean; isExternalFont: boolean } {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === 'data:' || parsed.protocol === 'blob:') {
      return { isLocal: false, isApi: false, isExternalFont: false };
    }
    const hostname = parsed.hostname.toLowerCase();
    const isLocal = LOCAL_HOSTS.has(hostname);
    const isApi = parsed.pathname.startsWith('/api/');
    const isExternalFont = EXTERNAL_FONT_HOSTS.has(hostname);
    return { isLocal, isApi, isExternalFont };
  } catch {
    return { isLocal: false, isApi: false, isExternalFont: false };
  }
}

export function attachPageMonitor(page: Page): PageMonitor {
  const monitor: PageMonitor = {
    pageErrors: [],
    localResourceErrors: [],
    externalFontFailures: [],
  };

  page.on('pageerror', (error) => {
    monitor.pageErrors.push(error.message || String(error));
  });

  page.on('requestfailed', (request) => {
    const url = request.url();
    const { isLocal, isApi, isExternalFont } = classifyUrl(url);
    if (isApi) return;

    const record: ResourceErrorRecord = {
      url,
      method: request.method(),
      reason: request.failure()?.errorText ?? 'requestfailed',
    };

    if (isExternalFont) {
      monitor.externalFontFailures.push(record);
    } else if (isLocal) {
      monitor.localResourceErrors.push(record);
    }
  });

  page.on('response', (response) => {
    const status = response.status();
    if (status < 400) return;

    const request = response.request();
    const url = response.url();
    const { isLocal, isApi, isExternalFont } = classifyUrl(url);
    if (isApi) return;

    const record: ResourceErrorRecord = {
      url,
      method: request.method(),
      status,
      reason: `HTTP ${status}`,
    };

    if (isExternalFont) {
      monitor.externalFontFailures.push(record);
    } else if (isLocal) {
      monitor.localResourceErrors.push(record);
    }
  });

  return monitor;
}

export async function createIsolatedContext(
  browser: Browser,
  options: {
    viewport?: { width: number; height: number };
    actor?: SyntheticActor | null;
    apiMocks?: Omit<VisualApiMockOptions, 'actor'>;
  } = {},
): Promise<IsolatedBrowserSession> {
  const context = await browser.newContext({
    locale: 'es-MX',
    timezoneId: 'America/Tijuana',
    deviceScaleFactor: 1,
    colorScheme: 'light',
    reducedMotion: 'reduce',
    viewport: options.viewport ?? { width: 1280, height: 800 },
  });

  const apiMock = await installApiMocks(context, {
    ...options.apiMocks,
    actor: options.actor ?? null,
  });

  const page = await context.newPage();
  const monitor = attachPageMonitor(page);

  return {
    context,
    page,
    apiMock,
    monitor,
    close: async () => {
      await context.close();
    },
  };
}

export async function launchIsolatedElectron(
  options: {
    actor?: SyntheticActor | null;
    frontendOrigin?: string;
    viewport?: { width: number; height: number };
    apiMocks?: Omit<VisualApiMockOptions, 'actor'>;
  } = {},
): Promise<IsolatedElectronSession> {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafeteria-visual-electron-'));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    FRONTEND_ORIGIN: options.frontendOrigin ?? ORIGINS.unified,
  };
  delete env.ELECTRON_RUN_AS_NODE;

  const electronApp = await electron.launch({
    args: [`--user-data-dir=${userDataDir}`, UNIFIED_ROOT],
    cwd: UNIFIED_ROOT,
    env,
  });

  try {
    const page = await electronApp.firstWindow();
    if (options.viewport) {
      await page.setViewportSize(options.viewport);
    }
    await page.waitForLoadState('load', { timeout: 60_000 });

    const apiMock = await installApiMocks(page, {
      ...options.apiMocks,
      actor: options.actor ?? null,
    });
    const monitor = attachPageMonitor(page);

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });

    return {
      electronApp,
      page,
      userDataDir,
      apiMock,
      monitor,
      close: async () => {
        try {
          await electronApp.close();
        } finally {
          fs.rmSync(userDataDir, { recursive: true, force: true });
        }
      },
    };
  } catch (error) {
    try {
      await electronApp.close();
    } finally {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
    throw error;
  }
}

export async function waitForVisualStability(page: Page): Promise<void> {
  await page.waitForFunction(() => document.readyState === 'complete', { timeout: 15_000 });

  await page.evaluate(async () => {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    const images = Array.from(document.images);
    await Promise.all(
      images.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise<void>((resolve) => {
          img.addEventListener('load', () => resolve(), { once: true });
          img.addEventListener('error', () => resolve(), { once: true });
        });
      }),
    );

    if (!document.getElementById('visual-harness-stabilize-style')) {
      const style = document.createElement('style');
      style.id = 'visual-harness-stabilize-style';
      style.textContent = `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
          caret-color: transparent !important;
        }
      `;
      document.head.appendChild(style);
    }
  });
}

export async function assertHealthyPage(
  page: Page,
  monitor: PageMonitor,
  apiMock: VisualApiMockController,
  expectedState?: ExpectedPageState,
): Promise<void> {
  apiMock.assertNoUnhandledRequests();

  if (monitor.pageErrors.length > 0) {
    throw new Error(`Uncaught page error(s): ${monitor.pageErrors.join(' | ')}`);
  }

  if (monitor.localResourceErrors.length > 0) {
    const details = monitor.localResourceErrors
      .map((err) => `${err.method} ${err.url} (${err.reason})`)
      .join('; ');
    throw new Error(`Missing or failed local resource(s): ${details}`);
  }

  const brokenImages = await page.evaluate(() =>
    Array.from(document.images)
      .filter((img) => img.complete && img.naturalWidth === 0)
      .map((img) => img.currentSrc || img.src || '(no src)'),
  );
  if (brokenImages.length > 0) {
    throw new Error(`Broken image(s) with naturalWidth === 0: ${brokenImages.join(', ')}`);
  }

  if (!expectedState) return;

  if (expectedState.urlPattern && !expectedState.urlPattern.test(page.url())) {
    throw new Error(
      `Unexpected URL state: expected ${expectedState.urlPattern.toString()}, got ${page.url()}`,
    );
  }

  if (expectedState.visibleHeading !== undefined) {
    const heading = page.getByRole('heading', { name: expectedState.visibleHeading }).first();
    const visible = await heading.isVisible().catch(() => false);
    if (!visible) {
      throw new Error(
        `Unexpected page state: expected visible heading ${String(expectedState.visibleHeading)} at ${page.url()}`,
      );
    }
  }

  if (expectedState.forbiddenText) {
    const bodyText = (await page.locator('body').innerText().catch(() => '')) ?? '';
    if (expectedState.forbiddenText.test(bodyText)) {
      throw new Error(
        `Unexpected forbidden text ${expectedState.forbiddenText.toString()} found at ${page.url()}`,
      );
    }
  }

  if (expectedState.check) {
    await expectedState.check(page);
  }
}

export async function captureSmokeScreenshot(
  page: Page,
  metadata: SmokeCaptureMetadata,
): Promise<SmokeCaptureResult> {
  const safeName = metadata.name.replace(/[^a-zA-Z0-9_-]+/g, '-');
  fs.mkdirSync(SMOKE_CAPTURE_DIR, { recursive: true });

  const pngPath = path.join(SMOKE_CAPTURE_DIR, `${safeName}.png`);
  const metaPath = path.join(SMOKE_CAPTURE_DIR, `${safeName}.meta.json`);

  await page.screenshot({
    path: pngPath,
    fullPage: false,
    animations: 'disabled',
  });

  const fullMetadata = {
    ...metadata,
    capturedAt: new Date().toISOString(),
    url: page.url(),
    baselineApproved: false as const,
    promotedToEvidence: false as const,
  };

  fs.writeFileSync(metaPath, JSON.stringify(fullMetadata, null, 2), 'utf-8');

  return {
    pngPath,
    metaPath,
    metadata: fullMetadata,
  };
}

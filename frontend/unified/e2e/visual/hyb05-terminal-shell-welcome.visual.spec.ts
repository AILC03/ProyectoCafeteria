import AxeBuilder from '@axe-core/playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Page, Route } from '@playwright/test';
import { expect, test } from '@playwright/test';
import {
  assertHealthyPage,
  createIsolatedContext,
  launchIsolatedElectron,
  ORIGINS,
  UNIFIED_ROOT,
  waitForVisualStability,
} from './capture.helpers.ts';
import { SYNTHETIC_ACTORS, VISITOR_ACTOR, type ApiRouteHandler } from './fixtures.ts';

const SELECTED_THEME = 'theme-nordic' as const;
const EVIDENCE_HYB05_DIR = path.resolve(
  UNIFIED_ROOT,
  '../docs/specs/frontend-visual-migration/evidence/HYB-05',
);

const TERMINAL_VIEWPORTS = [
  { label: '1024x768', width: 1024, height: 768 },
  { label: '1280x800', width: 1280, height: 800 },
] as const;

type CaptureRecord = {
  file: string;
  originLabel: string;
  role: string;
  state: string;
  url: string;
  capturedAt: string;
};

function resolveSourceCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: UNIFIED_ROOT, encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

function buildEmpleadosMinimalHandlers(): ApiRouteHandler[] {
  return [
    async (route: Route, pathname: string, method: string) => {
      if (pathname === '/api/v1/admin/employees' && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [], page: { limit: 50, nextCursor: null } }),
        });
        return true;
      }
      return false;
    },
  ];
}

async function applyNordicThemePreference(page: Page): Promise<void> {
  await page.addInitScript((themeId) => {
    window.localStorage.setItem('coffees_theme', themeId);
    window.localStorage.setItem('taffy_theme', themeId);
  }, SELECTED_THEME);
}

async function assertAxeClean(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations, `Axe violations: ${JSON.stringify(results.violations)}`).toEqual([]);
  const contrastIncomplete = results.incomplete.filter((item) => item.id === 'color-contrast');
  expect(
    contrastIncomplete,
    `Axe color-contrast incomplete: ${JSON.stringify(contrastIncomplete)}`,
  ).toEqual([]);
}

async function captureEvidencePng(
  page: Page,
  targetDir: string,
  fileName: string,
  info: Omit<CaptureRecord, 'file' | 'url' | 'capturedAt'>,
): Promise<CaptureRecord> {
  fs.mkdirSync(targetDir, { recursive: true });
  const filePath = path.join(targetDir, fileName);
  await page.screenshot({
    path: filePath,
    fullPage: false,
    animations: 'disabled',
  });
  return {
    file: fileName,
    originLabel: info.originLabel,
    role: info.role,
    state: info.state,
    url: page.url(),
    capturedAt: new Date().toISOString(),
  };
}

function writeEvidenceMarkdown(
  targetDir: string,
  title: string,
  sourceCommit: string,
  records: CaptureRecord[],
): void {
  fs.mkdirSync(targetDir, { recursive: true });
  const rows = records
    .map(
      (record) =>
        `| \`${record.file}\` | ${record.originLabel} | ${record.role} | ${record.state} | \`${record.url}\` | ${record.capturedAt} |`,
    )
    .join('\n');

  const content = [
    `# Evidencia HYB-05 — ${title}`,
    '',
    `- **Tema:** \`${SELECTED_THEME}\``,
    `- **Commit:** \`${sourceCommit}\``,
    '',
    '| Archivo | Origen | Rol | Estado | URL | Capturado |',
    '| --- | --- | --- | --- | --- | --- |',
    rows,
    '',
  ].join('\n');

  fs.writeFileSync(path.join(targetDir, 'evidence.md'), content, 'utf-8');
}

test.describe('HYB-05 Terminal shell & welcome visual verification', () => {
  const sourceCommit = resolveSourceCommit();

  for (const viewport of TERMINAL_VIEWPORTS) {
    test(`captures bienvenida original/reproduction (visitante + CAJERO) and audits a11y at ${viewport.label}`, async ({
      browser,
    }) => {
      test.setTimeout(90_000);
      const viewportSize = { width: viewport.width, height: viewport.height };
      const targetDir = path.join(EVIDENCE_HYB05_DIR, 'bienvenida', viewport.label);
      const records: CaptureRecord[] = [];

      // 1. Original (5184) con theme-nordic
      const origSession = await createIsolatedContext(browser, {
        viewport: viewportSize,
        actor: VISITOR_ACTOR,
        apiMocks: { extraHandlers: buildEmpleadosMinimalHandlers() },
      });
      try {
        await applyNordicThemePreference(origSession.page);
        await origSession.page.goto(`${ORIGINS.empleados}/`, { waitUntil: 'domcontentloaded' });
        await waitForVisualStability(origSession.page);
        await expect(origSession.page.locator('#welcome-right-panel')).toHaveClass(/theme-nordic/);
        await assertHealthyPage(origSession.page, origSession.monitor, origSession.apiMock, {
          urlPattern: new RegExp(`^${ORIGINS.empleados}/`),
          check: async (page) => {
            await expect(page.locator('#screen-welcome')).toBeVisible();
          },
        });
        records.push(
          await captureEvidencePng(origSession.page, targetDir, 'original.png', {
            originLabel: 'Original (empleados 5184)',
            role: 'visitante',
            state: 'anonymous',
          }),
        );
      } finally {
        await origSession.close();
      }

      // 2. Reproduction (5173) - visitante
      const visitorSession = await createIsolatedContext(browser, {
        viewport: viewportSize,
        actor: VISITOR_ACTOR,
      });
      try {
        await visitorSession.page.goto(`${ORIGINS.unified}/terminal`, { waitUntil: 'domcontentloaded' });
        await waitForVisualStability(visitorSession.page);
        await assertHealthyPage(visitorSession.page, visitorSession.monitor, visitorSession.apiMock, {
          urlPattern: new RegExp(`^${ORIGINS.unified}/terminal`),
          visibleHeading: /^Terminal$/i,
          check: async (page) => {
            await expect(page.locator('.pos-top-nav')).toBeVisible();
            await expect(page.locator('#screen-welcome')).toBeVisible();
            await expect(page.locator('.welcome-right.theme-nordic')).toBeVisible();
            await expect(page.getByRole('link', { name: /Empezar/i })).toHaveAttribute('href', '/terminal/acceso');
            await expect(page.locator('#live-date')).not.toBeEmpty();
            await expect(page.locator('#live-time')).toHaveText(/^\d{2}:\d{2} (AM|PM)$/);
          },
        });

        await assertAxeClean(visitorSession.page);

        // Keyboard/focus verification
        await visitorSession.page.keyboard.press('Tab');
        const focusedClass = await visitorSession.page.evaluate(() => document.activeElement?.className ?? '');
        expect(focusedClass).toContain('skip-link');

        const startLink = visitorSession.page.getByRole('link', { name: /Empezar/i });
        await startLink.focus();
        const focusOutline = await startLink.evaluate((el) => getComputedStyle(el).outlineWidth);
        expect(focusOutline).not.toBe('0px');

        records.push(
          await captureEvidencePng(visitorSession.page, targetDir, 'reproduction.png', {
            originLabel: 'Unificado (5173)',
            role: 'visitante',
            state: 'anonymous',
          }),
        );
      } finally {
        await visitorSession.close();
      }

      // 3. Reproduction (5173) - CAJERO sintético
      const cajeroSession = await createIsolatedContext(browser, {
        viewport: viewportSize,
        actor: SYNTHETIC_ACTORS.CAJERO,
      });
      try {
        await cajeroSession.page.goto(`${ORIGINS.unified}/terminal`, { waitUntil: 'domcontentloaded' });
        await waitForVisualStability(cajeroSession.page);
        await assertHealthyPage(cajeroSession.page, cajeroSession.monitor, cajeroSession.apiMock, {
          urlPattern: new RegExp(`^${ORIGINS.unified}/terminal`),
          visibleHeading: /^Terminal$/i,
          check: async (page) => {
            await expect(page.getByText(`Sesión: ${SYNTHETIC_ACTORS.CAJERO.name}`)).toBeVisible();
            await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
            await expect(page.getByRole('navigation', { name: 'Accesos de terminal' })).toBeVisible();
            await expect(page.getByRole('link', { name: 'Administración' })).toHaveCount(0);
          },
        });

        await assertAxeClean(cajeroSession.page);

        records.push(
          await captureEvidencePng(cajeroSession.page, targetDir, 'reproduction-cajero.png', {
            originLabel: 'Unificado (5173)',
            role: 'CAJERO',
            state: 'authenticated',
          }),
        );
      } finally {
        await cajeroSession.close();
      }

      writeEvidenceMarkdown(targetDir, `bienvenida (${viewport.label})`, sourceCommit, records);
    });
  }

  test('verifies responsive reflow (<=900px), reduced-motion, and no CSS contamination on .client-layout', async ({
    browser,
  }) => {
    // Reflow + reduced-motion on /terminal
    const termSession = await createIsolatedContext(browser, {
      viewport: { width: 640, height: 800 },
      actor: VISITOR_ACTOR,
    });
    try {
      await termSession.page.goto(`${ORIGINS.unified}/terminal`, { waitUntil: 'domcontentloaded' });
      await waitForVisualStability(termSession.page);
      await assertHealthyPage(termSession.page, termSession.monitor, termSession.apiMock, {
        visibleHeading: /^Terminal$/i,
      });

      const reflowMetrics = await termSession.page.evaluate(() => {
        const welcome = document.getElementById('screen-welcome');
        const btn = document.getElementById('btn-start');
        return {
          flexDirection: welcome ? getComputedStyle(welcome).flexDirection : '',
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          transitionDuration: btn ? getComputedStyle(btn).transitionDuration : '',
        };
      });

      expect(reflowMetrics.flexDirection).toBe('column');
      expect(reflowMetrics.scrollWidth).toBeLessThanOrEqual(reflowMetrics.innerWidth);
      expect(reflowMetrics.transitionDuration).toBe('0s');
    } finally {
      await termSession.close();
    }

    // Client layout isolation check
    const clientSession = await createIsolatedContext(browser, {
      viewport: { width: 1280, height: 800 },
      actor: VISITOR_ACTOR,
    });
    try {
      await clientSession.page.goto(`${ORIGINS.unified}/cliente/iniciar-sesion`, {
        waitUntil: 'domcontentloaded',
      });
      await waitForVisualStability(clientSession.page);
      await assertHealthyPage(clientSession.page, clientSession.monitor, clientSession.apiMock, {
        urlPattern: new RegExp(`^${ORIGINS.unified}/cliente/iniciar-sesion`),
      });

      const isolation = await clientSession.page.evaluate(() => {
        const clientRoot = document.querySelector('.client-layout');
        const styles = clientRoot ? getComputedStyle(clientRoot) : null;
        return {
          hasClientLayout: clientRoot !== null,
          termVar: styles?.getPropertyValue('--term-bg-primary').trim() ?? '',
          hasPosTopNav: document.querySelector('.pos-top-nav') !== null,
        };
      });

      expect(isolation.hasClientLayout).toBe(true);
      expect(isolation.termVar).toBe('');
      expect(isolation.hasPosTopNav).toBe(false);
    } finally {
      await clientSession.close();
    }
  });

  test('captures real Electron evidence in 1280x800 and maximized without Cliente link', async () => {
    test.setTimeout(90_000);
    const electronDir = path.join(EVIDENCE_HYB05_DIR, 'electron');
    const records: CaptureRecord[] = [];

    const session = await launchIsolatedElectron({
      actor: VISITOR_ACTOR,
      frontendOrigin: ORIGINS.unified,
      viewport: { width: 1280, height: 800 },
    });

    try {
      await expect
        .poll(() => session.page.evaluate(() => window.cafeteriaDesktop?.terminalOnly))
        .toBe(true);

      await waitForVisualStability(session.page);
      await assertHealthyPage(session.page, session.monitor, session.apiMock, {
        visibleHeading: /^Terminal$/i,
        forbiddenText: /Cliente/,
        check: async (page) => {
          await expect(page.getByRole('link', { name: 'Cliente' })).toHaveCount(0);
          await expect(page.getByRole('link', { name: /Empezar/i })).toHaveAttribute('href', '/terminal/acceso');
        },
      });
      // @axe-core/playwright opens a secondary page via browserContext.newPage(), which Electron rejects; axe runs in Chromium tests above.

      records.push(
        await captureEvidencePng(session.page, electronDir, 'electron-1280x800.png', {
          originLabel: 'Electron (terminalOnly)',
          role: 'visitante',
          state: '1280x800',
        }),
      );

      // Maximize Electron window
      await session.electronApp.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        win?.maximize();
      });
      await waitForVisualStability(session.page);
      await assertHealthyPage(session.page, session.monitor, session.apiMock, {
        visibleHeading: /^Terminal$/i,
        forbiddenText: /Cliente/,
      });

      records.push(
        await captureEvidencePng(session.page, electronDir, 'electron-maximized.png', {
          originLabel: 'Electron (terminalOnly)',
          role: 'visitante',
          state: 'maximized',
        }),
      );

      writeEvidenceMarkdown(electronDir, 'Electron terminalOnly', sourceCommit, records);
    } finally {
      await session.close();
    }
  });
});

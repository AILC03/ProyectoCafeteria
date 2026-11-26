import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  assertHealthyPage,
  captureSmokeScreenshot,
  createIsolatedContext,
  evidenceDir,
  launchIsolatedElectron,
  ORIGINS,
  SMOKE_CAPTURE_DIR,
  UNIFIED_ROOT,
  waitForVisualStability,
} from './capture.helpers.ts';
import { SYNTHETIC_ACTORS, VISITOR_ACTOR } from './fixtures.ts';

const EVIDENCE_DIR = path.resolve(
  UNIFIED_ROOT,
  '../docs/specs/frontend-visual-migration/evidence',
);

test.describe('HYB-02 Isolated visual harness', () => {
  test('serves original clientes (5183), original empleados (5184), and unified (5173) with synthetic mocks and smoke captures', async ({
    browser,
  }) => {
    const surfaces = [
      {
        name: 'smoke-clientes-original-5183',
        surface: 'clientes-original-auth',
        origin: ORIGINS.clientes,
        path: '/',
        viewport: { width: 390, height: 844 },
        actor: VISITOR_ACTOR,
        role: 'visitante',
        state: 'anonymous',
      },
      {
        name: 'smoke-empleados-original-5184',
        surface: 'empleados-original-welcome',
        origin: ORIGINS.empleados,
        path: '/',
        viewport: { width: 1280, height: 800 },
        actor: VISITOR_ACTOR,
        role: 'visitante',
        state: 'welcome',
      },
      {
        name: 'smoke-unified-terminal-5173',
        surface: 'unified-terminal-welcome',
        origin: ORIGINS.unified,
        path: '/terminal',
        viewport: { width: 1280, height: 800 },
        actor: SYNTHETIC_ACTORS.CAJERO,
        role: 'CAJERO',
        state: 'authenticated',
        expectedHeading: /Terminal/i,
      },
    ] as const;

    for (const target of surfaces) {
      const session = await createIsolatedContext(browser, {
        viewport: target.viewport,
        actor: target.actor,
      });

      try {
        await session.page.goto(`${target.origin}${target.path}`, {
          waitUntil: 'domcontentloaded',
        });
        await waitForVisualStability(session.page);
        await assertHealthyPage(session.page, session.monitor, session.apiMock, {
          urlPattern: new RegExp(`^${target.origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
          visibleHeading: 'expectedHeading' in target ? target.expectedHeading : undefined,
        });

        const smoke = await captureSmokeScreenshot(session.page, {
          name: target.name,
          surface: target.surface,
          origin: target.origin,
          viewport: target.viewport,
          role: target.role,
          state: target.state,
          runtime: 'chromium',
        });

        expect(smoke.pngPath.startsWith(SMOKE_CAPTURE_DIR)).toBe(true);
        expect(fs.existsSync(smoke.pngPath)).toBe(true);
        expect(fs.existsSync(smoke.metaPath)).toBe(true);
        expect(smoke.metadata.baselineApproved).toBe(false);
        expect(smoke.metadata.promotedToEvidence).toBe(false);
        expect(smoke.metadata.origin).toBe(target.origin);
        expect(smoke.metadata.role).toBe(target.role);
        expect(smoke.metadata.state).toBe(target.state);
      } finally {
        await session.close();
      }
    }

    if (fs.existsSync(EVIDENCE_DIR)) {
      const entries = fs.readdirSync(EVIDENCE_DIR, { recursive: true, withFileTypes: true });
      const leakedSmokeFiles = entries
        .filter((entry) => entry.isFile() && entry.name.startsWith('smoke-'))
        .map((entry) => entry.name);
      expect(leakedSmokeFiles).toEqual([]);
    }
  });

  test('keeps approved evidence read-only unless regeneration is explicitly authorized', () => {
    const specs = ['hyb03-terminal-batch.visual.spec.ts', 'hyb04-client-batch.visual.spec.ts', 'hyb05-terminal-shell-welcome.visual.spec.ts'];
    for (const spec of specs) {
      const source = fs.readFileSync(path.resolve(UNIFIED_ROOT, 'e2e/visual', spec), 'utf-8');
      expect(source).not.toContain('../docs/specs/frontend-visual-migration/evidence');
      expect(source).toContain('evidenceDir(');
    }

    if (process.env.VISUAL_EVIDENCE_OVERWRITE === '1') {
      expect(evidenceDir('HYB-GUARD')).toContain(path.join('docs', 'specs', 'frontend-visual-migration', 'evidence'));
    } else {
      expect(evidenceDir('HYB-GUARD')).toContain(path.join('test-results', 'visual-evidence'));
      expect(evidenceDir('HYB-GUARD')).not.toContain(path.join('docs', 'specs'));
    }
  });

  test('launches Electron with real preload, ephemeral profile, and synthetic mocks', async () => {
    test.setTimeout(90_000);

    const session = await launchIsolatedElectron({
      actor: VISITOR_ACTOR,
      frontendOrigin: ORIGINS.unified,
      viewport: { width: 1280, height: 800 },
    });

    const userDataDir = session.userDataDir;

    try {
      await expect
        .poll(() => session.page.evaluate(() => window.cafeteriaDesktop?.terminalOnly))
        .toBe(true);

      await waitForVisualStability(session.page);
      await assertHealthyPage(session.page, session.monitor, session.apiMock, {
        urlPattern: /^http:\/\/localhost:5173\/terminal/,
        visibleHeading: 'Terminal',
      });

      await expect(session.page.getByRole('link', { name: 'Cliente' })).toHaveCount(0);

      const smoke = await captureSmokeScreenshot(session.page, {
        name: 'smoke-electron-terminal-5173',
        surface: 'electron-terminal-welcome',
        origin: ORIGINS.unified,
        viewport: { width: 1280, height: 800 },
        role: 'visitante',
        state: 'anonymous',
        runtime: 'electron',
      });

      expect(smoke.pngPath.startsWith(SMOKE_CAPTURE_DIR)).toBe(true);
      expect(fs.existsSync(smoke.pngPath)).toBe(true);
      expect(smoke.metadata.runtime).toBe('electron');
      expect(smoke.metadata.baselineApproved).toBe(false);
    } finally {
      await session.close();
    }

    expect(fs.existsSync(userDataDir)).toBe(false);
  });

  test('isolates cookies and web storage across browser contexts', async ({ browser }) => {
    const contextA = await createIsolatedContext(browser, { actor: VISITOR_ACTOR });
    const contextB = await createIsolatedContext(browser, { actor: VISITOR_ACTOR });

    try {
      await contextA.page.goto(`${ORIGINS.unified}/terminal`, { waitUntil: 'domcontentloaded' });
      await contextA.page.evaluate(() => {
        localStorage.setItem('harness_isolation_key', 'leak-check-a');
        sessionStorage.setItem('harness_session_key', 'leak-session-a');
        document.cookie = 'harness_cookie=contextA; path=/';
      });

      await contextB.page.goto(`${ORIGINS.unified}/terminal`, { waitUntil: 'domcontentloaded' });
      const leaked = await contextB.page.evaluate(() => ({
        local: localStorage.getItem('harness_isolation_key'),
        session: sessionStorage.getItem('harness_session_key'),
        cookie: document.cookie,
      }));

      expect(leaked.local).toBeNull();
      expect(leaked.session).toBeNull();
      expect(leaked.cookie).not.toContain('harness_cookie=contextA');
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test('fails explicitly on unmocked API request', async ({ browser }) => {
    const session = await createIsolatedContext(browser, { actor: VISITOR_ACTOR });

    try {
      await session.page.goto(`${ORIGINS.unified}/terminal`, { waitUntil: 'domcontentloaded' });
      await waitForVisualStability(session.page);

      const status = await session.page.evaluate(async () => {
        const res = await fetch('/api/v1/unmocked-harness-probe');
        return res.status;
      });
      expect(status).toBe(501);

      expect(() => session.apiMock.assertNoUnhandledRequests()).toThrow(
        /Unmocked API request\(s\) detected: GET \/api\/v1\/unmocked-harness-probe/,
      );
    } finally {
      await session.close();
    }
  });

  test('fails explicitly on missing local resource (404) while distinguishing external fonts', async ({
    browser,
  }) => {
    const session = await createIsolatedContext(browser, { actor: VISITOR_ACTOR });

    try {
      await session.page.goto(`${ORIGINS.unified}/terminal`, { waitUntil: 'domcontentloaded' });
      await waitForVisualStability(session.page);

      // Simulate an offline external font CDN failure: must NOT fail local resource check.
      await session.context.route('https://fonts.googleapis.com/**', (route) =>
        route.abort('internetdisconnected'),
      );
      await session.page.evaluate(async () => {
        await fetch('https://fonts.googleapis.com/css2?family=Inter').catch(() => null);
      });
      expect(session.monitor.externalFontFailures.length).toBeGreaterThan(0);
      await assertHealthyPage(session.page, session.monitor, session.apiMock);

      // Now trigger a missing local asset (404): MUST fail explicitly.
      await session.context.route('**/assets/non-existent-local-asset-hyb02.png', (route) =>
        route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not Found' }),
      );
      await Promise.all([
        session.page.waitForResponse(
          (res) => res.url().includes('non-existent-local-asset-hyb02.png') && res.status() === 404,
        ),
        session.page.evaluate(async () => {
          await fetch('/assets/non-existent-local-asset-hyb02.png');
        }),
      ]);

      await expect
        .poll(() => session.monitor.localResourceErrors.length)
        .toBeGreaterThan(0);

      await expect(
        assertHealthyPage(session.page, session.monitor, session.apiMock),
      ).rejects.toThrow(/Missing or failed local resource\(s\):/);
    } finally {
      await session.close();
    }
  });

  test('fails explicitly on unexpected page state', async ({ browser }) => {
    const session = await createIsolatedContext(browser, { actor: VISITOR_ACTOR });

    try {
      await session.page.goto(`${ORIGINS.unified}/terminal`, { waitUntil: 'domcontentloaded' });
      await waitForVisualStability(session.page);

      await expect(
        assertHealthyPage(session.page, session.monitor, session.apiMock, {
          visibleHeading: 'Encabezado Inexistente HYB-02',
        }),
      ).rejects.toThrow(/Unexpected page state:/);
    } finally {
      await session.close();
    }
  });
});

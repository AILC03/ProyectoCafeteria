import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Page, Route } from '@playwright/test';
import { expect, test } from '@playwright/test';
import {
  assertHealthyPage,
  createIsolatedContext,
  ORIGINS,
  UNIFIED_ROOT,
  waitForVisualStability,
} from './capture.helpers.ts';
import {
  SYNTHETIC_ACTORS,
  SYNTHETIC_CATEGORIES,
  SYNTHETIC_PRODUCTS,
  VISITOR_ACTOR,
  type ApiRouteHandler,
} from './fixtures.ts';

const SELECTED_THEME = 'theme-nordic' as const;
const EVIDENCE_HYB03_DIR = path.resolve(
  UNIFIED_ROOT,
  '../docs/specs/frontend-visual-migration/evidence/HYB-03',
);

const TERMINAL_VIEWPORTS = [
  { label: '1024x768', width: 1024, height: 768 },
  { label: '1280x800', width: 1280, height: 800 },
] as const;

type SurfaceId = 'bienvenida' | 'acceso' | 'pos';

type CaptureRecord = {
  file: string;
  originLabel: string;
  role: string;
  state: string;
  url: string;
  loadedFonts: string[];
  capturedAt: string;
};

function resolveSourceCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: UNIFIED_ROOT, encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

function jsonMock(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

function buildEmpleadosSyntheticHandlers(): ApiRouteHandler[] {
  const syntheticStaff = {
    id: SYNTHETIC_ACTORS.CAJERO.id,
    name: SYNTHETIC_ACTORS.CAJERO.name,
    username: 'cajero_sintetico',
    role: SYNTHETIC_ACTORS.CAJERO.role,
    accountType: SYNTHETIC_ACTORS.CAJERO.accountType,
    mustChangePin: false,
    isActive: true,
  };

  return [
    async (route, pathname, method) => {
      if (pathname === '/api/v1/admin/employees' && method === 'GET') {
        await jsonMock(route, 200, {
          data: [syntheticStaff],
          page: { limit: 50, nextCursor: null },
        });
        return true;
      }
      if (pathname === '/api/v1/auth/login/staff' && method === 'POST') {
        await jsonMock(route, 200, { data: { user: syntheticStaff } });
        return true;
      }
      if (pathname === '/api/v1/products' && method === 'GET') {
        await jsonMock(route, 200, {
          data: SYNTHETIC_PRODUCTS.map((product) => ({
            ...product,
            basePriceCents: product.priceCents,
            isAvailable: product.available,
          })),
          page: { limit: 100, nextCursor: null },
        });
        return true;
      }
      if (pathname === '/api/v1/categories' && method === 'GET') {
        await jsonMock(route, 200, {
          data: SYNTHETIC_CATEGORIES,
          page: { limit: 100, nextCursor: null },
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

async function collectLoadedFonts(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    if (!document.fonts) return [];
    await document.fonts.ready;
    const families = new Set<string>();
    for (const face of document.fonts) {
      if (face.status === 'loaded') {
        families.add(`${face.family} (${face.weight})`);
      }
    }
    return Array.from(families).sort();
  });
}

async function captureSurfaceEvidence(
  page: Page,
  targetDir: string,
  fileName: string,
  info: Omit<CaptureRecord, 'file' | 'url' | 'loadedFonts' | 'capturedAt'>,
): Promise<CaptureRecord> {
  fs.mkdirSync(targetDir, { recursive: true });
  const filePath = path.join(targetDir, fileName);
  await page.screenshot({
    path: filePath,
    fullPage: false,
    animations: 'disabled',
  });

  const loadedFonts = await collectLoadedFonts(page);
  return {
    file: fileName,
    originLabel: info.originLabel,
    role: info.role,
    state: info.state,
    url: page.url(),
    loadedFonts,
    capturedAt: new Date().toISOString(),
  };
}

function writeEvidenceMarkdown(
  targetDir: string,
  surface: SurfaceId,
  viewportLabel: string,
  sourceCommit: string,
  records: CaptureRecord[],
): void {
  const rows = records
    .map((record) => {
      const fontsText = record.loadedFonts.length > 0 ? record.loadedFonts.join(', ') : 'ninguna fuente cargada';
      return `| \`${record.file}\` | ${record.originLabel} | ${record.role} | ${record.state} | \`${record.url}\` | ${fontsText} | ${record.capturedAt} |`;
    })
    .join('\n');

  const content = [
    `# Evidencia HYB-03 — ${surface} (${viewportLabel})`,
    '',
    `- **Superficie:** \`${surface}\``,
    `- **Viewport:** \`${viewportLabel}\``,
    `- **Tema elegido:** \`${SELECTED_THEME}\` (*Nordic Mint*)`,
    `- **Commit fuente:** \`${sourceCommit}\``,
    '- **Estado de aprobación:** Pendiente de aprobación del responsable (lote HYB-03)',
    '',
    '| Archivo | Origen | Rol | Estado | URL | Fuentes cargadas | Capturado |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    rows,
    '',
  ].join('\n');

  fs.writeFileSync(path.join(targetDir, 'evidence.md'), content, 'utf-8');
}

test.describe('HYB-03 Terminal visual batch capture (theme-nordic)', () => {
  const sourceCommit = resolveSourceCommit();

  for (const viewport of TERMINAL_VIEWPORTS) {
    test(`captures bienvenida, acceso, and pos at ${viewport.label}`, async ({ browser }) => {
      test.setTimeout(90_000);

      const viewportSize = { width: viewport.width, height: viewport.height };
      const empleadosHandlers = buildEmpleadosSyntheticHandlers();

      // 1. Bienvenida
      {
        const targetDir = path.join(EVIDENCE_HYB03_DIR, 'bienvenida', viewport.label);
        const records: CaptureRecord[] = [];

        const origSession = await createIsolatedContext(browser, {
          viewport: viewportSize,
          actor: VISITOR_ACTOR,
          apiMocks: { extraHandlers: empleadosHandlers },
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
            await captureSurfaceEvidence(origSession.page, targetDir, 'original.png', {
              originLabel: 'Original (empleados 5184)',
              role: 'visitante',
              state: 'anonymous',
            }),
          );
        } finally {
          await origSession.close();
        }

        const unifiedSession = await createIsolatedContext(browser, {
          viewport: viewportSize,
          actor: VISITOR_ACTOR,
        });
        try {
          await unifiedSession.page.goto(`${ORIGINS.unified}/terminal`, { waitUntil: 'domcontentloaded' });
          await waitForVisualStability(unifiedSession.page);
          await assertHealthyPage(unifiedSession.page, unifiedSession.monitor, unifiedSession.apiMock, {
            urlPattern: new RegExp(`^${ORIGINS.unified}/terminal`),
            visibleHeading: /Terminal/i,
          });
          records.push(
            await captureSurfaceEvidence(unifiedSession.page, targetDir, 'unified-current.png', {
              originLabel: 'Unificado actual (5173)',
              role: 'visitante',
              state: 'anonymous',
            }),
          );
        } finally {
          await unifiedSession.close();
        }

        writeEvidenceMarkdown(targetDir, 'bienvenida', viewport.label, sourceCommit, records);
      }

      // 2. Acceso (original ID + original PIN + unified current)
      {
        const targetDir = path.join(EVIDENCE_HYB03_DIR, 'acceso', viewport.label);
        const records: CaptureRecord[] = [];

        const origSession = await createIsolatedContext(browser, {
          viewport: viewportSize,
          actor: VISITOR_ACTOR,
          apiMocks: { extraHandlers: empleadosHandlers },
        });
        try {
          await applyNordicThemePreference(origSession.page);
          await origSession.page.goto(`${ORIGINS.empleados}/`, { waitUntil: 'domcontentloaded' });
          await waitForVisualStability(origSession.page);

          await origSession.page.locator('#btn-start').click();
          await expect(origSession.page.locator('#screen-employee-id')).toBeVisible();
          await waitForVisualStability(origSession.page);
          await assertHealthyPage(origSession.page, origSession.monitor, origSession.apiMock);
          records.push(
            await captureSurfaceEvidence(origSession.page, targetDir, 'original.png', {
              originLabel: 'Original ID (empleados 5184)',
              role: 'visitante',
              state: 'employee-id-step',
            }),
          );

          const idInput = origSession.page.locator('#screen-employee-id input').first();
          await idInput.fill('cajero_sintetico');
          await idInput.press('Enter');
          await expect(origSession.page.locator('#screen-employee-password')).toBeVisible();
          await waitForVisualStability(origSession.page);
          await assertHealthyPage(origSession.page, origSession.monitor, origSession.apiMock);
          records.push(
            await captureSurfaceEvidence(origSession.page, targetDir, 'original-pin.png', {
              originLabel: 'Original Contraseña (empleados 5184)',
              role: 'visitante',
              state: 'employee-password-step',
            }),
          );
        } finally {
          await origSession.close();
        }

        const unifiedSession = await createIsolatedContext(browser, {
          viewport: viewportSize,
          actor: VISITOR_ACTOR,
        });
        try {
          await unifiedSession.page.goto(`${ORIGINS.unified}/terminal/acceso`, {
            waitUntil: 'domcontentloaded',
          });
          await waitForVisualStability(unifiedSession.page);
          await assertHealthyPage(unifiedSession.page, unifiedSession.monitor, unifiedSession.apiMock, {
            urlPattern: new RegExp(`^${ORIGINS.unified}/terminal/acceso`),
            visibleHeading: /Acceso a terminal/i,
          });
          records.push(
            await captureSurfaceEvidence(unifiedSession.page, targetDir, 'unified-current.png', {
              originLabel: 'Unificado actual (5173)',
              role: 'visitante',
              state: 'anonymous',
            }),
          );
        } finally {
          await unifiedSession.close();
        }

        writeEvidenceMarkdown(targetDir, 'acceso', viewport.label, sourceCommit, records);
      }

      // 3. POS (original PosHeader + OrderingWorkspace con líneas sintéticas + unified current)
      {
        const targetDir = path.join(EVIDENCE_HYB03_DIR, 'pos', viewport.label);
        const records: CaptureRecord[] = [];

        const origSession = await createIsolatedContext(browser, {
          viewport: viewportSize,
          actor: VISITOR_ACTOR,
          apiMocks: { extraHandlers: empleadosHandlers },
        });
        try {
          await applyNordicThemePreference(origSession.page);
          await origSession.page.goto(`${ORIGINS.empleados}/`, { waitUntil: 'domcontentloaded' });
          await waitForVisualStability(origSession.page);

          await origSession.page.locator('#btn-start').click();
          const idInput = origSession.page.locator('#screen-employee-id input').first();
          await idInput.fill('cajero_sintetico');
          await idInput.press('Enter');

          const passInput = origSession.page.locator('#screen-employee-password input').first();
          await expect(passInput).toBeVisible();
          await passInput.fill('Sintetico123');
          await passInput.press('Enter');

          await expect(origSession.page.locator('.pos-top-nav')).toBeVisible();
          await expect(origSession.page.locator('.pos-workspace-grid')).toBeVisible();

          const firstProductCard = origSession.page.locator('.pos-product-card').first();
          await expect(firstProductCard).toBeVisible();
          await firstProductCard.click();
          await expect(origSession.page.locator('.ticket-item-row').first()).toBeVisible();

          await waitForVisualStability(origSession.page);
          await assertHealthyPage(origSession.page, origSession.monitor, origSession.apiMock);
          records.push(
            await captureSurfaceEvidence(origSession.page, targetDir, 'original.png', {
              originLabel: 'Original POS (empleados 5184)',
              role: 'CAJERO',
              state: 'authenticated-with-order-line',
            }),
          );
        } finally {
          await origSession.close();
        }

        const unifiedSession = await createIsolatedContext(browser, {
          viewport: viewportSize,
          actor: SYNTHETIC_ACTORS.CAJERO,
        });
        try {
          await unifiedSession.page.goto(`${ORIGINS.unified}/terminal/pos`, {
            waitUntil: 'domcontentloaded',
          });
          await waitForVisualStability(unifiedSession.page);
          await assertHealthyPage(unifiedSession.page, unifiedSession.monitor, unifiedSession.apiMock, {
            urlPattern: new RegExp(`^${ORIGINS.unified}/terminal/pos`),
          });
          records.push(
            await captureSurfaceEvidence(unifiedSession.page, targetDir, 'unified-current.png', {
              originLabel: 'Unificado actual (5173)',
              role: 'CAJERO',
              state: 'authenticated',
            }),
          );
        } finally {
          await unifiedSession.close();
        }

        writeEvidenceMarkdown(targetDir, 'pos', viewport.label, sourceCommit, records);
      }
    });
  }
});

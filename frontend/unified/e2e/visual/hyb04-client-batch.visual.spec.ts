import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import {
  assertHealthyPage,
  createIsolatedContext,
  evidenceDir,
  ORIGINS,
  UNIFIED_ROOT,
  waitForVisualStability,
} from './capture.helpers.ts';
import { SYNTHETIC_ACTORS, VISITOR_ACTOR } from './fixtures.ts';

const CLIENT_PALETTE = {
  surface: '#fcf9f6',
  primary: '#0f0301',
  secondary: '#974818',
} as const;

const CLIENT_VIEWPORTS = [
  { label: '390x844', width: 390, height: 844 },
  { label: '1280x800', width: 1280, height: 800 },
] as const;

type ClientSurfaceId = 'acceso' | 'menu' | 'personalizacion';

type CaptureRecord = {
  file: string;
  originLabel: string;
  role: string;
  state: string;
  url: string;
  loadedFonts: string[];
  capturedAt: string;
};

const SYNTHETIC_UNSPLASH_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">',
  '<defs>',
  '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">',
  '<stop offset="0%" stop-color="#f0edea"/>',
  '<stop offset="100%" stop-color="#e5e2df"/>',
  '</linearGradient>',
  '</defs>',
  '<rect width="600" height="400" fill="url(#bg)"/>',
  '<circle cx="300" cy="200" r="88" fill="#2d1a12"/>',
  '<circle cx="300" cy="200" r="68" fill="#974818"/>',
  '<circle cx="300" cy="200" r="46" fill="#fcf9f6" fill-opacity="0.18"/>',
  '</svg>',
].join('');

function resolveSourceCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: UNIFIED_ROOT, encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

async function installUnsplashSvgMock(page: Page): Promise<void> {
  await page.route('https://images.unsplash.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: SYNTHETIC_UNSPLASH_SVG,
    }),
  );
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
  surface: ClientSurfaceId,
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
    `# Evidencia HYB-04 — ${surface} (${viewportLabel})`,
    '',
    `- **Superficie:** \`${surface}\``,
    `- **Viewport:** \`${viewportLabel}\``,
    `- **Paleta única confirmada:** \`${CLIENT_PALETTE.surface}\` (surface), \`${CLIENT_PALETTE.primary}\` (primary), \`${CLIENT_PALETTE.secondary}\` (secondary)`,
    `- **Commit fuente:** \`${sourceCommit}\``,
    '- **Estado de aprobación:** Pendiente de aprobación explícita del responsable (lote REF-C / HYB-04)',
    '',
    '| Archivo | Origen | Rol | Estado | URL | Fuentes cargadas | Capturado |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    rows,
    '',
  ].join('\n');

  fs.writeFileSync(path.join(targetDir, 'evidence.md'), content, 'utf-8');
}

test.describe('HYB-04 Client visual batch capture (REF-C)', () => {
  const sourceCommit = resolveSourceCommit();

  for (const viewport of CLIENT_VIEWPORTS) {
    test(`captures acceso, menu, and personalizacion at ${viewport.label}`, async ({ browser }) => {
      test.setTimeout(90_000);

      const viewportSize = { width: viewport.width, height: viewport.height };

      // 1. Acceso (/iniciar-sesion vs /cliente/iniciar-sesion)
      {
        const targetDir = evidenceDir('HYB-04', 'acceso', viewport.label);
        const records: CaptureRecord[] = [];

        const origSession = await createIsolatedContext(browser, {
          viewport: viewportSize,
          actor: VISITOR_ACTOR,
        });
        try {
          await installUnsplashSvgMock(origSession.page);
          await origSession.page.goto(`${ORIGINS.clientes}/iniciar-sesion`, { waitUntil: 'domcontentloaded' });
          await waitForVisualStability(origSession.page);
          await assertHealthyPage(origSession.page, origSession.monitor, origSession.apiMock, {
            urlPattern: new RegExp(`^${ORIGINS.clientes}/iniciar-sesion`),
            visibleHeading: /Café de especialidad a tu alcance/i,
          });
          records.push(
            await captureSurfaceEvidence(origSession.page, targetDir, 'original.png', {
              originLabel: 'Original (clientes 5183)',
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
          await installUnsplashSvgMock(unifiedSession.page);
          await unifiedSession.page.goto(`${ORIGINS.unified}/cliente/iniciar-sesion`, {
            waitUntil: 'domcontentloaded',
          });
          await waitForVisualStability(unifiedSession.page);
          await assertHealthyPage(unifiedSession.page, unifiedSession.monitor, unifiedSession.apiMock, {
            urlPattern: new RegExp(`^${ORIGINS.unified}/cliente/iniciar-sesion`),
            visibleHeading: /Iniciar sesión/i,
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

      // 2. Menu (/menu vs /cliente/menu)
      {
        const targetDir = evidenceDir('HYB-04', 'menu', viewport.label);
        const records: CaptureRecord[] = [];

        const origSession = await createIsolatedContext(browser, {
          viewport: viewportSize,
          actor: SYNTHETIC_ACTORS.CLIENTE,
        });
        try {
          await installUnsplashSvgMock(origSession.page);
          await origSession.page.goto(`${ORIGINS.clientes}/menu`, { waitUntil: 'domcontentloaded' });
          await expect(origSession.page.getByText('Americano Clásico')).toBeVisible();
          await waitForVisualStability(origSession.page);
          await assertHealthyPage(origSession.page, origSession.monitor, origSession.apiMock, {
            urlPattern: new RegExp(`^${ORIGINS.clientes}/menu`),
          });
          records.push(
            await captureSurfaceEvidence(origSession.page, targetDir, 'original.png', {
              originLabel: 'Original (clientes 5183)',
              role: 'CLIENTE',
              state: 'authenticated-catalog',
            }),
          );
        } finally {
          await origSession.close();
        }

        const unifiedSession = await createIsolatedContext(browser, {
          viewport: viewportSize,
          actor: SYNTHETIC_ACTORS.CLIENTE,
        });
        try {
          await installUnsplashSvgMock(unifiedSession.page);
          await unifiedSession.page.goto(`${ORIGINS.unified}/cliente/menu`, {
            waitUntil: 'domcontentloaded',
          });
          await expect(unifiedSession.page.getByText('Americano Clásico')).toBeVisible();
          await waitForVisualStability(unifiedSession.page);
          await assertHealthyPage(unifiedSession.page, unifiedSession.monitor, unifiedSession.apiMock, {
            urlPattern: new RegExp(`^${ORIGINS.unified}/cliente/menu`),
            visibleHeading: /Menú/i,
          });
          records.push(
            await captureSurfaceEvidence(unifiedSession.page, targetDir, 'unified-current.png', {
              originLabel: 'Unificado actual (5173)',
              role: 'CLIENTE',
              state: 'authenticated-catalog',
            }),
          );
        } finally {
          await unifiedSession.close();
        }

        writeEvidenceMarkdown(targetDir, 'menu', viewport.label, sourceCommit, records);
      }

      // 3. Personalizacion (ProductModal vs ProductCustomizationDialog)
      {
        const targetDir = evidenceDir('HYB-04', 'personalizacion', viewport.label);
        const records: CaptureRecord[] = [];

        const origSession = await createIsolatedContext(browser, {
          viewport: viewportSize,
          actor: SYNTHETIC_ACTORS.CLIENTE,
        });
        try {
          await installUnsplashSvgMock(origSession.page);
          await origSession.page.goto(`${ORIGINS.clientes}/menu`, { waitUntil: 'domcontentloaded' });
          const pedirButton = origSession.page.getByRole('button', { name: /Pedir/i }).first();
          await expect(pedirButton).toBeVisible();
          await pedirButton.click();

          const dialog = origSession.page.getByRole('dialog');
          await expect(dialog).toBeVisible();
          await expect(dialog.getByText('Tamaño')).toBeVisible();
          await waitForVisualStability(origSession.page);
          await assertHealthyPage(origSession.page, origSession.monitor, origSession.apiMock, {
            urlPattern: new RegExp(`^${ORIGINS.clientes}/menu`),
          });
          records.push(
            await captureSurfaceEvidence(origSession.page, targetDir, 'original.png', {
              originLabel: 'Original ProductModal (clientes 5183)',
              role: 'CLIENTE',
              state: 'customization-modal-open',
            }),
          );
        } finally {
          await origSession.close();
        }

        const unifiedSession = await createIsolatedContext(browser, {
          viewport: viewportSize,
          actor: SYNTHETIC_ACTORS.CLIENTE,
        });
        try {
          await installUnsplashSvgMock(unifiedSession.page);
          await unifiedSession.page.goto(`${ORIGINS.unified}/cliente/menu`, {
            waitUntil: 'domcontentloaded',
          });
          const personalizarButton = unifiedSession.page.getByRole('button', { name: /Personalizar/i }).first();
          await expect(personalizarButton).toBeVisible();
          await personalizarButton.click();

          const dialog = unifiedSession.page.getByRole('dialog');
          await expect(dialog).toBeVisible();
          await expect(dialog.getByText('Tamaño')).toBeVisible();
          await waitForVisualStability(unifiedSession.page);
          await assertHealthyPage(unifiedSession.page, unifiedSession.monitor, unifiedSession.apiMock, {
            urlPattern: new RegExp(`^${ORIGINS.unified}/cliente/menu`),
          });
          records.push(
            await captureSurfaceEvidence(unifiedSession.page, targetDir, 'unified-current.png', {
              originLabel: 'Unificado actual ProductCustomizationDialog (5173)',
              role: 'CLIENTE',
              state: 'customization-modal-open',
            }),
          );
        } finally {
          await unifiedSession.close();
        }

        writeEvidenceMarkdown(targetDir, 'personalizacion', viewport.label, sourceCommit, records);
      }
    });
  }
});

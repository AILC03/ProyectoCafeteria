import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { assertHealthyPage, createIsolatedContext, ORIGINS, waitForVisualStability } from './capture.helpers.ts';
import { SYNTHETIC_ACTORS } from './fixtures.ts';

const group = { id: '4', name: 'Tamaño', pricingScope: 'GLOBAL', deletedAt: null };
const value = { id: '5', optionGroupId: '4', name: 'Grande', globalSurchargeCents: '500', isAvailable: true, deletedAt: null };
const product = { id: '2', categoryId: '1', name: 'Café', description: null, basePriceCents: '4500', imageUrl: null, imagePublicId: null, imageVersion: null, isAvailable: true, deletedAt: null, createdAt: '2026-01-01T12:00:00.000Z', updatedAt: '2026-01-01T12:00:00.000Z' };
const configuration = { groups: [{ groupId: '4', minSelections: 0, maxSelections: 1, values: [{ valueId: '5' }] }] };

for (const viewport of [{ width: 1024, height: 768 }, { width: 1280, height: 800 }]) {
  for (const kind of ['grupos', 'valores', 'catalogo'] as const) {
    test(`HYB-16 ${kind} ${viewport.width}x${viewport.height} (unapproved)`, async ({ browser }, info) => {
      const context = await createIsolatedContext(browser, {
        viewport, actor: { ...SYNTHETIC_ACTORS.ADMINISTRADOR, id: '1' },
        apiMocks: { extraHandlers: [async (route, pathname, method) => {
          if (method !== 'GET') return false;
          const data = pathname === '/api/v1/admin/option-groups' ? [group]
            : pathname === '/api/v1/admin/option-values' ? [value]
              : pathname === '/api/v1/admin/products' ? [product]
                : pathname === '/api/v1/admin/products/2/configuration' ? configuration : null;
          if (data === null) return false;
          await route.fulfill({ contentType: 'application/json', body: JSON.stringify(Array.isArray(data) ? { data, page: { limit: 20, nextCursor: null } } : { data }) });
          return true;
        }] },
      });
      try {
        await context.page.goto(`${ORIGINS.unified}/terminal/administracion/${kind}`);
        if (kind === 'grupos') {
          await expect(context.page.getByRole('heading', { name: 'Grupos de opciones', exact: true })).toBeVisible();
          await expect(context.page.getByText('Tamaño')).toBeVisible();
          await expect(context.page.getByLabel('Ámbito del recargo')).toHaveValue('GLOBAL');
        } else if (kind === 'valores') {
          await expect(context.page.getByRole('heading', { name: 'Valores de opciones', exact: true })).toBeVisible();
          await expect(context.page.getByText('Grande')).toBeVisible();
          await expect(context.page.getByLabel('ID del grupo de opciones')).toBeVisible();
        } else {
          await context.page.getByRole('button', { name: 'Opciones de Café' }).click();
          await expect(context.page.getByRole('textbox', { name: 'Grupos, límites y valores (JSON)' })).toContainText('minSelections');
          await context.page.locator('.admin-config-editor').scrollIntoViewIfNeeded();
        }
        await waitForVisualStability(context.page);
        await context.page.screenshot({ path: info.outputPath(`hyb16-${viewport.width}x${viewport.height}-${kind}-unapproved.png`) });
        if (kind === 'catalogo') await context.page.locator('.admin-config-editor').screenshot({ path: info.outputPath(`hyb16-${viewport.width}x${viewport.height}-configuration-unapproved.png`) });
        expect((await new AxeBuilder({ page: context.page }).include('.terminal-admin').analyze()).violations).toEqual([]);
        expect(await context.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
        expect(context.apiMock.handledRequests.every((request) => request.method === 'GET')).toBe(true);
        await assertHealthyPage(context.page, context.monitor, context.apiMock);
      } finally { await context.close(); }
    });
  }
}

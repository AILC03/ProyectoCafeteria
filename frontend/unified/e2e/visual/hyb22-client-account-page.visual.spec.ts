import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { assertHealthyPage, createIsolatedContext, ORIGINS, waitForVisualStability } from './capture.helpers.ts';
import { SYNTHETIC_ACTORS } from './fixtures.ts';

const profile = { customerNumber: 'CLI-001', name: 'Ana', phone: '+526641234567', recoveryEmail: null, recoveryEmailVerifiedAt: null, createdAt: '2026-01-01T00:00:00Z' };
const favorite = { productId: '9', categoryId: '1', name: 'Agua', description: null, basePriceCents: '2000', imageUrl: null, isAvailable: true, favoritedAt: '2026-01-01T00:00:00Z' };
const order = { id: '12', folio: 'A000012', status: 'LISTO', paymentMethod: 'CASH', totalCents: '2000', createdAt: '2026-11-09T12:00:00Z', paymentExpiresAt: '2026-11-09T12:10:00Z', paidAt: '2026-11-09T12:01:00Z', readyAt: null };

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  for (const empty of [false, true]) {
    test(`HYB-22 account ${empty ? 'empty' : 'data'} ${viewport.width}x${viewport.height} (unapproved)`, async ({ browser }, info) => {
      const context = await createIsolatedContext(browser, {
        viewport, actor: { ...SYNTHETIC_ACTORS.CLIENTE, id: '42' },
        apiMocks: { extraHandlers: [async (route, pathname, method) => {
          if (pathname === '/api/v1/customers/me' && method === 'GET') {
            await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: profile }) });
            return true;
          }
          if (pathname === '/api/v1/customers/me/favorites' && method === 'GET') {
            await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: empty ? [] : [favorite], page: { limit: 20, nextCursor: null } }) });
            return true;
          }
          if (pathname === '/api/v1/customers/me/orders' && method === 'GET') {
            await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: empty ? [] : [order], page: { limit: 20, nextCursor: null } }) });
            return true;
          }
          if (pathname === '/api/v1/orders/12' && method === 'GET') {
            await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: { ...order, source: 'MOBILE', items: [{ productName: 'Agua', quantity: 1, unitPriceCents: '2000', lineTotalCents: '2000' }] } }) });
            return true;
          }
          return false;
        }] },
      });
      try {
        await context.page.goto(`${ORIGINS.unified}/cliente/cuenta`);
        await expect(context.page.getByRole('heading', { name: 'Cuenta', level: 1 })).toBeVisible();
        await expect(context.page.getByRole('heading', { name: 'Perfil propio' })).toBeVisible();
        await expect(context.page.getByRole('heading', { name: 'Favoritos' })).toBeVisible();
        await expect(context.page.getByRole('heading', { name: 'Historial de órdenes' })).toBeVisible();
        await expect(context.page.getByText('CLI-001')).toBeVisible();
        await waitForVisualStability(context.page);
        await context.page.screenshot({ path: info.outputPath(`hyb22-${viewport.width}x${viewport.height}-${empty ? 'empty' : 'data'}-unapproved.png`), fullPage: true });
        expect((await new AxeBuilder({ page: context.page }).include('.client-layout').analyze()).violations).toEqual([]);
        expect(await context.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
        if (!empty) {
          await context.page.getByRole('button', { name: 'Ver orden A000012' }).click();
          await expect(context.page.getByRole('heading', { name: 'Orden A000012' })).toBeVisible();
          await waitForVisualStability(context.page);
          await context.page.screenshot({ path: info.outputPath(`hyb22-${viewport.width}x${viewport.height}-detail-unapproved.png`), fullPage: true });
        }
        await assertHealthyPage(context.page, context.monitor, context.apiMock);
      } finally { await context.close(); }
    });
  }
}

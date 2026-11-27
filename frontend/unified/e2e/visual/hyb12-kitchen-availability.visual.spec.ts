import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Route } from '@playwright/test';
import { assertHealthyPage, createIsolatedContext, ORIGINS, waitForVisualStability } from './capture.helpers.ts';
import { SYNTHETIC_ACTORS } from './fixtures.ts';

const summary = { id: '7', folio: 'A000007', guestName: 'Ana', status: 'EN_PREPARACION', createdAt: '2099-01-01T12:00:00.000Z' };
const detail = {
  ...summary, source: 'CASHIER', paymentMethod: 'CASH', totalCents: '6500', customerId: null,
  paymentExpiresAt: '2099-01-01T12:30:00.000Z', paidAt: '2099-01-01T12:05:00.000Z', readyAt: null, readyByEmployeeId: null,
  items: [{ id: '11', productId: '10', productName: 'Latte', basePriceCents: '6000', unitPriceCents: '6500', quantity: 1, lineTotalCents: '6500', options: [{ optionValueId: '5', groupName: 'Tamaño', optionName: 'Grande', surchargeCents: '500' }] }],
};
const product = { id: '10', categoryId: '1', name: 'Latte', description: null, basePriceCents: '6500', imageUrl: null, isAvailable: true };
function respond(route: Route, data: unknown, status = 200) { return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) }); }

for (const viewport of [{ width: 1024, height: 768 }, { width: 1280, height: 800 }]) {
  test(`HYB-12 kitchen queue and empty ${viewport.width}x${viewport.height} (unapproved)`, async ({ browser }, info) => {
    let ready = false;
    const context = await createIsolatedContext(browser, {
      viewport, actor: { ...SYNTHETIC_ACTORS.PREPARACION, id: '3' },
      apiMocks: { extraHandlers: [async (route, pathname, method) => {
        if (pathname === '/api/v1/preparation/orders' && method === 'GET') { await respond(route, { data: ready ? [] : [summary], page: { limit: 20, nextCursor: null } }); return true; }
        if (pathname === '/api/v1/orders/7' && method === 'GET') { await respond(route, { data: detail }); return true; }
        if (pathname === '/api/v1/orders/7/ready' && method === 'POST') {
          expect(route.request().postDataJSON()).toEqual({});
          ready = true;
          await respond(route, { data: { ...detail, status: 'LISTO', readyAt: '2099-01-01T12:10:00.000Z', readyByEmployeeId: '3' } });
          return true;
        }
        return false;
      }] },
    });
    try {
      await context.page.goto(`${ORIGINS.unified}/terminal/cocina`);
      const card = context.page.getByRole('article', { name: 'Orden A000007' });
      await expect(card.getByText('Grande')).toBeVisible();
      await expect(context.page.locator('.kitchen-count')).toHaveText('1 en esta página');
      await waitForVisualStability(context.page);
      await context.page.screenshot({ path: info.outputPath(`hyb12-${viewport.width}x${viewport.height}-queue-unapproved.png`) });
      expect((await new AxeBuilder({ page: context.page }).include('.terminal-kitchen').analyze()).violations).toEqual([]);
      await card.getByRole('button', { name: /Marcar orden.*LISTO/ }).click();
      await expect(context.page.getByRole('status').filter({ hasText: 'marcada como LISTO' })).toContainText('marcada como LISTO');
      await context.page.getByRole('button', { name: 'Actualizar cola' }).click();
      await expect(context.page.getByText('No hay órdenes en preparación.')).toBeVisible();
      await context.page.screenshot({ path: info.outputPath(`hyb12-${viewport.width}x${viewport.height}-empty-unapproved.png`) });
      expect(await context.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await assertHealthyPage(context.page, context.monitor, context.apiMock);
    } finally { await context.close(); }
  });

  test(`HYB-12 verified availability ${viewport.width}x${viewport.height} (unapproved)`, async ({ browser }, info) => {
    let available = true;
    const context = await createIsolatedContext(browser, {
      viewport, actor: { ...SYNTHETIC_ACTORS.CAJERO, id: '2' },
      apiMocks: { extraHandlers: [async (route, pathname, method) => {
        if (pathname === '/api/v1/products' && method === 'GET') { await respond(route, { data: [{ ...product, isAvailable: available }], page: { limit: 100, nextCursor: null } }); return true; }
        if (pathname === '/api/v1/products/10/availability' && method === 'PATCH') {
          expect(route.request().postDataJSON()).toEqual({ isAvailable: false });
          available = false;
          await respond(route, { data: { ...product, imagePublicId: null, imageVersion: null, deletedAt: null, createdAt: '2099-01-01T12:00:00.000Z', updatedAt: '2099-01-01T12:00:00.000Z', isAvailable: false } });
          return true;
        }
        return false;
      }] },
    });
    try {
      await context.page.goto(`${ORIGINS.unified}/terminal/disponibilidad`);
      await expect(context.page.locator('.availability-item')).toContainText('● Disponible');
      await waitForVisualStability(context.page);
      await context.page.screenshot({ path: info.outputPath(`hyb12-${viewport.width}x${viewport.height}-available-unapproved.png`) });
      await context.page.getByRole('button', { name: 'Agotar Latte' }).click();
      await expect(context.page.locator('.availability-item')).toContainText('○ Agotado');
      await expect(context.page.getByRole('button', { name: 'Habilitar Latte' })).toBeVisible();
      await context.page.screenshot({ path: info.outputPath(`hyb12-${viewport.width}x${viewport.height}-soldout-unapproved.png`) });
      expect((await new AxeBuilder({ page: context.page }).include('.terminal-availability').analyze()).violations).toEqual([]);
      expect(await context.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await assertHealthyPage(context.page, context.monitor, context.apiMock);
    } finally { await context.close(); }
  });
}

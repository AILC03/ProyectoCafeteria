import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { assertHealthyPage, createIsolatedContext, ORIGINS, waitForVisualStability } from './capture.helpers.ts';
import { SYNTHETIC_ACTORS } from './fixtures.ts';

const sale = { id: '9', saleNumber: 'V000009', orderId: '7', paymentId: '8', totalCents: '6500', soldAt: '2099-01-01T12:00:00.000Z', method: 'CASH' };
const ticket = { saleId: '9', saleNumber: 'V000009', orderFolio: 'A000007', soldAt: sale.soldAt, currency: 'MXN', totalCents: '6500', cashReceivedCents: '7000', changeCents: '500', items: [{ productName: 'Latte', quantity: 1, unitPriceCents: '6500', lineTotalCents: '6500' }], registration: null };

for (const viewport of [{ width: 1024, height: 768 }, { width: 1280, height: 800 }]) {
  for (const empty of [false, true]) {
    test(`HYB-13 history ${empty ? 'empty' : 'read-only reprint'} ${viewport.width}x${viewport.height} (unapproved)`, async ({ browser }, info) => {
      const methods: string[] = [];
      const context = await createIsolatedContext(browser, {
        viewport, actor: { ...SYNTHETIC_ACTORS.CAJERO, id: '2' },
        apiMocks: { extraHandlers: [async (route, pathname, method) => {
          if (!['/api/v1/sales', '/api/v1/sales/summary', '/api/v1/sales/9/ticket'].includes(pathname)) return false;
          methods.push(`${method} ${pathname}`);
          expect(method).toBe('GET');
          const payload = pathname === '/api/v1/sales' ? { data: empty ? [] : [sale], page: { limit: 20, nextCursor: null } }
            : pathname === '/api/v1/sales/summary' ? { data: { count: empty ? '0' : '1', totalCents: empty ? '0' : '6500', cashCents: empty ? '0' : '6500', stripeCents: '0' } }
              : { data: ticket };
          await route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) });
          return true;
        }] },
      });
      try {
        await context.page.goto(`${ORIGINS.unified}/terminal/historial`);
        await expect(context.page.getByRole('heading', { name: 'Historial y ventas' })).toBeVisible();
        await expect(context.page.locator('.terminal-history > .cash-summary')).toContainText(empty ? '$0.00' : '$65.00');
        await waitForVisualStability(context.page);
        await context.page.screenshot({ path: info.outputPath(`hyb13-${viewport.width}x${viewport.height}-${empty ? 'empty' : 'list'}-unapproved.png`) });
        if (empty) {
          await expect(context.page.getByRole('button', { name: /Ver ticket V/ })).toHaveCount(0);
          await expect(context.page.getByRole('status')).toContainText('No hay ventas');
        } else {
          await context.page.getByLabel('Método').selectOption('CASH');
          await context.page.getByRole('button', { name: 'Aplicar filtros' }).click();
          await expect(context.page.getByRole('button', { name: 'Ver ticket V000009' })).toBeVisible();
          const trigger = context.page.getByRole('button', { name: 'Ver ticket V000009' });
          await trigger.focus();
          await context.page.keyboard.press('Enter');
          await expect(context.page.getByRole('heading', { name: 'Ticket reimpreso' })).toBeFocused();
          await context.page.locator('.protected-ticket').scrollIntoViewIfNeeded();
          await context.page.screenshot({ path: info.outputPath(`hyb13-${viewport.width}x${viewport.height}-reprint-unapproved.png`) });
          await context.page.getByRole('button', { name: 'Cerrar ticket' }).click();
          await expect(trigger).toBeFocused();
          expect(methods).toContain('GET /api/v1/sales/9/ticket');
        }
        expect(methods.every((entry) => entry.startsWith('GET '))).toBe(true);
        expect((await new AxeBuilder({ page: context.page }).include('.terminal-history').analyze()).violations).toEqual([]);
        expect(await context.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
        await assertHealthyPage(context.page, context.monitor, context.apiMock);
      } finally { await context.close(); }
    });
  }
}

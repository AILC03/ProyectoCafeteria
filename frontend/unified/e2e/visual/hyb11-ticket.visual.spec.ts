import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { assertHealthyPage, createIsolatedContext, ORIGINS, waitForVisualStability } from './capture.helpers.ts';
import { SYNTHETIC_ACTORS } from './fixtures.ts';

const token = 's'.repeat(43);
const baseSale = { id: '9', saleNumber: 'V000009', orderId: '7', paymentId: '8', totalCents: '6500', soldAt: '2099-01-01T12:00:00.000Z', method: 'CASH' };
const baseTicket = {
  saleId: '9', saleNumber: 'V000009', orderFolio: 'A000007', soldAt: '2099-01-01T12:00:00.000Z', currency: 'MXN',
  totalCents: '6500', cashReceivedCents: '7000', changeCents: '500',
  items: [{ productName: 'Latte', quantity: 1, unitPriceCents: '6500', lineTotalCents: '6500' }],
};

for (const viewport of [{ width: 1024, height: 768 }, { width: 1280, height: 800 }]) {
  for (const mode of ['valid', 'expired', 'stripe'] as const) {
    test(`HYB-11 thermal receipt ${mode} ${viewport.width}x${viewport.height} (unapproved)`, async ({ browser }, info) => {
      const stripe = mode === 'stripe';
      const sale = stripe ? { ...baseSale, method: 'STRIPE', totalCents: '3500' } : baseSale;
      const registration = stripe ? null : { purpose: 'CUSTOMER_REGISTRATION', token, qrPayload: `cafeteria:register:${token}`, expiresAt: mode === 'expired' ? '2000-01-01T00:00:00.000Z' : '2099-01-02T12:00:00.000Z' };
      const ticket = { ...baseTicket, totalCents: sale.totalCents, cashReceivedCents: stripe ? null : '7000', changeCents: stripe ? null : '500', registration };
      const context = await createIsolatedContext(browser, {
        viewport, actor: { ...SYNTHETIC_ACTORS.CAJERO, id: '2' },
        apiMocks: { extraHandlers: [async (route, pathname, method) => {
          if (method !== 'GET') return false;
          const data = pathname === '/api/v1/sales/summary'
            ? { count: '1', totalCents: sale.totalCents, cashCents: stripe ? '0' : sale.totalCents, stripeCents: stripe ? sale.totalCents : '0' }
            : pathname === '/api/v1/sales' ? [sale]
              : pathname === '/api/v1/sales/9/ticket' ? ticket : null;
          if (data === null) return false;
          await route.fulfill({ contentType: 'application/json', body: JSON.stringify(pathname === '/api/v1/sales' ? { data, page: { limit: 20, nextCursor: null } } : { data }) });
          return true;
        }] },
      });
      try {
        await context.page.goto(`${ORIGINS.unified}/terminal/historial`);
        await context.page.getByRole('button', { name: 'Ver ticket V000009' }).click();
        const receipt = context.page.locator('.protected-ticket');
        await expect(receipt.getByRole('heading', { name: 'Ticket V000009' })).toBeVisible();
        await expect(context.page.locator('body')).not.toContainText(token);
        if (mode === 'valid') await expect(receipt.getByRole('img', { name: /Código QR/ })).toBeVisible();
        else await expect(receipt.getByRole('img', { name: /Código QR/ })).toHaveCount(0);
        // paymentApi intentionally discards registrations already expired on arrival.
        if (mode === 'expired') await expect(receipt.getByRole('heading', { name: 'Registra tu cuenta' })).toHaveCount(0);
        if (stripe) await expect(receipt).not.toContainText('Recibido:');
        else await expect(receipt).toContainText('Cambio: $5.00');
        await receipt.scrollIntoViewIfNeeded();
        await waitForVisualStability(context.page);
        await context.page.screenshot({ path: info.outputPath(`hyb11-${viewport.width}x${viewport.height}-${mode}-unapproved.png`) });
        await receipt.screenshot({ path: info.outputPath(`hyb11-${viewport.width}x${viewport.height}-${mode}-receipt-unapproved.png`) });
        expect((await new AxeBuilder({ page: context.page }).include('.protected-ticket').analyze()).violations).toEqual([]);
        await context.page.emulateMedia({ media: 'print' });
        await expect(receipt.getByRole('button', { name: 'Imprimir ticket', includeHidden: true })).toBeHidden();
        const pdf = await context.page.pdf({ format: 'A4', printBackground: true });
        expect(pdf.byteLength).toBeGreaterThan(1000);
        expect(await context.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
        await assertHealthyPage(context.page, context.monitor, context.apiMock);
      } finally { await context.close(); }
    });
  }
}

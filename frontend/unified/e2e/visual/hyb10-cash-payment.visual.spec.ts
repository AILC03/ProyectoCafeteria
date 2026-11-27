import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Route } from '@playwright/test';
import { assertHealthyPage, createIsolatedContext, launchIsolatedElectron, ORIGINS, waitForVisualStability } from './capture.helpers.ts';
import { SYNTHETIC_ACTORS, SYNTHETIC_PRODUCTS } from './fixtures.ts';

const order = {
  id: '7', folio: 'A000007', source: 'CASHIER', status: 'PENDIENTE_PAGO', paymentMethod: 'CASH', totalCents: '6500',
  customerId: null, guestName: null, paymentExpiresAt: '2099-01-01T12:30:00.000Z', paidAt: null, readyAt: null,
  readyByEmployeeId: null, createdAt: '2099-01-01T12:00:00.000Z',
  items: [{ id: '1', productId: '10', productName: 'Latte', basePriceCents: '6500', unitPriceCents: '6500', quantity: 1, lineTotalCents: '6500', options: [] }],
};
const cash = { id: '1', employeeId: '2', openedAt: '2099-01-01T12:00:00.000Z', closedAt: null, closedByEmployeeId: null, exceptionalCloseReason: null, openingAmountCents: '0', expectedCashCents: null, countedCashCents: null, differenceCents: null, cashSalesCents: '0', successfulPayments: '0', computedExpectedCashCents: '0' };
const paid = {
  payment: { id: '8', orderId: '7', method: 'CASH', status: 'SUCCEEDED', amountCents: '6500', currency: 'MXN', cashierId: '2', cashSessionId: '1', cashReceivedCents: '7000', changeCents: '500', confirmedAt: '2099-01-01T12:00:00.000Z' },
  sale: { id: '9', saleNumber: 'V000009', orderId: '7', paymentId: '8', totalCents: '6500', soldAt: '2099-01-01T12:00:00.000Z' },
  order: { id: '7', folio: 'A000007', status: 'EN_PREPARACION', paidAt: '2099-01-01T12:00:00.000Z' },
  ticket: { saleId: '9', path: '/api/v1/sales/9/ticket' },
};
function respond(route: Route, data: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
}

for (const viewport of [{ width: 1024, height: 768 }, { width: 1280, height: 800 }]) {
  test(`HYB-10 payment and ticket-only retry ${viewport.width}x${viewport.height} (unapproved)`, async ({ browser }, info) => {
    let charges = 0;
    let tickets = 0;
    const context = await createIsolatedContext(browser, {
      viewport, actor: { ...SYNTHETIC_ACTORS.CAJERO, id: '2' },
      apiMocks: {
        products: [{ ...SYNTHETIC_PRODUCTS[1], id: '10', name: 'Latte' }],
        extraHandlers: [async (route, pathname, method) => {
          if (pathname === '/api/v1/cash-sessions/current' && method === 'GET') { await respond(route, { data: cash }); return true; }
          if (pathname === '/api/v1/cashier/orders' && method === 'POST') { await respond(route, { data: order }, 201); return true; }
          if (pathname === '/api/v1/payments/cash' && method === 'POST') {
            charges += 1;
            expect(route.request().postDataJSON()).toEqual({ cashSessionId: '1', orderId: '7', cashReceivedCents: '7000' });
            await respond(route, { data: paid }, 201); return true;
          }
          if (pathname === '/api/v1/sales/9/ticket' && method === 'GET') {
            tickets += 1;
            if (tickets === 1) await respond(route, { code: 'UNAVAILABLE' }, 503);
            else await respond(route, { data: { saleId: '9', saleNumber: 'V000009', orderFolio: 'A000007', soldAt: '2099-01-01T12:00:00.000Z', currency: 'MXN', totalCents: '6500', cashReceivedCents: '7000', changeCents: '500', items: [{ productName: 'Latte', quantity: 1, unitPriceCents: '6500', lineTotalCents: '6500' }], registration: null } });
            return true;
          }
          return false;
        }],
      },
    });
    try {
      await context.page.goto(`${ORIGINS.unified}/terminal/pos`);
      await context.page.getByRole('button', { name: /Personalizar.*Latte/ }).click();
      await context.page.getByRole('button', { name: 'Confirmar personalización' }).click();
      await context.page.getByRole('button', { name: 'Crear orden pendiente' }).click();
      await expect(context.page.getByRole('heading', { name: 'Cobro en efectivo' })).toBeVisible();
      await expect(context.page.locator('.pos-checkout-total')).toContainText('$65.00');
      await expect(context.page.getByLabel('Efectivo recibido (MXN)')).toBeEmpty();
      await expect(context.page.getByRole('button', { name: /Tarjeta|Transferencia/ })).toHaveCount(0);
      await waitForVisualStability(context.page);
      await context.page.screenshot({ path: info.outputPath(`hyb10-${viewport.width}x${viewport.height}-pending-unapproved.png`) });
      await context.page.getByLabel('Efectivo recibido (MXN)').fill('70');
      await context.page.getByRole('button', { name: 'Aceptar y cobrar' }).click();
      await expect(context.page.getByRole('status').filter({ hasText: 'Pago confirmado por la API.' })).toContainText('Cambio: $5.00');
      await expect(context.page.getByRole('alert')).toContainText('ticket está pendiente');
      await expect(context.page.getByRole('button', { name: 'Aceptar y cobrar' })).toHaveCount(0);
      await context.page.screenshot({ path: info.outputPath(`hyb10-${viewport.width}x${viewport.height}-ticket-error-unapproved.png`) });
      await context.page.getByRole('button', { name: 'Reintentar ticket' }).click();
      await expect(context.page.getByRole('heading', { name: 'Ticket V000009' })).toBeVisible();
      expect(charges).toBe(1);
      expect(tickets).toBe(2);
      await context.page.emulateMedia({ media: 'print' });
      await expect(context.page.locator('.pos-top-grid')).toBeHidden();
      await expect(context.page.getByRole('heading', { name: 'Ticket V000009' })).toBeVisible();
      await context.page.emulateMedia({ media: 'screen' });
      expect((await new AxeBuilder({ page: context.page }).include('.terminal-pos').analyze()).violations).toEqual([]);
      expect(await context.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await assertHealthyPage(context.page, context.monitor, context.apiMock);
    } finally { await context.close(); }
  });
}

test('HYB-10 Electron keeps the D-20 guard without an order', async ({ browser }) => {
  void browser;
  const info = test.info();
  const session = await launchIsolatedElectron({ actor: { ...SYNTHETIC_ACTORS.CAJERO, id: '2' } });
  try {
    await session.page.goto(`${ORIGINS.unified}/terminal/cobro`);
    await expect(session.page.getByRole('heading', { name: 'Cobro en efectivo' })).toBeVisible();
    await expect(session.page.getByText(/No hay una orden recién creada/)).toBeVisible();
    expect(await session.page.evaluate(() => window.cafeteriaDesktop?.terminalOnly)).toBe(true);
    await assertHealthyPage(session.page, session.monitor, session.apiMock);
    await waitForVisualStability(session.page);
    await session.page.screenshot({ path: info.outputPath('hyb10-electron-payment-guard-unapproved.png') });
  } finally { await session.close(); }
});

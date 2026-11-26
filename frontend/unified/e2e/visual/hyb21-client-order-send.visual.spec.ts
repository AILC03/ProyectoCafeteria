import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';
import { assertHealthyPage, createIsolatedContext, ORIGINS, waitForVisualStability } from './capture.helpers.ts';

type PaymentMethod = 'CASH' | 'STRIPE';

const orderFor = (method: PaymentMethod) => ({
  id: '21',
  folio: 'A000021',
  status: 'PENDIENTE_PAGO',
  source: 'MOBILE',
  paidAt: null,
  paymentMethod: method,
  totalCents: '6500',
  paymentExpiresAt: '2099-01-01T12:30:00.000Z',
});

function respondOrder(route: Route, method: PaymentMethod) {
  return route.fulfill({
    status: 201,
    contentType: 'application/json',
    body: JSON.stringify({ data: orderFor(method) }),
  });
}

async function addProductToDraft(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Personalizar Latte Frío' }).click();
  const dialog = page.getByRole('dialog', { name: 'Latte Frío' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirmar personalización' }).click();
  await page.getByRole('button', { name: 'Añadir al carrito' }).click();
  await expect(page.getByRole('region', { name: 'Carrito borrador' }).getByText(/Latte Frío/)).toBeVisible();
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test(`HYB-21 sending order ${viewport.width}x${viewport.height} (unapproved)`, async ({ browser }, info) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const context = await createIsolatedContext(browser, {
      viewport,
      actor: null,
      apiMocks: {
        extraHandlers: [async (route, pathname, method) => {
          if (pathname !== '/api/v1/orders' || method !== 'POST') return false;
          await gate;
          await respondOrder(route, 'CASH');
          return true;
        }],
      },
    });
    try {
      await context.page.goto(`${ORIGINS.unified}/cliente/menu`);
      await addProductToDraft(context.page);
      await context.page.getByRole('button', { name: 'Crear orden pendiente' }).click();
      await expect(context.page.getByText('Enviando orden…')).toBeVisible();
      await context.page.screenshot({ path: info.outputPath(`hyb21-${viewport.width}x${viewport.height}-sending-unapproved.png`) });
      expect((await new AxeBuilder({ page: context.page }).include('.client-layout').analyze()).violations).toEqual([]);
      release();
      await expect(context.page.getByText('Orden creada')).toBeVisible();
      expect(await context.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await assertHealthyPage(context.page, context.monitor, context.apiMock);
    } finally { await context.close(); }
  });

  test(`HYB-21 uncertain order keeps explicit retry ${viewport.width}x${viewport.height} (unapproved)`, async ({ browser }, info) => {
    const context = await createIsolatedContext(browser, {
      viewport,
      actor: null,
      apiMocks: {
        extraHandlers: [async (route, pathname, method) => {
          if (pathname !== '/api/v1/orders' || method !== 'POST') return false;
          await route.fulfill({
            status: 503,
            contentType: 'application/problem+json',
            body: JSON.stringify({ code: 'DEPENDENCY_UNAVAILABLE' }),
          });
          return true;
        }],
      },
    });
    try {
      await context.page.goto(`${ORIGINS.unified}/cliente/menu`);
      await addProductToDraft(context.page);
      await context.page.getByRole('button', { name: 'Crear orden pendiente' }).click();
      await expect(context.page.getByText('No sabemos si se creó')).toBeVisible();
      await expect(context.page.getByText(/El envío anterior quedó sin confirmar/)).toBeVisible();
      await expect(context.page.getByText('Orden creada')).toHaveCount(0);
      await expect(context.page.getByText(/no se envió completamente/)).toHaveCount(0);
      await expect(context.page.getByRole('button', { name: 'Reintentar la misma orden' })).toBeEnabled();
      await context.page.getByText(/El envío anterior quedó sin confirmar/).scrollIntoViewIfNeeded();
      await waitForVisualStability(context.page);
      await context.page.screenshot({ path: info.outputPath(`hyb21-${viewport.width}x${viewport.height}-uncertain-unapproved.png`) });
      expect((await new AxeBuilder({ page: context.page }).include('.client-layout').analyze()).violations).toEqual([]);
      expect(await context.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await assertHealthyPage(context.page, context.monitor, context.apiMock);
    } finally { await context.close(); }
  });

  for (const method of ['CASH', 'STRIPE'] as const) {
    test(`HYB-21 confirmed ${method} order without payment ${viewport.width}x${viewport.height} (unapproved)`, async ({ browser }, info) => {
      const requests: string[] = [];
      const context = await createIsolatedContext(browser, {
        viewport,
        actor: null,
        apiMocks: {
          extraHandlers: [async (route, pathname, method_) => {
            requests.push(`${method_} ${pathname}`);
            if (pathname !== '/api/v1/orders' || method_ !== 'POST') return false;
            expect(await route.request().postDataJSON()).toEqual({
              paymentMethod: method,
              items: [{ productId: 'prod-2', quantity: 1, optionValueIds: [] }],
            });
            await respondOrder(route, method);
            return true;
          }],
        },
      });
      try {
        await context.page.goto(`${ORIGINS.unified}/cliente/menu`);
        await addProductToDraft(context.page);
        if (method === 'STRIPE') {
          await context.page.getByRole('radio', { name: /STRIPE/ }).click();
        }
        await context.page.getByRole('button', { name: 'Crear orden pendiente' }).click();
        const confirmation = context.page.locator('.order-confirmation');
        await expect(confirmation).toBeVisible();
        await expect(confirmation).toContainText('A000021');
        await expect(confirmation).toContainText('pendiente de pago');
        await expect(confirmation).toContainText('Crear la orden no confirma el pago.');
        if (method === 'CASH') {
          await expect(confirmation).toContainText('Paga en caja para completar.');
        } else {
          await expect(confirmation).toContainText('no se inició ningún cobro con tarjeta');
          await expect(confirmation).not.toContainText('Paga en caja para completar.');
        }
        await expect(context.page.getByText(/Pago confirmado/)).toHaveCount(0);
        expect(requests.some((entry) => /payments|checkout|stripe/i.test(entry))).toBe(false);
        await expect(context.page.getByText(/Producto añadido al carrito borrador/)).toHaveCount(0);
        await confirmation.scrollIntoViewIfNeeded();
        await waitForVisualStability(context.page);
        await context.page.screenshot({ path: info.outputPath(`hyb21-${viewport.width}x${viewport.height}-confirmed-${method.toLowerCase()}-unapproved.png`) });
        expect((await new AxeBuilder({ page: context.page }).include('.client-layout').analyze()).violations).toEqual([]);
        expect(await context.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
        await assertHealthyPage(context.page, context.monitor, context.apiMock);
      } finally { await context.close(); }
    });
  }
}

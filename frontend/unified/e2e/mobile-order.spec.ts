import { expect, test } from '@playwright/test';

test('restores draft, revalidates catalog and creates a CASH order without checkout or payment claim', async ({ page, context }) => {
  const requests: unknown[] = [];
  await context.addInitScript(() => {
    localStorage.setItem('cafeteria:cart-draft:v1', JSON.stringify({ version: 1, items: [{ productId: '10', quantity: 2, optionValueIds: [] }] }));
  });
  await context.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/v1/auth/me' || path === '/api/v1/auth/refresh') {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: 'UNAUTHENTICATED' }) });
    } else if (path === '/api/v1/auth/csrf') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { csrfToken: 'csrf' } }) });
    } else if (path === '/api/v1/categories') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], page: { nextCursor: null } }) });
    } else if (path === '/api/v1/products') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: '10', categoryId: '1', name: 'Latte', description: null, imageUrl: null, isAvailable: true, basePriceCents: '6500' }], page: { nextCursor: null } }) });
    } else if (path === '/api/v1/products/10') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { id: '10', categoryId: '1', name: 'Latte', description: null, imageUrl: null, isAvailable: true, basePriceCents: '6500' } }) });
    } else if (path === '/api/v1/products/10/options') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
    } else if (path === '/api/v1/orders') {
      requests.push(request.postDataJSON());
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { id: '1', folio: 'A000001', status: 'PENDIENTE_PAGO', source: 'MOBILE', paidAt: null, paymentMethod: 'CASH', totalCents: '13000', paymentExpiresAt: '2026-11-20T12:30:00Z' } }) });
    } else {
      await route.fulfill({ status: 404 });
    }
  });

  await page.goto('/cliente/menu');
  const cart = page.getByRole('region', { name: 'Carrito borrador' });
  await expect(cart.getByText('Subtotal estimado: $130.00.', { exact: false })).toBeVisible();
  await cart.getByRole('button', { name: 'Crear orden pendiente' }).focus();
  await page.keyboard.press('Enter');
  await expect(cart.getByText('Orden creada')).toBeVisible();
  await expect(cart.locator('p').filter({ hasText: /Total confirmado por el servidor/ })).toContainText('$130.00');
  await expect(cart.getByText(/Crear la orden no confirma el pago/)).toBeVisible();
  expect(requests).toEqual([{ paymentMethod: 'CASH', items: [{ productId: '10', quantity: 2, optionValueIds: [] }] }]);
  await page.setViewportSize({ width: 320, height: 700 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.getByRole('button', { name: 'Personalizar Latte' }).click();
  await expect(page.getByRole('dialog', { name: 'Latte' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test('503 never claims payment and SPA navigation retains explicit retry with the original snapshot and key', async ({ page, context }) => {
  const requests: Array<{ key: string | undefined; body: unknown }> = [];
  await context.addInitScript(() => {
    localStorage.setItem('cafeteria:cart-draft:v1', JSON.stringify({ version: 1, items: [{ productId: '10', quantity: 1, optionValueIds: [] }] }));
  });
  await context.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/v1/auth/me' || path === '/api/v1/auth/refresh') {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: 'UNAUTHENTICATED' }) });
    } else if (path === '/api/v1/auth/csrf') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { csrfToken: 'csrf' } }) });
    } else if (path === '/api/v1/categories') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], page: { nextCursor: null } }) });
    } else if (path === '/api/v1/products') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: '10', categoryId: '1', name: 'Latte', description: null, imageUrl: null, isAvailable: true, basePriceCents: '6500' }], page: { nextCursor: null } }) });
    } else if (path === '/api/v1/products/10') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { id: '10', categoryId: '1', name: 'Latte', description: null, imageUrl: null, isAvailable: true, basePriceCents: '6500' } }) });
    } else if (path === '/api/v1/products/10/options') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
    } else if (path === '/api/v1/orders') {
      requests.push({ key: request.headers()['idempotency-key'], body: request.postDataJSON() });
      if (requests.length === 1) {
        await route.fulfill({ status: 503, contentType: 'application/problem+json', body: JSON.stringify({ code: 'DEPENDENCY_UNAVAILABLE' }) });
      } else {
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { id: '2', folio: 'A000002', status: 'PENDIENTE_PAGO', source: 'MOBILE', paidAt: null, paymentMethod: 'CASH', totalCents: '6500', paymentExpiresAt: '2026-11-20T12:30:00Z' } }) });
      }
    } else {
      await route.fulfill({ status: 404 });
    }
  });
  await page.goto('/cliente/menu');
  const cart = page.getByRole('region', { name: 'Carrito borrador' });
  await expect(cart.getByText(/Subtotal estimado/)).toBeVisible();
  await cart.getByRole('button', { name: 'Crear orden pendiente' }).click();
  await expect(cart.getByRole('alert')).toContainText('No sabemos si se creó');
  await page.setViewportSize({ width: 320, height: 700 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.getByRole('link', { name: 'Iniciar sesión' }).click();
  await page.getByRole('link', { name: 'Menú' }).click();
  await expect(cart.getByRole('button', { name: 'Crear orden pendiente' })).toBeDisabled();
  await cart.getByRole('button', { name: 'Reintentar la misma orden' }).click();
  await expect(cart.getByText('Orden creada')).toBeVisible();
  await expect(cart.getByText(/Crear la orden no confirma el pago/)).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[0]).toEqual(requests[1]);
});

import { expect, test } from '@playwright/test';

test('repeat order clones directly into the cart without creating a new order or storing private data', async ({ page, context }) => {
  let orderPosts = 0;
  await context.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let data: unknown;
    if (path === '/api/v1/auth/me') data = { data: { id: '42', name: 'Ana', role: 'CLIENTE', accountType: 'CUSTOMER', mustChangePin: false } };
    else if (path === '/api/v1/auth/csrf') data = { data: { csrfToken: 'csrf' } };
    else if (path === '/api/v1/customers/me') data = { data: { customerNumber: 'C000105', name: 'Ana', phone: '+526641234567', recoveryEmail: null, recoveryEmailVerifiedAt: null, createdAt: '2026-11-09T12:00:00Z' } };
    else if (path === '/api/v1/customers/me/favorites') data = { data: [], page: { limit: 20, nextCursor: null } };
    else if (path === '/api/v1/customers/me/orders') data = { data: [{ id: '12', folio: 'A000012', status: 'EXPIRADA', paymentMethod: 'CASH', totalCents: '2000', createdAt: '2026-11-09T12:00:00Z', paymentExpiresAt: '2026-11-09T12:10:00Z', paidAt: null, readyAt: null }], page: { limit: 20, nextCursor: null } };
    else if (path === '/api/v1/customers/me/orders/12/repeat-preview') data = { data: { sourceOrderId: '12', canCreateOrder: true, totalCents: '2000', items: [{ productId: '9', productName: 'Agua', quantity: 1, optionValueIds: [], currentUnitPriceCents: '2000', currentLineTotalCents: '2000' }], warnings: [{ line: 1, code: 'PRICE_CHANGED', blocking: false, optionValueId: null }] } };
    else if (path === '/api/v1/categories') data = { data: [], page: { limit: 100, nextCursor: null } };
    else if (path === '/api/v1/products') data = { data: [{ id: '9', categoryId: '1', name: 'Agua', description: null, imageUrl: null, basePriceCents: '2000', isAvailable: true }], page: { limit: 100, nextCursor: null } };
    else if (path === '/api/v1/products/9') data = { data: { id: '9', categoryId: '1', name: 'Agua', description: null, imageUrl: null, basePriceCents: '2000', isAvailable: true } };
    else if (path === '/api/v1/products/9/options') data = { data: [] };
    else if (path === '/api/v1/orders') { orderPosts += 1; data = { data: {} }; }
    else { await route.fulfill({ status: 404 }); return; }
    await route.fulfill({ status: path === '/api/v1/orders' ? 201 : 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto('/cliente/cuenta');
  await page.getByRole('button', { name: 'Repetir pedido A000012' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/cliente\/menu$/);
  const cart = page.getByRole('dialog', { name: 'Tu carrito' });
  await expect(cart.getByText(/1 × Agua/)).toBeVisible();
  await expect(cart.getByText('$16.80')).toBeVisible();
  expect(orderPosts).toBe(0);
  await page.setViewportSize({ width: 320, height: 700 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('C000105');
});

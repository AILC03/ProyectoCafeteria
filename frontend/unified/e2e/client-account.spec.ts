import { expect, test } from '@playwright/test';

test('customer previews with keyboard, creates only on confirmation and never stores private data', async ({ page, context }) => {
  const posts: unknown[] = [];
  await context.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let data: unknown;
    if (path === '/api/v1/auth/me') data = { data: { id: '42', name: 'Ana', role: 'CLIENTE', accountType: 'CUSTOMER', mustChangePin: false } };
    else if (path === '/api/v1/auth/csrf') data = { data: { csrfToken: 'csrf' } };
    else if (path === '/api/v1/customers/me') data = { data: { customerNumber: 'C000105', name: 'Ana', phone: '+526641234567', recoveryEmail: null, recoveryEmailVerifiedAt: null, createdAt: '2026-11-09T12:00:00Z' } };
    else if (path === '/api/v1/customers/me/favorites') data = { data: [], page: { limit: 20, nextCursor: null } };
    else if (path === '/api/v1/customers/me/orders') data = { data: [{ id: '12', folio: 'A000012', status: 'EXPIRADA', paymentMethod: 'CASH', totalCents: '2000', createdAt: '2026-11-09T12:00:00Z', paymentExpiresAt: '2026-11-09T12:10:00Z', paidAt: null, readyAt: null }], page: { limit: 20, nextCursor: null } };
    else if (path === '/api/v1/orders/12') data = { data: { id: '12', folio: 'A000012', status: 'EXPIRADA', paymentMethod: 'CASH', totalCents: '2000', paidAt: null, items: [{ productName: 'Agua', quantity: 1, lineTotalCents: '2000' }] } };
    else if (path === '/api/v1/customers/me/orders/12/repeat-preview') data = { data: { sourceOrderId: '12', canCreateOrder: true, totalCents: '2000', items: [{ productId: '9', productName: 'Agua', quantity: 1, optionValueIds: [], currentUnitPriceCents: '2000', currentLineTotalCents: '2000' }], warnings: [{ line: 1, code: 'PRICE_CHANGED', blocking: false, optionValueId: null }] } };
    else if (path === '/api/v1/orders') { posts.push(request.postDataJSON()); data = { data: { id: '13', folio: 'A000013', source: 'MOBILE', status: 'PENDIENTE_PAGO', paidAt: null, paymentMethod: 'CASH', totalCents: '2000', paymentExpiresAt: '2026-11-09T12:10:00Z' } }; }
    else { await route.fulfill({ status: 404 }); return; }
    await route.fulfill({ status: path === '/api/v1/orders' ? 201 : 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto('/cliente/cuenta');
  await page.getByRole('button', { name: 'Ver orden A000012' }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Preparar repetición' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText(/PRICE_CHANGED/)).toBeVisible();
  expect(posts).toHaveLength(0);
  await page.getByRole('button', { name: 'Confirmar y crear nueva orden pendiente' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText(/Nueva orden A000013 creada/)).toBeVisible();
  expect(posts).toEqual([{ paymentMethod: 'CASH', items: [{ productId: '9', quantity: 1, optionValueIds: [] }] }]);
  await page.setViewportSize({ width: 320, height: 700 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('C000105');
});

import { expect, test } from '@playwright/test';

test.describe('Client catalog and customization', () => {
  test('browses categories, blocks sold-out products, and customizes options via keyboard and clicks', async ({ page, context }) => {
    await context.route('**/api/v1/**', async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;

      if (pathname === '/api/v1/auth/me' && request.method() === 'GET') {
        await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: 'UNAUTHENTICATED' }) });
        return;
      }

      if (pathname === '/api/v1/auth/refresh' && request.method() === 'POST') {
        await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: 'UNAUTHENTICATED' }) });
        return;
      }

      if (pathname === '/api/v1/categories' && request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [
              { id: '1', name: 'Cafés' },
              { id: '2', name: 'Panadería' },
            ],
            page: { limit: 100, nextCursor: null },
          }),
        });
        return;
      }

      if (pathname === '/api/v1/products' && request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [
              {
                id: '10',
                categoryId: '1',
                name: 'Latte',
                description: 'Espresso con leche vaporizada',
                basePriceCents: '6500',
                imageUrl: null,
                isAvailable: true,
              },
              {
                id: '11',
                categoryId: '2',
                name: 'Croissant',
                description: 'Hojaldre de mantequilla',
                basePriceCents: '4500',
                imageUrl: null,
                isAvailable: false,
              },
            ],
            page: { limit: 100, nextCursor: null },
          }),
        });
        return;
      }

      if (pathname === '/api/v1/products/10' && request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              id: '10',
              categoryId: '1',
              name: 'Latte',
              description: 'Espresso con leche vaporizada',
              basePriceCents: '6500',
              imageUrl: null,
              isAvailable: true,
            },
          }),
        });
        return;
      }

      if (pathname === '/api/v1/products/10/options' && request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [
              {
                id: 'g-size',
                name: 'Tamaño',
                pricingScope: 'PER_PRODUCT',
                minSelections: 1,
                maxSelections: 1,
                values: [
                  { id: 'v-med', name: 'Mediano', surchargeCents: '0', isAvailable: true },
                  { id: 'v-large', name: 'Grande', surchargeCents: '1000', isAvailable: true },
                ],
              },
              {
                id: 'g-milk',
                name: 'Leche',
                pricingScope: 'GLOBAL',
                minSelections: 0,
                maxSelections: 1,
                values: [
                  { id: 'v-oat', name: 'Avena', surchargeCents: '1200', isAvailable: true },
                  { id: 'v-soy', name: 'Soya', surchargeCents: '1000', isAvailable: false },
                ],
              },
            ],
          }),
        });
        return;
      }

      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'NOT_FOUND' }) });
    });

    await page.goto('/cliente/menu');
    await expect(page.getByRole('heading', { name: 'Latte' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Croissant agotado' })).toBeDisabled();

    // Filter with category button and keyboard arrow navigation.
    const allButton = page.getByRole('button', { name: 'Todas' });
    await allButton.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('button', { name: 'Cafés' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Latte' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Croissant' })).toHaveCount(0);

    // Customize Latte.
    await page.getByRole('button', { name: 'Personalizar Latte' }).click();
    const dialog = page.getByRole('dialog', { name: 'Latte' });
    await expect(dialog).toBeVisible();

    await expect(dialog.getByRole('button', { name: /Soya/i })).toBeDisabled();
    await dialog.getByRole('button', { name: /Grande/i }).click();
    await dialog.getByRole('button', { name: /Avena/i }).click();
    await expect(dialog.getByText('$87.00')).toBeVisible();

    await dialog.getByRole('button', { name: 'Añadir al carrito' }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name: /Abrir carrito, 1 producto/ }).click();
    const cart = page.getByRole('dialog', { name: 'Tu carrito' });
    await expect(cart.getByText(/1 × Latte.*\$87\.00/)).toBeVisible();
  });
});

import { expect, test, type BrowserContext } from '@playwright/test';

type MockActor = {
  id: string;
  name: string;
  role: string;
  accountType: string;
  mustChangePin: boolean;
};

const CUSTOMER_ACTOR: MockActor = {
  id: 'cust-1',
  name: 'Mariana López',
  role: 'CLIENTE',
  accountType: 'CUSTOMER',
  mustChangePin: false,
};

const STAFF_ACTOR: MockActor = {
  id: 'staff-1',
  name: 'Cajero Uno',
  role: 'CAJERO',
  accountType: 'STAFF',
  mustChangePin: false,
};

async function setupApiMocks(
  context: BrowserContext,
  options: {
    initialActor?: MockActor | null;
    failLogout?: boolean;
  } = {},
) {
  let activeActor: MockActor | null = options.initialActor ?? null;
  let failLogout = options.failLogout ?? false;

  await context.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;

    if (pathname === '/api/v1/auth/me' && request.method() === 'GET') {
      if (activeActor === null) {
        await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: 'UNAUTHENTICATED' }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: activeActor }) });
      return;
    }

    if (pathname === '/api/v1/auth/csrf' && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { csrfToken: 'csrf-token-1' } }) });
      return;
    }

    if (pathname === '/api/v1/auth/refresh' && request.method() === 'POST') {
      if (activeActor === null) {
        await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: 'UNAUTHENTICATED' }) });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { user: activeActor, csrfToken: 'csrf-refreshed' } }),
      });
      return;
    }

    if (pathname === '/api/v1/auth/login/customer' && request.method() === 'POST') {
      const payload = request.postDataJSON() as { identifier?: string; pin?: string };
      if (payload.identifier === '5512345678' && payload.pin === '1234') {
        activeActor = CUSTOMER_ACTOR;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { user: CUSTOMER_ACTOR, csrfToken: 'csrf-customer-2' } }),
        });
        return;
      }
      await route.fulfill({
        status: 401,
        contentType: 'application/problem+json',
        body: JSON.stringify({ status: 401, code: 'INVALID_CREDENTIALS', detail: 'Invalid credentials' }),
      });
      return;
    }

    if (pathname === '/api/v1/auth/logout' && request.method() === 'POST') {
      if (failLogout) {
        await route.fulfill({
          status: 503,
          contentType: 'application/problem+json',
          body: JSON.stringify({ status: 503, code: 'TEMPORARY', detail: 'Service unavailable' }),
        });
        return;
      }
      activeActor = null;
      await route.fulfill({ status: 204 });
      return;
    }

    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'NOT_FOUND' }) });
  });

  return {
    setFailLogout(value: boolean) {
      failLogout = value;
    },
  };
}

test.describe('Client auth and actor isolation', () => {
  test('logs in as customer, accesses /cliente/cuenta, and logs out back to login', async ({ page, context }) => {
    await setupApiMocks(context);

    await page.goto('/cliente/iniciar-sesion');
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();

    await page.getByLabel('Teléfono o número de cliente').fill('5512345678');
    await page.getByLabel('Dígito 1 del NIP').fill('1');
    await page.getByLabel('Dígito 2 del NIP').fill('2');
    await page.getByLabel('Dígito 3 del NIP').fill('3');
    await page.getByLabel('Dígito 4 del NIP').fill('4');
    await page.getByRole('button', { name: 'Iniciar sesión como cliente' }).click();

    await expect(page).toHaveURL(/\/cliente\/menu$/);
    await expect(page.getByRole('heading', { name: 'Menú' })).toBeVisible();
    await expect(page.getByText('Sesión: Mariana López')).toBeVisible();

    await page.getByRole('link', { name: 'Cuenta' }).click();
    await expect(page).toHaveURL(/\/cliente\/cuenta$/);
    await expect(page.getByRole('heading', { name: 'Cuenta' })).toBeVisible();

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/cliente\/iniciar-sesion$/);
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();

    await page.getByRole('link', { name: 'Cuenta' }).click();
    await expect(page).toHaveURL(/\/cliente\/cuenta$/);
    await expect(page.getByRole('heading', { name: 'Acceso no disponible' })).toBeVisible();

    await page.goto('/cliente/cuenta');
    await expect(page).toHaveURL(/\/cliente\/cuenta$/);
    await expect(page.getByRole('heading', { name: 'Acceso no disponible' })).toBeVisible();
  });

  test('keeps public routes accessible anonymously and enters guest mode in memory only', async ({ page, context }) => {
    await setupApiMocks(context);

    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Aplicación unificada de cafetería' })).toBeVisible();

    await page.goto('/cliente/menu');
    await expect(page).toHaveURL(/\/cliente\/menu$/);
    await expect(page.getByRole('heading', { name: 'Menú' })).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/\/cliente\/menu$/);
    await expect(page.getByRole('heading', { name: 'Menú' })).toBeVisible();

    await page.goto('/cliente/iniciar-sesion');
    await page.getByLabel('Nombre para tu pedido (opcional)').fill('Ana');
    await page.getByRole('button', { name: 'Continuar como invitado' }).click();

    await expect(page).toHaveURL(/\/cliente\/menu$/);
    await expect(page.getByText('Invitado: Ana')).toBeVisible();

    const storedKeys = await page.evaluate(() => Object.keys(localStorage));
    expect(storedKeys).not.toContain('taffy_is_guest');
    expect(storedKeys).not.toContain('taffy_guest_name');

    await page.getByRole('link', { name: 'Cuenta' }).click();
    await expect(page.getByRole('heading', { name: 'Acceso no disponible' })).toBeVisible();

    await page.getByRole('button', { name: 'Salir de invitado' }).click();
    await expect(page).toHaveURL(/\/cliente\/iniciar-sesion$/);
    await expect(page.getByText('Invitado: Ana')).toHaveCount(0);
  });

  test('handles actor replacement for STAFF -> client and CUSTOMER -> terminal with logout failure guard', async ({ page, context }) => {
    const mocks = await setupApiMocks(context, { initialActor: STAFF_ACTOR, failLogout: true });

    await page.goto('/cliente/menu');
    await expect(page.getByRole('heading', { name: 'Acceso no disponible' })).toBeVisible();

    await page.getByRole('button', { name: 'Cambiar a área de cliente' }).click();
    const dialog = page.getByRole('dialog', { name: 'Cambiar de sesión' });
    await expect(dialog).toBeVisible();

    // Failed logout keeps STAFF session active and blocks replacement.
    await dialog.getByRole('button', { name: 'Cerrar sesión y continuar' }).click();
    await expect(dialog.getByRole('alert')).toContainText('No fue posible cerrar la sesión actual');

    // Allow logout and confirm replacement to client login page.
    mocks.setFailLogout(false);
    await dialog.getByRole('button', { name: 'Cerrar sesión y continuar' }).click();
    await expect(page).toHaveURL(/\/cliente\/iniciar-sesion$/);
    await expect(page.getByLabel('Teléfono o número de cliente')).toBeVisible();

    // Log in as customer and confirm switching back to terminal clears session.
    await page.getByLabel('Teléfono o número de cliente').fill('5512345678');
    await page.getByLabel('Dígito 1 del NIP').fill('1234');
    await page.getByRole('button', { name: 'Iniciar sesión como cliente' }).click();
    await expect(page).toHaveURL(/\/cliente\/menu$/);

    await page.getByRole('link', { name: 'Terminal' }).click();
    const terminalDialog = page.getByRole('dialog', { name: 'Cambiar de sesión' });
    await expect(terminalDialog).toBeVisible();
    await terminalDialog.getByRole('button', { name: 'Cerrar sesión y continuar' }).click();

    await expect(page).toHaveURL(/\/terminal$/);
    await expect(page.getByRole('heading', { name: 'Terminal' })).toBeVisible();
  });
});

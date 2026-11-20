import { expect, test, type BrowserContext } from '@playwright/test';

type MockActor = {
  id: string;
  name: string;
  role: string;
  accountType: string;
  mustChangePin: boolean;
};

const CAJERO: MockActor = { id: 'staff-1', name: 'Cajero Uno', role: 'CAJERO', accountType: 'STAFF', mustChangePin: false };
const PREPARACION: MockActor = { id: 'staff-2', name: 'Cocina Dos', role: 'PREPARACION', accountType: 'STAFF', mustChangePin: false };
const ADMINISTRADOR: MockActor = { id: 'staff-3', name: 'Admin Tres', role: 'ADMINISTRADOR', accountType: 'STAFF', mustChangePin: false };
const GERENTE: MockActor = { id: 'staff-4', name: 'Gerente Legacy', role: 'GERENTE', accountType: 'STAFF', mustChangePin: false };

const ACTORS: Record<string, MockActor> = {
  cajero1: CAJERO,
  cocinero1: PREPARACION,
  admin1: ADMINISTRADOR,
  gerente1: GERENTE,
};

async function setupApiMocks(
  context: BrowserContext,
  options: { initialActor?: MockActor | null; failLogout?: boolean } = {},
) {
  let activeActor: MockActor | null = options.initialActor ?? null;
  let failLogout = options.failLogout ?? false;

  await context.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (pathname === '/api/v1/auth/me' && request.method() === 'GET') {
      if (activeActor === null) {
        await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: 'UNAUTHENTICATED' }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: activeActor }) });
      return;
    }

    if (pathname === '/api/v1/auth/csrf' && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { csrfToken: 'csrf-prelogin' } }) });
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

    if (pathname === '/api/v1/auth/login/staff' && request.method() === 'POST') {
      const payload = request.postDataJSON() as { username?: string; password?: string };
      const actor = payload.username === undefined ? undefined : ACTORS[payload.username];
      if (actor === undefined || payload.password !== 'password123') {
        await route.fulfill({
          status: 401,
          contentType: 'application/problem+json',
          body: JSON.stringify({ status: 401, code: 'INVALID_CREDENTIALS', detail: 'Invalid credentials' }),
        });
        return;
      }
      activeActor = actor;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { user: actor, csrfToken: 'csrf-staff-session' } }),
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

    if ((pathname === '/api/v1/categories' || pathname === '/api/v1/products') && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], page: { limit: 100, nextCursor: null } }),
      });
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

async function loginAs(page: import('@playwright/test').Page, username: string) {
  await page.getByLabel('Usuario').fill(username);
  await page.getByLabel('Contraseña').fill('password123');
  await page.getByRole('button', { name: 'Iniciar sesión como personal' }).press('Enter');
}

test.describe('Terminal staff access (TASK-13)', () => {
  test('enters from the welcome page by keyboard, lands in POS and logs out', async ({ page, context }) => {
    await setupApiMocks(context);

    await page.goto('/terminal');
    await expect(page.getByRole('heading', { name: 'Terminal' })).toBeVisible();
    await page.getByRole('link', { name: 'Empezar' }).click();
    await expect(page).toHaveURL(/\/terminal\/acceso$/);

    await loginAs(page, 'cajero1');
    await expect(page).toHaveURL(/\/terminal\/pos$/);
    await expect(page.getByRole('heading', { name: 'Punto de venta' })).toBeVisible();
    await expect(page.getByText('Sesión: Cajero Uno')).toBeVisible();

    const storedKeys = await page.evaluate(() => Object.keys(localStorage));
    expect(storedKeys).not.toContain('password');
    expect(storedKeys).not.toContain('csrf');

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/terminal$/);
    await expect(page.getByRole('link', { name: 'Empezar' })).toBeVisible();
  });

  test('routes PREPARACION to cocina only and ADMINISTRADOR to every area', async ({ page, context }) => {
    await setupApiMocks(context);

    await page.goto('/terminal/acceso');
    await loginAs(page, 'cocinero1');
    await expect(page).toHaveURL(/\/terminal\/cocina$/);
    await expect(page.getByRole('heading', { name: 'Cocina' })).toBeVisible();

    await page.goto('/terminal/pos');
    await expect(page.getByRole('heading', { name: 'Acceso no disponible' })).toBeVisible();
    await page.goto('/terminal/administracion');
    await expect(page.getByRole('heading', { name: 'Acceso no disponible' })).toBeVisible();

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/terminal$/);
    await page.getByRole('link', { name: 'Empezar' }).click();
    await loginAs(page, 'admin1');
    await expect(page).toHaveURL(/\/terminal\/pos$/);
    await page.getByRole('navigation', { name: 'Navegación de terminal' }).getByRole('link', { name: 'Administración' }).click();
    await expect(page.getByRole('heading', { name: 'Administración' })).toBeVisible();
  });

  test('rejects invalid credentials and a legacy GERENTE actor without granting access', async ({ page, context }) => {
    await setupApiMocks(context);

    await page.goto('/terminal/acceso');
    await page.getByLabel('Usuario').fill('cajero1');
    await page.getByLabel('Contraseña').fill('wrong-password');
    await page.getByRole('button', { name: 'Iniciar sesión como personal' }).click();
    await expect(page.getByRole('alert')).toContainText('Usuario o contraseña incorrectos.');
    await expect(page).toHaveURL(/\/terminal\/acceso$/);

    await loginAs(page, 'gerente1');
    await expect(page.getByRole('alert')).toContainText('Esta cuenta no tiene acceso permitido en la terminal.');
    await expect(page).toHaveURL(/\/terminal\/acceso$/);
    await expect(page.getByText('Sesión: Gerente Legacy')).toHaveCount(0);

    await page.goto('/terminal/pos');
    await expect(page.getByRole('heading', { name: 'Acceso no disponible' })).toBeVisible();
  });

  test('keeps the session and reports an error when logout fails', async ({ page, context }) => {
    const mocks = await setupApiMocks(context, { failLogout: true });

    await page.goto('/terminal/acceso');
    await loginAs(page, 'cajero1');
    await expect(page).toHaveURL(/\/terminal\/pos$/);

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page.getByRole('alert')).toContainText('No fue posible cerrar la sesión.');
    await expect(page.getByRole('heading', { name: 'Punto de venta' })).toBeVisible();

    mocks.setFailLogout(false);
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/terminal$/);
  });

  test('requires a successful logout before switching an active staff user', async ({ page, context }) => {
    await setupApiMocks(context, { initialActor: CAJERO });

    await page.goto('/terminal/acceso');
    await expect(page.getByText(/Sesión de personal activa/)).toBeVisible();
    await page.getByRole('button', { name: 'Cambiar de usuario' }).click();
    await expect(page.getByLabel('Usuario')).toBeVisible();
    await expect(page).toHaveURL(/\/terminal\/acceso$/);
  });
});

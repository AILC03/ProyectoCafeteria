import { expect, test, type BrowserContext } from '@playwright/test';

type MockActor = {
  id: string;
  name: string;
  role: string;
  accountType: string;
  mustChangePin: boolean;
};

const CAJERO: MockActor = { id: '2', name: 'Cajero Uno', role: 'CAJERO', accountType: 'STAFF', mustChangePin: false };
const ADMIN: MockActor = { id: '3', name: 'Admin Tres', role: 'ADMINISTRADOR', accountType: 'STAFF', mustChangePin: false };
const OTRO_CAJERO: MockActor = { id: '4', name: 'Otro Cajero', role: 'CAJERO', accountType: 'STAFF', mustChangePin: false };

const openSession = {
  id: '1',
  employeeId: '2',
  openedAt: '2099-01-01T12:00:00.000Z',
  closedAt: null,
  closedByEmployeeId: null,
  exceptionalCloseReason: null,
  openingAmountCents: '50000',
  expectedCashCents: null,
  countedCashCents: null,
  differenceCents: null,
  cashSalesCents: '0',
  successfulPayments: '0',
  computedExpectedCashCents: '50000',
};

const pendingOrder = {
  id: '7',
  folio: 'A000007',
  source: 'CASHIER',
  status: 'PENDIENTE_PAGO',
  paymentMethod: 'CASH',
  totalCents: '6500',
  customerId: '10',
  guestName: null,
  paymentExpiresAt: '2099-01-01T12:30:00.000Z',
  paidAt: null,
  readyAt: null,
  readyByEmployeeId: null,
  createdAt: '2099-01-01T12:00:00.000Z',
  items: [{
    id: '1', productId: '10', productName: 'Latte', basePriceCents: '6500', unitPriceCents: '6500',
    quantity: 1, lineTotalCents: '6500', options: [],
  }],
};

type SetupOptions = {
  actor: MockActor;
  cashSession?: typeof openSession | null;
  openFails409?: boolean;
  associateFails409?: boolean;
};

async function setupApi(context: BrowserContext, options: SetupOptions) {
  let cashSession = options.cashSession ?? null;
  const requests: Array<{ path: string; body?: unknown; key?: string }> = [];

  await context.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path === '/api/v1/auth/me' && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: options.actor }) });
      return;
    }
    if (path === '/api/v1/auth/csrf' && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { csrfToken: 'csrf-e2e' } }) });
      return;
    }
    if ((path === '/api/v1/categories' || path === '/api/v1/products') && request.method() === 'GET') {
      const data = path === '/api/v1/categories' ? [] : [{
        id: '10', categoryId: '1', name: 'Latte', description: null, imageUrl: null,
        isAvailable: true, basePriceCents: '6500',
      }];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data, page: { limit: 100, nextCursor: null } }) });
      return;
    }
    if (path === '/api/v1/products/10' && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {
        id: '10', categoryId: '1', name: 'Latte', description: null, imageUrl: null,
        isAvailable: true, basePriceCents: '6500',
      } }) });
      return;
    }
    if (path === '/api/v1/products/10/options' && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
      return;
    }
    if (path === '/api/v1/cashier/customers/search' && request.method() === 'POST') {
      requests.push({ path, body: request.postDataJSON() });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { id: '10', name: 'Cliente Uno', customerNumber: 'C10' } }) });
      return;
    }
    if (path === '/api/v1/cashier/orders' && request.method() === 'POST') {
      requests.push({ path, body: request.postDataJSON(), key: request.headers()['idempotency-key'] });
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: pendingOrder }) });
      return;
    }
    if (path === '/api/v1/cashier/orders/7/customer' && request.method() === 'PATCH') {
      requests.push({ path, body: request.postDataJSON() });
      if (options.associateFails409) {
        await route.fulfill({ status: 409, contentType: 'application/problem+json', body: JSON.stringify({ code: 'ORDER_CONFLICT' }) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: pendingOrder }) });
      }
      return;
    }
    if (path === '/api/v1/cash-sessions/current' && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: cashSession }) });
      return;
    }
    if (path === '/api/v1/cash-sessions' && request.method() === 'POST') {
      requests.push({ path, body: request.postDataJSON(), key: request.headers()['idempotency-key'] });
      if (options.openFails409) {
        await route.fulfill({ status: 409, contentType: 'application/problem+json', body: JSON.stringify({ code: 'CASH_CONFLICT' }) });
        return;
      }
      cashSession = openSession;
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: openSession }) });
      return;
    }
    if (/^\/api\/v1\/cash-sessions\/[^/]+\/close$/.test(path) && request.method() === 'POST') {
      const body = request.postDataJSON() as { countedCashCents?: string; exceptionalCloseReason?: string };
      requests.push({ path, body, key: request.headers()['idempotency-key'] });
      const countedCashCents = String(body.countedCashCents ?? '0');
      const closed = {
        ...openSession,
        closedAt: '2099-01-01T13:00:00.000Z',
        closedByEmployeeId: options.actor.id,
        expectedCashCents: openSession.openingAmountCents,
        countedCashCents,
        differenceCents: (BigInt(countedCashCents) - BigInt(openSession.openingAmountCents)).toString(),
        exceptionalCloseReason: body.exceptionalCloseReason ?? null,
      };
      cashSession = closed;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: closed }) });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'NOT_FOUND' }) });
  });

  return { requests };
}

test.describe('POS and cash sessions (TASK-14)', () => {
  test('creates a pending order with customer association, opens and closes own cash, and stays keyboard/touch usable', async ({ page, context }) => {
    const { requests } = await setupApi(context, { actor: CAJERO });

    await page.goto('/terminal/pos');
    await expect(page.getByRole('heading', { name: 'Punto de venta' })).toBeVisible();

    const productButton = page.getByRole('button', { name: 'Personalizar Latte' });
    await productButton.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Latte' })).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar personalización' }).click();
    await expect(page.getByText('1 × Latte')).toBeVisible();

    await page.getByLabel('Teléfono o número de cliente').fill('C10');
    await page.getByRole('button', { name: 'Buscar cliente' }).click();
    await expect(page.getByText(/Confirma el nombre antes de usarlo/)).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar cliente' }).click();
    await page.getByRole('button', { name: 'Crear orden pendiente' }).click();
    await expect(page.getByText(/Orden A000007 creada/)).toBeVisible();
    await expect(page.getByText('Crear la orden no confirma el pago ni genera un QR.')).toBeVisible();
    await page.getByRole('button', { name: 'Asociar cliente' }).click();
    await expect(page.getByText('Cliente asociado a la orden A000007.')).toBeVisible();

    const orderRequest = requests.find((entry) => entry.path.endsWith('/cashier/orders'));
    expect(orderRequest?.body).toEqual({
      paymentMethod: 'CASH',
      items: [{ productId: '10', quantity: 1, optionValueIds: [] }],
      customer: { identifier: 'C10', confirmedName: 'Cliente Uno' },
    });
    expect(orderRequest?.key).toMatch(/^[0-9a-f-]{36}$/i);

    await page.getByRole('navigation', { name: 'Navegación de terminal' }).getByRole('link', { name: 'Caja' }).click();
    await expect(page.getByRole('heading', { name: 'Caja cerrada' })).toBeVisible();
    await page.getByLabel('Fondo inicial (MXN)').fill('500');
    await page.getByRole('button', { name: 'Abrir caja' }).click();
    await expect(page.getByRole('heading', { name: 'Caja abierta' })).toBeVisible();
    await expect(page.getByText('Caja abierta con fondo $500.00.')).toBeVisible();
    await page.getByLabel('Efectivo contado (MXN)').fill('490');
    await page.getByRole('button', { name: 'Cerrar caja' }).click();
    await expect(page.getByRole('heading', { name: 'Última sesión cerrada' })).toBeVisible();
    await expect(page.getByText(/Diferencia calculada por el servidor: -\$10\.00/)).toBeVisible();

    await page.setViewportSize({ width: 320, height: 700 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });

  test('requires an exceptional reason for an administrator closing another cashier session', async ({ page, context }) => {
    await setupApi(context, { actor: ADMIN, cashSession: openSession });

    await page.goto('/terminal/caja');
    await expect(page.getByRole('heading', { name: 'Caja abierta' })).toBeVisible();
    await page.getByLabel('Efectivo contado (MXN)').fill('500');
    await page.getByRole('button', { name: 'Cerrar caja' }).click();
    await expect(page.getByText('Indica el motivo para cerrar una caja ajena.')).toBeVisible();

    await page.getByLabel('Motivo de cierre excepcional').fill('Responsable ausente');
    await page.getByRole('button', { name: 'Cerrar caja' }).click();
    await expect(page.getByRole('heading', { name: 'Última sesión cerrada' })).toBeVisible();
    await expect(page.getByText('Responsable ausente')).toBeVisible();
  });

  test('blocks another cashier from closing and reports 409 without claiming success', async ({ page, context }) => {
    await setupApi(context, { actor: OTRO_CAJERO, cashSession: openSession, associateFails409: true });

    await page.goto('/terminal/caja');
    await expect(page.getByRole('heading', { name: 'Caja abierta' })).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Sólo el responsable de la caja puede cerrarla');
    await expect(page.getByRole('button', { name: 'Cerrar caja' })).toHaveCount(0);

    await page.goto('/terminal/pos');
    await page.getByRole('button', { name: 'Personalizar Latte' }).click();
    await page.getByRole('button', { name: 'Confirmar personalización' }).click();
    await page.getByLabel('Teléfono o número de cliente').fill('C10');
    await page.getByRole('button', { name: 'Buscar cliente' }).click();
    await page.getByRole('button', { name: 'Confirmar cliente' }).click();
    await page.getByLabel('ID de orden pendiente').fill('7');
    await page.getByRole('button', { name: 'Asociar cliente' }).click();
    await expect(page.getByText(/ya no permite asociar clientes/)).toBeVisible();
  });
});

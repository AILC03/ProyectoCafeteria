import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Route } from '@playwright/test';
import { assertHealthyPage, createIsolatedContext, launchIsolatedElectron, ORIGINS, waitForVisualStability } from './capture.helpers.ts';
import { SYNTHETIC_ACTORS } from './fixtures.ts';

const opened = {
  id: '1', employeeId: '2', openedAt: '2099-01-01T12:00:00.000Z',
  closedAt: null, closedByEmployeeId: null, exceptionalCloseReason: null,
  openingAmountCents: '50000', expectedCashCents: null, countedCashCents: null,
  differenceCents: null, cashSalesCents: '6500', successfulPayments: '1', computedExpectedCashCents: '56500',
};

function respond(route: Route, data: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ data }) });
}

test('HYB-09 Electron shows API-backed cash without automatic opening', async ({ browser }) => {
  void browser;
  const info = test.info();
  const session = await launchIsolatedElectron({ actor: { ...SYNTHETIC_ACTORS.CAJERO, id: '2' } });
  try {
    await session.page.goto(`${ORIGINS.unified}/terminal/pos`);
    await expect(session.page.getByText('No hay caja abierta.')).toBeVisible();
    await expect(session.page.getByRole('button', { name: 'Abrir caja' })).toHaveCount(0);
    expect(await session.page.evaluate(() => window.cafeteriaDesktop?.terminalOnly)).toBe(true);
    expect(session.apiMock.handledRequests.some((request) => request.pathname === '/api/v1/cash-sessions/current')).toBe(true);
    await assertHealthyPage(session.page, session.monitor, session.apiMock);
    await waitForVisualStability(session.page);
    await session.page.screenshot({ path: info.outputPath('hyb09-electron-cash-closed-unapproved.png') });
  } finally { await session.close(); }
});

for (const viewport of [{ width: 1024, height: 768 }, { width: 1280, height: 800 }]) {
  test(`HYB-09 cashier closes cash ${viewport.width}x${viewport.height} (unapproved)`, async ({ browser }, info) => {
    let current: typeof opened | (typeof opened & { closedAt: string; closedByEmployeeId: string; countedCashCents: string; differenceCents: string; expectedCashCents: string }) | null = opened;
    const session = await createIsolatedContext(browser, {
      viewport, actor: { ...SYNTHETIC_ACTORS.CAJERO, id: '2' },
      apiMocks: { extraHandlers: [async (route, pathname, method) => {
        if (pathname === '/api/v1/cash-sessions/current' && method === 'GET') { await respond(route, current); return true; }
        if (pathname === '/api/v1/cash-sessions' && method === 'POST') {
          expect(await route.request().postDataJSON()).toEqual({ openingAmountCents: '50000' });
          expect(route.request().headers()['idempotency-key']).toBeTruthy();
          current = opened;
          await respond(route, current, 201);
          return true;
        }
        if (pathname === '/api/v1/cash-sessions/1/close' && method === 'POST') {
          expect(await route.request().postDataJSON()).toEqual({ countedCashCents: '56000' });
          expect(route.request().headers()['idempotency-key']).toBeTruthy();
          current = { ...opened, closedAt: '2099-01-01T13:00:00.000Z', closedByEmployeeId: '2', countedCashCents: '56000', expectedCashCents: '56500', differenceCents: '-500' };
          await respond(route, current);
          return true;
        }
        return false;
      }] },
    });
    try {
      await session.page.goto(`${ORIGINS.unified}/terminal/pos`);
      await expect(session.page.getByRole('button', { name: 'Cerrar caja' })).toBeVisible();
      await waitForVisualStability(session.page);
      await session.page.screenshot({ path: info.outputPath(`hyb09-${viewport.width}x${viewport.height}-closed-unapproved.png`) });
      await session.page.getByRole('button', { name: 'Cerrar caja' }).click();
      await session.page.getByLabel('Efectivo contado (MXN)').fill('560');
      await session.page.getByRole('button', { name: 'Confirmar cierre' }).click();
      await expect(session.page.getByText('No hay una caja abierta.')).toBeVisible();
      await expect(session.page.getByRole('status').last()).toContainText('Diferencia calculada por el servidor: -$5.00');
      await session.page.screenshot({ path: info.outputPath(`hyb09-${viewport.width}x${viewport.height}-result-unapproved.png`) });
      expect((await new AxeBuilder({ page: session.page }).include('.pos-cash-card').analyze()).violations).toEqual([]);
      expect(await session.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await assertHealthyPage(session.page, session.monitor, session.apiMock);
    } finally { await session.close(); }
  });

  for (const role of ['CAJERO', 'ADMINISTRADOR'] as const) {
    test(`HYB-09 foreign cash ${role} ${viewport.width}x${viewport.height} (unapproved)`, async ({ browser }, info) => {
      const actor = role === 'CAJERO' ? { ...SYNTHETIC_ACTORS.CAJERO, id: '4' } : { ...SYNTHETIC_ACTORS.ADMINISTRADOR, id: '3' };
      const session = await createIsolatedContext(browser, {
        viewport, actor,
        apiMocks: { extraHandlers: [async (route, pathname, method) => {
          if (pathname === '/api/v1/cash-sessions/current' && method === 'GET') { await respond(route, opened); return true; }
          return false;
        }] },
      });
      try {
        await session.page.goto(`${ORIGINS.unified}/terminal/pos`);
        await expect(session.page.getByRole('heading', { name: 'Caja abierta' })).toBeVisible();
        if (role === 'CAJERO') {
          await expect(session.page.getByRole('button', { name: 'Cerrar caja' })).toHaveCount(0);
          await expect(session.page.getByText(/caja ajena/)).toBeVisible();
        } else {
          await session.page.getByRole('button', { name: 'Cerrar caja' }).click();
          await expect(session.page.getByLabel('Motivo de cierre excepcional')).toBeVisible();
          await session.page.getByLabel('Efectivo contado (MXN)').fill('565');
          await session.page.getByRole('button', { name: 'Confirmar cierre' }).click();
          await expect(session.page.getByRole('alert')).toContainText('motivo para cerrar una caja ajena');
        }
        await waitForVisualStability(session.page);
        await session.page.screenshot({ path: info.outputPath(`hyb09-${viewport.width}x${viewport.height}-foreign-${role.toLowerCase()}-unapproved.png`) });
        expect((await new AxeBuilder({ page: session.page }).include('.pos-cash-card').analyze()).violations).toEqual([]);
        expect(await session.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
        await assertHealthyPage(session.page, session.monitor, session.apiMock);
      } finally { await session.close(); }
    });
  }

  test(`HYB-09 unverifiable opening ${viewport.width}x${viewport.height} (unapproved)`, async ({ browser }, info) => {
    const session = await createIsolatedContext(browser, {
      viewport, actor: { ...SYNTHETIC_ACTORS.ADMINISTRADOR, id: '3' },
      apiMocks: { extraHandlers: [async (route, pathname, method) => {
        if (pathname === '/api/v1/cash-sessions' && method === 'POST') { await respond(route, { id: '1' }, 201); return true; }
        return false;
      }] },
    });
    try {
      await session.page.goto(`${ORIGINS.unified}/terminal/administracion/caja`);
      await session.page.getByRole('button', { name: 'Caja del turno' }).click();
      await expect(session.page.getByRole('heading', { name: 'Caja cerrada' })).toBeVisible();
      await session.page.getByLabel('Fondo inicial (MXN)').fill('500');
      await session.page.getByRole('button', { name: 'Abrir caja' }).click();
      await expect(session.page.getByRole('alert')).toContainText('No repitas la operación');
      await expect(session.page.getByRole('heading', { name: 'Estado no verificable' })).toBeVisible();
      await expect(session.page.getByRole('heading', { name: 'Caja cerrada' })).toHaveCount(0);
      await expect(session.page.getByRole('button', { name: 'Abrir caja' })).toHaveCount(0);
      await expect(session.page.getByRole('button', { name: 'Reintentar la misma operación de caja' })).toHaveCount(0);
      await session.page.screenshot({ path: info.outputPath(`hyb09-${viewport.width}x${viewport.height}-uncertain-unapproved.png`) });
      expect((await new AxeBuilder({ page: session.page }).include('.admin-cash').analyze()).violations).toEqual([]);
      await assertHealthyPage(session.page, session.monitor, session.apiMock);
    } finally { await session.close(); }
  });

  test(`HYB-09 failed status lookup ${viewport.width}x${viewport.height} (unapproved)`, async ({ browser }, info) => {
    const session = await createIsolatedContext(browser, {
      viewport, actor: { ...SYNTHETIC_ACTORS.CAJERO, id: '2' },
      apiMocks: { extraHandlers: [async (route, pathname, method) => {
        if (pathname === '/api/v1/cash-sessions/current' && method === 'GET') {
          await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'UNAVAILABLE' }) });
          return true;
        }
        return false;
      }] },
    });
    try {
      await session.page.goto(`${ORIGINS.unified}/terminal/pos`);
      await expect(session.page.getByRole('button', { name: 'Reintentar consulta' })).toBeVisible();
      await expect(session.page.getByRole('button', { name: 'Abrir caja' })).toHaveCount(0);
      await session.page.screenshot({ path: info.outputPath(`hyb09-${viewport.width}x${viewport.height}-lookup-error-unapproved.png`) });
      expect((await new AxeBuilder({ page: session.page }).include('.pos-cash-card').analyze()).violations).toEqual([]);
      await assertHealthyPage(session.page, session.monitor, session.apiMock);
    } finally { await session.close(); }
  });
}

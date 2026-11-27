import { fireEvent, render, screen, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { invalidateCsrfToken, setCsrfToken } from '../../../../shared/api/client';
import { server } from '../../../../test/server';
import { AdminCashPage } from './AdminCashPage';

const fixedNow = () => new Date('2026-11-27T18:00:00.000Z');

const session = {
  id: '7',
  employeeId: '2',
  employeeName: 'Caja Uno',
  employeeUsername: 'caja1',
  openedAt: '2026-11-26T15:00:00.000000Z',
  closedAt: '2026-11-26T23:10:00.000000Z',
  closedByEmployeeId: '2',
  closedByName: 'Caja Uno',
  exceptionalCloseReason: null,
  openingAmountCents: '50000',
  cashSalesCents: '120000',
  successfulPayments: '12',
  computedExpectedCashCents: '170000',
  expectedCashCents: '170000',
  countedCashCents: '165000',
  differenceCents: '-5000',
};

const summary = {
  sessionCount: '1',
  closedCount: '1',
  openCount: '0',
  shortageCents: '-5000',
  surplusCents: '0',
  differenceCount: '1',
};

beforeEach(() => setCsrfToken('admin-test'));
afterEach(() => invalidateCsrfToken());

describe('Administración → Caja', () => {
  test('muestra faltantes y sobrantes separados sin abrir ni cerrar cajas', async () => {
    const requests: string[] = [];
    server.use(
      http.get('/api/v1/admin/cash-sessions', ({ request }) => {
        requests.push(request.url);
        return HttpResponse.json({ data: [session], summary, page: { limit: 20, nextCursor: null } });
      }),
    );
    render(<AdminCashPage now={fixedNow} />);

    expect(await screen.findByRole('heading', { name: 'Historial de caja' })).toBeInTheDocument();
    expect(await screen.findByText('Faltante total')).toBeInTheDocument();
    expect(screen.getByText('Sobrante total')).toBeInTheDocument();
    expect(screen.getAllByText('Faltante $50.00').length).toBeGreaterThan(0);
    expect(screen.getByText('Caja Uno')).toBeInTheDocument();
    expect(screen.getByText('@caja1')).toBeInTheDocument();
    expect(requests.every((url) => url.includes('/admin/cash-sessions'))).toBe(true);
    expect(requests.every((url) => !url.includes('/cash-sessions/current'))).toBe(true);
  });

  test('el detalle explica el cálculo del esperado y la diferencia', async () => {
    server.use(
      http.get('/api/v1/admin/cash-sessions', () =>
        HttpResponse.json({ data: [session], summary, page: { limit: 20, nextCursor: null } }),
      ),
    );
    render(<AdminCashPage now={fixedNow} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Detalle' }));
    const detail = screen.getByRole('region', { name: 'Caja #7' });
    expect(within(detail).getByText('Esperado calculado (fondo + efectivo)')).toBeInTheDocument();
    expect(within(detail).getByText('Efectivo contado')).toBeInTheDocument();
    expect(within(detail).getAllByText('$1,700.00').length).toBeGreaterThan(0);
    expect(within(detail).getByText('$1,650.00')).toBeInTheDocument();
  });

  test('sin cajas muestra un estado vacío verificable', async () => {
    server.use(
      http.get('/api/v1/admin/cash-sessions', () =>
        HttpResponse.json({
          data: [],
          summary: {
            sessionCount: '0',
            closedCount: '0',
            openCount: '0',
            shortageCents: '0',
            surplusCents: '0',
            differenceCount: '0',
          },
          page: { limit: 20, nextCursor: null },
        }),
      ),
    );
    render(<AdminCashPage now={fixedNow} />);
    expect(
      await screen.findByText('No hay cajas que coincidan con el periodo y los filtros.'),
    ).toBeInTheDocument();
  });

  test('una respuesta no verificable no se presenta como historial', async () => {
    server.use(
      http.get('/api/v1/admin/cash-sessions', () =>
        HttpResponse.json({ data: [session], summary, page: { limit: 20, nextCursor: null, extra: true } }),
      ),
    );
    render(<AdminCashPage now={fixedNow} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se puede verificar/i);
  });
});

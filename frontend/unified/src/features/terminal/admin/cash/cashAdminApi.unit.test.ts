import { describe, expect, test } from 'vitest';
import {
  buildAdminCashQuery,
  parseAdminCashPage,
  UnverifiableAdminCashError,
} from './cashAdminApi';

const from = '2026-11-01T08:00:00.000Z';
const to = '2026-11-27T08:00:00.000Z';

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

describe('consulta administrativa de caja', () => {
  test('construye un query estricto con filtros opcionales y cursor', () => {
    const query = buildAdminCashQuery({ from, to, status: 'CLOSED', difference: 'SHORTAGE' }, 'abc', 50);
    const params = new URLSearchParams(query);
    expect(params.get('from')).toBe(from);
    expect(params.get('to')).toBe(to);
    expect(params.get('status')).toBe('CLOSED');
    expect(params.get('difference')).toBe('SHORTAGE');
    expect(params.get('limit')).toBe('50');
    expect(params.get('cursor')).toBe('abc');
  });

  test('rechaza una diferencia combinada con cajas abiertas', () => {
    expect(() => buildAdminCashQuery({ from, to, status: 'OPEN', difference: 'NONE' })).toThrow(
      TypeError,
    );
  });

  test('rechaza rangos invertidos o mayores a un año', () => {
    expect(() => buildAdminCashQuery({ from: to, to: from })).toThrow(TypeError);
    expect(() =>
      buildAdminCashQuery({ from: '2024-01-01T00:00:00.000Z', to: '2026-01-01T00:00:00.000Z' }),
    ).toThrow(TypeError);
  });

  test('parsea la página verificable y conserva los importes como cadenas', () => {
    const page = parseAdminCashPage({
      data: [session],
      summary,
      page: { limit: 20, nextCursor: null },
    });
    expect(page.items[0]!.differenceCents).toBe('-5000');
    expect(page.summary.shortageCents).toBe('-5000');
    expect(page.nextCursor).toBeNull();
  });

  test('rechaza diferencias que no coinciden con contado menos esperado', () => {
    expect(() =>
      parseAdminCashPage({
        data: [{ ...session, differenceCents: '-1000' }],
        summary,
        page: { limit: 20, nextCursor: null },
      }),
    ).toThrow(UnverifiableAdminCashError);
  });

  test('rechaza resúmenes incoherentes o con sobrante negativo', () => {
    expect(() =>
      parseAdminCashPage({
        data: [],
        summary: { ...summary, sessionCount: '2' },
        page: { limit: 20, nextCursor: null },
      }),
    ).toThrow(UnverifiableAdminCashError);
    expect(() =>
      parseAdminCashPage({
        data: [],
        summary: { ...summary, shortageCents: '1', surplusCents: '0', differenceCount: '0' },
        page: { limit: 20, nextCursor: null },
      }),
    ).toThrow(UnverifiableAdminCashError);
  });
});

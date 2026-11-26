import { afterEach, describe, expect, test } from 'vitest';
import { HttpResponse, http } from 'msw';
import { ApiError, invalidateCsrfToken, setCsrfToken } from '../../../shared/api/client';
import { clearIdempotencyOperations } from '../../../shared/api/idempotency';
import { server } from '../../../test/server';
import {
  UnverifiableCashSessionResponseError,
  formatCashError,
  getCurrentCashSession,
  parseMxnAmountToCents,
  prepareCashClose,
  prepareCashOpen,
  sendCashClose,
  sendCashOpen,
} from './cashApi';
import { mayCloseCashSession, requiresExceptionalCloseReason } from './cashSessionRules';

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

const closedSession = {
  ...openSession,
  closedAt: '2099-01-01T13:00:00.000Z',
  closedByEmployeeId: '2',
  expectedCashCents: '50000',
  countedCashCents: '49000',
  differenceCents: '-1000',
};

afterEach(() => {
  invalidateCsrfToken();
  clearIdempotencyOperations();
});

describe('cash session API and rules (TASK-14)', () => {
  test('parses MXN amounts as integer cents without floating point', () => {
    expect(parseMxnAmountToCents('500')).toBe('50000');
    expect(parseMxnAmountToCents(' 0.05 ')).toBe('5');
    expect(parseMxnAmountToCents('1234.5')).toBe('123450');
    expect(() => parseMxnAmountToCents('12.345')).toThrow('importe válido');
    expect(() => parseMxnAmountToCents('-5')).toThrow('importe válido');
    expect(() => parseMxnAmountToCents('1,000')).toThrow('importe válido');
  });

  test('reads current session including the nullable empty state', async () => {
    server.use(
      http.get('/api/v1/cash-sessions/current', () => HttpResponse.json({ data: null })),
    );
    expect(await getCurrentCashSession()).toBeNull();

    server.use(http.get('/api/v1/cash-sessions/current', () => HttpResponse.json({ data: openSession })));
    expect((await getCurrentCashSession())?.id).toBe('1');

    server.use(http.get('/api/v1/cash-sessions/current', () => HttpResponse.json({ data: { id: '1' } })));
    await expect(getCurrentCashSession()).rejects.toBeInstanceOf(UnverifiableCashSessionResponseError);
  });

  test('opens and closes with immutable keys and exact contract bodies', async () => {
    setCsrfToken('csrf-test');
    const keys: Array<string | undefined> = [];
    const bodies: unknown[] = [];
    server.use(
      http.post('/api/v1/cash-sessions', async ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key') ?? undefined);
        bodies.push(await request.json());
        return HttpResponse.json({ data: openSession }, { status: 201 });
      }),
      http.post('/api/v1/cash-sessions/1/close', async ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key') ?? undefined);
        bodies.push(await request.json());
        expect(request.headers.get('X-CSRF-Token')).toBe('csrf-test');
        return HttpResponse.json({ data: closedSession });
      }),
    );

    const open = prepareCashOpen('50000');
    expect((await sendCashOpen(open)).employeeId).toBe('2');
    const close = prepareCashClose('1', { countedCashCents: '49000' });
    expect((await sendCashClose('1', close)).differenceCents).toBe('-1000');
    expect(bodies).toEqual([{ openingAmountCents: '50000' }, { countedCashCents: '49000' }]);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(keys[0]).not.toBe(keys[1]);
  });

  test('reuses the same key and body for an uncertain close retry', async () => {
    setCsrfToken('csrf-test');
    const keys: Array<string | undefined> = [];
    const bodies: unknown[] = [];
    let attempt = 0;
    server.use(http.post('/api/v1/cash-sessions/1/close', async ({ request }) => {
      keys.push(request.headers.get('Idempotency-Key') ?? undefined);
      bodies.push(await request.json());
      attempt += 1;
      if (attempt === 1) return HttpResponse.json({ code: 'DEPENDENCY_UNAVAILABLE' }, { status: 503 });
      return HttpResponse.json({ data: closedSession });
    }));
    const operation = prepareCashClose('1', { countedCashCents: '49000' });
    await expect(sendCashClose('1', operation)).rejects.toMatchObject({ status: 503 });
    expect((await sendCashClose('1', operation)).differenceCents).toBe('-1000');
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(keys[0]).toBe(keys[1]);
    expect(bodies).toEqual([{ countedCashCents: '49000' }, { countedCashCents: '49000' }]);
  });

  test('requires a non-empty reason only for an administrator closing another session', () => {
    const owner = { id: '2', role: 'CAJERO' };
    const admin = { id: '3', role: 'ADMINISTRADOR' };
    const otherCashier = { id: '4', role: 'CAJERO' };

    expect(mayCloseCashSession(openSession, owner)).toBe(true);
    expect(requiresExceptionalCloseReason(openSession, owner)).toBe(false);
    expect(mayCloseCashSession(openSession, admin)).toBe(true);
    expect(requiresExceptionalCloseReason(openSession, admin)).toBe(true);
    expect(mayCloseCashSession(openSession, otherCashier)).toBe(false);
    expect(() => prepareCashClose('1', { countedCashCents: '49000', exceptionalCloseReason: '   ' })).not.toThrow();
    expect(() => prepareCashClose('1', { countedCashCents: 'x' })).toThrow('Importe contado');
  });

  test('formats conflict and permission errors without guessing server state', () => {
    expect(formatCashError(new ApiError(403, '403', { code: 'FORBIDDEN' }))).toContain('permiso');
    expect(formatCashError(new ApiError(409, '409', { code: 'CASH_CONFLICT' }))).toContain('cambió de estado');
    expect(formatCashError(new ApiError(404, '404'))).toContain('No encontramos');
    expect(formatCashError(new UnverifiableCashSessionResponseError())).toContain('No repitas');
  });
});

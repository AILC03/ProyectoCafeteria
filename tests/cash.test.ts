import { randomBytes } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { cashOpen, cashClose, cents } from '../src/modules/cash/cash.validation.js';
import { cashCharge } from '../src/modules/payments/payments.validation.js';
import { cashChange, checkedCents } from '../src/modules/cash/cash.rules.js';
import { TicketCipher, ticketCipherConfiguration } from '../src/modules/tickets/tickets.cipher.js';
describe('caja: importes y validación', () => {
  it.each(['-1', '1.5', '01', '1e3', '+1', ' 1', '9223372036854775808', 1, null])(
    'rechaza importe %j',
    (value) => {
      expect(cents.safeParse(value).success).toBe(false);
    },
  );
  it('BIGINT exacto y rangos/diferencia, sin flotantes', () => {
    expect(cents.parse('9007199254740993')).toBe(9007199254740993n);
    expect(cents.parse('9223372036854775807')).toBe(9223372036854775807n);
    expect(cashChange(6500n, 10000n)).toBe(3500n);
    expect(() => cashChange(6500n, 6000n)).toThrow();
    expect(() => cashChange(6500n, 10000n, 3499n)).toThrow();
    expect(() => checkedCents(9223372036854775808n)).toThrow();
  });
  it('no acepta total/esperado/cambio manipulados ni campos extra', () => {
    expect(cashOpen.safeParse({ openingAmountCents: '0', employeeId: '1' }).success).toBe(false);
    expect(cashClose.safeParse({ countedCashCents: '0', expectedCashCents: '0' }).success).toBe(
      false,
    );
    expect(
      cashCharge.safeParse({
        orderId: '1',
        cashSessionId: '1',
        cashReceivedCents: '1000',
        totalCents: '1',
      }).success,
    ).toBe(false);
    expect(
      cashClose.safeParse({ countedCashCents: '0', exceptionalCloseReason: '   ' }).success,
    ).toBe(false);
  });
});
describe('ticket: cifrado con contexto y configuración sin fallback', () => {
  it('no habilita cifrado por defecto ni acepta claves compartidas', () => {
    expect(ticketCipherConfiguration({})).toBeUndefined();
    expect(() => ticketCipherConfiguration({ TICKET_ENCRYPTION_KEY: 'short' })).toThrow();
    const key = randomBytes(32).toString('hex');
    expect(() =>
      ticketCipherConfiguration({ TICKET_ENCRYPTION_KEY: key, AUTH_JWT_SECRET: key }),
    ).toThrow();
    expect(() =>
      ticketCipherConfiguration({ TICKET_ENCRYPTION_KEY: key.toUpperCase(), AUTH_JWT_SECRET: key }),
    ).toThrow();
  });
  it('AEAD impide traslado a otra venta, manipulación, clave o versión ajena', () => {
    const cipher = new TicketCipher(randomBytes(32).toString('hex'));
    const token = randomBytes(32).toString('base64url'),
      encrypted = cipher.seal(token, 1n);
    expect(encrypted.includes(token)).toBe(false);
    expect(cipher.open(encrypted, 1n, 'v1') === token).toBe(true);
    expect(() => cipher.open(encrypted, 2n, 'v1')).toThrow();
    expect(() => cipher.open(encrypted, 1n, 'v2')).toThrow();
    const tampered =
      encrypted.slice(0, 20) + (encrypted[20] === 'A' ? 'B' : 'A') + encrypted.slice(21);
    expect(() => cipher.open(tampered, 1n, 'v1')).toThrow();
    expect(() =>
      new TicketCipher(randomBytes(32).toString('hex')).open(encrypted, 1n, 'v1'),
    ).toThrow();
  });
});

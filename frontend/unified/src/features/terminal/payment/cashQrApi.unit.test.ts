import { describe, expect, test } from 'vitest';
import { cashQrToken, formatCashQrError } from './cashQrApi';
import { ApiError } from '../../../shared/api/client';

const TOKEN = 'A'.repeat(43);

describe('cash QR scanning', () => {
  test('accepts the raw token and the exact cash payload', () => {
    expect(cashQrToken(TOKEN)).toBe(TOKEN);
    expect(cashQrToken(`  cafeteria:cash:${TOKEN}  `)).toBe(TOKEN);
  });

  test('rejects URLs, other QR purposes and malformed tokens', () => {
    expect(cashQrToken(`https://cafeteria.test/pago?token=${TOKEN}`)).toBeNull();
    expect(cashQrToken(`cafeteria:register:${TOKEN}`)).toBeNull();
    expect(cashQrToken('A'.repeat(42))).toBeNull();
    expect(cashQrToken('')).toBeNull();
  });

  test('maps scanning errors to operational messages without leaking payloads', () => {
    expect(formatCashQrError(new ApiError(404, 'Not found'))).toContain('no corresponde');
    expect(formatCashQrError(new ApiError(409, 'Conflict'))).toContain('ya fue pagada');
    expect(formatCashQrError(new TypeError('El código QR no es válido.'))).toContain('no es válido');
  });
});

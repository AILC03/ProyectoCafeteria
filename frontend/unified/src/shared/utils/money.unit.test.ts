import { describe, expect, it } from 'vitest';
import { addCents, formatMxnCents, multiplyCents, parseCentsBigInt, sumCents } from './money';

describe('money utilities (BigInt cents)', () => {
  it('parses decimal integer strings and handles invalid/empty inputs safely', () => {
    expect(parseCentsBigInt('6500')).toBe(6500n);
    expect(parseCentsBigInt('  105  ')).toBe(105n);
    expect(parseCentsBigInt('-250')).toBe(-250n);
    expect(parseCentsBigInt('')).toBe(0n);
    expect(parseCentsBigInt(null)).toBe(0n);
    expect(parseCentsBigInt(undefined)).toBe(0n);
    expect(parseCentsBigInt('12.34')).toBe(0n);
    expect(parseCentsBigInt('abc')).toBe(0n);
  });

  it('adds, sums, and multiplies decimal cent strings without float drift', () => {
    expect(addCents('6500', '1000')).toBe('7500');
    expect(sumCents(['6500', '1000', '500'])).toBe('8000');
    expect(sumCents([])).toBe('0');
    expect(multiplyCents('6500', 3)).toBe('19500');
    expect(multiplyCents('6500', 0)).toBe('0');
    expect(multiplyCents('6500', -2)).toBe('0');
    expect(addCents('900719925474099100', '200')).toBe('900719925474099300');
  });

  it('formats MXN cents cleanly without floating-point conversion', () => {
    expect(formatMxnCents('0')).toBe('$0.00');
    expect(formatMxnCents('5')).toBe('$0.05');
    expect(formatMxnCents('6500')).toBe('$65.00');
    expect(formatMxnCents('123456')).toBe('$1,234.56');
    expect(formatMxnCents('-150')).toBe('-$1.50');
    expect(formatMxnCents(null)).toBe('$0.00');
    expect(formatMxnCents('900719925474099300')).toBe('$9,007,199,254,740,993.00');
  });
});

import { describe, expect, it } from 'vitest';
import { addCents, formatMxnCents, multiplyCents, parseCentsBigInt, splitIncludedIva, sumCents } from './money';

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

  it('splits an IVA-inclusive total so subtotal and tax add back exactly', () => {
    expect(splitIncludedIva('6500')).toEqual({ subtotalCents: '5603', ivaCents: '897', totalCents: '6500' });
    expect(splitIncludedIva('11600')).toEqual({ subtotalCents: '10000', ivaCents: '1600', totalCents: '11600' });
    expect(splitIncludedIva('1')).toEqual({ subtotalCents: '1', ivaCents: '0', totalCents: '1' });
    expect(splitIncludedIva('0')).toEqual({ subtotalCents: '0', ivaCents: '0', totalCents: '0' });
  });

  it('keeps subtotal + IVA equal to the total for many values', () => {
    for (let cents = 0; cents <= 5000; cents += 37) {
      const breakdown = splitIncludedIva(String(cents));
      expect(BigInt(breakdown.subtotalCents) + BigInt(breakdown.ivaCents)).toBe(BigInt(breakdown.totalCents));
    }
  });
});

import { describe, expect, test } from 'vitest';
import {
  createCustomPeriod,
  createPresetPeriod,
  defaultPeriod,
  formatInteger,
  formatPercentChange,
  formatSignedInteger,
  periodQuery,
} from './periods';

describe('DA-001 business periods (America/Tijuana)', () => {
  test('defaults to Today with UTC semi-open limits in winter', () => {
    const range = defaultPeriod(new Date('2026-11-24T20:00:00.000Z'));
    expect(range).toEqual({
      preset: 'today',
      label: 'Hoy',
      from: '2026-11-24T08:00:00.000Z',
      to: '2026-11-25T08:00:00.000Z',
    });
    expect(periodQuery(range)).toEqual({ from: range.from, to: range.to });
  });

  test('uses the business date before UTC midnight', () => {
    const range = defaultPeriod(new Date('2026-11-24T07:30:00.000Z'));
    expect(range.from).toBe('2026-11-23T08:00:00.000Z');
    expect(range.to).toBe('2026-11-24T08:00:00.000Z');
  });

  test('rolls over month and year boundaries', () => {
    const range = createCustomPeriod('2026-12-31', '2027-01-01');
    expect(range.from).toBe('2026-12-31T08:00:00.000Z');
    expect(range.to).toBe('2027-01-02T08:00:00.000Z');
    const leap = createCustomPeriod('2028-02-28', '2028-02-29');
    expect(leap.from).toBe('2028-02-28T08:00:00.000Z');
    expect(leap.to).toBe('2028-03-01T08:00:00.000Z');
  });

  test('accepts exactly 366 absolute days but rejects one more', () => {
    const exact = createCustomPeriod('2026-01-01', '2027-01-01');
    expect(Date.parse(exact.to) - Date.parse(exact.from)).toBe(366 * 24 * 3600000);
    expect(() => createCustomPeriod('2026-01-01', '2027-01-02')).toThrow(/366/);
  });

  test('uses seven local calendar dates including today', () => {
    const range = createPresetPeriod('last7', new Date('2026-11-24T20:00:00.000Z'));
    expect(range.from).toBe('2026-11-18T08:00:00.000Z');
    expect(range.to).toBe('2026-11-25T08:00:00.000Z');
  });

  test('keeps thirty local dates across the autumn DST change', () => {
    const range = createPresetPeriod('last30', new Date('2026-11-24T20:00:00.000Z'));
    expect(range.from).toBe('2026-10-26T07:00:00.000Z');
    expect(range.to).toBe('2026-11-25T08:00:00.000Z');
    expect(Date.parse(range.to) - Date.parse(range.from)).toBe(30 * 24 * 3600000 + 3600000);
  });

  test('converts summer midnight with PDT offset', () => {
    const range = defaultPeriod(new Date('2026-07-01T20:00:00.000Z'));
    expect(range.from).toBe('2026-07-01T07:00:00.000Z');
    expect(range.to).toBe('2026-07-02T07:00:00.000Z');
  });

  test('uses 23 hours on the spring DST day', () => {
    const range = defaultPeriod(new Date('2026-03-08T20:00:00.000Z'));
    expect(range.from).toBe('2026-03-08T08:00:00.000Z');
    expect(range.to).toBe('2026-03-09T07:00:00.000Z');
    expect(Date.parse(range.to) - Date.parse(range.from)).toBe(23 * 3600000);
  });

  test('uses 25 hours on the autumn DST day', () => {
    const range = defaultPeriod(new Date('2026-11-01T20:00:00.000Z'));
    expect(range.from).toBe('2026-11-01T07:00:00.000Z');
    expect(range.to).toBe('2026-11-02T08:00:00.000Z');
    expect(Date.parse(range.to) - Date.parse(range.from)).toBe(25 * 3600000);
  });

  test('treats custom end dates as inclusive and rejects invalid ranges', () => {
    const range = createCustomPeriod('2026-11-01', '2026-11-02');
    expect(range.from).toBe('2026-11-01T07:00:00.000Z');
    expect(range.to).toBe('2026-11-03T08:00:00.000Z');
    expect(range.label).toBe('2026-11-01 a 2026-11-02');
    expect(() => createCustomPeriod('2026-02-30', '2026-03-01')).toThrow(/no existe/);
    expect(() => createCustomPeriod('2026-03-02', '2026-03-01')).toThrow(/posterior/);
    expect(() => createCustomPeriod('2026-01-01', '2027-01-03')).toThrow(/366/);
  });

  test('formats counts and backend percentages without recomputing', () => {
    expect(formatInteger('1234')).toBe((1234).toLocaleString('es-MX'));
    expect(formatInteger('9007199254740993')).toBe(
      (9007199254740993n).toLocaleString('es-MX'),
    );
    expect(formatSignedInteger('-4')).toBe((-4).toLocaleString('es-MX'));
    expect(formatSignedInteger('4')).toBe('4');
    for (const invalid of ['-1', '1.5', '01', '12345678901234567890']) {
      expect(() => formatInteger(invalid)).toThrow(/no es verificable/);
    }
    expect(() => formatSignedInteger('1.5')).toThrow(/no es verificable/);
    expect(formatPercentChange(null)).toBe('Sin comparación');
    expect(formatPercentChange('23.45')).toBe('+23.45 %');
    expect(formatPercentChange('0.50')).toBe('+0.50 %');
    expect(formatPercentChange('10.00')).toBe('+10.00 %');
    expect(formatPercentChange('-10.00')).toBe('-10.00 %');
    expect(formatPercentChange('-0.50')).toBe('-0.50 %');
    expect(formatPercentChange('0.00')).toBe('0.00 %');
    for (const invalid of ['-0.00', '0', '23.4', 'abc']) {
      expect(() => formatPercentChange(invalid)).toThrow(/no es verificable/);
    }
  });

  test('rejects non-UTC period boundaries before a request', () => {
    expect(() =>
      periodQuery({
        preset: 'custom',
        label: 'test',
        from: '2026-11-24T00:00:00-08:00',
        to: '2026-11-25T00:00:00.000Z',
      }),
    ).toThrow(/instantes UTC/);
    expect(
      periodQuery({
        preset: 'custom',
        label: 'microsegundos',
        from: '2026-11-24T08:00:00.123456Z',
        to: '2026-11-25T08:00:00.000Z',
      }),
    ).toEqual({
      from: '2026-11-24T08:00:00.123456Z',
      to: '2026-11-25T08:00:00.000Z',
    });
  });
});

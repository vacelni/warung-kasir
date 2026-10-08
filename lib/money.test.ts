import { describe, expect, it } from 'vitest';
import { formatRupiah } from './money';

describe('formatRupiah', () => {
  it('formats without a space between Rp and the number', () => {
    expect(formatRupiah(15000)).toBe('Rp15.000');
    expect(formatRupiah(0)).toBe('Rp0');
    expect(formatRupiah(1250000)).toBe('Rp1.250.000');
  });

  it('groups every three digits', () => {
    expect(formatRupiah(5)).toBe('Rp5');
    expect(formatRupiah(999)).toBe('Rp999');
    expect(formatRupiah(1000)).toBe('Rp1.000');
    expect(formatRupiah(100000)).toBe('Rp100.000');
    expect(formatRupiah(2147483647)).toBe('Rp2.147.483.647');
  });

  it('puts the sign before Rp', () => {
    expect(formatRupiah(-10000)).toBe('-Rp10.000');
  });

  it('rejects fractional amounts', () => {
    expect(() => formatRupiah(1500.5)).toThrow(RangeError);
    expect(() => formatRupiah(Number.NaN)).toThrow(RangeError);
  });
});

import { describe, expect, it } from 'vitest';
import { averageTransaction, calculateChange, calculateSubtotal, formatRupiah, sumMoney } from './money';

describe('calculateSubtotal', () => {
  it('multiplies unit price by quantity', () => {
    expect(calculateSubtotal(15000, 1)).toBe(15000);
    expect(calculateSubtotal(15000, 2)).toBe(30000);
    expect(calculateSubtotal(5000, 2)).toBe(10000);
  });

  it('stays exact for large quantities', () => {
    expect(calculateSubtotal(18000, 999)).toBe(17_982_000);
  });

  it.each([0, -1, 1.5, Number.NaN, Infinity])('rejects quantity %s', (quantity) => {
    expect(() => calculateSubtotal(15000, quantity)).toThrow(RangeError);
  });

  it.each([0, -5000, 1500.5, Number.NaN])('rejects unit price %s', (price) => {
    expect(() => calculateSubtotal(price, 1)).toThrow(RangeError);
  });

  it('rejects a subtotal beyond the safe integer range', () => {
    expect(() => calculateSubtotal(Number.MAX_SAFE_INTEGER, 2)).toThrow(RangeError);
  });
});

describe('sumMoney', () => {
  it('adds amounts', () => {
    expect(sumMoney([15000, 5000])).toBe(20000);
    expect(sumMoney([30000, 10000])).toBe(40000);
  });

  it('totals an empty list as zero', () => {
    expect(sumMoney([])).toBe(0);
  });

  it('rejects fractional amounts instead of accumulating float error', () => {
    expect(() => sumMoney([0.1, 0.2])).toThrow(RangeError);
  });
});

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

  it('rejects fractional and non-finite amounts', () => {
    expect(() => formatRupiah(1500.5)).toThrow(RangeError);
    expect(() => formatRupiah(Number.NaN)).toThrow(RangeError);
    expect(() => formatRupiah(Infinity)).toThrow(RangeError);
  });

  it('never inserts any whitespace, including the non-breaking space', () => {
    for (const amount of [0, 5, 15000, 1250000, -10000]) {
      expect(formatRupiah(amount)).not.toMatch(/\s/);
    }
  });
});

describe('calculateChange', () => {
  it('returns the change for an overpayment', () => {
    expect(calculateChange(40000, 50000)).toEqual({ ok: true, change: 10000 });
  });

  it('returns zero change for an exact payment', () => {
    expect(calculateChange(40000, 40000)).toEqual({ ok: true, change: 0 });
  });

  it('is invalid for an underpayment and reports the shortfall', () => {
    expect(calculateChange(40000, 30000)).toEqual({ ok: false, shortfall: 10000 });
  });

  it('rejects fractional amounts', () => {
    expect(() => calculateChange(40000.5, 50000)).toThrow(RangeError);
    expect(() => calculateChange(40000, 50000.5)).toThrow(RangeError);
  });
});

describe('averageTransaction', () => {
  it('rounds to the nearest Rupiah', () => {
    expect(averageTransaction(1250000, 32)).toBe(39063); // 39062.5 rounds up
    expect(averageTransaction(100, 3)).toBe(33);
  });

  it('is Rp0 when there are no transactions', () => {
    expect(averageTransaction(0, 0)).toBe(0);
    expect(formatRupiah(averageTransaction(0, 0))).toBe('Rp0');
  });

  it('rejects a negative or fractional count', () => {
    expect(() => averageTransaction(1000, -1)).toThrow(RangeError);
    expect(() => averageTransaction(1000, 1.5)).toThrow(RangeError);
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { averageTransaction } from '@/lib/money';
import {
  barHeight,
  bucketLabel,
  describeRange,
  hasNoSales,
  labelIndexes,
  toSeries,
  toSummary,
  toTopProducts,
} from './model';

const originalTz = process.env.TZ;
afterEach(() => {
  process.env.TZ = originalTz;
});

const summaryRow = { revenue: 80000, transaction_count: 3, item_count: 9, average_amount: 26667 };

describe('toSummary', () => {
  it('maps the single summary row', () => {
    expect(toSummary([summaryRow])).toEqual({
      revenue: 80000,
      transactionCount: 3,
      itemCount: 9,
      averageAmount: 26667,
    });
  });

  it('keeps zeros as zeros (no sales is a real answer, not a missing one)', () => {
    const empty = toSummary([{ revenue: 0, transaction_count: 0, item_count: 0, average_amount: 0 }]);
    expect(empty).toEqual({ revenue: 0, transactionCount: 0, itemCount: 0, averageAmount: 0 });
    expect(hasNoSales({ summary: empty, series: [], topProducts: [] })).toBe(true);
  });

  it('refuses a missing, empty, or doubled response instead of showing zeros', () => {
    expect(() => toSummary(null)).toThrow();
    expect(() => toSummary([])).toThrow();
    expect(() => toSummary([summaryRow, summaryRow])).toThrow();
  });

  it('refuses a fraction, a negative number, or a non-number', () => {
    expect(() => toSummary([{ ...summaryRow, revenue: 10.5 }])).toThrow();
    expect(() => toSummary([{ ...summaryRow, item_count: -1 }])).toThrow();
    expect(() => toSummary([{ ...summaryRow, average_amount: '26667' as unknown as number }])).toThrow();
  });

  // The database computes the average (round half up); the money rule in lib/money must agree with it.
  it.each([
    [80000, 3, 26667],
    [15001, 2, 7501],
    [10000, 3, 3333],
    [1250000, 32, 39063],
    [0, 0, 0],
  ])('average of %i over %i sales is %i, the same as lib/money', (revenue, count, expected) => {
    expect(averageTransaction(revenue, count)).toBe(expected);
  });
});

describe('toSeries and toTopProducts', () => {
  it('maps series rows in order', () => {
    expect(
      toSeries([
        { bucket_start: '2026-08-09T17:00:00+00:00', revenue: 65000, transaction_count: 2 },
        { bucket_start: '2026-08-10T17:00:00+00:00', revenue: 0, transaction_count: 0 },
      ]),
    ).toEqual([
      { start: '2026-08-09T17:00:00+00:00', revenue: 65000, transactionCount: 2 },
      { start: '2026-08-10T17:00:00+00:00', revenue: 0, transactionCount: 0 },
    ]);
  });

  it('rejects a missing series or a bad time', () => {
    expect(() => toSeries(null)).toThrow();
    expect(() => toSeries([{ bucket_start: 'nope', revenue: 1, transaction_count: 1 }])).toThrow();
  });

  it('maps top products and keeps the database order', () => {
    expect(
      toTopProducts([
        { product_id: 'p1', product_name: 'Es Teh', quantity: 5, revenue: 25000 },
        { product_id: 'p2', product_name: 'Nasi Goreng', quantity: 2, revenue: 30000 },
      ]).map((p) => [p.productName, p.quantity, p.revenue]),
    ).toEqual([
      ['Es Teh', 5, 25000],
      ['Nasi Goreng', 2, 30000],
    ]);
    expect(toTopProducts([])).toEqual([]);
    expect(() => toTopProducts(null)).toThrow();
  });
});

describe('chart helpers', () => {
  it('labels hour buckets as Jakarta clock time and day buckets as Jakarta day and month', () => {
    // 17:00Z is midnight in Jakarta.
    expect(bucketLabel('2026-08-09T17:00:00+00:00', 'hour')).toBe('00:00');
    expect(bucketLabel('2026-08-10T16:00:00+00:00', 'hour')).toBe('23:00');
    expect(bucketLabel('2026-08-09T17:00:00+00:00', 'day')).toBe('10 Agu');
  });

  it.each(['UTC', 'America/Los_Angeles'])('labels ignore the device timezone (%s)', (tz) => {
    process.env.TZ = tz;
    expect(bucketLabel('2026-08-09T17:00:00+00:00', 'day')).toBe('10 Agu');
    expect(bucketLabel('2026-08-09T17:00:00+00:00', 'hour')).toBe('00:00');
  });

  it('labels every bucket when there are few, and a spread when there are many', () => {
    expect(labelIndexes(1, 5)).toEqual([0]);
    expect(labelIndexes(4, 5)).toEqual([0, 1, 2, 3]);
    expect(labelIndexes(0, 5)).toEqual([]);
    expect(labelIndexes(24, 5)).toEqual([0, 6, 12, 17, 23]);
    const many = labelIndexes(366, 5);
    expect(many).toHaveLength(5);
    expect(many[0]).toBe(0);
    expect(many.at(-1)).toBe(365);
  });

  it('scales bars to the tallest, gives a sale at least one unit, and gives no sale none', () => {
    expect(barHeight(50, 100, 120)).toBe(60);
    expect(barHeight(100, 100, 120)).toBe(120);
    expect(barHeight(0, 100, 120)).toBe(0);
    expect(barHeight(1, 1_000_000, 120)).toBe(1);
    expect(barHeight(0, 0, 120)).toBe(0);
  });

  it('describes the covered days in Jakarta', () => {
    expect(describeRange({ from: '2026-10-07T17:00:00.000Z', to: '2026-10-08T17:00:00.000Z', bucket: 'hour', days: 1 })).toBe(
      'Kamis, 8 Okt 2026',
    );
    expect(describeRange({ from: '2026-08-09T17:00:00.000Z', to: '2026-08-13T17:00:00.000Z', bucket: 'day', days: 4 })).toBe(
      '10/08/2026 – 13/08/2026',
    );
  });
});

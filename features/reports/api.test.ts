import { describe, expect, it, vi } from 'vitest';
import { fakeSupabase, type FakeResult, type RecordedQuery } from '@/lib/test-support/fakeSupabase';
import { getReport, TOP_PRODUCT_COUNT } from './api';
import type { ReportRange } from './range';

const mocks = vi.hoisted(() => ({ supabase: null as unknown }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.supabase }));

const RANGE: ReportRange = {
  from: '2026-08-09T17:00:00.000Z',
  to: '2026-08-11T17:00:00.000Z',
  bucket: 'day',
  days: 2,
};

const ok = (data: unknown): FakeResult => ({ data, error: null });

function useDatabase(result: (query: RecordedQuery) => FakeResult) {
  const fake = fakeSupabase(result);
  mocks.supabase = fake.supabase;
  return fake.queries;
}

const healthy = (query: RecordedQuery): FakeResult => {
  switch (query.table) {
    case 'rpc:sales_summary':
      return ok([{ revenue: 80000, transaction_count: 3, item_count: 9, average_amount: 26667 }]);
    case 'rpc:sales_series':
      return ok([{ bucket_start: '2026-08-09T17:00:00+00:00', revenue: 65000, transaction_count: 2 }]);
    case 'rpc:top_products':
      return ok([{ product_id: 'p1', product_name: 'Es Teh', quantity: 5, revenue: 25000 }]);
    default:
      throw new Error(`Unexpected query on ${query.table}`);
  }
};

describe('getReport', () => {
  it('asks the database for the three aggregates with the window, and nothing else', async () => {
    const queries = useDatabase(healthy);
    const report = await getReport(RANGE);

    expect(queries.map((q) => q.table).sort()).toEqual(['rpc:sales_series', 'rpc:sales_summary', 'rpc:top_products']);
    const args = Object.fromEntries(queries.map((q) => [q.table, q.steps[0]?.[1]]));
    expect(args['rpc:sales_summary']).toEqual({ p_from: RANGE.from, p_to: RANGE.to });
    expect(args['rpc:sales_series']).toEqual({ p_from: RANGE.from, p_to: RANGE.to, p_bucket: 'day' });
    expect(args['rpc:top_products']).toEqual({ p_from: RANGE.from, p_to: RANGE.to, p_limit: TOP_PRODUCT_COUNT });

    expect(report.summary.revenue).toBe(80000);
    expect(report.series).toHaveLength(1);
    expect(report.topProducts[0]?.productName).toBe('Es Teh');
  });

  it('never sends a store id (the database takes it from the signed-in profile)', async () => {
    const queries = useDatabase(healthy);
    await getReport(RANGE);
    expect(JSON.stringify(queries)).not.toMatch(/store/i);
  });

  it('sends the hour bucket for a one-day range', async () => {
    const queries = useDatabase(healthy);
    await getReport({ ...RANGE, bucket: 'hour', days: 1 });
    expect(queries.find((q) => q.table === 'rpc:sales_series')?.steps[0]?.[1]).toMatchObject({ p_bucket: 'hour' });
  });

  it.each(['rpc:sales_summary', 'rpc:sales_series', 'rpc:top_products'])(
    'fails (never zeros) when %s fails',
    async (failing) => {
      useDatabase((query) =>
        query.table === failing ? { data: null, error: { code: '42501', message: 'denied' } } : healthy(query),
      );
      await expect(getReport(RANGE)).rejects.toThrow(/denied/);
    },
  );

  it('fails on a summary that is not exactly one row', async () => {
    useDatabase((query) => (query.table === 'rpc:sales_summary' ? ok([]) : healthy(query)));
    await expect(getReport(RANGE)).rejects.toThrow(/unexpected summary/);
  });
});

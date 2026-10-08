import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, type FakeResult, type RecordedQuery } from '@/lib/test-support/fakeSupabase';
import { PAGE_SIZE, getTransaction, listTransactions, type HistoryQuery } from './api';

const mocks = vi.hoisted(() => ({ supabase: null as unknown }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.supabase }));

const ok = (data: unknown): FakeResult => ({ data, error: null });
const failure = (message = 'boom'): FakeResult => ({ data: null, error: { code: 'PGRST000', message } });

function useDatabase(result: (query: RecordedQuery) => FakeResult) {
  const fake = fakeSupabase(result);
  mocks.supabase = fake.supabase;
  return fake.queries;
}

function row(n: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    code: `TRX-20261007-${String(n).padStart(6, '0')}`,
    cashier_id: 'cashier-1',
    total: 40000,
    paid_amount: 50000,
    change_amount: 10000,
    status: 'completed',
    created_at: `2026-10-07T03:${String(60 - n).padStart(2, '0')}:00.123456+00:00`,
    cashier: { name: 'Andi' },
    transaction_items: [{ quantity: 2 }, { quantity: 2 }],
    ...overrides,
  };
}

const ALL: HistoryQuery = {
  search: '',
  range: { from: null, to: null },
  order: 'newest',
  cashierId: null,
  after: null,
};

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

const stepNames = (query: RecordedQuery | undefined) => query?.steps.map(([name]) => name);

describe('listTransactions', () => {
  it('reads only what the list shows: header columns, the cashier name, and item quantities (no names or prices)', async () => {
    const queries = useDatabase(() => ok([]));

    await listTransactions(ALL);

    const select = queries[0]?.steps.find(([name]) => name === 'select');
    expect(select?.[1]).toContain('cashier:profiles!transactions_cashier_id_fkey(name)');
    expect(select?.[1]).toContain('transaction_items(quantity)');
    expect(select?.[1]).not.toContain('product_name');
    expect(select?.[1]).not.toContain('unit_price');
    expect(select?.[1]).not.toContain('synced_at');
  });

  it('owner: no cashier filter (RLS gives the whole store)', async () => {
    const queries = useDatabase(() => ok([]));
    await listTransactions({ ...ALL, cashierId: null });
    expect(queries[0]?.steps.some(([name, column]) => name === 'eq' && column === 'cashier_id')).toBe(false);
  });

  it('cashier: also asks for their own sales only, on top of RLS', async () => {
    const queries = useDatabase(() => ok([]));
    await listTransactions({ ...ALL, cashierId: 'cashier-1' });
    expect(queries[0]?.steps).toContainEqual(['eq', 'cashier_id', 'cashier-1']);
  });

  it('sorts newest first by (created_at, id) and asks for one extra row', async () => {
    const queries = useDatabase(() => ok([]));
    await listTransactions(ALL);

    expect(queries[0]?.steps).toEqual(
      expect.arrayContaining([
        ['order', 'created_at', { ascending: false }],
        ['order', 'id', { ascending: false }],
        ['limit', PAGE_SIZE + 1],
      ]),
    );
  });

  it('sorts oldest first ascending on both keys', async () => {
    const queries = useDatabase(() => ok([]));
    await listTransactions({ ...ALL, order: 'oldest' });

    expect(queries[0]?.steps).toEqual(
      expect.arrayContaining([
        ['order', 'created_at', { ascending: true }],
        ['order', 'id', { ascending: true }],
      ]),
    );
  });

  it('filters the sale time window: from inclusive, to exclusive', async () => {
    const queries = useDatabase(() => ok([]));
    await listTransactions({ ...ALL, range: { from: '2026-10-06T17:00:00.000Z', to: '2026-10-07T17:00:00.000Z' } });

    expect(queries[0]?.steps).toEqual(
      expect.arrayContaining([
        ['gte', 'created_at', '2026-10-06T17:00:00.000Z'],
        ['lt', 'created_at', '2026-10-07T17:00:00.000Z'],
      ]),
    );
  });

  it('searches the display code only, case-insensitively, never the UUID', async () => {
    const queries = useDatabase(() => ok([]));
    await listTransactions({ ...ALL, search: '3f9a' });

    expect(queries[0]?.steps).toContainEqual(['ilike', 'code', '%3f9a%']);
    expect(queries[0]?.steps.some(([name, column]) => name === 'ilike' && column === 'id')).toBe(false);
  });

  it('sends no search or window filter when none is set', async () => {
    const queries = useDatabase(() => ok([]));
    await listTransactions(ALL);
    expect(stepNames(queries[0])).toEqual(['select', 'retry', 'order', 'order', 'limit']);
  });

  it('fails fast offline: no automatic retry, so this device’s own sales show without a ~7 s wait', async () => {
    const queries = useDatabase(() => ok([]));
    await listTransactions(ALL);
    expect(queries[0]?.steps).toContainEqual(['retry', false]);
  });

  it('continues after a cursor with a keyset condition, keeping the exact timestamp string', async () => {
    const queries = useDatabase(() => ok([]));
    const createdAt = '2026-10-07T03:32:00.123456+00:00';
    await listTransactions({ ...ALL, after: { createdAt, id: 'abc' } });

    expect(queries[0]?.steps).toContainEqual([
      'or',
      `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.abc)`,
    ]);
  });

  it('flips the keyset direction when sorting oldest first', async () => {
    const queries = useDatabase(() => ok([]));
    await listTransactions({ ...ALL, order: 'oldest', after: { createdAt: '2026-10-07T03:32:00+00:00', id: 'abc' } });

    expect(queries[0]?.steps).toContainEqual([
      'or',
      'created_at.gt.2026-10-07T03:32:00+00:00,and(created_at.eq.2026-10-07T03:32:00+00:00,id.gt.abc)',
    ]);
  });

  it('maps a row: server status, cashier name, and the unit count (4, not 2 lines)', async () => {
    useDatabase(() => ok([row(1)]));

    const page = await listTransactions(ALL);

    expect(page.entries).toEqual([
      {
        id: '00000000-0000-4000-8000-000000000001',
        code: 'TRX-20261007-000001',
        createdAt: '2026-10-07T03:59:00.123456+00:00',
        total: 40000,
        paidAmount: 50000,
        changeAmount: 10000,
        cashierId: 'cashier-1',
        cashierName: 'Andi',
        itemCount: 4,
        source: 'server',
        serverStatus: 'completed',
        syncStatus: null,
      },
    ]);
    expect(page.next).toBeNull();
  });

  it('keeps a missing cashier profile as an unknown name, not a crash', async () => {
    useDatabase(() => ok([row(1, { cashier: null })]));
    expect((await listTransactions(ALL)).entries[0]?.cashierName).toBeNull();
  });

  it('a full page plus one extra row means more exist: the extra row is dropped and the cursor is the last shown row', async () => {
    const rows = Array.from({ length: PAGE_SIZE + 1 }, (_, index) => row(index + 1));
    useDatabase(() => ok(rows));

    const page = await listTransactions(ALL);

    expect(page.entries).toHaveLength(PAGE_SIZE);
    const last = rows[PAGE_SIZE - 1]!;
    expect(page.next).toEqual({ createdAt: last.created_at, id: last.id });
    expect(page.entries.some((entry) => entry.id === rows[PAGE_SIZE]!.id)).toBe(false);
  });

  it('exactly a full page has no next page (no empty trailing page)', async () => {
    useDatabase(() => ok(Array.from({ length: PAGE_SIZE }, (_, index) => row(index + 1))));

    const page = await listTransactions(ALL);

    expect(page.entries).toHaveLength(PAGE_SIZE);
    expect(page.next).toBeNull();
  });

  it('rejects an unknown server status instead of showing it', async () => {
    useDatabase(() => ok([row(1, { status: 'syncing' })]));
    await expect(listTransactions(ALL)).rejects.toThrow('unknown status');
  });

  it('throws with the database message when the read fails', async () => {
    useDatabase(() => failure('offline'));
    await expect(listTransactions(ALL)).rejects.toThrow('Could not load the transaction history: offline');
  });
});

describe('getTransaction', () => {
  const detailRow = row(1, {
    transaction_items: [
      { product_name: 'Nasi Goreng', unit_price: 15000, quantity: 2, subtotal: 30000 },
      { product_name: 'Es Teh', unit_price: 5000, quantity: 2, subtotal: 10000 },
    ],
  });

  it('reads one row by id with its item snapshot', async () => {
    const queries = useDatabase(() => ok(detailRow));

    const detail = await getTransaction(detailRow.id);

    const select = queries[0]?.steps.find(([name]) => name === 'select');
    expect(select?.[1]).toContain('transaction_items(product_name, unit_price, quantity, subtotal)');
    expect(queries[0]?.steps).toContainEqual(['eq', 'id', detailRow.id]);
    expect(queries[0]?.steps.some(([name]) => name === 'maybeSingle')).toBe(true);
    expect(queries[0]?.steps).toContainEqual(['retry', false]);
    expect(detail).toMatchObject({
      code: 'TRX-20261007-000001',
      source: 'server',
      serverStatus: 'completed',
      itemCount: 4,
      lines: [
        { productName: 'Es Teh', unitPrice: 5000, quantity: 2, subtotal: 10000 },
        { productName: 'Nasi Goreng', unitPrice: 15000, quantity: 2, subtotal: 30000 },
      ],
    });
  });

  it('returns null when the row is not visible to the caller (missing, other store, other cashier)', async () => {
    useDatabase(() => ok(null));
    expect(await getTransaction('00000000-0000-4000-8000-000000000009')).toBeNull();
  });

  it('throws when the read fails, so the caller can tell "unreachable" from "not found"', async () => {
    useDatabase(() => failure('offline'));
    await expect(getTransaction(detailRow.id)).rejects.toThrow('Could not load the transaction: offline');
  });
});

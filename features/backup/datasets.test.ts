import { describe, expect, it, vi } from 'vitest';
import { toCsv } from '@/lib/csv';
import { fakeSupabase, type FakeResult, type RecordedQuery } from '@/lib/test-support/fakeSupabase';
import { DATASETS, describeOptions, exportFileName, readAllRows, type DatasetKey } from './datasets';

const mocks = vi.hoisted(() => ({ supabase: null as unknown }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.supabase }));

const STORE = 'store-a';

function useDatabase(result: (query: RecordedQuery) => FakeResult) {
  const fake = fakeSupabase(result);
  mocks.supabase = fake.supabase;
  return fake.queries;
}

/** Serves `rows` once (first page), then an empty page. */
function onePage(rows: unknown[]) {
  return (query: RecordedQuery): FakeResult => {
    const range = query.steps.find(([step]) => step === 'range');
    return { data: range?.[1] === 0 ? rows : [], error: null };
  };
}

const dataset = (key: DatasetKey) => DATASETS.find((d) => d.key === key)!;

describe('readAllRows', () => {
  it('keeps paging past the server row cap until an empty page', async () => {
    const ranges: Array<[number, number]> = [];
    const sizes = [1000, 1000, 5, 0];
    const rows = await readAllRows('things', async (from, to) => {
      ranges.push([from, to]);
      return { data: Array.from({ length: sizes[ranges.length - 1] ?? 0 }, (_, i) => from + i), error: null };
    });
    expect(rows).toHaveLength(2005);
    expect(rows.at(-1)).toBe(2004);
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
      [2005, 3004],
    ]);
  });

  it('keeps going when the server caps pages below the requested size', async () => {
    const pages = [[1, 2], [3], []];
    const rows = await readAllRows('things', async () => ({ data: pages.shift() ?? [], error: null }));
    expect(rows).toEqual([1, 2, 3]);
  });

  it('fails loudly instead of exporting a partial file', async () => {
    let call = 0;
    await expect(
      readAllRows('transactions', async () => (++call === 1 ? { data: [1], error: null } : { data: null, error: { message: 'timeout' } })),
    ).rejects.toThrow('Could not read transactions: timeout');
  });
});

describe('datasets', () => {
  it('exports the six tables of PRD §27 and the menu options', () => {
    expect(DATASETS.map((d) => d.key).sort()).toEqual([
      'categories',
      'option_choices',
      'product_options',
      'products',
      'profiles',
      'store',
      'transaction_items',
      'transactions',
    ]);
  });

  it('scopes every query to the signed-in store and orders on a unique key', async () => {
    const queries = useDatabase(() => ({ data: [], error: null }));
    for (const d of DATASETS) await d.load(STORE);
    expect(queries).toHaveLength(8);
    for (const query of queries) {
      const filter = query.table === 'stores' ? ['eq', 'id', STORE] : ['eq', 'store_id', STORE];
      expect(query.steps).toContainEqual(filter);
      const orders = query.steps.filter(([step]) => step === 'order').map(([, column]) => column);
      // product_option_groups has no id column; its primary key is (product_id, group_id).
      expect(orders.at(-1)).toBe(query.table === 'product_option_groups' ? 'group_id' : 'id');
    }
  });

  it('writes transactions with Jakarta times and the cashier name', async () => {
    useDatabase(
      onePage([
        {
          id: 't1',
          store_id: STORE,
          code: 'TRX-20260811-E40000',
          cashier_id: 'c1',
          status: 'completed',
          total: 15000,
          paid_amount: 20000,
          change_amount: 5000,
          // 00:30 WIB on 11 Aug is still 10 Aug in UTC.
          created_at: '2026-08-10T17:30:00+00:00',
          synced_at: '2026-08-10T17:31:00+00:00',
          cashier: { name: 'Andi' },
        },
      ]),
    );
    const table = await dataset('transactions').load(STORE);
    expect(table.columns).toEqual([
      'id',
      'code',
      'store_id',
      'cashier_id',
      'cashier_name',
      'status',
      'total',
      'paid_amount',
      'change_amount',
      'created_at',
      'tanggal_wib',
      'waktu_wib',
      'synced_at',
      'time_flag',
    ]);
    expect(table.rows).toEqual([
      [
        't1',
        'TRX-20260811-E40000',
        STORE,
        'c1',
        'Andi',
        'completed',
        15000,
        20000,
        5000,
        '2026-08-11T00:30:00.000+07:00',
        '11/08/2026',
        '00:30',
        '2026-08-11T00:31:00.000+07:00',
        '',
      ],
    ]);
  });

  it('flags sale times to check in time_flag, without changing them (SEC-06)', async () => {
    const row = (id: string, created_at: string, synced_at: string) => ({
      id, store_id: STORE, code: 'TRX-X', cashier_id: 'c1', status: 'completed', total: 1, paid_amount: 1, change_amount: 0,
      created_at, synced_at, cashier: { name: 'Andi' },
    });
    useDatabase(
      onePage([
        row('ahead', '2026-08-10T17:40:00+00:00', '2026-08-10T17:30:00+00:00'),
        row('late', '2026-08-08T10:00:00+00:00', '2026-08-10T10:00:00+00:00'),
        row('ok', '2026-08-10T17:30:00+00:00', '2026-08-10T17:30:05+00:00'),
      ]),
    );
    const table = await dataset('transactions').load(STORE);
    const flag = table.columns.indexOf('time_flag');
    const soldAt = table.columns.indexOf('created_at');
    expect(table.rows.map((r) => [r[0], r[flag]])).toEqual([['ahead', 'future'], ['late', 'late'], ['ok', '']]);
    expect(table.rows[0]![soldAt]).toBe('2026-08-11T00:40:00.000+07:00');
  });

  it('exports products with their category name, inactive ones included', async () => {
    useDatabase(
      onePage([
        {
          id: 'p1',
          store_id: STORE,
          category_id: 'k1',
          name: 'Nasi Rames',
          price: 13000,
          is_active: false,
          created_at: '2026-10-01T00:00:00+00:00',
          updated_at: '2026-10-01T00:00:00+00:00',
          category: { name: 'Makanan' },
        },
      ]),
    );
    const table = await dataset('products').load(STORE);
    expect(table.rows[0]?.slice(0, 7)).toEqual(['p1', STORE, 'k1', 'Makanan', 'Nasi Rames', 13000, false]);
  });

  it('writes the options and note of each sold line as readable text', async () => {
    useDatabase(
      onePage([
        {
          id: 'i1',
          transaction_id: 't1',
          store_id: STORE,
          product_id: 'p1',
          product_name: 'Geprek',
          unit_price: 19000,
          quantity: 2,
          subtotal: 38000,
          options: [
            { group: 'Level', name: 'Level 3', price: 0 },
            { group: 'Nasi', name: 'Pakai nasi', price: 4000 },
          ],
          note: 'sambal dipisah',
        },
        {
          id: 'i2',
          transaction_id: 't1',
          store_id: STORE,
          product_id: 'p2',
          product_name: 'Es Teh',
          unit_price: 5000,
          quantity: 1,
          subtotal: 5000,
          options: [],
          note: null,
        },
      ]),
    );
    const table = await dataset('transaction_items').load(STORE);
    expect(table.columns).toEqual([
      'id', 'transaction_id', 'store_id', 'product_id', 'product_name', 'options', 'note', 'unit_price', 'quantity', 'subtotal',
    ]);
    expect(table.rows).toEqual([
      ['i1', 't1', STORE, 'p1', 'Geprek', 'Level: Level 3; Nasi: Pakai nasi (+4000)', 'sambal dipisah', 19000, 2, 38000],
      ['i2', 't1', STORE, 'p2', 'Es Teh', '', null, 5000, 1, 5000],
    ]);
  });

  it('exports the option choices with their group, and which groups each menu shows', async () => {
    useDatabase(
      onePage([
        {
          id: 'c1',
          store_id: STORE,
          group_id: 'g1',
          name: 'Pakai nasi',
          price_delta: 4000,
          is_default: false,
          is_active: true,
          position: 0,
          created_at: '2026-10-18T00:00:00Z',
          updated_at: '2026-10-18T00:00:00Z',
          group: { name: 'Nasi', allow_multiple: false, required: false },
        },
      ]),
    );
    const choices = await dataset('option_choices').load(STORE);
    expect(choices.rows[0]?.slice(0, 11)).toEqual(['c1', STORE, 'g1', 'Nasi', false, false, 'Pakai nasi', 4000, false, true, 0]);

    useDatabase(
      onePage([{ product_id: 'p1', group_id: 'g1', store_id: STORE, position: 0, product: { name: 'Geprek' }, group: { name: 'Nasi' } }]),
    );
    const links = await dataset('product_options').load(STORE);
    expect(links.columns).toEqual(['product_id', 'product_name', 'group_id', 'group_name', 'store_id', 'position']);
    expect(links.rows).toEqual([['p1', 'Geprek', 'g1', 'Nasi', STORE, 0]]);
  });

  it('describeOptions leaves out the price of a free choice', () => {
    expect(describeOptions([{ group: 'Level', name: 'Level 3', price: 0 }])).toBe('Level: Level 3');
    expect(describeOptions([])).toBe('');
  });

  it('profiles: no email, password, or token column, requested or written', async () => {
    const queries = useDatabase(
      onePage([
        { id: 'c1', store_id: STORE, name: 'Andi', role: 'cashier', is_active: true, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' },
      ]),
    );
    const table = await dataset('profiles').load(STORE);
    expect(table.columns).toEqual(['id', 'store_id', 'name', 'role', 'is_active', 'created_at', 'updated_at']);
    const select = String(queries[0]?.steps.find(([step]) => step === 'select')?.[1]);
    expect(select).not.toMatch(/email|password|token|secret|phone/i);
    expect(table.columns.join(',')).not.toMatch(/email|password|token|secret/i);
  });

  it('neutralizes formula payloads stored in names (H12, end to end)', async () => {
    useDatabase(
      onePage([
        {
          id: 'k1',
          store_id: STORE,
          name: '=HYPERLINK("http://evil.example","Klik")',
          created_at: '2026-10-01T00:00:00Z',
          updated_at: '2026-10-01T00:00:00Z',
        },
      ]),
    );
    const table = await dataset('categories').load(STORE);
    const csv = toCsv(table.columns, table.rows);
    expect(csv).toContain('"\'=HYPERLINK(""http://evil.example"",""Klik"")"');
    expect(csv).not.toMatch(/(^|,)"=/m);
  });
});

describe('exportFileName', () => {
  it('dates the file in Asia/Jakarta', () => {
    // 18:00 UTC on 7 Oct is already 8 Oct in Jakarta.
    expect(exportFileName({ slug: 'transaksi' }, new Date('2026-10-07T18:00:00Z'))).toBe('warungkasir-transaksi-20261008.csv');
  });
});

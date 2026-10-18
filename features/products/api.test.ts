import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, type FakeResult, type RecordedQuery } from '@/lib/test-support/fakeSupabase';
import { createProduct, listActiveProducts, listProducts, setProductActive, updateProduct } from './api';

const mocks = vi.hoisted(() => ({ supabase: null as unknown }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.supabase }));

const INPUT = { name: 'Nasi Goreng', categoryId: 'cat-1', price: 15000 };
const ok = (data: unknown): FakeResult => ({ data, error: null });
const failure = (code: string | undefined): FakeResult => ({ data: null, error: { code, message: 'boom' } });

function useDatabase(result: (query: RecordedQuery) => FakeResult) {
  const fake = fakeSupabase(result);
  mocks.supabase = fake.supabase;
  return fake.queries;
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createProduct', () => {
  it('inserts an active product for the given store with an integer price', async () => {
    const queries = useDatabase(() => ok({ id: 'p-new' }));

    const result = await createProduct('store-1', INPUT);

    // The new id comes back so its option groups can be attached.
    expect(result).toEqual({ ok: true, id: 'p-new' });
    expect(queries).toEqual([
      {
        table: 'products',
        steps: [
          ['insert', { store_id: 'store-1', category_id: 'cat-1', name: 'Nasi Goreng', price: 15000, is_active: true }],
          ['select', 'id'],
          ['single'],
        ],
      },
    ]);
  });

  it.each([
    ['23514', 'Data menu tidak valid. Periksa nama, kategori, dan harga.'],
    ['42501', 'Anda tidak memiliki izin untuk mengubah menu.'],
    ['23503', 'Kategori tidak ditemukan. Muat ulang halaman lalu pilih kategori lain.'],
    [undefined, 'Tidak dapat terhubung ke server. Periksa koneksi internet lalu coba lagi.'],
    ['XX000', 'Menu gagal disimpan. Coba lagi.'],
  ])('explains database error %s in Indonesian', async (code, message) => {
    useDatabase(() => failure(code));
    expect(await createProduct('store-1', INPUT)).toEqual({ ok: false, message });
  });
});

describe('updateProduct', () => {
  it('sends only name, category, and price; never store_id or is_active', async () => {
    const queries = useDatabase(() => ok([{ id: 'p-1' }]));

    expect(await updateProduct('p-1', { ...INPUT, price: 17000 })).toEqual({ ok: true });
    expect(queries).toEqual([
      {
        table: 'products',
        steps: [
          ['update', { category_id: 'cat-1', name: 'Nasi Goreng', price: 17000 }],
          ['eq', 'id', 'p-1'],
          ['select', 'id'],
        ],
      },
    ]);
  });

  it('reports a change the database silently ignored (RLS) as a permission problem', async () => {
    useDatabase(() => ok([]));
    expect(await updateProduct('p-1', INPUT)).toEqual({
      ok: false,
      message: 'Anda tidak memiliki izin untuk mengubah menu.',
    });
  });

  it('surfaces a rejected price from the database check constraint', async () => {
    useDatabase(() => failure('23514'));
    expect(await updateProduct('p-1', INPUT)).toEqual({
      ok: false,
      message: 'Data menu tidak valid. Periksa nama, kategori, dan harga.',
    });
  });
});

describe('setProductActive', () => {
  it('deactivates by updating is_active only', async () => {
    const queries = useDatabase(() => ok([{ id: 'p-1' }]));

    expect(await setProductActive('p-1', false)).toEqual({ ok: true });
    expect(queries).toEqual([
      { table: 'products', steps: [['update', { is_active: false }], ['eq', 'id', 'p-1'], ['select', 'id']] },
    ]);
  });

  it('reactivates by updating is_active only', async () => {
    const queries = useDatabase(() => ok([{ id: 'p-1' }]));

    expect(await setProductActive('p-1', true)).toEqual({ ok: true });
    expect(queries[0]?.steps[0]).toEqual(['update', { is_active: true }]);
  });

  it('never issues a DELETE on products, whatever the outcome (no hard delete in the MVP)', async () => {
    const queries = useDatabase(() => ok([{ id: 'p-1' }]));

    await createProduct('store-1', INPUT);
    await updateProduct('p-1', INPUT);
    await setProductActive('p-1', false);
    await setProductActive('p-1', true);
    await listProducts();
    await listActiveProducts();

    const operations = queries.flatMap((query) => query.steps.map((step) => step[0]));
    expect(operations).not.toContain('delete');
  });

  it('reports a status change the database silently ignored (RLS)', async () => {
    useDatabase(() => ok([]));
    expect(await setProductActive('p-1', false)).toEqual({
      ok: false,
      message: 'Anda tidak memiliki izin untuk mengubah menu.',
    });
  });

  it('explains a network failure', async () => {
    useDatabase(() => failure(undefined));
    expect(await setProductActive('p-1', false)).toEqual({
      ok: false,
      message: 'Tidak dapat terhubung ke server. Periksa koneksi internet lalu coba lagi.',
    });
  });
});

describe('reading the catalog', () => {
  const rows = [
    { id: 'p-1', name: 'Es Teh', price: 5000, category_id: 'cat-2', is_active: true },
    { id: 'p-2', name: 'Nasi Rames', price: 13000, category_id: 'cat-1', is_active: false },
  ];

  it('listProducts returns every product, inactive included, as the owner needs', async () => {
    const queries = useDatabase(() => ok(rows));

    const products = await listProducts();

    expect(products).toEqual([
      { id: 'p-1', name: 'Es Teh', price: 5000, categoryId: 'cat-2', isActive: true },
      { id: 'p-2', name: 'Nasi Rames', price: 13000, categoryId: 'cat-1', isActive: false },
    ]);
    expect(queries[0]?.steps.map((step) => step[0])).not.toContain('eq');
  });

  it('listActiveProducts asks only for active products, so inactive ones never reach the cashier menu', async () => {
    const queries = useDatabase(() => ok(rows.filter((row) => row.is_active)));

    const products = await listActiveProducts();

    expect(queries[0]?.steps).toContainEqual(['eq', 'is_active', true]);
    expect(products.map((product) => product.name)).toEqual(['Es Teh']);
  });

  it('throws when the database cannot be read, so the screen can show an error', async () => {
    useDatabase(() => failure('XX000'));
    await expect(listProducts()).rejects.toThrow('Could not load products');
    await expect(listActiveProducts()).rejects.toThrow('Could not load the active products');
  });
});

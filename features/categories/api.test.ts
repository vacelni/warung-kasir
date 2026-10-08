import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, type FakeResult, type RecordedQuery } from '@/lib/test-support/fakeSupabase';
import {
  categoryInUseMessage,
  countByCategory,
  countProductsPerCategory,
  createCategory,
  deleteCategory,
  renameCategory,
} from './api';

const mocks = vi.hoisted(() => ({ supabase: null as unknown }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.supabase }));

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

describe('createCategory', () => {
  it('inserts the name for the given store', async () => {
    const queries = useDatabase(() => ok(null));

    expect(await createCategory('store-1', 'Paket')).toEqual({ ok: true });
    expect(queries).toEqual([{ table: 'categories', steps: [['insert', { store_id: 'store-1', name: 'Paket' }]] }]);
  });

  it('explains a duplicate name (unique per store)', async () => {
    useDatabase(() => failure('23505'));
    expect(await createCategory('store-1', 'Makanan')).toEqual({
      ok: false,
      message: 'Kategori dengan nama ini sudah ada. Gunakan nama lain.',
    });
  });

  it('explains a network failure', async () => {
    useDatabase(() => failure(undefined));
    const result = await createCategory('store-1', 'Paket');
    expect(result).toEqual({
      ok: false,
      message: 'Tidak dapat terhubung ke server. Periksa koneksi internet lalu coba lagi.',
    });
  });
});

describe('renameCategory', () => {
  it('updates only the name of one category', async () => {
    const queries = useDatabase(() => ok([{ id: 'c-1' }]));

    expect(await renameCategory('c-1', 'Lauk')).toEqual({ ok: true });
    expect(queries).toEqual([
      { table: 'categories', steps: [['update', { name: 'Lauk' }], ['eq', 'id', 'c-1'], ['select', 'id']] },
    ]);
  });

  it('reports a rename the database silently ignored (RLS)', async () => {
    useDatabase(() => ok([]));
    expect(await renameCategory('c-1', 'Lauk')).toEqual({
      ok: false,
      message: 'Anda tidak memiliki izin untuk mengubah kategori.',
    });
  });

  it('explains a duplicate name', async () => {
    useDatabase(() => failure('23505'));
    expect(await renameCategory('c-1', 'Minuman')).toEqual({
      ok: false,
      message: 'Kategori dengan nama ini sudah ada. Gunakan nama lain.',
    });
  });
});

describe('deleteCategory', () => {
  it('deletes one category', async () => {
    const queries = useDatabase(() => ok([{ id: 'c-1' }]));

    expect(await deleteCategory('c-1')).toEqual({ ok: true });
    expect(queries).toEqual([{ table: 'categories', steps: [['delete'], ['eq', 'id', 'c-1'], ['select', 'id']] }]);
  });

  it('reports "in use" when the foreign key refuses (a product, active or not, still uses it)', async () => {
    useDatabase(() => failure('23503'));
    expect(await deleteCategory('c-1')).toEqual({ ok: false, inUse: true, message: categoryInUseMessage() });
  });

  it('does not treat other failures as "in use"', async () => {
    useDatabase(() => failure('XX000'));
    expect(await deleteCategory('c-1')).toEqual({
      ok: false,
      inUse: false,
      message: 'Kategori gagal dihapus. Coba lagi.',
    });
  });

  it('reports a delete the database silently ignored (RLS)', async () => {
    useDatabase(() => ok([]));
    expect(await deleteCategory('c-1')).toEqual({
      ok: false,
      inUse: false,
      message: 'Anda tidak memiliki izin untuk mengubah kategori.',
    });
  });
});

describe('product counts per category', () => {
  it('counts every product row, so inactive products keep a category in use', () => {
    expect(countByCategory([{ category_id: 'a' }, { category_id: 'a' }, { category_id: 'b' }])).toEqual({ a: 2, b: 1 });
    expect(countByCategory([])).toEqual({});
  });

  it('reads all products without filtering on is_active', async () => {
    const queries = useDatabase(() => ok([{ category_id: 'a' }, { category_id: 'a' }]));

    expect(await countProductsPerCategory()).toEqual({ a: 2 });
    expect(queries).toEqual([{ table: 'products', steps: [['select', 'category_id']] }]);
  });
});

describe('categoryInUseMessage', () => {
  it('names the number of menu and says inactive menu count too', () => {
    const message = categoryInUseMessage(3);
    expect(message).toContain('3 menu');
    expect(message).toContain('nonaktif');
  });
});

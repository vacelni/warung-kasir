import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, type FakeResult, type RecordedQuery } from '@/lib/test-support/fakeSupabase';
import {
  createChoice,
  createGroup,
  deleteChoice,
  deleteGroup,
  listOptionGroups,
  listProductLinks,
  setProductGroups,
  updateChoice,
  updateGroup,
} from './api';

const mocks = vi.hoisted(() => ({ supabase: null as unknown }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.supabase }));

const ok = (data: unknown): FakeResult => ({ data, error: null });
const failure = (code: string | undefined): FakeResult => ({ data: null, error: { code, message: 'boom' } });

function fakeDatabase(result: (query: RecordedQuery) => FakeResult) {
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

describe('listOptionGroups', () => {
  it('maps the rows and orders the choices by position, then creation time', async () => {
    fakeDatabase(() =>
      ok([
        {
          id: 'g1',
          name: 'Level',
          allow_multiple: false,
          required: true,
          option_choices: [
            { id: 'c3', group_id: 'g1', name: 'Level 5', price_delta: 0, is_default: false, is_active: true, position: 2, created_at: '2026-10-18T01:00:03Z' },
            { id: 'c1', group_id: 'g1', name: 'Level 1', price_delta: 0, is_default: true, is_active: true, position: 0, created_at: '2026-10-18T01:00:01Z' },
            { id: 'c2', group_id: 'g1', name: 'Level 3', price_delta: 500, is_default: false, is_active: false, position: 0, created_at: '2026-10-18T01:00:02Z' },
          ],
        },
      ]),
    );

    const groups = await listOptionGroups();

    expect(groups).toEqual([
      {
        id: 'g1',
        name: 'Level',
        allowMultiple: false,
        required: true,
        choices: [
          { id: 'c1', groupId: 'g1', name: 'Level 1', priceDelta: 0, isDefault: true, isActive: true, position: 0 },
          { id: 'c2', groupId: 'g1', name: 'Level 3', priceDelta: 500, isDefault: false, isActive: false, position: 0 },
          { id: 'c3', groupId: 'g1', name: 'Level 5', priceDelta: 0, isDefault: false, isActive: true, position: 2 },
        ],
      },
    ]);
  });

  it('throws when the read fails, so the caller can tell "unreachable" from "none"', async () => {
    fakeDatabase(() => failure('PGRST000'));
    await expect(listOptionGroups()).rejects.toThrow('Could not load the option groups');
    await expect(listProductLinks()).rejects.toThrow('Could not load the product options');
  });
});

describe('group and choice writes', () => {
  it('creates a group for the given store and returns its id', async () => {
    const queries = fakeDatabase(() => ok({ id: 'g-new' }));

    expect(await createGroup('store-1', { name: 'Level', allowMultiple: false, required: true })).toEqual({ ok: true, id: 'g-new' });
    expect(queries[0]).toEqual({
      table: 'option_groups',
      steps: [['insert', { store_id: 'store-1', name: 'Level', allow_multiple: false, required: true }], ['select', 'id'], ['single']],
    });
  });

  it('sends only the changed fields of a choice, in database column names', async () => {
    const queries = fakeDatabase(() => ok([{ id: 'c1' }]));

    expect(await updateChoice('c1', { isActive: false })).toEqual({ ok: true });
    expect(await updateChoice('c1', { name: 'Level 4', priceDelta: 1000 })).toEqual({ ok: true });
    expect(queries.map((query) => query.steps[0])).toEqual([
      ['update', { is_active: false }],
      ['update', { name: 'Level 4', price_delta: 1000 }],
    ]);
  });

  it('creates a choice at the given position', async () => {
    const queries = fakeDatabase(() => ok({ id: 'c-new' }));
    await createChoice('store-1', 'g1', { name: 'Level 3', priceDelta: 0 }, 2);
    expect(queries[0]?.steps[0]).toEqual([
      'insert',
      { store_id: 'store-1', group_id: 'g1', name: 'Level 3', price_delta: 0, position: 2 },
    ]);
  });

  it.each([
    ['23505', 'Nama ini sudah dipakai. Gunakan nama lain.'],
    ['23514', 'Data pilihan tidak valid. Periksa nama dan tambahan harga.'],
    ['42501', 'Anda tidak memiliki izin untuk mengubah pilihan menu.'],
    [undefined, 'Tidak dapat terhubung ke server. Periksa koneksi internet lalu coba lagi.'],
    ['XX000', 'Pilihan gagal disimpan. Coba lagi.'],
  ])('explains database error %s in Indonesian', async (code, message) => {
    fakeDatabase(() => failure(code));
    expect(await createGroup('store-1', { name: 'Level', allowMultiple: false, required: true })).toEqual({ ok: false, message });
  });

  it('reports a change the database silently ignored (RLS) as a permission problem', async () => {
    fakeDatabase(() => ok([]));
    const denied = { ok: false, message: 'Anda tidak memiliki izin untuk mengubah pilihan menu.' };
    expect(await updateGroup('g1', { name: 'x', allowMultiple: false, required: true })).toEqual(denied);
    expect(await updateChoice('c1', { name: 'x' })).toEqual(denied);
    expect(await deleteChoice('c1')).toEqual(denied);
    expect(await deleteGroup('g1')).toEqual(denied);
  });

  it('deletes a group by id', async () => {
    const queries = fakeDatabase(() => ok([{ id: 'g1' }]));
    expect(await deleteGroup('g1')).toEqual({ ok: true });
    expect(queries[0]).toEqual({ table: 'option_groups', steps: [['delete'], ['eq', 'id', 'g1'], ['select', 'id']] });
  });
});

describe('setProductGroups', () => {
  /** The product currently shows `existing`; every other query succeeds. */
  function productHas(...existing: string[]) {
    return fakeDatabase((query) =>
      query.steps[0]?.[0] === 'select' ? ok(existing.map((group_id) => ({ group_id }))) : ok(null),
    );
  }
  const writes = (queries: RecordedQuery[]) => queries.slice(1).map((query) => query.steps.map((step) => step[0]).join('>'));

  it('attaches new groups with their position and leaves the others alone', async () => {
    const queries = productHas();

    expect(await setProductGroups('store-1', 'p1', ['g-nasi', 'g-level'])).toEqual({ ok: true });
    expect(queries[1]?.steps[0]).toEqual([
      'insert',
      [
        { store_id: 'store-1', product_id: 'p1', group_id: 'g-nasi', position: 0 },
        { store_id: 'store-1', product_id: 'p1', group_id: 'g-level', position: 1 },
      ],
    ]);
    expect(writes(queries)).toEqual(['insert']);
  });

  it('adds before it removes, so a failure part-way never leaves the product with fewer groups', async () => {
    const queries = productHas('g-old');

    await setProductGroups('store-1', 'p1', ['g-new']);

    expect(writes(queries)).toEqual(['insert', 'delete>eq>in']);
    expect(queries[2]?.steps).toContainEqual(['in', 'group_id', ['g-old']]);
  });

  it('renumbers the groups that stay so the owner’s order is kept', async () => {
    const queries = productHas('g-a', 'g-b');

    await setProductGroups('store-1', 'p1', ['g-b', 'g-a']);

    const updates = queries.filter((query) => query.steps[0]?.[0] === 'update');
    expect(updates.map((query) => [query.steps[0]?.[1], query.steps[2]?.[2]])).toEqual([
      [{ position: 0 }, 'g-b'],
      [{ position: 1 }, 'g-a'],
    ]);
  });

  it('removes every group when none are chosen', async () => {
    const queries = productHas('g-a');
    expect(await setProductGroups('store-1', 'p1', [])).toEqual({ ok: true });
    expect(writes(queries)).toEqual(['delete>eq>in']);
  });

  it('stops and explains when the groups cannot be saved', async () => {
    fakeDatabase((query) => (query.steps[0]?.[0] === 'select' ? ok([]) : failure('42501')));
    expect(await setProductGroups('store-1', 'p1', ['g1'])).toEqual({
      ok: false,
      message: 'Anda tidak memiliki izin untuk mengubah pilihan menu.',
    });
  });
});

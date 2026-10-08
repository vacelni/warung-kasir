import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, type FakeResult, type RecordedQuery } from '@/lib/test-support/fakeSupabase';
import { createCashier, listCashiers, renameCashier, resetCashierPassword, setCashierActive } from './api';

const mocks = vi.hoisted(() => ({ supabase: null as unknown }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.supabase }));

const SECRET = 'rahasia-kasir-1';

function useBackend(result: (query: RecordedQuery) => FakeResult | { data: unknown; error: unknown }) {
  const fake = fakeSupabase(result as (query: RecordedQuery) => FakeResult);
  mocks.supabase = fake.supabase;
  return fake.queries;
}

const httpError = (status: number, body: unknown) =>
  new FunctionsHttpError(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

let errorLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('listCashiers', () => {
  it('reads cashier profiles only (no owner), by name', async () => {
    const queries = useBackend(() => ({ data: [{ id: 'c1', name: 'Andi', is_active: false }], error: null }));
    expect(await listCashiers()).toEqual([{ id: 'c1', name: 'Andi', isActive: false }]);
    expect(queries[0]).toEqual({
      table: 'profiles',
      steps: [['select', 'id, name, is_active'], ['eq', 'role', 'cashier'], ['order', 'name']],
    });
  });

  it('throws when the list cannot be read', async () => {
    useBackend(() => ({ data: null, error: { message: 'down' } }));
    await expect(listCashiers()).rejects.toThrow('Could not load the cashiers');
  });
});

describe('admin-cashier calls', () => {
  it('sends exactly the action fields: no store_id, role, or is_owner', async () => {
    const queries = useBackend(() => ({ data: { cashier: {} }, error: null }));
    await createCashier({ name: 'Fajar', email: 'fajar@warung.test', password: SECRET });
    await setCashierActive('c1', false);
    await resetCashierPassword('c1', SECRET);
    expect(queries).toEqual([
      { table: 'fn:admin-cashier', steps: [['invoke', { action: 'create', name: 'Fajar', email: 'fajar@warung.test', password: SECRET }]] },
      { table: 'fn:admin-cashier', steps: [['invoke', { action: 'set_active', cashier_id: 'c1', is_active: false }]] },
      { table: 'fn:admin-cashier', steps: [['invoke', { action: 'reset_password', cashier_id: 'c1', password: SECRET }]] },
    ]);
  });

  it.each([
    [409, { error: 'email_taken' }, { ok: false, message: 'Email ini sudah dipakai akun lain. Gunakan email lain.', field: 'email' }],
    [400, { error: 'invalid_request', field: 'password' }, { ok: false, message: 'Password minimal 8 karakter.', field: 'password' }],
    [400, { error: 'invalid_request', field: 'action' }, { ok: false, message: 'Data tidak valid. Periksa kembali isian.' }],
    [403, { error: 'forbidden' }, { ok: false, message: 'Hanya Owner yang dapat mengelola karyawan.' }],
    [401, { error: 'unauthorized' }, { ok: false, message: 'Sesi Anda telah berakhir. Silakan masuk kembali.' }],
    [500, { error: 'server_error' }, { ok: false, message: 'Akun kasir gagal dibuat. Coba lagi.' }],
    [401, 'Invalid JWT', { ok: false, message: 'Akun kasir gagal dibuat. Coba lagi.' }],
  ])('maps HTTP %i %j to an Indonesian message', async (status, body, expected) => {
    useBackend(() => ({ data: null, error: httpError(status, body) }));
    expect(await createCashier({ name: 'Fajar', email: 'fajar@warung.test', password: SECRET })).toEqual(expected);
  });

  it('maps self-change and not-found for status changes', async () => {
    useBackend(() => ({ data: null, error: httpError(403, { error: 'self_change' }) }));
    expect(await setCashierActive('o', false)).toEqual({ ok: false, message: 'Akun Owner tidak dapat diubah dari halaman ini.' });
    useBackend(() => ({ data: null, error: httpError(404, { error: 'not_found' }) }));
    expect(await setCashierActive('x', false)).toEqual({ ok: false, message: 'Akun kasir tidak ditemukan. Muat ulang halaman lalu coba lagi.' });
  });

  it('reports a network failure as offline', async () => {
    useBackend(() => ({ data: null, error: new FunctionsFetchError(new TypeError('Failed to fetch')) }));
    expect(await resetCashierPassword('c1', SECRET)).toEqual({
      ok: false,
      message: 'Tidak dapat terhubung ke server. Periksa koneksi internet lalu coba lagi.',
    });
  });

  it('never logs the password', async () => {
    useBackend(() => ({ data: null, error: httpError(500, { error: 'server_error' }) }));
    await resetCashierPassword('c1', SECRET);
    await createCashier({ name: 'Fajar', email: 'fajar@warung.test', password: SECRET });
    expect(errorLog).toHaveBeenCalled();
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(SECRET);
  });
});

describe('renameCashier', () => {
  it('updates only the name, of a cashier', async () => {
    const queries = useBackend(() => ({ data: [{ id: 'c1' }], error: null }));
    expect(await renameCashier('c1', 'Andi S')).toEqual({ ok: true });
    expect(queries[0]).toEqual({
      table: 'profiles',
      steps: [['update', { name: 'Andi S' }], ['eq', 'id', 'c1'], ['eq', 'role', 'cashier'], ['select', 'id']],
    });
  });

  it('treats "no row updated" (hidden by RLS) as no permission', async () => {
    useBackend(() => ({ data: [], error: null }));
    expect(await renameCashier('c1', 'X')).toEqual({ ok: false, message: 'Hanya Owner yang dapat mengelola karyawan.' });
  });

  it('explains a blank name and a network failure', async () => {
    useBackend(() => ({ data: null, error: { code: '23514', message: 'check' } }));
    expect(await renameCashier('c1', ' ')).toEqual({ ok: false, message: 'Nama wajib diisi.', field: 'name' });
    useBackend(() => ({ data: null, error: { message: 'Failed to fetch' } }));
    expect(await renameCashier('c1', 'X')).toMatchObject({ ok: false, message: expect.stringContaining('Tidak dapat terhubung') });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, type FakeResult, type RecordedQuery } from '@/lib/test-support/fakeSupabase';
import { getStoreProfile, saveReceiptNote, saveStoreProfile } from './api';
import { normalizeReceiptNote, SETTINGS_MESSAGES, validateStoreProfile } from './validation';

const mocks = vi.hoisted(() => ({ supabase: null as unknown }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.supabase }));

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

describe('validateStoreProfile', () => {
  it('trims and turns empty optional fields into null', () => {
    expect(validateStoreProfile({ name: ' Warung Bu Sari ', address: '  ', phone: ' 0812-3456 7890 ' })).toEqual({
      ok: true,
      input: { name: 'Warung Bu Sari', address: null, phone: '0812-3456 7890' },
    });
  });

  it('keeps a multi-line address', () => {
    const result = validateStoreProfile({ name: 'W', address: 'Jl. Contoh No. 10\nSemarang', phone: '' });
    expect(result).toEqual({ ok: true, input: { name: 'W', address: 'Jl. Contoh No. 10\nSemarang', phone: null } });
  });

  it('requires a name and a plausible phone number', () => {
    expect(validateStoreProfile({ name: ' ', address: '', phone: '=HYPERLINK("x")' })).toEqual({
      ok: false,
      errors: { name: SETTINGS_MESSAGES.nameRequired, phone: SETTINGS_MESSAGES.phoneInvalid },
    });
    expect(validateStoreProfile({ name: 'W', address: '', phone: '+62 (24) 123-456' }).ok).toBe(true);
  });

  it('clears a blank receipt note', () => {
    expect(normalizeReceiptNote('   ')).toBeNull();
    expect(normalizeReceiptNote(' Terima kasih :)\nDatang lagi ')).toBe('Terima kasih :)\nDatang lagi');
  });
});

describe('settings api', () => {
  it('reads the profile fields of the given store', async () => {
    const queries = useDatabase(() => ({
      data: { name: 'Warung', address: null, phone: '0812', receipt_note: 'Terima kasih' },
      error: null,
    }));
    expect(await getStoreProfile('store-a')).toEqual({ name: 'Warung', address: null, phone: '0812', receiptNote: 'Terima kasih' });
    expect(queries[0]?.steps).toEqual([['select', 'name, address, phone, receipt_note'], ['eq', 'id', 'store-a'], ['single']]);
  });

  it('saves only the profile columns, scoped to the store', async () => {
    const queries = useDatabase(() => ({ data: [{ id: 'store-a' }], error: null }));
    expect(await saveStoreProfile('store-a', { name: 'W', address: null, phone: '0812' })).toEqual({ ok: true });
    expect(queries[0]).toEqual({
      table: 'stores',
      steps: [['update', { name: 'W', address: null, phone: '0812' }], ['eq', 'id', 'store-a'], ['select', 'id']],
    });
  });

  it('saves only receipt_note for the Struk section', async () => {
    const queries = useDatabase(() => ({ data: [{ id: 'store-a' }], error: null }));
    await saveReceiptNote('store-a', null);
    expect(queries[0]?.steps[0]).toEqual(['update', { receipt_note: null }]);
  });

  it.each([
    [{ data: [], error: null }, 'Hanya Owner yang dapat mengubah pengaturan warung.'],
    [{ data: null, error: { code: '42501', message: 'denied' } }, 'Hanya Owner yang dapat mengubah pengaturan warung.'],
    [{ data: null, error: { code: '23514', message: 'check' } }, 'Data warung tidak valid. Nama warung wajib diisi.'],
    [{ data: null, error: { message: 'Failed to fetch' } }, 'Tidak dapat terhubung ke server. Periksa koneksi internet lalu coba lagi.'],
    [{ data: null, error: { code: 'XX000', message: 'boom' } }, 'Pengaturan gagal disimpan. Coba lagi.'],
  ])('explains %j', async (result, message) => {
    useDatabase(() => result as FakeResult);
    expect(await saveReceiptNote('store-a', 'x')).toEqual({ ok: false, message });
  });
});

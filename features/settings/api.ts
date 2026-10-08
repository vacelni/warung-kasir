import { getSupabase } from '@/lib/supabase';
import type { ProfileInput, StoreProfile } from './validation';

export type SaveResult = { ok: true } | { ok: false; message: string };

const MESSAGES = {
  invalid: 'Data warung tidak valid. Nama warung wajib diisi.',
  noPermission: 'Hanya Owner yang dapat mengubah pengaturan warung.',
  offline: 'Tidak dapat terhubung ke server. Periksa koneksi internet lalu coba lagi.',
  save: 'Pengaturan gagal disimpan. Coba lagi.',
} as const;

/** The signed-in user's store. RLS returns only the caller's own store. */
export async function getStoreProfile(storeId: string): Promise<StoreProfile> {
  const { data, error } = await getSupabase()
    .from('stores')
    .select('name, address, phone, receipt_note')
    .eq('id', storeId)
    .single();
  if (error) throw new Error(`Could not load the store profile: ${error.message}`);
  return { name: data.name, address: data.address, phone: data.phone, receiptNote: data.receipt_note };
}

type StoreUpdate = { name?: string; address?: string | null; phone?: string | null; receipt_note?: string | null };

/**
 * Sends only the columns of the section being edited. The column grant allows exactly name,
 * address, phone, and receipt_note, and RLS limits the update to the owner's own store.
 */
async function updateStore(storeId: string, patch: StoreUpdate): Promise<SaveResult> {
  const { data, error } = await getSupabase().from('stores').update(patch).eq('id', storeId).select('id');
  if (error) {
    console.error('Could not update the store:', error);
    // Postgres SQLSTATEs: check violation (23514), RLS / privilege (42501). No code: network.
    if (error.code === '23514') return { ok: false, message: MESSAGES.invalid };
    if (error.code === '42501') return { ok: false, message: MESSAGES.noPermission };
    if (!error.code) return { ok: false, message: MESSAGES.offline };
    return { ok: false, message: MESSAGES.save };
  }
  // RLS hides a store the caller may not change: no error, but nothing was updated.
  if (data.length === 0) return { ok: false, message: MESSAGES.noPermission };
  return { ok: true };
}

export function saveStoreProfile(storeId: string, input: ProfileInput): Promise<SaveResult> {
  return updateStore(storeId, { name: input.name, address: input.address, phone: input.phone });
}

export function saveReceiptNote(storeId: string, receiptNote: string | null): Promise<SaveResult> {
  return updateStore(storeId, { receipt_note: receiptNote });
}

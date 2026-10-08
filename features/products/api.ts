import { getSupabase } from '@/lib/supabase';
import type { Money } from '@/lib/money';
import type { ProductInput } from './validation';

export type Product = {
  id: string;
  name: string;
  price: Money;
  categoryId: string;
  isActive: boolean;
};

export type SaveResult = { ok: true } | { ok: false; message: string };

type DbError = { code?: string; message: string };

const MESSAGES = {
  invalid: 'Data menu tidak valid. Periksa nama, kategori, dan harga.',
  noPermission: 'Anda tidak memiliki izin untuk mengubah menu.',
  offline: 'Tidak dapat terhubung ke server. Periksa koneksi internet lalu coba lagi.',
  save: 'Menu gagal disimpan. Coba lagi.',
  status: 'Status menu gagal diubah. Coba lagi.',
} as const;

function failureMessage(error: DbError, fallback: string): string {
  // Codes are Postgres SQLSTATEs: check (23514), foreign key (23503), RLS / privilege (42501).
  if (error.code === '23514') return MESSAGES.invalid;
  if (error.code === '23503') return 'Kategori tidak ditemukan. Muat ulang halaman lalu pilih kategori lain.';
  if (error.code === '42501') return MESSAGES.noPermission;
  // PostgREST reports a failed fetch without a Postgres code.
  if (!error.code) return MESSAGES.offline;
  return fallback;
}

type ProductRow = { id: string; name: string; price: number; category_id: string; is_active: boolean };

function toProduct(row: ProductRow): Product {
  return { id: row.id, name: row.name, price: row.price, categoryId: row.category_id, isActive: row.is_active };
}

const COLUMNS = 'id, name, price, category_id, is_active';

/** Every product of the store, inactive included, for the owner's management list. RLS scopes the store. */
export async function listProducts(): Promise<Product[]> {
  const { data, error } = await getSupabase().from('products').select(COLUMNS).order('name');
  if (error) throw new Error(`Could not load products: ${error.message}`);
  return data.map(toProduct);
}

/**
 * The cashier catalog: active products only (PRD §23). RLS lets every member of the store read
 * inactive rows too, so hiding them is this query's job, not the database's.
 */
export async function listActiveProducts(): Promise<Product[]> {
  const { data, error } = await getSupabase().from('products').select(COLUMNS).eq('is_active', true).order('name');
  if (error) throw new Error(`Could not load the active products: ${error.message}`);
  return data.map(toProduct);
}

/** New products start active. `storeId` comes from the signed-in profile; RLS rejects any other store. */
export async function createProduct(storeId: string, input: ProductInput): Promise<SaveResult> {
  const { error } = await getSupabase().from('products').insert({
    store_id: storeId,
    category_id: input.categoryId,
    name: input.name,
    price: input.price,
    is_active: true,
  });
  if (error) {
    console.error('Could not create the product:', error);
    return { ok: false, message: failureMessage(error, MESSAGES.save) };
  }
  return { ok: true };
}

/** Sends only the three editable columns; store_id and is_active are not part of an edit (DATABASE D.11). */
export async function updateProduct(id: string, input: ProductInput): Promise<SaveResult> {
  const { data, error } = await getSupabase()
    .from('products')
    .update({ category_id: input.categoryId, name: input.name, price: input.price })
    .eq('id', id)
    .select('id');
  if (error) {
    console.error('Could not update the product:', error);
    return { ok: false, message: failureMessage(error, MESSAGES.save) };
  }
  // RLS hides rows the caller may not change: no error, but nothing was updated.
  if (data.length === 0) return { ok: false, message: MESSAGES.noPermission };
  return { ok: true };
}

/**
 * Deactivate ("Nonaktifkan") or reactivate ("Aktifkan"). This is the only way a product leaves
 * the cashier menu: there is no hard delete in the MVP (PRD §23, DATABASE D.5).
 */
export async function setProductActive(id: string, isActive: boolean): Promise<SaveResult> {
  const { data, error } = await getSupabase().from('products').update({ is_active: isActive }).eq('id', id).select('id');
  if (error) {
    console.error('Could not change the product status:', error);
    return { ok: false, message: failureMessage(error, MESSAGES.status) };
  }
  if (data.length === 0) return { ok: false, message: MESSAGES.noPermission };
  return { ok: true };
}

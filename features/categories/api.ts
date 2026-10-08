import { getSupabase } from '@/lib/supabase';

export type Category = { id: string; name: string };

export type SaveResult = { ok: true } | { ok: false; message: string };
/** `inUse` = the database refused because a product still references the category. */
export type DeleteResult = { ok: true } | { ok: false; inUse: boolean; message: string };

type DbError = { code?: string; message: string };

const MESSAGES = {
  duplicate: 'Kategori dengan nama ini sudah ada. Gunakan nama lain.',
  noPermission: 'Anda tidak memiliki izin untuk mengubah kategori.',
  offline: 'Tidak dapat terhubung ke server. Periksa koneksi internet lalu coba lagi.',
  save: 'Kategori gagal disimpan. Coba lagi.',
  remove: 'Kategori gagal dihapus. Coba lagi.',
} as const;

/** Why a category cannot be deleted, shown before and after asking the database (DATABASE D.4). */
export function categoryInUseMessage(productCount?: number): string {
  const users = productCount === undefined ? 'menu' : `${productCount} menu`;
  return (
    `Kategori ini masih dipakai oleh ${users}, termasuk menu yang nonaktif, sehingga tidak dapat dihapus. ` +
    'Pindahkan menu tersebut ke kategori lain lebih dulu.'
  );
}

// PostgREST reports a failed fetch without a Postgres code.
function isOffline(error: DbError): boolean {
  return !error.code;
}

export function saveErrorMessage(error: DbError): string {
  if (error.code === '23505') return MESSAGES.duplicate;
  if (error.code === '42501') return MESSAGES.noPermission;
  return isOffline(error) ? MESSAGES.offline : MESSAGES.save;
}

/** Read-only counts per category, built from every product row, inactive ones included. */
export function countByCategory(rows: ReadonlyArray<{ category_id: string }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.category_id] = (counts[row.category_id] ?? 0) + 1;
  return counts;
}

export async function listCategories(): Promise<Category[]> {
  const { data, error } = await getSupabase().from('categories').select('id, name').order('created_at').order('name');
  if (error) throw new Error(`Could not load categories: ${error.message}`);
  return data;
}

/**
 * How many products use each category. Deliberately not filtered by `is_active`: an inactive
 * product still blocks deleting its category (PRD §24).
 */
export async function countProductsPerCategory(): Promise<Record<string, number>> {
  const { data, error } = await getSupabase().from('products').select('category_id');
  if (error) throw new Error(`Could not count products per category: ${error.message}`);
  return countByCategory(data);
}

export async function createCategory(storeId: string, name: string): Promise<SaveResult> {
  const { error } = await getSupabase().from('categories').insert({ store_id: storeId, name });
  if (error) {
    console.error('Could not create the category:', error);
    return { ok: false, message: saveErrorMessage(error) };
  }
  return { ok: true };
}

export async function renameCategory(id: string, name: string): Promise<SaveResult> {
  const { data, error } = await getSupabase().from('categories').update({ name }).eq('id', id).select('id');
  if (error) {
    console.error('Could not rename the category:', error);
    return { ok: false, message: saveErrorMessage(error) };
  }
  // RLS hides rows from other stores and from non-owners: no error, but nothing changed.
  if (data.length === 0) return { ok: false, message: MESSAGES.noPermission };
  return { ok: true };
}

/** The foreign key products.category_id → categories (ON DELETE RESTRICT) is the real guard; this only reports it. */
export async function deleteCategory(id: string): Promise<DeleteResult> {
  const { data, error } = await getSupabase().from('categories').delete().eq('id', id).select('id');
  if (error) {
    if (error.code === '23503') return { ok: false, inUse: true, message: categoryInUseMessage() };
    console.error('Could not delete the category:', error);
    const message = error.code === '42501' ? MESSAGES.noPermission : isOffline(error) ? MESSAGES.offline : MESSAGES.remove;
    return { ok: false, inUse: false, message };
  }
  if (data.length === 0) return { ok: false, inUse: false, message: MESSAGES.noPermission };
  return { ok: true };
}

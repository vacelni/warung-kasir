import { getSupabase } from '@/lib/supabase';
import type { Money } from '@/lib/money';
import { sortChoices, type OptionChoice, type OptionGroup, type ProductGroupLink } from './model';

export type SaveResult = { ok: true } | { ok: false; message: string };
export type CreateResult = { ok: true; id: string } | { ok: false; message: string };

type DbError = { code?: string; message: string };

const MESSAGES = {
  duplicate: 'Nama ini sudah dipakai. Gunakan nama lain.',
  invalid: 'Data pilihan tidak valid. Periksa nama dan tambahan harga.',
  noPermission: 'Anda tidak memiliki izin untuk mengubah pilihan menu.',
  offline: 'Tidak dapat terhubung ke server. Periksa koneksi internet lalu coba lagi.',
  save: 'Pilihan gagal disimpan. Coba lagi.',
  remove: 'Pilihan gagal dihapus. Coba lagi.',
  notFound: 'Data tidak ditemukan. Muat ulang halaman lalu coba lagi.',
} as const;

function failureMessage(error: DbError, fallback: string): string {
  if (error.code === '23505') return MESSAGES.duplicate;
  if (error.code === '23514') return MESSAGES.invalid;
  if (error.code === '23503') return MESSAGES.notFound;
  if (error.code === '42501') return MESSAGES.noPermission;
  // PostgREST reports a failed fetch without a Postgres code.
  return error.code ? fallback : MESSAGES.offline;
}

type ChoiceRow = {
  id: string;
  group_id: string;
  name: string;
  price_delta: number;
  is_default: boolean;
  is_active: boolean;
  position: number;
  created_at: string;
};

type GroupRow = {
  id: string;
  name: string;
  allow_multiple: boolean;
  required: boolean;
  option_choices: ChoiceRow[];
};

function toChoice(row: ChoiceRow): OptionChoice & { createdAt: string } {
  return {
    id: row.id,
    groupId: row.group_id,
    name: row.name,
    priceDelta: row.price_delta,
    isDefault: row.is_default,
    isActive: row.is_active,
    position: row.position,
    createdAt: row.created_at,
  };
}

function withoutCreatedAt(choice: OptionChoice & { createdAt: string }): OptionChoice {
  const { id, groupId, name, priceDelta, isDefault, isActive, position } = choice;
  return { id, groupId, name, priceDelta, isDefault, isActive, position };
}

/**
 * Every option group of the store with all its choices, sold-out ones included. RLS scopes the
 * store and lets every member read (the cashier screen needs them); only the owner can change them.
 */
export async function listOptionGroups(): Promise<OptionGroup[]> {
  const { data, error } = await getSupabase()
    .from('option_groups')
    .select(
      'id, name, allow_multiple, required, option_choices(id, group_id, name, price_delta, is_default, is_active, position, created_at)',
    )
    .order('name');
  if (error) throw new Error(`Could not load the option groups: ${error.message}`);
  return (data as GroupRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    allowMultiple: row.allow_multiple,
    required: row.required,
    choices: sortChoices(row.option_choices.map(toChoice)).map(withoutCreatedAt),
  }));
}

/** Which groups each product shows, with their order. */
export async function listProductLinks(): Promise<ProductGroupLink[]> {
  const { data, error } = await getSupabase().from('product_option_groups').select('product_id, group_id, position');
  if (error) throw new Error(`Could not load the product options: ${error.message}`);
  return data.map((row) => ({ productId: row.product_id, groupId: row.group_id, position: row.position }));
}

export type GroupInput = { name: string; allowMultiple: boolean; required: boolean };

export async function createGroup(storeId: string, input: GroupInput): Promise<CreateResult> {
  const { data, error } = await getSupabase()
    .from('option_groups')
    .insert({ store_id: storeId, name: input.name, allow_multiple: input.allowMultiple, required: input.required })
    .select('id')
    .single();
  if (error) {
    console.error('Could not create the option group:', error);
    return { ok: false, message: failureMessage(error, MESSAGES.save) };
  }
  return { ok: true, id: data.id };
}

export async function updateGroup(id: string, input: GroupInput): Promise<SaveResult> {
  const { data, error } = await getSupabase()
    .from('option_groups')
    .update({ name: input.name, allow_multiple: input.allowMultiple, required: input.required })
    .eq('id', id)
    .select('id');
  if (error) {
    console.error('Could not update the option group:', error);
    return { ok: false, message: failureMessage(error, MESSAGES.save) };
  }
  // RLS hides rows the caller may not change: no error, but nothing was updated.
  if (data.length === 0) return { ok: false, message: MESSAGES.noPermission };
  return { ok: true };
}

/** Removes the group and its choices. Sold lines keep their own copy of what was chosen. */
export async function deleteGroup(id: string): Promise<SaveResult> {
  const { data, error } = await getSupabase().from('option_groups').delete().eq('id', id).select('id');
  if (error) {
    console.error('Could not delete the option group:', error);
    return { ok: false, message: failureMessage(error, MESSAGES.remove) };
  }
  if (data.length === 0) return { ok: false, message: MESSAGES.noPermission };
  return { ok: true };
}

export type ChoiceInput = { name: string; priceDelta: Money };

export async function createChoice(
  storeId: string,
  groupId: string,
  input: ChoiceInput,
  position: number,
): Promise<CreateResult> {
  const { data, error } = await getSupabase()
    .from('option_choices')
    .insert({ store_id: storeId, group_id: groupId, name: input.name, price_delta: input.priceDelta, position })
    .select('id')
    .single();
  if (error) {
    console.error('Could not create the option choice:', error);
    return { ok: false, message: failureMessage(error, MESSAGES.save) };
  }
  return { ok: true, id: data.id };
}

export type ChoiceChanges = Partial<ChoiceInput & { isDefault: boolean; isActive: boolean }>;

export async function updateChoice(id: string, changes: ChoiceChanges): Promise<SaveResult> {
  const update = {
    ...(changes.name !== undefined && { name: changes.name }),
    ...(changes.priceDelta !== undefined && { price_delta: changes.priceDelta }),
    ...(changes.isDefault !== undefined && { is_default: changes.isDefault }),
    ...(changes.isActive !== undefined && { is_active: changes.isActive }),
  };
  const { data, error } = await getSupabase().from('option_choices').update(update).eq('id', id).select('id');
  if (error) {
    console.error('Could not update the option choice:', error);
    return { ok: false, message: failureMessage(error, MESSAGES.save) };
  }
  if (data.length === 0) return { ok: false, message: MESSAGES.noPermission };
  return { ok: true };
}

export async function deleteChoice(id: string): Promise<SaveResult> {
  const { data, error } = await getSupabase().from('option_choices').delete().eq('id', id).select('id');
  if (error) {
    console.error('Could not delete the option choice:', error);
    return { ok: false, message: failureMessage(error, MESSAGES.remove) };
  }
  if (data.length === 0) return { ok: false, message: MESSAGES.noPermission };
  return { ok: true };
}

/**
 * Makes `groupIds` exactly the groups of a product, in that order. New links are added first and
 * dropped ones removed after, so a failure part-way never leaves a product with fewer groups than
 * it had before the edit.
 */
export async function setProductGroups(
  storeId: string,
  productId: string,
  groupIds: readonly string[],
): Promise<SaveResult> {
  const db = getSupabase();
  const { data: existing, error: readError } = await db
    .from('product_option_groups')
    .select('group_id')
    .eq('product_id', productId);
  if (readError) {
    console.error('Could not read the product options:', readError);
    return { ok: false, message: failureMessage(readError, MESSAGES.save) };
  }

  const current = new Set(existing.map((row) => row.group_id));
  const wanted = new Set(groupIds);
  const toAdd = groupIds.filter((id) => !current.has(id));
  const toRemove = [...current].filter((id) => !wanted.has(id));

  if (toAdd.length > 0) {
    const { error } = await db.from('product_option_groups').insert(
      toAdd.map((groupId) => ({
        store_id: storeId,
        product_id: productId,
        group_id: groupId,
        position: groupIds.indexOf(groupId),
      })),
    );
    if (error) {
      console.error('Could not attach the option groups:', error);
      return { ok: false, message: failureMessage(error, MESSAGES.save) };
    }
  }
  if (toRemove.length > 0) {
    const { error } = await db.from('product_option_groups').delete().eq('product_id', productId).in('group_id', toRemove);
    if (error) {
      console.error('Could not detach the option groups:', error);
      return { ok: false, message: failureMessage(error, MESSAGES.save) };
    }
  }
  // Keep the order the owner chose for the groups that stay.
  for (const [position, groupId] of groupIds.entries()) {
    if (!current.has(groupId)) continue;
    const { error } = await db
      .from('product_option_groups')
      .update({ position })
      .eq('product_id', productId)
      .eq('group_id', groupId);
    if (error) {
      console.error('Could not reorder the option groups:', error);
      return { ok: false, message: failureMessage(error, MESSAGES.save) };
    }
  }
  return { ok: true };
}

import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import { EMPLOYEE_MESSAGES, type NewCashier } from './validation';

/** A cashier as the owner's employee list shows it. The login email lives in Auth, not in profiles. */
export type Cashier = { id: string; name: string; isActive: boolean };

type Field = 'name' | 'email' | 'password';

export type AdminResult = { ok: true } | { ok: false; message: string; field?: Field };

const MESSAGES = {
  offline: 'Tidak dapat terhubung ke server. Periksa koneksi internet lalu coba lagi.',
  unauthorized: 'Sesi Anda telah berakhir. Silakan masuk kembali.',
  forbidden: 'Hanya Owner yang dapat mengelola karyawan.',
  emailTaken: 'Email ini sudah dipakai akun lain. Gunakan email lain.',
  weakPassword: 'Password terlalu lemah. Gunakan password lain.',
  notFound: 'Akun kasir tidak ditemukan. Muat ulang halaman lalu coba lagi.',
  selfChange: 'Akun Owner tidak dapat diubah dari halaman ini.',
  invalid: 'Data tidak valid. Periksa kembali isian.',
  create: 'Akun kasir gagal dibuat. Coba lagi.',
  status: 'Status kasir gagal diubah. Coba lagi.',
  password: 'Password gagal direset. Coba lagi.',
  rename: 'Nama gagal disimpan. Coba lagi.',
} as const;

const FIELD_MESSAGES: Record<Field, string> = {
  name: EMPLOYEE_MESSAGES.nameRequired,
  email: EMPLOYEE_MESSAGES.emailInvalid,
  password: EMPLOYEE_MESSAGES.passwordTooShort,
};

function isField(value: unknown): value is Field {
  return value === 'name' || value === 'email' || value === 'password';
}

/** Turns an admin-cashier error body ({ error, field? }) into a message for the owner. */
function adminFailure(code: unknown, field: unknown, fallback: string): AdminResult {
  switch (code) {
    case 'unauthorized':
      return { ok: false, message: MESSAGES.unauthorized };
    case 'forbidden':
    case 'origin_not_allowed':
      return { ok: false, message: MESSAGES.forbidden };
    case 'email_taken':
      return { ok: false, message: MESSAGES.emailTaken, field: 'email' };
    case 'weak_password':
      return { ok: false, message: MESSAGES.weakPassword, field: 'password' };
    case 'not_found':
      return { ok: false, message: MESSAGES.notFound };
    case 'self_change':
      return { ok: false, message: MESSAGES.selfChange };
    case 'invalid_request':
      return isField(field)
        ? { ok: false, message: FIELD_MESSAGES[field], field }
        : { ok: false, message: MESSAGES.invalid };
    default:
      return { ok: false, message: fallback };
  }
}

type AdminRequest =
  | { action: 'create'; name: string; email: string; password: string }
  | { action: 'set_active'; cashier_id: string; is_active: boolean }
  | { action: 'reset_password'; cashier_id: string; password: string };

/**
 * Calls the admin-cashier Edge Function with the signed-in owner's session. The function checks
 * the caller; nothing here is a security control. Errors are logged without the request body,
 * which can hold a password.
 */
async function callAdmin(request: AdminRequest, fallback: string): Promise<AdminResult> {
  const { error } = await getSupabase().functions.invoke('admin-cashier', { body: request });
  if (!error) return { ok: true };

  if (error instanceof FunctionsFetchError) {
    console.error(`admin-cashier ${request.action}: request failed:`, error.message);
    return { ok: false, message: MESSAGES.offline };
  }
  if (error instanceof FunctionsHttpError) {
    const response: unknown = error.context;
    let body: unknown = null;
    if (response instanceof Response) {
      try {
        body = await response.json();
      } catch {
        // The gateway can answer with a non-JSON body (e.g. a rejected JWT); the fallback applies.
        body = null;
      }
    }
    const code = typeof body === 'object' && body !== null && 'error' in body ? body.error : null;
    const field = typeof body === 'object' && body !== null && 'field' in body ? body.field : null;
    console.error(`admin-cashier ${request.action}: refused:`, code ?? error.message);
    return adminFailure(code, field, fallback);
  }
  console.error(`admin-cashier ${request.action}: failed:`, error.message);
  return { ok: false, message: fallback };
}

/** The store's cashiers, inactive included. RLS lets only the owner read other profiles of the store. */
export async function listCashiers(): Promise<Cashier[]> {
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('id, name, is_active')
    .eq('role', 'cashier')
    .order('name');
  if (error) throw new Error(`Could not load the cashiers: ${error.message}`);
  return data.map((row) => ({ id: row.id, name: row.name, isActive: row.is_active }));
}

export function createCashier(input: NewCashier): Promise<AdminResult> {
  return callAdmin({ action: 'create', ...input }, MESSAGES.create);
}

/** Deactivate (also bans the Auth user) or reactivate, through the Edge Function (SECURITY E.10). */
export function setCashierActive(id: string, isActive: boolean): Promise<AdminResult> {
  return callAdmin({ action: 'set_active', cashier_id: id, is_active: isActive }, MESSAGES.status);
}

export function resetCashierPassword(id: string, password: string): Promise<AdminResult> {
  return callAdmin({ action: 'reset_password', cashier_id: id, password }, MESSAGES.password);
}

/**
 * The one profile edit the owner makes directly: the name. The column grant allows nothing else
 * (role, store_id, is_active are not updatable by clients) and RLS limits it to the owner's store.
 */
export async function renameCashier(id: string, name: string): Promise<AdminResult> {
  const { data, error } = await getSupabase()
    .from('profiles')
    .update({ name })
    .eq('id', id)
    .eq('role', 'cashier')
    .select('id');
  if (error) {
    console.error('Could not rename the cashier:', error);
    if (error.code === '23514') return { ok: false, message: EMPLOYEE_MESSAGES.nameRequired, field: 'name' };
    if (error.code === '42501') return { ok: false, message: MESSAGES.forbidden };
    if (!error.code) return { ok: false, message: MESSAGES.offline };
    return { ok: false, message: MESSAGES.rename };
  }
  // RLS hides rows the caller may not change: no error, but nothing was updated.
  if (data.length === 0) return { ok: false, message: MESSAGES.forbidden };
  return { ok: true };
}

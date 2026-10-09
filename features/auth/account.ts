import { isAuthApiError, isAuthRetryableFetchError } from '@supabase/supabase-js';
import type { Tables } from '@/lib/database.types';
import { isRole, type Role } from '@/lib/permissions';

/** The signed-in user's identity as the app uses it. */
export type Profile = {
  id: string;
  storeId: string;
  name: string;
  role: Role;
};

export type ProfileRow = Pick<Tables<'profiles'>, 'id' | 'store_id' | 'name' | 'role' | 'is_active'>;

export type SignedOutReason = 'inactive' | 'expired';

export type SessionState =
  /**
   * `offline`: the server could not be reached, so this is the profile it last confirmed on this
   * device (decision D5). The app works with it; the server still checks every sync.
   */
  | { status: 'signedIn'; profile: Profile; offline?: true }
  | { status: 'signedOut'; reason: SignedOutReason | null }
  /** The server could not be reached, so the session could not be checked. Never a reason to log out (D5). */
  | { status: 'unreachable' };

export const AUTH_MESSAGES = {
  required: {
    email: 'Email wajib diisi.',
    password: 'Password wajib diisi.',
  },
  invalidEmail: 'Format email tidak valid.',
  invalidCredentials: 'Email atau password salah.',
  inactive: 'Akun tidak aktif atau belum terdaftar. Hubungi Owner.',
  // After the app ended a session because the account check failed. Deactivation and an owner's
  // password reset both end the session on the server (INFO-3) and look the same to the device.
  accessEnded: 'Akses di perangkat ini dihentikan: akun dinonaktifkan atau password diganti oleh Owner. Hubungi Owner.',
  offline: 'Koneksi internet diperlukan untuk masuk.',
  serverError: 'Server sedang bermasalah. Coba lagi sebentar lagi.',
  rateLimited: 'Terlalu banyak percobaan masuk. Tunggu sebentar lalu coba lagi.',
  profileUnavailable: 'Gagal memuat data akun. Periksa koneksi lalu coba lagi.',
  sessionExpired: 'Sesi Anda telah berakhir. Silakan masuk kembali.',
  unknown: 'Gagal masuk. Silakan coba lagi.',
} as const;

/**
 * Account validation after login (SECURITY E.1): the profile must exist, be
 * active, and carry a known role. RLS already hides inactive profiles, so an
 * inactive account usually arrives here as null.
 */
export function toActiveProfile(row: ProfileRow | null): Profile | null {
  if (!row || !row.is_active || !isRole(row.role)) return null;
  return { id: row.id, storeId: row.store_id, name: row.name, role: row.role };
}

/** User-facing message for a failed signInWithPassword call (PRD §38, UI_SPEC A.8). */
export function loginErrorMessage(error: unknown): string {
  if (isAuthRetryableFetchError(error)) {
    // auth-js gives status 0 when no answer came back at all (offline, DNS, timeout) and the HTTP
    // status when the server answered with a failure (5xx). A server failure is not proof that the
    // connection is down, so it must not tell the user to look for internet.
    return error.status >= 500 ? AUTH_MESSAGES.serverError : AUTH_MESSAGES.offline;
  }
  if (isAuthApiError(error)) {
    switch (error.code) {
      case 'invalid_credentials':
        return AUTH_MESSAGES.invalidCredentials;
      // Deactivating a cashier also bans the auth user (SECURITY E.10).
      case 'user_banned':
        return AUTH_MESSAGES.inactive;
      case 'over_request_rate_limit':
        return AUTH_MESSAGES.rateLimited;
    }
  }
  return AUTH_MESSAGES.unknown;
}

const REASON_PARAM = 'alasan';

export function loginPath(reason: SignedOutReason | null): string {
  return reason ? `/login?${REASON_PARAM}=${reason}` : '/login';
}

/** Notice shown on the login page after the app signed the user out. */
export function signedOutNotice(searchParams: URLSearchParams): string | null {
  switch (searchParams.get(REASON_PARAM)) {
    case 'inactive':
      return AUTH_MESSAGES.accessEnded;
    case 'expired':
      return AUTH_MESSAGES.sessionExpired;
    default:
      return null;
  }
}

export type CredentialErrors = { email?: string; password?: string };

/** Inline validation before any request is made (UI_SPEC A.8). */
export function validateCredentials(email: string, password: string): CredentialErrors {
  const errors: CredentialErrors = {};
  if (email === '') errors.email = AUTH_MESSAGES.required.email;
  else if (!/^[^\s@]+@[^\s@]+$/.test(email)) errors.email = AUTH_MESSAGES.invalidEmail;
  if (password === '') errors.password = AUTH_MESSAGES.required.password;
  return errors;
}

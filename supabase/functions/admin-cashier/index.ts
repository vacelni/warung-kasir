/**
 * admin-cashier Edge Function entry point (Deno). Wires handler.ts to the Supabase admin API.
 *
 * The secret key is read from the function's environment only (SECURITY E.7): it never leaves
 * this process, is never logged, and never appears in a response.
 */
import { createClient, isAuthApiError, isAuthSessionMissingError } from 'npm:@supabase/supabase-js@2.117.3';
import { parseAllowedOrigins } from '../_shared/cors.ts';
import { handleRequest, type AdminApi, type ProfileRecord } from './handler.ts';

/** Long enough to be permanent; reactivation lifts it with 'none'. */
const BAN_DURATION = '876000h';

/** The new-style secret key (SUPABASE_SECRET_KEYS), falling back to the legacy service_role key. */
function secretKey(): string {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) {
    const parsed: unknown = JSON.parse(keys);
    if (typeof parsed === 'object' && parsed !== null && 'default' in parsed && typeof parsed.default === 'string') {
      return parsed.default;
    }
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  throw new Error('No server-side secret key is configured for admin-cashier.');
}

const url = Deno.env.get('SUPABASE_URL');
if (!url) throw new Error('SUPABASE_URL is not set.');

const supabase = createClient(url, secretKey(), {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const allowedOrigins = parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGINS'));

/** Logs what failed without the payload: messages from Auth/PostgREST carry no passwords or keys. */
function logFailure(step: string, error: { message: string; code?: string } | null): void {
  console.error(`admin-cashier: ${step} failed:`, error?.code ?? '', error?.message ?? 'no detail');
}

type ProfileRow = { id: string; store_id: string; name: string; role: string; is_active: boolean };

const admin: AdminApi = {
  async verifyToken(token) {
    const { data, error } = await supabase.auth.getUser(token);
    if (error) {
      // An API error is Auth refusing the token (invalid, expired, user gone), and a missing
      // session is a token whose session was ended (logout, password reset, deactivation); anything
      // else is an outage and must not look like "unauthorized".
      if (isAuthApiError(error) || isAuthSessionMissingError(error)) return null;
      throw new Error(`Auth could not verify the token: ${error.message}`);
    }
    return data.user.id;
  },

  async getProfile(userId): Promise<ProfileRecord | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, store_id, name, role, is_active')
      .eq('id', userId)
      .maybeSingle<ProfileRow>();
    if (error) throw new Error(`Could not read the profile: ${error.message}`);
    if (!data) return null;
    return { id: data.id, storeId: data.store_id, name: data.name, role: data.role, isActive: data.is_active };
  },

  async createUser(email, password) {
    // Confirmed at once: the owner assigns the login, the cashier needs no mailbox (PRD §25).
    const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) {
      if (error.code === 'email_exists' || error.code === 'user_already_exists') return { ok: false, reason: 'email_taken' };
      if (error.code === 'weak_password') return { ok: false, reason: 'weak_password' };
      logFailure('createUser', error);
      return { ok: false, reason: 'failed' };
    }
    return { ok: true, userId: data.user.id };
  },

  async deleteUser(userId) {
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) logFailure('deleteUser', error);
    return !error;
  },

  async insertCashierProfile({ id, storeId, name }) {
    // role and is_active are fixed here: this function never creates anything but an active cashier.
    const { error } = await supabase.from('profiles').insert({ id, store_id: storeId, name, role: 'cashier', is_active: true });
    if (error) logFailure('insert profile', error);
    return !error;
  },

  async setProfileActive(userId, isActive) {
    const { data, error } = await supabase
      .from('profiles')
      .update({ is_active: isActive })
      .eq('id', userId)
      .eq('role', 'cashier')
      .select('id');
    if (error) logFailure('update profile status', error);
    return !error && data.length === 1;
  },

  async setBanned(userId, banned) {
    const { error } = await supabase.auth.admin.updateUserById(userId, { ban_duration: banned ? BAN_DURATION : 'none' });
    if (error) logFailure(banned ? 'ban' : 'unban', error);
    return !error;
  },

  async setPassword(userId, password) {
    const { error } = await supabase.auth.admin.updateUserById(userId, { password });
    if (error) logFailure('set password', error);
    return !error;
  },

  async revokeSessions(userId) {
    const { error } = await supabase.rpc('revoke_user_sessions', { p_user_id: userId });
    if (error) logFailure('revoke sessions', error);
    return !error;
  },
};

Deno.serve((request) => handleRequest(request, { admin, allowedOrigins }));

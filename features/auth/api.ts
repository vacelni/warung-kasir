import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import {
  AUTH_MESSAGES,
  loginErrorMessage,
  toActiveProfile,
  type Profile,
  type SessionState,
} from './account';

type ProfileLookup =
  | { kind: 'found'; profile: Profile }
  /** No visible profile: missing, inactive (hidden by RLS), or an unknown role. */
  | { kind: 'invalid' }
  /** The Data API rejected the access token. */
  | { kind: 'rejected' }
  /** Network or server failure: the account state is unknown. */
  | { kind: 'unreachable' };

async function lookupProfile(userId: string): Promise<ProfileLookup> {
  const { data, error, status } = await getSupabase()
    .from('profiles')
    .select('id, store_id, name, role, is_active')
    .eq('id', userId)
    .maybeSingle();

  if (error) return status === 401 ? { kind: 'rejected' } : { kind: 'unreachable' };

  const profile = toActiveProfile(data);
  return profile ? { kind: 'found', profile } : { kind: 'invalid' };
}

export type SignInResult = { ok: true; profile: Profile } | { ok: false; message: string };

/**
 * Password login followed by account validation (SECURITY E.1). A session is
 * never kept for an account that fails validation.
 */
export async function signIn(email: string, password: string): Promise<SignInResult> {
  const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: loginErrorMessage(error) };

  const lookup = await lookupProfile(data.user.id);
  if (lookup.kind === 'found') return { ok: true, profile: lookup.profile };

  await signOut();
  return {
    ok: false,
    message: lookup.kind === 'invalid' ? AUTH_MESSAGES.inactive : AUTH_MESSAGES.profileUnavailable,
  };
}

/**
 * Resolves the stored session on app start (TECHNICAL_SPEC C.12, SECURITY E.9).
 * A network failure never ends the session; only a server rejection, a failed
 * account validation, or an explicit logout does.
 */
export async function loadSession(): Promise<SessionState> {
  const { data, error } = await getSupabase().auth.getSession();
  if (error) {
    // auth-js keeps the stored session when a refresh fails for network reasons
    // and removes it only when the server rejects the refresh token.
    return isAuthRetryableFetchError(error) ? { status: 'unreachable' } : { status: 'signedOut', reason: 'expired' };
  }
  if (!data.session) return { status: 'signedOut', reason: null };

  const lookup = await lookupProfile(data.session.user.id);
  switch (lookup.kind) {
    case 'found':
      return { status: 'signedIn', profile: lookup.profile };
    case 'unreachable':
      return { status: 'unreachable' };
    case 'rejected':
      await signOut();
      return { status: 'signedOut', reason: 'expired' };
    case 'invalid':
      await signOut();
      return { status: 'signedOut', reason: 'inactive' };
  }
}

export async function hasStoredSession(): Promise<boolean> {
  const { data } = await getSupabase().auth.getSession();
  return data.session !== null;
}

/**
 * Signs this device out. auth-js always clears the local session; an error only
 * means the server could not revoke the refresh token (e.g. offline).
 */
export async function signOut(): Promise<void> {
  const { error } = await getSupabase().auth.signOut({ scope: 'local' });
  if (error) {
    console.warn('Signed out locally; the server could not revoke the session:', error.message);
  }
}

/** Calls back when the session ends outside the app's control (refresh rejected, other tab). */
export function onSignedOut(callback: () => void): () => void {
  const { data } = getSupabase().auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') callback();
  });
  return () => data.subscription.unsubscribe();
}

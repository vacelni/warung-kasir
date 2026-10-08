import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { clearCatalog } from '@/features/offline/catalogCache';
import { getSupabase } from '@/lib/supabase';
import {
  AUTH_MESSAGES,
  loginErrorMessage,
  toActiveProfile,
  type Profile,
  type SessionState,
} from './account';
import { clearIdentity, readIdentity, saveIdentity } from './identityCache';

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
  if (lookup.kind === 'found') {
    await rememberIdentity(lookup.profile);
    return { ok: true, profile: lookup.profile };
  }

  await signOut();
  return {
    ok: false,
    message: lookup.kind === 'invalid' ? AUTH_MESSAGES.inactive : AUTH_MESSAGES.profileUnavailable,
  };
}

/** Caches the confirmed profile for offline use. A failure only costs the offline start. */
async function rememberIdentity(profile: Profile): Promise<void> {
  try {
    await saveIdentity(profile, new Date());
  } catch (error) {
    console.warn('Could not cache the profile for offline use:', error);
  }
}

/**
 * The server could not be reached. With a cached profile of this user (`userId` null = the stored
 * session could not even be refreshed, so its user is unknown), the app opens with it and keeps
 * selling; otherwise there is nothing to open with yet.
 */
async function offlineIdentity(userId: string | null): Promise<SessionState> {
  try {
    const profile = await readIdentity(userId);
    if (profile) return { status: 'signedIn', profile, offline: true };
  } catch (error) {
    console.error('Could not read the cached profile:', error);
  }
  return { status: 'unreachable' };
}

/**
 * The cached profile as a session state, without asking the server: what the app opens with when
 * the server check is slow or the device is offline (D5). Null when nothing is cached.
 */
export async function cachedSession(): Promise<SessionState | null> {
  const state = await offlineIdentity(null);
  return state.status === 'signedIn' ? state : null;
}

/**
 * Resolves the stored session on app start (TECHNICAL_SPEC C.12, SECURITY E.9).
 * A network failure never ends the session; only a server rejection, a failed
 * account validation, or an explicit logout does. Offline, the cached profile keeps the
 * user in the app (D5); sync still waits for a session the server accepts.
 */
export async function loadSession(): Promise<SessionState> {
  const { data, error } = await getSupabase().auth.getSession();
  if (error) {
    // auth-js keeps the stored session when a refresh fails for network reasons
    // and removes it only when the server rejects the refresh token.
    if (isAuthRetryableFetchError(error)) return offlineIdentity(null);
    await clearDeviceCaches();
    return { status: 'signedOut', reason: 'expired' };
  }
  if (!data.session) {
    await clearDeviceCaches();
    return { status: 'signedOut', reason: null };
  }

  const lookup = await lookupProfile(data.session.user.id);
  switch (lookup.kind) {
    case 'found':
      await rememberIdentity(lookup.profile);
      return { status: 'signedIn', profile: lookup.profile };
    case 'unreachable':
      return offlineIdentity(data.session.user.id);
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
  await clearDeviceCaches();
}

/**
 * What a session leaves on the device besides the outbox: the cached profile and the catalog
 * (TECHNICAL_SPEC C.10). Cleared on every sign-out. The outbox is never cleared here: pending and
 * failed sales stay on the device, tied to their cashier, until that cashier syncs them (C.12).
 */
export async function clearDeviceCaches(): Promise<void> {
  const results = await Promise.allSettled([clearIdentity(), clearCatalog()]);
  for (const result of results) {
    if (result.status === 'rejected') console.error('Could not clear a device cache:', result.reason);
  }
}

/** Calls back when the session ends outside the app's control (refresh rejected, other tab). */
export function onSignedOut(callback: () => void): () => void {
  const { data } = getSupabase().auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') callback();
  });
  return () => data.subscription.unsubscribe();
}

/**
 * Calls back when the server has just accepted the session again (login, token refreshed): the
 * moment sync and an offline identity can be checked. Deferred, because auth-js must not be
 * called from inside its own listener.
 */
export function onSessionRefreshed(callback: () => void): () => void {
  const { data } = getSupabase().auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') setTimeout(callback, 0);
  });
  return () => data.subscription.unsubscribe();
}

import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { clearCatalog } from '@/features/offline/catalogCache';
import { AUTH_STORAGE_KEY, getSupabase, hasStoredSessionData, removeStoredSession } from '@/lib/supabase';
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

/** How long logout waits for the server to revoke the session before ending it on the device anyway. */
export const SIGN_OUT_SERVER_WAIT_MS = 4_000;

/** The promise's result, or `timedOut` when it takes longer than `ms`. */
async function within<T>(promise: Promise<T>, ms: number): Promise<{ timedOut: false; value: T } | { timedOut: true }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ timedOut: true }>((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), ms);
  });
  try {
    return await Promise.race([promise.then((value) => ({ timedOut: false as const, value })), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Signs this device out (SEC-01). Online, the server is asked to revoke the session first, for at
 * most SIGN_OUT_SERVER_WAIT_MS. auth-js does not remove a stored session whose expired token it
 * could not refresh (offline, server down), so whenever that call fails, times out, or is skipped
 * offline, the session is deleted from storage here; auth-js then only drops it from its state and
 * announces SIGNED_OUT in this tab and the others. The next person on the device always gets the
 * login page. The outbox is never touched: unsynced sales stay for their cashier (C.12).
 */
export async function signOut(): Promise<void> {
  const auth = getSupabase().auth;
  let revoked = false;
  if (navigator.onLine) {
    const attempt = await within(auth.signOut({ scope: 'local' }), SIGN_OUT_SERVER_WAIT_MS);
    if (attempt.timedOut) console.warn('Signing out: the server did not answer; ending the session on this device.');
    else if (attempt.value.error) console.warn('Signing out: the server could not revoke the session:', attempt.value.error.message);
    else revoked = true;
  }

  if (!revoked || hasStoredSessionData()) {
    removeStoredSession();
    const local = await within(auth.signOut({ scope: 'local' }), SIGN_OUT_SERVER_WAIT_MS);
    if (local.timedOut || local.value.error) console.warn('Signing out: the session was removed from this device.');
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

/**
 * Calls back when the session ends outside the app's control (refresh rejected, other tab). Also
 * when another tab deletes the stored session directly (SEC-01), which auth-js may not announce.
 */
export function onSignedOut(callback: () => void): () => void {
  const { data } = getSupabase().auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') callback();
  });
  const onStorage = (event: StorageEvent) => {
    // key null: the other tab cleared the whole storage.
    if ((event.key === AUTH_STORAGE_KEY || event.key === null) && !hasStoredSessionData()) callback();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    data.subscription.unsubscribe();
    window.removeEventListener('storage', onStorage);
  };
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

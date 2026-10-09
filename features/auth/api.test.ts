import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readCatalog, saveCatalog } from '@/features/offline/catalogCache';
import { enqueueTransaction, getOutboxEntry } from '@/features/offline/outbox';
import { resetIndexedDb } from '@/lib/test-support/fakeIndexedDb';
import { testSnapshot } from '@/lib/test-support/transactions';
import { AUTH_MESSAGES, type Profile, type ProfileRow } from './account';
import { loadSession, signIn, signOut } from './api';
import { readIdentity, saveIdentity } from './identityCache';

const supabase = vi.hoisted(() => {
  const profileQuery = {
    response: { data: null as unknown, error: null as unknown, status: 200 },
    maybeSingle: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
  };
  profileQuery.maybeSingle.mockImplementation(async () => profileQuery.response);
  profileQuery.eq.mockImplementation(() => ({ maybeSingle: profileQuery.maybeSingle }));
  profileQuery.select.mockImplementation(() => ({ eq: profileQuery.eq }));

  return {
    profileQuery,
    from: vi.fn(() => ({ select: profileQuery.select })),
    auth: {
      signInWithPassword: vi.fn(),
      getSession: vi.fn(),
      signOut: vi.fn(),
    },
  };
});

vi.mock('@/lib/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase')>()),
  getSupabase: () => ({ auth: supabase.auth, from: supabase.from }),
}));

const USER_ID = 'a2000000-0000-4000-8000-000000000001';

const activeCashier: ProfileRow = {
  id: USER_ID,
  store_id: '5a000000-0000-4000-8000-000000000001',
  name: 'Andi',
  role: 'cashier',
  is_active: true,
};

function profileReturns(data: ProfileRow | null) {
  supabase.profileQuery.response = { data, error: null, status: 200 };
}

function profileFails(status: number) {
  supabase.profileQuery.response = {
    data: null,
    error: { message: 'request failed', code: '', details: '', hint: '' },
    status,
  };
}

function storedSession() {
  supabase.auth.getSession.mockResolvedValue({
    data: { session: { user: { id: USER_ID } } },
    error: null,
  });
}

beforeEach(async () => {
  await resetIndexedDb();
  vi.clearAllMocks();
  supabase.auth.signOut.mockResolvedValue({ error: null });
  supabase.auth.signInWithPassword.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  profileReturns(activeCashier);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('signIn', () => {
  it('returns the validated profile for an active account', async () => {
    const result = await signIn('kasir1.a@warungkasir.test', 'password123');

    expect(result).toEqual({
      ok: true,
      profile: { id: USER_ID, storeId: activeCashier.store_id, name: 'Andi', role: 'cashier' },
    });
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'kasir1.a@warungkasir.test',
      password: 'password123',
    });
    expect(supabase.from).toHaveBeenCalledWith('profiles');
    expect(supabase.profileQuery.eq).toHaveBeenCalledWith('id', USER_ID);
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it('reports wrong credentials without loading a profile', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'),
    });

    expect(await signIn('owner.a@warungkasir.test', 'salah')).toEqual({
      ok: false,
      message: 'Email atau password salah.',
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('reports a banned (deactivated) account as inactive', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError('User is banned', 400, 'user_banned'),
    });

    expect(await signIn('nonaktif.a@warungkasir.test', 'password123')).toEqual({
      ok: false,
      message: AUTH_MESSAGES.inactive,
    });
  });

  it('reports that login needs a connection when the network fails', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: new AuthRetryableFetchError('Failed to fetch', 0),
    });

    expect(await signIn('owner.a@warungkasir.test', 'password123')).toEqual({
      ok: false,
      message: AUTH_MESSAGES.offline,
    });
  });

  it('signs out again when the profile is hidden (inactive or missing)', async () => {
    profileReturns(null);

    expect(await signIn('nonaktif.a@warungkasir.test', 'password123')).toEqual({
      ok: false,
      message: AUTH_MESSAGES.inactive,
    });
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('signs out again when the profile is inactive', async () => {
    profileReturns({ ...activeCashier, is_active: false });

    const result = await signIn('nonaktif.a@warungkasir.test', 'password123');

    expect(result).toEqual({ ok: false, message: AUTH_MESSAGES.inactive });
    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it('does not keep an unvalidated session when the profile cannot be loaded', async () => {
    profileFails(0);

    expect(await signIn('owner.a@warungkasir.test', 'password123')).toEqual({
      ok: false,
      message: AUTH_MESSAGES.profileUnavailable,
    });
    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
  });
});

describe('loadSession', () => {
  it('is signed out when no session is stored', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });

    expect(await loadSession()).toEqual({ status: 'signedOut', reason: null });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('is signed in with the role from the active profile', async () => {
    storedSession();

    expect(await loadSession()).toEqual({
      status: 'signedIn',
      profile: { id: USER_ID, storeId: activeCashier.store_id, name: 'Andi', role: 'cashier' },
    });
  });

  it('stays signed in (unreachable) when the token refresh fails offline (D5)', async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: new AuthRetryableFetchError('Failed to fetch', 0),
    });

    expect(await loadSession()).toEqual({ status: 'unreachable' });
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it('is signed out (expired) when the server rejects the refresh token', async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: new AuthApiError('Invalid Refresh Token: Refresh Token Not Found', 400, 'refresh_token_not_found'),
    });

    expect(await loadSession()).toEqual({ status: 'signedOut', reason: 'expired' });
  });

  it('stays signed in (unreachable) when the profile cannot be loaded', async () => {
    storedSession();
    profileFails(0);

    expect(await loadSession()).toEqual({ status: 'unreachable' });
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it('treats a server error as temporary, not as a logout', async () => {
    storedSession();
    profileFails(503);

    expect(await loadSession()).toEqual({ status: 'unreachable' });
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it('signs out (expired) when the Data API rejects the access token', async () => {
    storedSession();
    profileFails(401);

    expect(await loadSession()).toEqual({ status: 'signedOut', reason: 'expired' });
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('signs out (inactive) when the account was deactivated', async () => {
    storedSession();
    profileReturns(null);

    expect(await loadSession()).toEqual({ status: 'signedOut', reason: 'inactive' });
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});

describe('signOut', () => {
  it('signs out only this device', async () => {
    await signOut();

    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('reports, but does not fail on, a server that cannot revoke the session', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    supabase.auth.signOut.mockResolvedValue({ error: new AuthRetryableFetchError('Failed to fetch', 0) });

    await expect(signOut()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe('offline identity (decision D5)', () => {
  const andi: Profile = { id: USER_ID, storeId: activeCashier.store_id, name: 'Andi', role: 'cashier' };
  const CONFIRMED = new Date('2026-10-07T03:00:00.000Z');

  it('remembers the profile the server confirmed, at login and at app start', async () => {
    await signIn('kasir1.a@warungkasir.test', 'password123');
    expect(await readIdentity(USER_ID)).toEqual(andi);

    await resetIndexedDb();
    storedSession();
    await loadSession();
    expect(await readIdentity(USER_ID)).toEqual(andi);
  });

  it('offline with an expired token: stays in the app with the cached profile, no sign-out', async () => {
    await saveIdentity(andi, CONFIRMED);
    supabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: new AuthRetryableFetchError('Failed to fetch', 0),
    });

    expect(await loadSession()).toEqual({ status: 'signedIn', profile: andi, offline: true });
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it('offline with a valid token: uses the cached profile of that same user', async () => {
    await saveIdentity(andi, CONFIRMED);
    storedSession();
    profileFails(0);

    expect(await loadSession()).toEqual({ status: 'signedIn', profile: andi, offline: true });
  });

  it('never opens with another user’s cached profile', async () => {
    await saveIdentity({ ...andi, id: 'someone-else' }, CONFIRMED);
    storedSession();
    profileFails(0);

    expect(await loadSession()).toEqual({ status: 'unreachable' });
  });

  it('without a cached profile, offline is "unreachable" (nothing to open with yet)', async () => {
    storedSession();
    profileFails(0);

    expect(await loadSession()).toEqual({ status: 'unreachable' });
  });

  it('a server rejection is not offline: signed out, and the cached profile is gone', async () => {
    await saveIdentity(andi, CONFIRMED);
    supabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: new AuthApiError('Invalid Refresh Token: Refresh Token Not Found', 400, 'refresh_token_not_found'),
    });

    expect(await loadSession()).toEqual({ status: 'signedOut', reason: 'expired' });
    expect(await readIdentity(null)).toBeNull();
  });

  it('a deactivated account is signed out and loses its cached profile', async () => {
    await saveIdentity(andi, CONFIRMED);
    storedSession();
    profileReturns(null);

    expect(await loadSession()).toEqual({ status: 'signedOut', reason: 'inactive' });
    expect(await readIdentity(USER_ID)).toBeNull();
  });
});

describe('signOut and device data (TECHNICAL_SPEC C.10, C.12)', () => {
  it('clears the cached profile and catalog, and keeps every outbox entry', async () => {
    await saveIdentity({ id: USER_ID, storeId: 'store-a', name: 'Andi', role: 'cashier' }, new Date());
    await saveCatalog(USER_ID, 'store-a', { products: [], categories: [] }, new Date());
    await enqueueTransaction(testSnapshot({ id: 'pending-sale', cashier_id: USER_ID }));
    await enqueueTransaction(testSnapshot({ id: 'other-cashier', cashier_id: 'someone-else' }));

    await signOut();

    expect(await readIdentity(null)).toBeNull();
    expect(await readCatalog(USER_ID, 'store-a')).toBeNull();
    expect(await getOutboxEntry('pending-sale')).toMatchObject({ cashier_id: USER_ID, sync_status: 'pending' });
    expect(await getOutboxEntry('other-cashier')).toMatchObject({ cashier_id: 'someone-else' });
  });

  // What happens to the stored session itself is tested with the real client in signOut.test.ts
  // (SEC-01); this mock cannot show it.
  it('works offline: the caches are cleared, the outbox is not', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    supabase.auth.signOut.mockResolvedValue({ error: new AuthRetryableFetchError('Failed to fetch', 0) });
    await saveIdentity({ id: USER_ID, storeId: 'store-a', name: 'Andi', role: 'cashier' }, new Date());
    await enqueueTransaction(testSnapshot({ cashier_id: USER_ID }));

    await signOut();

    expect(await readIdentity(null)).toBeNull();
    expect(await getOutboxEntry(testSnapshot().id)).toBeDefined();
  });
});

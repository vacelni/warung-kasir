// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enqueueTransaction, getOutboxEntry } from '@/features/offline/outbox';
import { AUTH_STORAGE_KEY } from '@/lib/supabase';
import { resetIndexedDb } from '@/lib/test-support/fakeIndexedDb';
import { testSnapshot } from '@/lib/test-support/transactions';
import { SIGN_OUT_SERVER_WAIT_MS } from './api';
import { readIdentity, saveIdentity } from './identityCache';

// SEC-01 with the real supabase-js client (no mock of auth.signOut): what actually stays in
// localStorage after "Keluar" when the access token has expired and the server cannot be reached.

const USER_ID = 'a2000000-0000-4000-8000-000000000001';
const nowSeconds = () => Math.floor(Date.now() / 1000);

/** A session as auth-js stores it, with an access token that expired an hour ago. */
function expiredSession() {
  return {
    access_token: 'header.payload.signature',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: nowSeconds() - 3600,
    refresh_token: `refresh-${crypto.randomUUID()}`, // unique: auth-js caches a failed refresh per token
    user: { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'kasir@warungkasir.test', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' },
  };
}

function storedAuthKeys(): string[] {
  return Object.keys(localStorage).filter((key) => key.startsWith(AUTH_STORAGE_KEY));
}

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
}

let fetchMock: ReturnType<typeof vi.fn>;
// A fresh client per test: a refresh one test leaves hanging must not be joined by the next
// (auth-js runs one refresh at a time per client).
let getSupabase: typeof import('@/lib/supabase').getSupabase;
let signOut: typeof import('./api').signOut;
let onSignedOut: typeof import('./api').onSignedOut;

beforeEach(async () => {
  vi.resetModules();
  ({ getSupabase } = await import('@/lib/supabase'));
  ({ signOut, onSignedOut } = await import('./api'));
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test-fixture-not-a-real-key');
  fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  await resetIndexedDb();
  localStorage.clear();
  setOnline(true);
  // The client has started (no session yet); the session below expired while the app was open.
  await getSupabase().auth.initialize();
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(expiredSession()));
  await saveIdentity({ id: USER_ID, storeId: 'store-a', name: 'Andi', role: 'cashier' }, new Date());
  await enqueueTransaction(testSnapshot({ id: 'pending-sale', cashier_id: USER_ID }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('signOut with an expired access token (SEC-01)', () => {
  it('offline: removes the stored session at once, announces SIGNED_OUT, keeps the outbox', async () => {
    setOnline(false);
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const signedOut = vi.fn();
    const stop = onSignedOut(signedOut);

    const started = Date.now();
    await signOut();

    expect(Date.now() - started).toBeLessThan(1_000);
    expect(storedAuthKeys()).toEqual([]);
    await vi.waitFor(() => expect(signedOut).toHaveBeenCalled());
    expect(await readIdentity(null)).toBeNull();
    expect(await getOutboxEntry('pending-sale')).toMatchObject({ cashier_id: USER_ID, sync_status: 'pending' });
    // The next start finds no session to restore.
    expect((await getSupabase().auth.getSession()).data.session).toBeNull();
    stop();
  });

  it('"online" but the network fails: the session is still removed from the device', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await signOut();

    expect(storedAuthKeys()).toEqual([]);
    expect((await getSupabase().auth.getSession()).data.session).toBeNull();
    expect(await getOutboxEntry('pending-sale')).toBeDefined();
  }, 15_000);

  it('a server that never answers: logout gives up waiting after the bound and still ends the session', async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));

    const started = Date.now();
    await signOut();

    expect(Date.now() - started).toBeLessThan(SIGN_OUT_SERVER_WAIT_MS + 2_000);
    expect(storedAuthKeys()).toEqual([]);
  }, 15_000);
});

describe('a refresh that succeeds after logout gave up waiting (SEC-01 race)', () => {
  it('does not bring the session back: auth-js discards tokens refreshed after the session was removed', async () => {
    let answerRefresh: (response: Response) => void = () => {};
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (String(input).includes('grant_type=refresh_token')) {
        return new Promise<Response>((resolve) => {
          answerRefresh = resolve;
        });
      }
      return Promise.reject(new TypeError('Failed to fetch'));
    });

    await signOut(); // the refresh is still waiting: logout gave up after SIGN_OUT_SERVER_WAIT_MS
    expect(storedAuthKeys()).toEqual([]);

    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('grant_type=refresh_token'))).toBe(true);

    // The network comes back and the server answers the refresh with fresh tokens.
    const fresh = { ...expiredSession(), access_token: 'new.access.token', refresh_token: 'rotated', expires_at: nowSeconds() + 3600 };
    answerRefresh(new Response(JSON.stringify(fresh), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(storedAuthKeys()).toEqual([]);
    expect((await getSupabase().auth.getSession()).data.session).toBeNull();
  }, 15_000);
});

describe('onSignedOut across tabs (SEC-01)', () => {
  it('calls back when another tab deletes the stored session, not when it stores one', () => {
    const signedOut = vi.fn();
    const stop = onSignedOut(signedOut);

    window.dispatchEvent(new StorageEvent('storage', { key: AUTH_STORAGE_KEY, newValue: '{}' }));
    expect(signedOut).not.toHaveBeenCalled();

    localStorage.removeItem(AUTH_STORAGE_KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: AUTH_STORAGE_KEY, newValue: null }));
    expect(signedOut).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated', newValue: null }));
    expect(signedOut).toHaveBeenCalledTimes(1);

    stop();
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(signedOut).toHaveBeenCalledTimes(1);
  });
});

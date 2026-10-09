import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetIndexedDb } from '@/lib/test-support/fakeIndexedDb';
import { testSnapshot } from '@/lib/test-support/transactions';
import { enqueueTransaction, getOutboxEntry, markNotSynced, markSyncing } from './outbox';
import { classifySyncError, syncOnce } from './sync';

type RpcResponse = { data: unknown; error: { code?: string; message: string } | null };

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('@/features/auth/api', () => ({ signOut: mocks.signOut }));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: { getSession: mocks.getSession, refreshSession: mocks.refreshSession },
    rpc: (name: string, args: unknown) => ({
      abortSignal: () => mocks.rpc(name, args),
    }),
  }),
}));

const CASHIER = 'cashier-1';
const ID = testSnapshot().id;

function signedInAs(userId: string | null) {
  mocks.getSession.mockResolvedValue({ data: { session: userId ? { user: { id: userId } } : null }, error: null });
}

function respond(...responses: Array<RpcResponse | Error>) {
  for (const response of responses) {
    if (response instanceof Error) mocks.rpc.mockRejectedValueOnce(response);
    else mocks.rpc.mockResolvedValueOnce(response);
  }
}

const CREATED: RpcResponse = { data: 'created', error: null };
const EXISTS: RpcResponse = { data: 'exists', error: null };
const NETWORK_DOWN: RpcResponse = { data: null, error: { code: '', message: 'TypeError: Failed to fetch' } };

beforeEach(async () => {
  await resetIndexedDb();
  mocks.rpc.mockReset();
  mocks.getSession.mockReset();
  mocks.refreshSession.mockReset();
  mocks.signOut.mockReset();
  signedInAs(CASHIER);
});

describe('syncOnce', () => {
  it('sends the exact snapshot to create_transaction and marks the entry synced on created', async () => {
    await enqueueTransaction(testSnapshot());
    respond(CREATED);

    await expect(syncOnce(CASHIER)).resolves.toEqual({ synced: 1, pending: 0, failed: 0 });

    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('create_transaction', {
      p_id: ID,
      p_code: 'TRX-20261007-3F9A2C',
      p_created_at: '2026-10-07T03:32:00.000Z',
      p_total: 40000,
      p_paid_amount: 50000,
      p_change_amount: 10000,
      p_items: [
        { product_id: 'nasi', product_name: 'Nasi Goreng', unit_price: 15000, quantity: 2, subtotal: 30000 },
        { product_id: 'teh', product_name: 'Es Teh', unit_price: 5000, quantity: 2, subtotal: 10000 },
      ],
    });
    // Identity and store come from the server session, never from the payload.
    const [[, args]] = mocks.rpc.mock.calls as [[string, Record<string, unknown>]];
    expect(args).not.toHaveProperty('p_store_id');
    expect(args).not.toHaveProperty('p_cashier_id');
    expect(await getOutboxEntry(ID)).toMatchObject({ sync_status: 'synced', attempts: 1, last_error: null });
  });

  it('treats exists as success (the server already has this sale)', async () => {
    await enqueueTransaction(testSnapshot());
    respond(EXISTS);

    await syncOnce(CASHIER);

    expect((await getOutboxEntry(ID))?.sync_status).toBe('synced');
  });

  it('lost response: keeps the entry pending, then the retry sends the same UUID and sale time (G.11)', async () => {
    await enqueueTransaction(testSnapshot());
    // The server committed, but the response never reached the device.
    respond(NETWORK_DOWN);

    await expect(syncOnce(CASHIER)).resolves.toEqual({ synced: 0, pending: 1, failed: 0 });
    expect(await getOutboxEntry(ID)).toMatchObject({
      sync_status: 'pending',
      attempts: 1,
      last_error: 'TypeError: Failed to fetch',
    });

    respond(EXISTS);
    await syncOnce(CASHIER);

    const [[, first], [, retry]] = mocks.rpc.mock.calls as [[string, Record<string, unknown>], [string, Record<string, unknown>]];
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(retry).toMatchObject({ p_id: ID, p_created_at: '2026-10-07T03:32:00.000Z' });
    expect(retry).toEqual(first);
    expect(await getOutboxEntry(ID)).toMatchObject({ sync_status: 'synced', attempts: 2, last_error: null });
  });

  it.each([
    ['a timeout', { data: null, error: { code: '', message: 'AbortError: signal timed out' } }],
    ['a server error', { data: null, error: { message: '<html>502 Bad Gateway</html>' } }],
    ['an expired session', { data: null, error: { code: 'PGRST303', message: 'JWT expired' } }],
    ['a missing grant (no session)', { data: null, error: { code: '42501', message: 'permission denied' } }],
    ['an unexpected result', { data: 'ok', error: null }],
  ])('keeps the entry pending after %s', async (_, response) => {
    await enqueueTransaction(testSnapshot());
    respond(response);

    await syncOnce(CASHIER);

    expect(await getOutboxEntry(ID)).toMatchObject({ sync_status: 'pending', attempts: 1 });
  });

  it('keeps the entry pending when the request throws', async () => {
    await enqueueTransaction(testSnapshot());
    respond(new Error('boom'));

    await syncOnce(CASHIER);

    expect(await getOutboxEntry(ID)).toMatchObject({ sync_status: 'pending', last_error: 'boom' });
  });

  it('a session the server ended (WK003): keeps the sale pending, and signs out when the refresh is refused too', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.refreshSession.mockResolvedValue({ data: { session: null }, error: new AuthApiError('Invalid Refresh Token: Refresh Token Not Found', 400, 'refresh_token_not_found') });
    await enqueueTransaction(testSnapshot());
    await enqueueTransaction(testSnapshot({ id: 'second-sale' }));
    respond({ data: null, error: { code: 'WK003', message: 'create_transaction: the session has ended; sign in again' } });

    await expect(syncOnce(CASHIER)).resolves.toEqual({ synced: 0, pending: 2, failed: 0 });
    expect(await getOutboxEntry(ID)).toMatchObject({ sync_status: 'pending', attempts: 1 });
    expect(await getOutboxEntry('second-sale')).toMatchObject({ sync_status: 'pending', attempts: 0 }); // not sent
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.refreshSession).toHaveBeenCalledOnce();
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });

  it.each([
    ['cannot reach the server', new AuthRetryableFetchError('Failed to fetch', 0)],
    ['is rate limited (429)', new AuthApiError('Too many requests', 429, 'over_request_rate_limit')],
    ['meets a server error (500)', new AuthApiError('Internal error', 500, 'unexpected_failure')],
  ])('WK003 while the refresh %s: stays pending and signed in (retried later)', async (_, refreshError) => {
    mocks.refreshSession.mockResolvedValue({ data: { session: null }, error: refreshError });
    await enqueueTransaction(testSnapshot());
    respond({ data: null, error: { code: 'WK003', message: 'create_transaction: the session has ended; sign in again' } });

    await syncOnce(CASHIER);

    expect(await getOutboxEntry(ID)).toMatchObject({ sync_status: 'pending' });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it.each([
    ['an invalid sale (WK001)', 'WK001', 'create_transaction: paid_amount is less than total'],
    ['an inactive account (WK002)', 'WK002', 'create_transaction: the caller has no active profile'],
  ])('marks %s failed, keeps it on the device, and does not resend it automatically', async (_, code, message) => {
    await enqueueTransaction(testSnapshot());
    respond({ data: null, error: { code, message } });

    await expect(syncOnce(CASHIER)).resolves.toEqual({ synced: 0, pending: 0, failed: 1 });
    expect(await getOutboxEntry(ID)).toMatchObject({ sync_status: 'failed', last_error: `${code}: ${message}` });

    await syncOnce(CASHIER);
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(await getOutboxEntry(ID)).toBeDefined();
  });

  it('stops after a network failure and leaves the remaining sales pending', async () => {
    await enqueueTransaction(testSnapshot({ id: 'first', created_at: '2026-10-07T03:00:00.000Z' }));
    await enqueueTransaction(testSnapshot({ id: 'second', created_at: '2026-10-07T04:00:00.000Z' }));
    respond(NETWORK_DOWN);

    await expect(syncOnce(CASHIER)).resolves.toEqual({ synced: 0, pending: 2, failed: 0 });
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect((await getOutboxEntry('second'))?.sync_status).toBe('pending');
  });

  it('continues past a permanently rejected sale', async () => {
    await enqueueTransaction(testSnapshot({ id: 'bad', created_at: '2026-10-07T03:00:00.000Z' }));
    await enqueueTransaction(testSnapshot({ id: 'good', created_at: '2026-10-07T04:00:00.000Z' }));
    respond({ data: null, error: { code: 'WK001', message: 'rejected' } }, CREATED);

    await expect(syncOnce(CASHIER)).resolves.toEqual({ synced: 1, pending: 0, failed: 1 });
  });

  it('sends nothing without a session, and the sale stays pending (D5)', async () => {
    await enqueueTransaction(testSnapshot());
    signedInAs(null);

    await expect(syncOnce(CASHIER)).resolves.toEqual({ synced: 0, pending: 1, failed: 0, skipped: 'no-session' });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(await getOutboxEntry(ID)).toMatchObject({ sync_status: 'pending', attempts: 0 });
  });

  it('sends nothing when the session belongs to another user', async () => {
    await enqueueTransaction(testSnapshot());
    signedInAs('cashier-2');

    await expect(syncOnce(CASHIER)).resolves.toMatchObject({ skipped: 'no-session' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('sends only the signed-in cashier’s own sales', async () => {
    await enqueueTransaction(testSnapshot({ id: 'mine' }));
    await enqueueTransaction(testSnapshot({ id: 'theirs', cashier_id: 'cashier-2' }));
    respond(CREATED);

    await syncOnce(CASHIER);

    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect((await getOutboxEntry('theirs'))?.sync_status).toBe('pending');
  });

  it('resends an entry left syncing by an interrupted run', async () => {
    await enqueueTransaction(testSnapshot());
    await markSyncing(ID, new Date());
    respond(EXISTS);

    await syncOnce(CASHIER);

    expect(await getOutboxEntry(ID)).toMatchObject({ sync_status: 'synced', attempts: 2 });
  });

  it('runs overlapping calls one after another, so a sale is never sent twice at once', async () => {
    await enqueueTransaction(testSnapshot());
    respond(CREATED);

    await Promise.all([syncOnce(CASHIER), syncOnce(CASHIER)]);

    expect(mocks.rpc).toHaveBeenCalledOnce();
  });

  it('makes no request at all when nothing is waiting', async () => {
    await enqueueTransaction(testSnapshot());
    await markNotSynced(ID, 'failed', 'WK001: rejected');

    await expect(syncOnce(CASHIER)).resolves.toEqual({ synced: 0, pending: 0, failed: 0 });
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe('classifySyncError', () => {
  it.each([
    ['WK001', 'permanent'],
    ['WK002', 'permanent'],
    ['WK003', 'session'],
    ['22003', 'permanent'],
    ['23514', 'permanent'],
    ['', 'transient'],
    [undefined, 'transient'],
    ['PGRST301', 'transient'],
    ['PGRST202', 'transient'],
    ['42501', 'transient'],
    ['57014', 'transient'],
  ])('%s → %s', (code, kind) => {
    expect(classifySyncError({ code, message: 'x' })).toBe(kind);
  });
});

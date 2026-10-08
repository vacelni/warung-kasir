import { beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '@/lib/idb';
import { resetIndexedDb } from '@/lib/test-support/fakeIndexedDb';
import { testSnapshot as snapshot } from '@/lib/test-support/transactions';
import {
  countUnsynced,
  enqueueTransaction,
  getOutboxEntry,
  listEntries,
  listSyncable,
  markNotSynced,
  markSynced,
  markSyncing,
  pruneSynced,
  retryFailed,
  SYNCED_RETENTION_MS,
} from './outbox';

beforeEach(resetIndexedDb);

describe('enqueueTransaction', () => {
  it('stores the complete sale as pending, with no attempts yet', async () => {
    const entry = await enqueueTransaction(snapshot());

    expect(entry).toEqual({ ...snapshot(), sync_status: 'pending', attempts: 0, last_error: null, last_attempt_at: null });
    await expect(getOutboxEntry(snapshot().id)).resolves.toEqual(entry);
  });

  it('keeps the snapshot names and prices exactly as sold', async () => {
    await enqueueTransaction(snapshot());
    const stored = await getOutboxEntry(snapshot().id);

    expect(stored?.items[0]).toEqual({
      product_id: 'nasi',
      product_name: 'Nasi Goreng',
      unit_price: 15000,
      quantity: 2,
      subtotal: 30000,
    });
    expect(stored?.created_at).toBe('2026-10-07T03:32:00.000Z');
  });

  it('is idempotent on the id: a second write (double tap) keeps the first entry and adds nothing', async () => {
    const first = await enqueueTransaction(snapshot());
    const second = await enqueueTransaction(snapshot({ paid_amount: 100000, change_amount: 60000 }));

    expect(second).toEqual(first);
    expect(await listSyncable('cashier-1')).toHaveLength(1);
    expect((await getOutboxEntry(snapshot().id))?.paid_amount).toBe(50000);
  });

  it('never resets the sync state of an existing entry', async () => {
    await enqueueTransaction(snapshot());
    await markSyncing(snapshot().id, new Date('2026-10-07T03:33:00Z'));
    await markSynced(snapshot().id);

    await enqueueTransaction(snapshot());
    expect((await getOutboxEntry(snapshot().id))?.sync_status).toBe('synced');
  });

  it('survives closing and reopening the database (page refresh)', async () => {
    await enqueueTransaction(snapshot());
    await closeDb();

    expect((await getOutboxEntry(snapshot().id))?.sync_status).toBe('pending');
  });
});

describe('listSyncable', () => {
  it('returns only this cashier’s pending and syncing entries, oldest sale first', async () => {
    await enqueueTransaction(snapshot({ id: 'b', created_at: '2026-10-07T05:00:00.000Z' }));
    await enqueueTransaction(snapshot({ id: 'a', created_at: '2026-10-07T04:00:00.000Z' }));
    await enqueueTransaction(snapshot({ id: 'c', created_at: '2026-10-07T03:00:00.000Z' }));
    await enqueueTransaction(snapshot({ id: 'other', cashier_id: 'cashier-2' }));
    await enqueueTransaction(snapshot({ id: 'done' }));
    await enqueueTransaction(snapshot({ id: 'rejected' }));
    await markSyncing('c', new Date());
    await markSynced('done');
    await markNotSynced('rejected', 'failed', 'WK001: rejected');

    expect((await listSyncable('cashier-1')).map((entry) => entry.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('sync state updates', () => {
  it('records attempts and errors without touching the sale', async () => {
    await enqueueTransaction(snapshot());
    const id = snapshot().id;

    const syncing = await markSyncing(id, new Date('2026-10-07T03:33:00Z'));
    expect(syncing).toMatchObject({ sync_status: 'syncing', attempts: 1, last_attempt_at: '2026-10-07T03:33:00.000Z' });

    const pending = await markNotSynced(id, 'pending', 'FetchError: Failed to fetch');
    expect(pending).toMatchObject({ sync_status: 'pending', attempts: 1, last_error: 'FetchError: Failed to fetch' });

    await markSyncing(id, new Date('2026-10-07T03:40:00Z'));
    const synced = await markSynced(id);
    expect(synced).toMatchObject({ sync_status: 'synced', attempts: 2, last_error: null });

    expect(synced).toMatchObject(snapshot());
  });

  it('keeps a failed entry with its error', async () => {
    await enqueueTransaction(snapshot());
    await markNotSynced(snapshot().id, 'failed', 'WK002: inactive');

    expect(await getOutboxEntry(snapshot().id)).toMatchObject({ sync_status: 'failed', last_error: 'WK002: inactive' });
  });

  it('refuses to update an entry that does not exist, and never creates one', async () => {
    await expect(markSynced('missing')).rejects.toThrow('does not exist');
    await expect(getOutboxEntry('missing')).resolves.toBeUndefined();
  });
});

describe('countUnsynced', () => {
  it('counts this cashier’s pending (incl. syncing) and failed entries; synced ones are done', async () => {
    for (const id of ['p1', 'p2', 's1', 'f1', 'done']) await enqueueTransaction(snapshot({ id }));
    await enqueueTransaction(snapshot({ id: 'theirs', cashier_id: 'cashier-2' }));
    await markSyncing('s1', new Date());
    await markNotSynced('f1', 'failed', 'WK001: rejected');
    await markSynced('done');

    expect(await countUnsynced('cashier-1')).toEqual({ pending: 3, failed: 1 });
    expect(await countUnsynced('cashier-2')).toEqual({ pending: 1, failed: 0 });
    expect(await countUnsynced('nobody')).toEqual({ pending: 0, failed: 0 });
  });
});

describe('retryFailed (Coba lagi)', () => {
  it('puts only this cashier’s failed entries back to pending, keeping the sale and its error', async () => {
    await enqueueTransaction(snapshot({ id: 'mine' }));
    await enqueueTransaction(snapshot({ id: 'theirs', cashier_id: 'cashier-2' }));
    await enqueueTransaction(snapshot({ id: 'done' }));
    await markNotSynced('mine', 'failed', 'WK002: inactive');
    await markNotSynced('theirs', 'failed', 'WK002: inactive');
    await markSynced('done');

    expect(await retryFailed('cashier-1')).toBe(1);

    expect(await getOutboxEntry('mine')).toMatchObject({
      ...snapshot({ id: 'mine' }),
      sync_status: 'pending',
      last_error: 'WK002: inactive',
    });
    expect((await getOutboxEntry('theirs'))?.sync_status).toBe('failed');
    expect((await getOutboxEntry('done'))?.sync_status).toBe('synced');
  });
});

describe('pruneSynced (retention of synced copies)', () => {
  const NOW = new Date('2026-10-20T00:00:00.000Z');
  const old = new Date(NOW.getTime() - SYNCED_RETENTION_MS - 1);
  const recent = new Date(NOW.getTime() - SYNCED_RETENTION_MS + 60_000);

  it('keeps synced copies for 7 days after the server confirmed them', () => {
    expect(SYNCED_RETENTION_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('removes only old synced entries of this cashier; never pending, syncing, or failed, however old', async () => {
    for (const id of ['old-synced', 'recent-synced', 'old-pending', 'old-syncing', 'old-failed']) {
      await enqueueTransaction(snapshot({ id, created_at: '2026-01-01T00:00:00.000Z' }));
    }
    await enqueueTransaction(snapshot({ id: 'theirs-old-synced', cashier_id: 'cashier-2' }));
    await markSyncing('old-synced', old);
    await markSynced('old-synced');
    await markSyncing('recent-synced', recent);
    await markSynced('recent-synced');
    await markSyncing('old-pending', old);
    await markNotSynced('old-pending', 'pending', 'TypeError: Failed to fetch');
    await markSyncing('old-syncing', old);
    await markSyncing('old-failed', old);
    await markNotSynced('old-failed', 'failed', 'WK001: rejected');
    await markSyncing('theirs-old-synced', old);
    await markSynced('theirs-old-synced');

    expect(await pruneSynced('cashier-1', NOW)).toBe(1);

    const left = (await listEntries('cashier-1')).map((entry) => entry.id).sort();
    expect(left).toEqual(['old-failed', 'old-pending', 'old-syncing', 'recent-synced']);
    expect(await getOutboxEntry('theirs-old-synced')).toBeDefined();
  });
});

describe('created_at and device clock (D4, TECHNICAL_SPEC C.12)', () => {
  it('keeps the sale time from the device as sold, even from a wrong clock, through every sync state', async () => {
    // A device clock a year ahead: the sale time and its code are what the cashier's device said.
    // They are never regenerated on retry or sync (the server keeps created_at as sent, D4).
    const skewed = snapshot({ created_at: '2027-10-07T16:30:00.000Z', code: 'TRX-20271007-3F9A2C' });
    await enqueueTransaction(skewed);
    await markSyncing(skewed.id, new Date('2026-10-07T03:33:00Z'));
    await markNotSynced(skewed.id, 'pending', 'TypeError: Failed to fetch');
    await markSyncing(skewed.id, new Date('2026-10-07T03:40:00Z'));
    await markSynced(skewed.id);

    expect(await getOutboxEntry(skewed.id)).toMatchObject({
      created_at: '2027-10-07T16:30:00.000Z',
      code: 'TRX-20271007-3F9A2C',
    });
  });
});

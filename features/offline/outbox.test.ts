import { beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '@/lib/idb';
import { resetIndexedDb } from '@/lib/test-support/fakeIndexedDb';
import { testSnapshot as snapshot } from '@/lib/test-support/transactions';
import {
  enqueueTransaction,
  getOutboxEntry,
  listSyncable,
  markNotSynced,
  markSynced,
  markSyncing,
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

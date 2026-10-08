import type { TransactionSnapshot } from '@/lib/checkout';
import { getDb, type OutboxEntry, type SyncStatus } from '@/lib/idb';

export type { OutboxEntry, SyncStatus };

/**
 * Saves a sale to the device outbox as `pending`. This is the checkout's only write
 * (decision C31): online or offline, the server is reached later by sync.
 *
 * Idempotent on the id: writing the same id again (double tap, retry after an error) keeps
 * the first entry untouched and returns it, so one checkout can never become two sales.
 */
export async function enqueueTransaction(snapshot: TransactionSnapshot): Promise<OutboxEntry> {
  const db = await getDb();
  const tx = db.transaction('outbox', 'readwrite');
  const existing = await tx.store.get(snapshot.id);
  if (existing) {
    await tx.done;
    return existing;
  }
  const entry: OutboxEntry = {
    ...snapshot,
    items: snapshot.items.map((item) => ({ ...item })),
    sync_status: 'pending',
    attempts: 0,
    last_error: null,
    last_attempt_at: null,
  };
  // add, not put: an existing entry is never overwritten.
  await tx.store.add(entry);
  await tx.done;
  return entry;
}

export async function getOutboxEntry(id: string): Promise<OutboxEntry | undefined> {
  return (await getDb()).get('outbox', id);
}

/**
 * Entries of one cashier that sync should send, oldest sale first. `syncing` is included:
 * an entry still marked syncing when a run starts was interrupted (tab closed, reload) and
 * is safe to resend because the RPC is idempotent. `failed` entries wait for the user.
 */
export async function listSyncable(cashierId: string): Promise<OutboxEntry[]> {
  const entries = await (await getDb()).getAllFromIndex('outbox', 'by_cashier', cashierId);
  return entries
    .filter((entry) => entry.sync_status === 'pending' || entry.sync_status === 'syncing')
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

type SyncFields = Pick<OutboxEntry, 'sync_status' | 'attempts' | 'last_error' | 'last_attempt_at'>;

/** Changes only the sync fields; the sale itself is immutable. Never creates or deletes an entry. */
async function updateSyncFields(id: string, update: (entry: OutboxEntry) => SyncFields): Promise<OutboxEntry> {
  const db = await getDb();
  const tx = db.transaction('outbox', 'readwrite');
  const entry = await tx.store.get(id);
  if (!entry) throw new Error(`Outbox entry ${id} does not exist.`);
  const next: OutboxEntry = { ...entry, ...update(entry) };
  await tx.store.put(next);
  await tx.done;
  return next;
}

export function markSyncing(id: string, at: Date): Promise<OutboxEntry> {
  return updateSyncFields(id, (entry) => ({
    sync_status: 'syncing',
    attempts: entry.attempts + 1,
    last_error: entry.last_error,
    last_attempt_at: at.toISOString(),
  }));
}

/** The server confirmed the sale ('created' or 'exists'). The entry stays on the device. */
export function markSynced(id: string): Promise<OutboxEntry> {
  return updateSyncFields(id, (entry) => ({
    sync_status: 'synced',
    attempts: entry.attempts,
    last_error: null,
    last_attempt_at: entry.last_attempt_at,
  }));
}

/** Not synced: `pending` retries later, `failed` waits for the user. The error is kept either way. */
export function markNotSynced(id: string, status: 'pending' | 'failed', error: string): Promise<OutboxEntry> {
  return updateSyncFields(id, (entry) => ({
    sync_status: status,
    attempts: entry.attempts,
    last_error: error,
    last_attempt_at: entry.last_attempt_at,
  }));
}

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
  // `strict`: the browser reports success only after the write reached disk, so a sale the
  // success screen shows survives a crash or power loss right after (Chrome defaults to relaxed).
  const tx = db.transaction('outbox', 'readwrite', { durability: 'strict' });
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
  // add, not put: an existing entry is never overwritten. Awaiting both together means a
  // refused write (full storage) rejects here, once, instead of leaving tx.done unhandled.
  await Promise.all([tx.store.add(entry), tx.done]);
  return entry;
}

export async function getOutboxEntry(id: string): Promise<OutboxEntry | undefined> {
  return (await getDb()).get('outbox', id);
}

/**
 * Every entry of one cashier, whatever its sync status. History reads this to show sales the
 * server may not have yet; it never changes an entry.
 */
export async function listEntries(cashierId: string): Promise<OutboxEntry[]> {
  return (await getDb()).getAllFromIndex('outbox', 'by_cashier', cashierId);
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
  await Promise.all([tx.store.put(next), tx.done]);
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

/** Not yet on the server, for one cashier: what the sync indicator and the logout warning count. */
export type UnsyncedCounts = { pending: number; failed: number };

export async function countUnsynced(cashierId: string): Promise<UnsyncedCounts> {
  const entries = await listEntries(cashierId);
  let pending = 0;
  let failed = 0;
  for (const entry of entries) {
    if (entry.sync_status === 'failed') failed += 1;
    else if (entry.sync_status !== 'synced') pending += 1;
  }
  return { pending, failed };
}

/**
 * "Coba lagi" on failed sales: puts this cashier's `failed` entries back to `pending` so the next
 * sync sends them again (same UUID, same sale). The last error is kept until a new attempt
 * replaces it. Returns how many were reset.
 */
export async function retryFailed(cashierId: string): Promise<number> {
  const db = await getDb();
  const tx = db.transaction('outbox', 'readwrite');
  const entries = await tx.store.index('by_cashier').getAll(cashierId);
  const failed = entries.filter((entry) => entry.sync_status === 'failed');
  await Promise.all([
    ...failed.map((entry) => tx.store.put({ ...entry, sync_status: 'pending' })),
    tx.done,
  ]);
  return failed.length;
}

/**
 * Local copies of synced sales are kept this long after the server confirmed them, so the
 * device's own recent sales still open offline (history, detail). The server keeps them forever.
 */
export const SYNCED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Removes this cashier's `synced` entries confirmed more than SYNCED_RETENTION_MS before `now`.
 * The only deletion in the outbox: `pending`, `syncing`, and `failed` entries are never removed,
 * and the status is re-read inside the same write transaction, so an entry cannot change state
 * between the check and the delete. Returns how many were removed.
 */
export async function pruneSynced(cashierId: string, now: Date): Promise<number> {
  const cutoff = now.getTime() - SYNCED_RETENTION_MS;
  const db = await getDb();
  const tx = db.transaction('outbox', 'readwrite');
  const entries = await tx.store.index('by_cashier').getAll(cashierId);
  const expired = entries.filter(
    (entry) =>
      entry.sync_status === 'synced' &&
      entry.last_attempt_at !== null &&
      Date.parse(entry.last_attempt_at) < cutoff,
  );
  await Promise.all([...expired.map((entry) => tx.store.delete(entry.id)), tx.done]);
  return expired.length;
}

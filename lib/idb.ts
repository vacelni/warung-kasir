import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { TransactionSnapshot } from './checkout';

/** Client-only sync state (decision D3). Never stored as the server transaction status. */
export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

/** A sale waiting for, or done with, synchronization (TECHNICAL_SPEC C.12). */
export type OutboxEntry = TransactionSnapshot & {
  sync_status: SyncStatus;
  attempts: number;
  last_error: string | null;
  /** ISO 8601 time of the last sync attempt; null before the first. */
  last_attempt_at: string | null;
};

interface WarungKasirDB extends DBSchema {
  outbox: {
    key: string;
    value: OutboxEntry;
    indexes: { by_cashier: string };
  };
}

export type Db = IDBPDatabase<WarungKasirDB>;

const DB_NAME = 'warung-kasir';
const DB_VERSION = 1;

let dbPromise: Promise<Db> | undefined;

/**
 * The app's IndexedDB database, opened once per page. Schema changes bump DB_VERSION and add an
 * `oldVersion` step to `upgrade`; existing outbox entries must always survive an upgrade.
 */
export function getDb(): Promise<Db> {
  dbPromise ??= openDB<WarungKasirDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const outbox = db.createObjectStore('outbox', { keyPath: 'id' });
        outbox.createIndex('by_cashier', 'cashier_id');
      }
    },
    // Another tab needs a newer schema: let it upgrade, and reopen on next use.
    blocking() {
      void closeDb();
    },
    // The browser closed the connection (e.g. storage cleared): reopen on next use.
    terminated() {
      dbPromise = undefined;
    },
  }).catch((error: unknown) => {
    dbPromise = undefined;
    throw error;
  });
  return dbPromise;
}

/** Closes the connection; the next getDb() reopens it. Never deletes data. */
export async function closeDb(): Promise<void> {
  const pending = dbPromise;
  dbPromise = undefined;
  if (pending) (await pending).close();
}

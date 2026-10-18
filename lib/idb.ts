import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { TransactionSnapshot } from './checkout';
import type { CatalogOptionGroup } from './options';

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

/**
 * The signed-in user's profile as last confirmed by the server. Lets the app open offline with
 * the cached identity (decision D5). Holds no token or password: the session itself stays with
 * Supabase Auth. Cleared whenever the session ends.
 */
export type CachedIdentity = {
  id: string;
  storeId: string;
  name: string;
  role: string;
  /** ISO 8601 time the server last confirmed this profile. */
  confirmed_at: string;
};

/** Offline snapshot of the menu the cashier sells from (TECHNICAL_SPEC C.10). Cleared on logout. */
export type CatalogSnapshot = {
  /** The user who loaded it; another user never reads it. */
  user_id: string;
  store_id: string;
  /** `optionGroups` is absent in snapshots saved before product options existed (DATABASE D.12). */
  products: Array<{ id: string; name: string; price: number; categoryId: string; optionGroups?: CatalogOptionGroup[] }>;
  categories: Array<{ id: string; name: string }>;
  /**
   * The store's name, address, phone and receipt note, for the receipt view offline (TECHNICAL_SPEC
   * C.10, UI_SPEC A.15). Absent in snapshots saved before it was added; null when it could not be read.
   */
  store?: { name: string; address: string | null; phone: string | null; receipt_note: string | null } | null;
  /** ISO 8601 time it was read from the server. */
  saved_at: string;
};

interface WarungKasirDB extends DBSchema {
  outbox: {
    key: string;
    value: OutboxEntry;
    indexes: { by_cashier: string };
  };
  identity: {
    key: string;
    value: CachedIdentity;
  };
  catalog: {
    key: string;
    value: CatalogSnapshot;
  };
}

export type Db = IDBPDatabase<WarungKasirDB>;

const DB_NAME = 'warung-kasir';
const DB_VERSION = 2;

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
      // v2 (Phase 10): cached identity and catalog. The outbox is left exactly as it was.
      if (oldVersion < 2) {
        db.createObjectStore('identity', { keyPath: 'id' });
        db.createObjectStore('catalog', { keyPath: 'user_id' });
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

/**
 * True when the browser refused a write because the device storage is full (or the origin's
 * quota is used up). Checkout reports it in words the cashier can act on.
 */
export function isQuotaError(error: unknown): boolean {
  // A DOMException is not an Error subclass in every environment; check the name only.
  const name = typeof error === 'object' && error !== null && 'name' in error ? error.name : null;
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
}

/**
 * Asks the browser not to evict this origin's storage under pressure (TECHNICAL_SPEC C.12).
 * Chrome decides by itself (installed PWA, engagement); a refusal is normal and changes nothing,
 * the outbox simply stays "best effort" storage. Returns whether storage is persistent.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
    if (!storage?.persist) return false;
    if (await storage.persisted()) return true;
    return await storage.persist();
  } catch (error) {
    console.warn('Could not request persistent storage:', error);
    return false;
  }
}

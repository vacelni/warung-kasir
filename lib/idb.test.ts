import { openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetIndexedDb } from '@/lib/test-support/fakeIndexedDb';
import { testSnapshot } from '@/lib/test-support/transactions';
import { closeDb, getDb, isQuotaError, requestPersistentStorage, type OutboxEntry } from './idb';

beforeEach(resetIndexedDb);

describe('getDb schema upgrade', () => {
  it('upgrades a Phase 6 (v1) database without losing a single outbox entry', async () => {
    // What a device that sold offline before this release has on disk.
    const pendingSale: OutboxEntry = {
      ...testSnapshot(),
      sync_status: 'pending',
      attempts: 2,
      last_error: 'TypeError: Failed to fetch',
      last_attempt_at: '2026-10-07T03:40:00.000Z',
    };
    const v1 = await openDB('warung-kasir', 1, {
      upgrade(db) {
        db.createObjectStore('outbox', { keyPath: 'id' }).createIndex('by_cashier', 'cashier_id');
      },
    });
    await v1.put('outbox', pendingSale);
    v1.close();

    const db = await getDb();

    expect(db.version).toBe(2);
    expect([...db.objectStoreNames].sort()).toEqual(['catalog', 'identity', 'outbox']);
    expect(await db.get('outbox', pendingSale.id)).toEqual(pendingSale);
    expect(await db.getAllFromIndex('outbox', 'by_cashier', 'cashier-1')).toHaveLength(1);
    await closeDb();
  });
});

describe('getDb connection handling', () => {
  it('lets another tab upgrade the schema: this connection closes and a failed reopen is not cached', async () => {
    const db = await getDb();
    // A newer app version in another tab asks for version 3; the old connection must step aside.
    const newer = await openDB('warung-kasir', 3, { upgrade() {} });

    await expect(db.get('outbox', 'any')).rejects.toThrow();
    newer.close();

    // This (old) code asks for version 2, which the database has moved past: the open fails...
    await expect(getDb()).rejects.toThrow();
    // ...and the failure is not remembered, so each call tries again instead of returning one stale rejection.
    await expect(getDb()).rejects.toThrow();
  });

  it('closeDb with no open connection does nothing', async () => {
    await closeDb();
    await expect(closeDb()).resolves.toBeUndefined();
  });
});

describe('isQuotaError', () => {
  it('recognizes the browser’s "storage full" errors', () => {
    expect(isQuotaError(new DOMException('full', 'QuotaExceededError'))).toBe(true);
    expect(isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true);
  });

  it('does not mistake other failures for a full disk', () => {
    expect(isQuotaError(new DOMException('x', 'UnknownError'))).toBe(false);
    expect(isQuotaError(new Error('QuotaExceededError'))).toBe(false);
    expect(isQuotaError(null)).toBe(false);
  });
});

describe('requestPersistentStorage (TECHNICAL_SPEC C.12)', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    vi.restoreAllMocks();
  });

  function withStorage(storage: object | undefined) {
    Object.defineProperty(globalThis, 'navigator', { value: { storage }, configurable: true });
  }

  it('asks once and reports a grant', async () => {
    const persist = vi.fn(async () => true);
    withStorage({ persisted: async () => false, persist });

    await expect(requestPersistentStorage()).resolves.toBe(true);
    expect(persist).toHaveBeenCalledOnce();
  });

  it('does not ask again when storage is already persistent', async () => {
    const persist = vi.fn(async () => true);
    withStorage({ persisted: async () => true, persist });

    await expect(requestPersistentStorage()).resolves.toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it('carries on when the browser refuses (best-effort storage)', async () => {
    withStorage({ persisted: async () => false, persist: async () => false });
    await expect(requestPersistentStorage()).resolves.toBe(false);
  });

  it('carries on when the API is missing or throws', async () => {
    withStorage(undefined);
    await expect(requestPersistentStorage()).resolves.toBe(false);

    vi.spyOn(console, 'warn').mockImplementation(() => {});
    withStorage({ persisted: async () => Promise.reject(new Error('SecurityError')), persist: async () => true });
    await expect(requestPersistentStorage()).resolves.toBe(false);
  });
});

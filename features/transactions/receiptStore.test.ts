// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveCatalog } from '@/features/offline/catalogCache';
import { resetIndexedDb } from '@/lib/test-support/fakeIndexedDb';
import { loadReceiptStore, RECEIPT_SERVER_WAIT_MS } from './receiptStore';

const mocks = vi.hoisted(() => ({ getStoreProfile: vi.fn() }));
vi.mock('@/features/settings/api', () => ({ getStoreProfile: mocks.getStoreProfile }));

const SERVER = { name: 'Warung Bu Sari', address: 'Jl. Contoh No. 10', phone: '0812', receiptNote: 'Terima kasih :)' };
const DEVICE = { ...SERVER, name: 'Warung Bu Sari (copy)' };

beforeEach(async () => {
  await resetIndexedDb();
  mocks.getStoreProfile.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadReceiptStore (UI_SPEC A.15)', () => {
  it('uses the server when it answers', async () => {
    mocks.getStoreProfile.mockResolvedValue(SERVER);
    await saveCatalog('kasir-1', 'store-a', { products: [], categories: [], store: DEVICE }, new Date());

    expect(await loadReceiptStore('kasir-1', 'store-a')).toEqual(SERVER);
    expect(mocks.getStoreProfile).toHaveBeenCalledWith('store-a');
  });

  it('offline: uses the copy saved with this user’s catalog for this store', async () => {
    mocks.getStoreProfile.mockRejectedValue(new Error('offline'));
    await saveCatalog('kasir-1', 'store-a', { products: [], categories: [], store: DEVICE }, new Date());

    expect(await loadReceiptStore('kasir-1', 'store-a')).toEqual(DEVICE);
    expect(await loadReceiptStore('kasir-2', 'store-a')).toBeNull(); // never another user's copy
  });

  it('with no network at all, uses the device copy without asking the server', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await saveCatalog('kasir-1', 'store-a', { products: [], categories: [], store: DEVICE }, new Date());

    expect(await loadReceiptStore('kasir-1', 'store-a')).toEqual(DEVICE);
    expect(mocks.getStoreProfile).not.toHaveBeenCalled();
  });

  it('a server that does not answer is given up after the wait, then the device copy is used', async () => {
    mocks.getStoreProfile.mockImplementation(() => new Promise(() => {}));
    await saveCatalog('kasir-1', 'store-a', { products: [], categories: [], store: DEVICE }, new Date());

    const started = Date.now();
    expect(await loadReceiptStore('kasir-1', 'store-a')).toEqual(DEVICE);
    expect(Date.now() - started).toBeLessThan(RECEIPT_SERVER_WAIT_MS + 1_000);
  }, 10_000);

  it('null when neither exists: the receipt shows without a header', async () => {
    mocks.getStoreProfile.mockRejectedValue(new Error('offline'));
    expect(await loadReceiptStore('kasir-1', 'store-a')).toBeNull();
  });
});

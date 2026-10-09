import { readCatalog } from '@/features/offline/catalogCache';
import { getStoreProfile } from '@/features/settings/api';
import type { StoreProfile } from '@/features/settings/validation';

/**
 * Store header for the receipt view (UI_SPEC A.15): from the server when it answers, otherwise
 * the copy saved with this device's catalog (TECHNICAL_SPEC C.10). Null when neither exists; the
 * receipt is then shown without a header.
 */
/** How long the receipt waits for the server (its reads retry for seconds when the network is bad). */
export const RECEIPT_SERVER_WAIT_MS = 3_000;

async function fromServer(storeId: string): Promise<StoreProfile | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), RECEIPT_SERVER_WAIT_MS);
  });
  try {
    return await Promise.race([getStoreProfile(storeId), timeout]);
  } catch (error) {
    console.warn('Could not read the store details; using the copy on this device:', error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function loadReceiptStore(userId: string, storeId: string): Promise<StoreProfile | null> {
  // Offline, the copy on the device is used at once (D5: the cashier must not wait to show it).
  if (navigator.onLine) {
    const store = await fromServer(storeId);
    if (store) return store;
  }
  try {
    return (await readCatalog(userId, storeId))?.store ?? null;
  } catch (error) {
    console.error('Could not read the menu saved on this device:', error);
    return null;
  }
}

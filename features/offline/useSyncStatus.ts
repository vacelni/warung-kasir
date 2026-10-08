'use client';

import { useSyncExternalStore } from 'react';
import { syncManager, type SyncSnapshot } from './syncManager';

/** This tab's sync state for the signed-in user (counts, running, retry), kept current by the sync manager. */
export function useSyncStatus(): SyncSnapshot {
  return useSyncExternalStore(syncManager.subscribe, syncManager.getSnapshot, syncManager.getSnapshot);
}

'use client';

import { useEffect } from 'react';
import { onSessionRefreshed } from '@/features/auth/api';
import { requestPersistentStorage } from '@/lib/idb';
import { onOtherTabChange, syncManager } from './syncManager';

/**
 * Connects the browser's lifecycle to the sync manager for the signed-in user (TECHNICAL_SPEC
 * C.12): app start, session refreshed, `online`, tab visible again. Mounted once, by the app
 * shell. Every trigger goes through syncManager.request, so they never start parallel runs.
 */
export function useSyncAgent(cashierId: string): void {
  useEffect(() => {
    syncManager.setCashier(cashierId);
    void requestPersistentStorage();
    void syncManager.request('start');

    const onOnline = () => void syncManager.request('online');
    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncManager.request('visible');
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    const stopTabs = onOtherTabChange(() => syncManager.outboxChanged());
    let stopSession = () => {};
    try {
      stopSession = onSessionRefreshed(() => void syncManager.request('session'));
    } catch (error) {
      console.error('Could not watch the session for sync:', error);
    }

    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      stopTabs();
      stopSession();
      syncManager.setCashier(null);
    };
  }, [cashierId]);
}

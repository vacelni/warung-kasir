'use client';

import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/**
 * The browser's own view of the network: false only when the device has no network at all.
 * True does NOT mean Supabase is reachable (captive portal, server down); use it to label the UI
 * and to hide actions that certainly cannot work, never as proof a sync will succeed.
 */
export function useConnectivity(): { online: boolean } {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    // Static prerender: assume online; the client corrects it on hydration.
    () => true,
  );
  return { online };
}

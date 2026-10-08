'use client';

import { useEffect } from 'react';

/**
 * Registers out/sw.js (features/offline/sw.ts) so the app shell opens offline (PRD §35). Production
 * build only: `next dev` serves no sw.js and must never be cached. Runs after the page rendered and
 * never blocks it; if registration fails (unsupported browser, private mode) the app works online
 * as before and sales still go through the IndexedDB outbox.
 *
 * `updateViaCache: 'none'` makes the browser check sw.js itself on every navigation; a new version
 * installs in the background and takes over only on the next launch (see sw.ts).
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    if (process.env.NODE_ENV !== 'production') {
      // A worker left by a production build served on this origin would keep answering
      // navigations with old pages during development: remove it.
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch((error: unknown) => console.warn('Could not remove an old service worker:', error));
      return;
    }
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch((error: unknown) => {
      console.error('Service worker registration failed; the app works online only:', error);
    });
  }, []);
  return null;
}

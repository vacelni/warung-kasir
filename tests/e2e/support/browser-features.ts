import type { Page } from './test';

/** Removes the newer features before any page script runs, the way an older browser lacks them. */
export async function removeNewerBrowserFeatures(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'locks', { value: undefined, configurable: true });
    Object.defineProperty(window, 'BroadcastChannel', { value: undefined, configurable: true });
    Object.defineProperty(Navigator.prototype, 'storage', { value: undefined, configurable: true });
    // `'serviceWorker' in navigator` must be false, as in a browser without the feature.
    Reflect.deleteProperty(Navigator.prototype, 'serviceWorker');
  });
}

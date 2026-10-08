import { expect, test, type Page, type Response } from '@playwright/test';
import { OWNER, productCard, startOnline, supabaseEnv, waitForServiceWorkerControl } from './support/offline';

// PWA and service worker (PRD §35, TECHNICAL_SPEC C.10) against the production build on :3200.

/** Every URL in every cache of this origin. */
function cachedUrls(page: Page) {
  return page.evaluate(async () => {
    const result: Record<string, string[]> = {};
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      result[name] = (await cache.keys()).map((request) => request.url);
    }
    return result;
  });
}

/** The precache list compiled into sw.js. */
async function precacheList(page: Page): Promise<string[]> {
  const source = await (await page.request.get('/sw.js')).text();
  return JSON.parse(/const __WK_PRECACHE__ = (\[.*\]);/.exec(source)![1]!) as string[];
}

test('the service worker precaches this build and is served uncached', async ({ page }) => {
  await page.goto('/login');
  await waitForServiceWorkerControl(page);

  const sw = await page.request.get('/sw.js');
  expect(sw.headers()['cache-control']).toBe('no-cache');
  const list = await precacheList(page);
  for (const url of ['/', '/login', '/kasir', '/kasir/bayar', '/kasir/selesai', '/riwayat', '/riwayat/detail', '/lainnya', '/manifest.webmanifest', '/icon-192.png']) {
    expect(list).toContain(url);
  }
  expect(list.some((url) => url.startsWith('/_next/static/'))).toBe(true);

  // One versioned cache, holding exactly the build's own files.
  const caches = await cachedUrls(page);
  const names = Object.keys(caches);
  expect(names).toHaveLength(1);
  expect(names[0]).toMatch(/^wk-shell-[0-9a-f]{16}$/);
  const origin = new URL(page.url()).origin;
  expect(caches[names[0]!]!.map((url) => url.replace(origin, '')).sort()).toEqual([...list].sort());
});

test('offline: the app shell reopens and navigates (reload, bottom navigation, deep link)', async ({ page, context }) => {
  await startOnline(page, OWNER.email);

  await context.setOffline(true);
  await page.reload();

  // The cashier screen opens from the device: cached identity, cached menu.
  await expect(page.getByRole('banner')).toContainText(OWNER.name);
  await expect(productCard(page, 'Nasi Goreng')).toBeVisible();
  await expect(page.getByText(/Menu dan harga memakai data tersimpan di perangkat/)).toBeVisible();
  await expect(page.getByRole('banner').getByText('Offline')).toBeVisible();
  await expect(page).toHaveURL(/\/kasir$/);

  // Client navigation (RSC payloads come from the precache).
  const nav = page.getByRole('navigation', { name: 'Navigasi utama' });
  await nav.getByRole('link', { name: 'Riwayat' }).click();
  await expect(page).toHaveURL(/\/riwayat$/);
  await expect(page.getByRole('heading', { name: 'Riwayat', level: 1 })).toBeVisible();
  await nav.getByRole('link', { name: 'Lainnya' }).click();
  await expect(page.getByRole('region', { name: 'Status sinkronisasi' })).toBeVisible();

  // A full navigation to a precached route with a query string.
  await page.goto('/riwayat/detail?id=00000000-0000-4000-8000-000000000000');
  await expect(page.getByRole('banner')).toContainText(OWNER.name);
});

test('Supabase responses are never cached nor served by the service worker', async ({ page, context }) => {
  const supabaseOrigin = new URL(supabaseEnv().url).origin;
  const supabaseResponses: Response[] = [];
  page.on('response', (response) => {
    if (response.url().startsWith(supabaseOrigin)) supabaseResponses.push(response);
  });

  // Auth, PostgREST reads (catalog, profile, history, reports), all while the worker controls the page.
  await startOnline(page, OWNER.email);
  const nav = page.getByRole('navigation', { name: 'Navigasi utama' });
  await nav.getByRole('link', { name: 'Riwayat' }).click();
  await expect(page.getByRole('heading', { name: 'Riwayat', level: 1 })).toBeVisible();
  await nav.getByRole('link', { name: 'Laporan' }).click();
  await expect(page).toHaveURL(/\/laporan$/);
  await page.waitForLoadState('networkidle');

  expect(supabaseResponses.length).toBeGreaterThan(3);
  for (const response of supabaseResponses) expect(response.fromServiceWorker()).toBe(false);

  const origin = new URL(page.url()).origin;
  const list = new Set(await precacheList(page));
  for (const urls of Object.values(await cachedUrls(page))) {
    for (const url of urls) {
      expect(url.startsWith(origin)).toBe(true);
      expect(url).not.toContain(supabaseOrigin);
      expect(list.has(url.replace(origin, ''))).toBe(true);
    }
  }

  // Offline, a Supabase request is not answered from any cache: it fails like the network.
  await context.setOffline(true);
  const failed = await page.evaluate(async (url) => {
    try {
      await fetch(`${url}/rest/v1/products?select=id`);
      return false;
    } catch {
      return true;
    }
  }, supabaseOrigin);
  expect(failed).toBe(true);
});

test('installable PWA: manifest, icons, service worker (Chrome installability check)', async ({ page, context }) => {
  await page.goto('/login');
  await waitForServiceWorkerControl(page);

  const cdp = await context.newCDPSession(page);
  const { installabilityErrors } = (await cdp.send('Page.getInstallabilityErrors')) as {
    installabilityErrors: Array<{ errorId: string }>;
  };
  expect(installabilityErrors).toEqual([]);

  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ display: 'standalone', start_url: '/', scope: '/' });
  for (const icon of manifest.icons as Array<{ src: string }>) {
    expect((await page.request.get(icon.src)).ok()).toBe(true);
  }
});

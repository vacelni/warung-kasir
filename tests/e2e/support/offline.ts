import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, type APIRequestContext, type BrowserContext, type Page } from './test';

export { EXPIRED_AT, editStoredSession, storedAccessToken } from './session';

// Shared steps for the *.offline.spec.ts files. They run against the production build served on
// port 3000 (playwright.config.ts) and the local Supabase stack with the dev seed.

export const PASSWORD = 'password123';
export const KASIR1 = { email: 'kasir1.a@warungkasir.test', id: 'a2000000-0000-4000-8000-000000000001', name: 'Andi' };
export const KASIR2 = { email: 'kasir2.a@warungkasir.test', id: 'a2000000-0000-4000-8000-000000000002', name: 'Budi' };
export const OWNER = { email: 'owner.a@warungkasir.test', id: 'a1000000-0000-4000-8000-000000000001', name: 'Bu Sari' };
/** A product of store B: create_transaction must reject it for a store A cashier (WK001). */
export const STORE_B_PRODUCT = 'db000000-0000-4000-8000-000000000001';
export const RPC = '/rest/v1/rpc/create_transaction';

/** The local Supabase URL and publishable key, from the environment or .env.local (as the build used). */
export function supabaseEnv(): { url: string; key: string } {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    const text = readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf8');
    const read = (name: string) => new RegExp(`^${name}=(.*)$`, 'm').exec(text)?.[1]?.trim();
    url ??= read('NEXT_PUBLIC_SUPABASE_URL');
    key ??= read('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  }
  if (!url || !key) throw new Error('Supabase URL/key not found (.env.local).');
  return { url, key };
}

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'MASUK' }).click();
  await expect(page).toHaveURL(/\/kasir$/);
}

/**
 * Waits until the service worker is active, then reloads so it controls the page. (A new worker
 * never claims an open page: it takes over on the next load, by design.)
 */
export async function waitForServiceWorkerControl(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
}

/** Logs in, lets the service worker take over, and waits for the menu (which also saves it on the device). */
export async function startOnline(page: Page, email: string) {
  await login(page, email);
  await waitForServiceWorkerControl(page);
  await expect(productCard(page, 'Nasi Goreng')).toBeVisible();
  // The device copy of the menu is written right after the server answer.
  await expect.poll(() => catalogUser(page)).not.toBeNull();
}

export const productCard = (page: Page, name: string) =>
  page.getByRole('main').getByRole('button', { name: new RegExp(`^${name}`) });

/** Sells the given products, paying the exact amount, and returns the sale's UUID from the success screen. */
export async function sell(page: Page, products: string[]): Promise<string> {
  for (const name of products) await productCard(page, name).click();
  await page.getByRole('link', { name: 'LIHAT PESANAN' }).click();
  await page.getByRole('link', { name: 'LANJUT BAYAR' }).click();
  const main = page.getByRole('main');
  await main.getByRole('group', { name: 'Nominal cepat' }).getByRole('button', { name: 'UANG PAS' }).click();
  await main.getByRole('button', { name: 'BAYAR' }).click();
  await expect(page.getByRole('heading', { name: 'Transaksi Berhasil', level: 1 })).toBeVisible();
  return new URL(page.url()).searchParams.get('id')!;
}

export type Entry = {
  id: string;
  code: string;
  cashier_id: string;
  store_id: string;
  created_at: string;
  total: number;
  paid_amount: number;
  change_amount: number;
  sync_status: string;
  attempts: number;
  last_error: string | null;
  last_attempt_at: string | null;
  items: Array<{ product_id: string; product_name: string; unit_price: number; quantity: number; subtotal: number }>;
};

function idb<T>(page: Page, store: string, action: 'getAll'): Promise<T[]> {
  return page.evaluate(
    ({ store, action }) =>
      new Promise<T[]>((resolve, reject) => {
        const open = indexedDB.open('warung-kasir');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains(store)) {
            db.close();
            resolve([]);
            return;
          }
          const read = db.transaction(store).objectStore(store)[action]();
          read.onerror = () => reject(read.error);
          read.onsuccess = () => {
            resolve(read.result as T[]);
            db.close();
          };
        };
      }),
    { store, action },
  );
}

/** Every outbox entry in this browser's IndexedDB. */
export const outboxEntries = (page: Page) => idb<Entry>(page, 'outbox', 'getAll');

export async function outboxEntry(page: Page, id: string): Promise<Entry | undefined> {
  return (await outboxEntries(page)).find((entry) => entry.id === id);
}

async function catalogUser(page: Page): Promise<string | null> {
  const [snapshot] = await idb<{ user_id: string }>(page, 'catalog', 'getAll');
  return snapshot?.user_id ?? null;
}

/** Replaces one outbox entry (to stage a sale the server must reject). */
export function putOutboxEntry(page: Page, entry: Entry) {
  return page.evaluate(
    (value) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('warung-kasir');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('outbox', 'readwrite');
          tx.objectStore('outbox').put(value);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    entry,
  );
}

export type ServerTransaction = {
  id: string;
  cashier_id: string;
  code: string;
  total: number;
  created_at: string;
  synced_at: string;
};

/** Reads transactions back from the database through RLS with an owner session (a separate login). */
/**
 * Calls the admin-cashier Edge Function as the owner of store A, from the dev server's origin (the
 * one in the local ALLOWED_ORIGINS). Uses a request context of its own, so it works while a test's
 * browser context is offline.
 */
export async function asOwnerAdmin(request: APIRequestContext, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { url, key } = supabaseEnv();
  const login = await request.post(`${url}/auth/v1/token?grant_type=password`, { headers: { apikey: key }, data: { email: OWNER.email, password: PASSWORD } });
  const { access_token } = (await login.json()) as { access_token: string };
  const response = await request.post(`${url}/functions/v1/admin-cashier`, {
    headers: { apikey: key, Authorization: `Bearer ${access_token}`, Origin: 'http://localhost:3100' },
    data: body,
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as Record<string, unknown>;
}

export async function serverTransactions(context: BrowserContext, id: string): Promise<ServerTransaction[]> {
  const { url, key } = supabaseEnv();
  const login = await context.request.post(`${url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: key },
    data: { email: OWNER.email, password: PASSWORD },
  });
  expect(login.ok()).toBe(true);
  const { access_token } = (await login.json()) as { access_token: string };
  const response = await context.request.get(`${url}/rest/v1/transactions?id=eq.${id}&select=id,cashier_id,code,total,created_at,synced_at`, {
    headers: { apikey: key, authorization: `Bearer ${access_token}` },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as ServerTransaction[];
}

/** RPC calls made by any page of the context, with their p_id. */
export function recordRpcCalls(context: BrowserContext): string[] {
  const ids: string[] = [];
  context.on('request', (request) => {
    if (request.url().includes(RPC) && request.method() === 'POST') {
      ids.push(String((request.postDataJSON() as { p_id?: string }).p_id));
    }
  });
  return ids;
}

export async function openLainnya(page: Page) {
  await page.getByRole('navigation', { name: 'Navigasi utama' }).getByRole('link', { name: 'Lainnya' }).click();
  await expect(page).toHaveURL(/\/lainnya$/);
}

export const syncStatus = (page: Page) => page.getByRole('region', { name: 'Status sinkronisasi' });

/** Fires the browser's `online` event: the sync manager's trigger for "the network is back". */
export function signalOnline(page: Page) {
  return page.evaluate(() => window.dispatchEvent(new Event('online')));
}

const BOTTOM_TABS = new Set(['Kasir', 'Riwayat', 'Laporan', 'Lainnya']);

/**
 * Opens a screen the way a user of this viewport would: the sidebar on a tablet or desktop (every
 * screen is in it), the bottom navigation on a phone (the four tabs, and the rest through Lainnya).
 */
export async function goTo(page: Page, label: string) {
  const sidebar = page.getByRole('navigation', { name: 'Navigasi samping' });
  const bottom = page.getByRole('navigation', { name: 'Navigasi utama' });
  // Both exist in the page; CSS shows one. Wait for the shell before choosing.
  await expect(sidebar.or(bottom)).toBeVisible();
  if (await sidebar.isVisible()) {
    await sidebar.getByRole('link', { name: label, exact: true }).click();
    return;
  }
  if (BOTTOM_TABS.has(label)) {
    await page.getByRole('navigation', { name: 'Navigasi utama' }).getByRole('link', { name: label, exact: true }).click();
    return;
  }
  await openLainnya(page);
  await page.getByRole('main').getByRole('link', { name: label, exact: true }).click();
}

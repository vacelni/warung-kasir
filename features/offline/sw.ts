/**
 * WarungKasir service worker (TECHNICAL_SPEC C.10, C.12). Compiled by scripts/build-sw.mts after
 * `next build` into out/sw.js, a classic script: this file must not import anything.
 *
 * What it does:
 *  - install: downloads every file of this build (list generated from out/) into one versioned
 *    cache. All or nothing: if one file fails, this version does not install and the previous
 *    one keeps working.
 *  - fetch: answers a same-origin GET for a precached page or static file from that cache, so the
 *    app shell opens offline. Everything else goes to the network untouched.
 *  - activate: deletes the caches of older versions.
 *
 * What it never does:
 *  - cache Supabase (*.supabase.co: Auth, PostgREST, RPC, Edge Functions, Storage) or any other
 *    origin: cross-origin requests are not even intercepted;
 *  - write anything to a cache at runtime: the only cache writes are the build's own files during
 *    install, so no API response, token, or private data can ever end up in CacheStorage. The
 *    offline menu lives in IndexedDB, written by the app (features/offline/catalogCache.ts);
 *  - skipWaiting() or clients.claim(): a new version waits until every tab/window of the app is
 *    closed and takes over on the next launch, never in the middle of a sale.
 */

// Injected by scripts/build-sw.mts.
declare const __WK_PRECACHE__: readonly string[];
declare const __WK_CACHE_NAME__: string;

export const CACHE_PREFIX = 'wk-shell-';

/** Supabase hosts. Named explicitly so the rule is visible; they are cross-origin anyway. */
export function isSupabaseUrl(url: URL): boolean {
  const host = url.hostname;
  return host === 'supabase.co' || host.endsWith('.supabase.co') || host === 'supabase.in' || host.endsWith('.supabase.in');
}

/**
 * Cache key of the exported page for a navigation path: "/kasir/" and "/kasir.html" → "/kasir",
 * "/index.html" → "/". The query (e.g. ?id= on /riwayat/detail) never selects a different file.
 */
export function pageKey(pathname: string): string {
  let path = pathname.replace(/\/+$/, '') || '/';
  path = path.replace(/\.html$/, '');
  if (path === '/index') return '/';
  return path;
}

export type FetchDecision =
  /** Not intercepted: the browser fetches from the network as if there were no service worker. */
  | { kind: 'network' }
  /** Answer from the precache under `cacheKey`; if it is somehow missing, fetch the network (never stored). */
  | { kind: 'precache'; cacheKey: string };

export type FetchRequestInfo = { url: string; method: string; mode: string };

export function decideFetch(request: FetchRequestInfo, origin: string, precached: ReadonlySet<string>): FetchDecision {
  if (request.method !== 'GET') return { kind: 'network' };
  const url = new URL(request.url);
  if (url.origin !== origin || isSupabaseUrl(url)) return { kind: 'network' };
  const key = request.mode === 'navigate' ? pageKey(url.pathname) : url.pathname;
  return precached.has(key) ? { kind: 'precache', cacheKey: key } : { kind: 'network' };
}

/** Old versions of this app's cache; other caches on the origin are not ours to delete. */
export function staleCaches(keys: readonly string[], current: string): string[] {
  return keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== current);
}

// ---------------------------------------------------------------------------------------------
// Runtime (only inside a ServiceWorkerGlobalScope; never runs in the app, tests, or Node).

type ExtendableEvent = Event & { waitUntil(promise: Promise<unknown>): void };
type FetchEvent = ExtendableEvent & { request: Request; respondWith(response: Promise<Response>): void };
type ServiceWorkerScope = {
  location: Location;
  addEventListener(type: 'install' | 'activate', listener: (event: ExtendableEvent) => void): void;
  addEventListener(type: 'fetch', listener: (event: FetchEvent) => void): void;
};

/**
 * A redirected response cannot answer a navigation, so store a plain copy. Hosting with clean
 * URLs (Cloudflare) serves "/kasir" directly; this only guards against a host that redirects.
 */
async function storable(response: Response): Promise<Response> {
  if (!response.redirected) return response;
  return new Response(await response.blob(), { status: response.status, statusText: response.statusText, headers: response.headers });
}

async function precache(cacheName: string, urls: readonly string[]): Promise<void> {
  const cache = await caches.open(cacheName);
  try {
    await Promise.all(
      urls.map(async (url) => {
        // `reload` skips the HTTP cache, so a version never mixes in files of another deploy.
        const response = await fetch(new Request(url, { cache: 'reload', credentials: 'same-origin' }));
        if (!response.ok) throw new Error(`Precache failed for ${url}: HTTP ${response.status}`);
        await cache.put(url, await storable(response));
      }),
    );
  } catch (error) {
    // A half-filled cache must never be used; the previous version stays in charge.
    await caches.delete(cacheName);
    throw error;
  }
}

async function fromPrecache(cacheName: string, cacheKey: string, request: Request): Promise<Response> {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(cacheKey);
  return hit ?? fetch(request);
}

function start(scope: ServiceWorkerScope, cacheName: string, urls: readonly string[]): void {
  const precached = new Set(urls);

  scope.addEventListener('install', (event) => {
    // No skipWaiting(): see the header comment.
    event.waitUntil(precache(cacheName, urls));
  });

  scope.addEventListener('activate', (event) => {
    // No clients.claim(): pages opened before this version stay as they are until relaunched.
    event.waitUntil(caches.keys().then((keys) => Promise.all(staleCaches(keys, cacheName).map((key) => caches.delete(key)))));
  });

  scope.addEventListener('fetch', (event) => {
    const { request } = event;
    const decision = decideFetch(request, scope.location.origin, precached);
    if (decision.kind === 'network') return;
    event.respondWith(fromPrecache(cacheName, decision.cacheKey, request));
  });
}

if (typeof globalThis === 'object' && 'ServiceWorkerGlobalScope' in globalThis) {
  start(globalThis as unknown as ServiceWorkerScope, __WK_CACHE_NAME__, __WK_PRECACHE__);
}

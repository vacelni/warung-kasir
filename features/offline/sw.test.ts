import { describe, expect, it } from 'vitest';
import { CACHE_PREFIX, decideFetch, isSupabaseUrl, pageKey, staleCaches } from './sw';

const ORIGIN = 'https://warungkasir.pages.dev';
const PRECACHED = new Set(['/', '/kasir', '/riwayat/detail', '/login', '/_next/static/chunks/app.js', '/kasir.txt', '/manifest.webmanifest']);

const get = (url: string, mode = 'cors') => decideFetch({ url, method: 'GET', mode }, ORIGIN, PRECACHED);

describe('service worker: never caches Supabase (TECHNICAL_SPEC C.10, SECURITY)', () => {
  it.each([
    'https://abcdefghijklmnop.supabase.co/auth/v1/token?grant_type=refresh_token',
    'https://abcdefghijklmnop.supabase.co/rest/v1/products?select=*',
    'https://abcdefghijklmnop.supabase.co/rest/v1/rpc/create_transaction',
    'https://abcdefghijklmnop.supabase.co/functions/v1/admin-cashier',
    'https://abcdefghijklmnop.supabase.co/storage/v1/object/public/x.png',
    'http://127.0.0.1:54321/rest/v1/products',
  ])('leaves %s to the network (not intercepted)', (url) => {
    expect(get(url)).toEqual({ kind: 'network' });
    expect(get(url, 'navigate')).toEqual({ kind: 'network' });
  });

  it('even a precached-looking path on a Supabase host is not served from the cache', () => {
    expect(
      decideFetch({ url: 'https://x.supabase.co/kasir', method: 'GET', mode: 'navigate' }, 'https://x.supabase.co', PRECACHED),
    ).toEqual({ kind: 'network' });
  });

  it('recognizes Supabase hosts', () => {
    expect(isSupabaseUrl(new URL('https://abc.supabase.co/rest/v1'))).toBe(true);
    expect(isSupabaseUrl(new URL('https://abc.supabase.in'))).toBe(true);
    expect(isSupabaseUrl(new URL('https://notsupabase.com'))).toBe(false);
    expect(isSupabaseUrl(new URL('https://supabase.co.evil.example'))).toBe(false);
  });

  it('never intercepts writes (POST/PATCH/DELETE), same origin or not', () => {
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      expect(decideFetch({ url: `${ORIGIN}/kasir`, method, mode: 'cors' }, ORIGIN, PRECACHED)).toEqual({ kind: 'network' });
    }
  });

  it('never intercepts other origins (fonts, CDNs)', () => {
    expect(get('https://fonts.googleapis.com/css2?family=Inter')).toEqual({ kind: 'network' });
  });
});

describe('service worker: app shell offline', () => {
  it('serves a precached page for a navigation, ignoring the query', () => {
    expect(get(`${ORIGIN}/kasir`, 'navigate')).toEqual({ kind: 'precache', cacheKey: '/kasir' });
    expect(get(`${ORIGIN}/riwayat/detail?id=3f9a2c4e-7b1d-4c2a-9e10-000000000001`, 'navigate')).toEqual({
      kind: 'precache',
      cacheKey: '/riwayat/detail',
    });
    expect(get(`${ORIGIN}/`, 'navigate')).toEqual({ kind: 'precache', cacheKey: '/' });
  });

  it('serves precached static files and RSC payloads (client navigation) by path', () => {
    expect(get(`${ORIGIN}/_next/static/chunks/app.js`)).toEqual({ kind: 'precache', cacheKey: '/_next/static/chunks/app.js' });
    expect(get(`${ORIGIN}/kasir.txt?_rsc=1x2y3`)).toEqual({ kind: 'precache', cacheKey: '/kasir.txt' });
    expect(get(`${ORIGIN}/manifest.webmanifest`)).toEqual({ kind: 'precache', cacheKey: '/manifest.webmanifest' });
  });

  it('lets anything not in this build go to the network (and it is never stored)', () => {
    expect(get(`${ORIGIN}/unknown`, 'navigate')).toEqual({ kind: 'network' });
    expect(get(`${ORIGIN}/_next/static/chunks/other-build.js`)).toEqual({ kind: 'network' });
  });

  it('maps navigation paths to the exported page', () => {
    expect(pageKey('/kasir/')).toBe('/kasir');
    expect(pageKey('/kasir.html')).toBe('/kasir');
    expect(pageKey('/index.html')).toBe('/');
    expect(pageKey('/')).toBe('/');
    expect(pageKey('/riwayat/detail')).toBe('/riwayat/detail');
  });
});

describe('service worker: cache versions', () => {
  it('on activation deletes only older versions of this app cache', () => {
    const current = `${CACHE_PREFIX}new`;
    expect(staleCaches([`${CACHE_PREFIX}old1`, current, `${CACHE_PREFIX}old2`, 'someone-else'], current)).toEqual([
      `${CACHE_PREFIX}old1`,
      `${CACHE_PREFIX}old2`,
    ]);
  });
});

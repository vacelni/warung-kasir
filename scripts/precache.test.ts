import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cacheName, precacheUrl, selectPrecacheFiles } from './precache.mts';

const OUT = [
  'index.html',
  'index.txt',
  'kasir.html',
  'kasir.txt',
  'kasir/__next._tree.txt',
  'kasir/bayar.html',
  'riwayat/detail.html',
  'backup/__next.!KGFwcCk/backup/__PAGE__.txt',
  '_next/static/chunks/0abc.js',
  '_next/static/chunks/0abc.css',
  '_next/static/media/font.woff2',
  '_next/static/BUILD/_buildManifest.js',
  'icon-192.png',
  'icon.svg',
  'apple-touch-icon.png',
  'manifest.webmanifest',
  '404.html',
  '_not-found.html',
  '_not-found.txt',
  '_not-found/__next._full.txt',
  '_headers',
  'sw.js',
  '_next/static/chunks/0abc.js.map',
];

describe('selectPrecacheFiles', () => {
  const selected = selectPrecacheFiles(OUT);

  it('takes every page, RSC payload, script, style, font, icon, and the manifest', () => {
    for (const file of [
      'index.html',
      'kasir.html',
      'kasir/bayar.html',
      'riwayat/detail.html',
      'kasir.txt',
      'kasir/__next._tree.txt',
      'backup/__next.!KGFwcCk/backup/__PAGE__.txt',
      '_next/static/chunks/0abc.js',
      '_next/static/chunks/0abc.css',
      '_next/static/media/font.woff2',
      'icon-192.png',
      'icon.svg',
      'manifest.webmanifest',
    ]) {
      expect(selected).toContain(file);
    }
  });

  it('leaves out the worker, host config, source maps, and not-found pages', () => {
    for (const file of [
      'sw.js',
      '_headers',
      '_next/static/chunks/0abc.js.map',
      '404.html',
      '_not-found.html',
      '_not-found.txt',
      '_not-found/__next._full.txt',
    ]) {
      expect(selected).not.toContain(file);
    }
  });

  it('is sorted (stable output across builds)', () => {
    expect(selected).toEqual([...selected].sort());
  });
});

describe('precacheUrl', () => {
  it('requests pages by their clean URL (what the worker looks up for a navigation)', () => {
    expect(precacheUrl('index.html')).toBe('/');
    expect(precacheUrl('kasir.html')).toBe('/kasir');
    expect(precacheUrl('riwayat/detail.html')).toBe('/riwayat/detail');
    expect(precacheUrl('docs/index.html')).toBe('/docs');
  });

  it('requests every other file by its path, same origin only', () => {
    expect(precacheUrl('_next/static/chunks/0abc.js')).toBe('/_next/static/chunks/0abc.js');
    expect(precacheUrl('kasir.txt')).toBe('/kasir.txt');
    for (const file of selectPrecacheFiles(OUT)) expect(precacheUrl(file)).toMatch(/^\/(?!\/)/);
  });
});

describe('cacheName', () => {
  const files = [
    { file: 'index.html', content: '<html>1</html>' },
    { file: '_next/static/chunks/a.js', content: 'a' },
  ];

  it('is stable for the same build, whatever the listing order', () => {
    expect(cacheName(files, 'sw')).toBe(cacheName([...files].reverse(), 'sw'));
    expect(cacheName(files, 'sw')).toMatch(/^wk-shell-[0-9a-f]{16}$/);
  });

  it('changes when any file or the worker changes (a new deploy never reuses an old cache)', () => {
    const base = cacheName(files, 'sw');
    expect(cacheName([{ ...files[0]!, content: '<html>2</html>' }, files[1]!], 'sw')).not.toBe(base);
    expect(cacheName([...files, { file: 'kasir.html', content: 'k' }], 'sw')).not.toBe(base);
    expect(cacheName(files, 'sw v2')).not.toBe(base);
  });
});

describe('worker source (features/offline/sw.ts)', () => {
  const source = readFileSync(path.join(import.meta.dirname, '..', 'features', 'offline', 'sw.ts'), 'utf8');
  // Code only: the header comment names these APIs to say they are not used.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('never takes over a running app mid-sale: no skipWaiting(), no clients.claim()', () => {
    expect(code).not.toMatch(/skipWaiting\s*\(/);
    expect(code).not.toMatch(/clients\.claim\s*\(/);
  });

  it('writes to a cache only while installing this build’s file list (no runtime caching)', () => {
    expect(code.match(/cache\.put\(/g)).toHaveLength(1);
    expect(code).not.toMatch(/\.add\(|\.addAll\(/);
    expect(code).toMatch(/async function precache\([^)]*\)[\s\S]*cache\.put\(url,/);
  });

  it('imports nothing (it is compiled to a classic script)', () => {
    expect(code).not.toMatch(/^\s*import\s/m);
  });
});

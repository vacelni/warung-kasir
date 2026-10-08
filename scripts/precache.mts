import { createHash } from 'node:crypto';

/**
 * Which exported files the service worker precaches, and under which URL (TECHNICAL_SPEC C.10).
 * Pure, so the rules are unit-tested; scripts/build-sw.mts feeds it the real out/ listing.
 */

/** File types of the app shell: pages, their RSC payloads (client navigation), code, styles, fonts, icons, manifest. */
const SHELL_EXTENSIONS = ['.html', '.txt', '.js', '.css', '.woff2', '.woff', '.png', '.svg', '.ico', '.webmanifest'];

/** Paths (relative to out/, "/" separators) that are never precached. */
function isExcluded(file: string): boolean {
  return (
    // The worker itself, and host configuration files.
    file === 'sw.js' ||
    file === '_headers' ||
    file === '_redirects' ||
    file.endsWith('.map') ||
    // Not-found pages: a host may answer them with status 404, which would fail the whole install.
    file === '404.html' ||
    file.startsWith('_not-found')
  );
}

export function selectPrecacheFiles(files: readonly string[]): string[] {
  return files
    .filter((file) => !isExcluded(file) && SHELL_EXTENSIONS.some((ext) => file.endsWith(ext)))
    .sort();
}

/**
 * URL a file is requested under. Pages use their clean URL ("kasir.html" → "/kasir", "index.html"
 * → "/"), which is what static hosting serves without a redirect and what the worker looks up
 * for a navigation (see pageKey in features/offline/sw.ts).
 */
export function precacheUrl(file: string): string {
  if (file === 'index.html') return '/';
  if (file.endsWith('/index.html')) return `/${file.slice(0, -'/index.html'.length)}`;
  if (file.endsWith('.html')) return `/${file.slice(0, -'.html'.length)}`;
  return `/${file}`;
}

/**
 * Cache name for one build: changes whenever any precached file (or the worker) changes, so a
 * deploy never reuses another build's cache. Old ones are deleted when the new worker activates.
 */
export function cacheName(entries: ReadonlyArray<{ file: string; content: Uint8Array | string }>, workerSource: string): string {
  const hash = createHash('sha256');
  for (const { file, content } of [...entries].sort((a, b) => a.file.localeCompare(b.file))) {
    hash.update(file).update('\0').update(createHash('sha256').update(content).digest('hex')).update('\0');
  }
  hash.update(workerSource);
  return `wk-shell-${hash.digest('hex').slice(0, 16)}`;
}

/**
 * Serves the static export (out/) the way Cloudflare static hosting does, so the PWA and offline
 * E2E specs test the real build, service worker included (never `next dev`):
 *  - clean URLs: /kasir → kasir.html, / → index.html, no redirect;
 *  - response headers from out/_headers (public/_headers), "/*" splats and exact paths;
 *  - 404.html with status 404 for anything else;
 *  - Next's segment-prefetch files on a Windows-built out/ (see windowsSegmentFile).
 *
 * Usage: node tests/e2e/support/static-server.mts <port>
 */
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..', '..', 'out');
const port = Number(process.argv[2] ?? 3000);

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

type Rule = { pattern: string; headers: Array<[string, string]> };

/** Minimal parser for Cloudflare's _headers format. */
function parseHeaders(text: string): Rule[] {
  const rules: Rule[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      rules.push({ pattern: line.trim(), headers: [] });
      continue;
    }
    const separator = line.indexOf(':');
    rules.at(-1)?.headers.push([line.slice(0, separator).trim(), line.slice(separator + 1).trim()]);
  }
  return rules;
}

function matches(pattern: string, pathname: string): boolean {
  if (pattern.endsWith('*')) return pathname.startsWith(pattern.slice(0, -1));
  return pathname === pattern;
}

async function isFile(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

/**
 * Next's client router prefetches "/kasir/__next.!KGFwcCk.kasir.__PAGE__.txt" (segments joined by
 * dots). `next build` writes that file under exactly this name on Linux (Cloudflare's build), but
 * on Windows Next 16.4 joins the segments of `path.relative()` (backslashes) and writes
 * "/kasir/__next.!KGFwcCk/kasir/__PAGE__.txt" instead. This maps the requested name to the nested
 * file, so a Windows-built out/ behaves in the tests as the Linux-built one does in production
 * (no 404 for every prefetch). Does nothing when the dotted file exists.
 */
function windowsSegmentFile(pathname: string): string | null {
  const match = /^(.*\/)__next\.([^./]+)\.(.+)\.txt$/.exec(pathname);
  if (!match) return null;
  const [, directory, first, rest] = match;
  return `${directory}__next.${first}/${rest!.split('.').join('/')}.txt`;
}

/** The file Cloudflare would serve for this path, or null. */
async function resolveFile(pathname: string): Promise<string | null> {
  const decoded = decodeURIComponent(pathname);
  const alternatives = [decoded, windowsSegmentFile(decoded)].filter((name): name is string => name !== null);
  for (const name of alternatives) {
    const candidate = path.normalize(path.join(root, name));
    if (!candidate.startsWith(root)) return null;
    for (const file of [candidate, `${candidate}.html`, path.join(candidate, 'index.html')]) {
      if (await isFile(file)) return file;
    }
  }
  return null;
}

const rules = parseHeaders(await readFile(path.join(root, '_headers'), 'utf8').catch(() => ''));

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://localhost:${port}`);
  const file = await resolveFile(url.pathname);
  for (const rule of rules) {
    if (matches(rule.pattern, url.pathname)) for (const [name, value] of rule.headers) response.setHeader(name, value);
  }
  const served = file ?? path.join(root, '404.html');
  response.statusCode = file ? 200 : 404;
  response.setHeader('Content-Type', TYPES[path.extname(served)] ?? 'application/octet-stream');
  createReadStream(served).pipe(response);
}).listen(port, () => console.log(`Serving ${root} on http://localhost:${port}`));

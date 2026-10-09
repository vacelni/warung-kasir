import { createHash } from 'node:crypto';

/**
 * Content-Security-Policy for the static export (SECURITY E.12, TECHNICAL_SPEC H.5). Pure, so the
 * rules are unit-tested; scripts/build-headers.mts feeds it the real out/ files.
 *
 * A static export cannot send per-request nonces, so every inline <script> Next.js writes into the
 * HTML (the runtime bootstrap, the RSC payload of each page) is allowed by its SHA-256 hash, taken
 * from the built files themselves. No 'unsafe-inline', no 'unsafe-eval'.
 */

/** Cloudflare's limit for one line of `_headers`, including the header name. */
export const MAX_HEADER_LINE = 2000;

const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;

/** Text of every inline <script> (one without `src`) in an HTML document, exactly as written. */
export function inlineScripts(html: string): string[] {
  const bodies: string[] = [];
  for (const [, attributes = '', body = ''] of html.matchAll(SCRIPT)) {
    if (!/\ssrc\s*=/i.test(` ${attributes}`)) bodies.push(body);
  }
  return bodies;
}

/** CSP source expression for one inline script: 'sha256-<base64>' of its UTF-8 text. */
export function scriptHash(body: string): string {
  return `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`;
}

/**
 * Markup the policy would block without 'unsafe-inline': a `style="…"` attribute or an inline
 * event handler (`onclick="…"`). Script bodies are skipped (their text is data, not markup).
 * Returns the first offending snippet, or null.
 */
export function findInlineAttribute(html: string): string | null {
  const markup = html.replace(SCRIPT, '<script></script>');
  const match = /<[a-z][^>]*\s(style|on[a-z]+)\s*=[^>]*>/i.exec(markup);
  return match ? match[0].slice(0, 120) : null;
}

/** The .env files `next build` reads, highest precedence first (after the process environment). */
export const PRODUCTION_ENV_FILES = ['.env.production.local', '.env.local', '.env.production', '.env'] as const;

/** Value of `name` in one .env file's text (`KEY=value`, optional quotes or `export`), or undefined. */
function envFileValue(text: string, name: string): string | undefined {
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || match[1] !== name) continue;
    const raw = match[2] ?? '';
    const quoted = /^(['"])(.*)\1$/.exec(raw);
    return quoted ? quoted[2] : raw.replace(/\s+#.*$/, '');
  }
  return undefined;
}

/**
 * The value `next build` inlined for `name`: the process environment wins, then the .env files in
 * PRODUCTION_ENV_FILES order (`files` holds their texts in that order, null when a file is absent).
 * Without @next/env, which is not a declared dependency (TECHNICAL_SPEC C.15).
 */
export function buildEnvValue(name: string, processEnv: Record<string, string | undefined>, files: ReadonlyArray<string | null>): string | undefined {
  const fromProcess = processEnv[name];
  if (fromProcess !== undefined && fromProcess !== '') return fromProcess;
  for (const text of files) {
    const value = text === null ? undefined : envFileValue(text, name);
    if (value !== undefined && value !== '') return value;
  }
  return undefined;
}

/** Origin (scheme://host[:port]) of the Supabase project URL the bundle talks to. */
export function supabaseOrigin(url: string | undefined): string {
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL must be set to build the Content-Security-Policy.');
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not a valid URL.');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL must be an http(s) URL.');
  }
  return parsed.origin;
}

export function contentSecurityPolicy({ scriptHashes, supabase }: { scriptHashes: readonly string[]; supabase: string }): string {
  const hashes = [...new Set(scriptHashes)].sort();
  const directives: Array<[string, string[]]> = [
    ['default-src', ["'none'"]],
    ['script-src', ["'self'", ...hashes]],
    ['style-src', ["'self'"]],
    ['img-src', ["'self'"]],
    ['font-src', ["'self'"]],
    // RSC payloads and the service worker's precache ('self'); REST, Auth and Edge Functions.
    ['connect-src', ["'self'", supabase]],
    ['manifest-src', ["'self'"]],
    ['worker-src', ["'self'"]],
    ['frame-ancestors', ["'none'"]],
    ['base-uri', ["'none'"]],
    // Every form is handled in JavaScript; nothing is ever submitted by the browser (SEC-02).
    ['form-action', ["'none'"]],
    ['object-src', ["'none'"]],
  ];
  return directives.map(([name, sources]) => `${name} ${sources.join(' ')}`).join('; ');
}

/**
 * Adds the policy to the "/*" rule of a `_headers` file. It must be the only CSP line: a request
 * matching two rules that both set it would receive two policies, and the browser enforces both.
 */
export function withContentSecurityPolicy(headersFile: string, policy: string): string {
  if (/^\s+content-security-policy\s*:/im.test(headersFile)) throw new Error('_headers already sets a Content-Security-Policy.');
  const lines = headersFile.split('\n');
  const rules = lines.flatMap((line, index) => (line.trim() === '/*' ? [index] : []));
  const [rule] = rules;
  if (rules.length !== 1 || rule === undefined) throw new Error('_headers must contain exactly one "/*" rule.');
  const header = `  Content-Security-Policy: ${policy}`;
  if (header.length > MAX_HEADER_LINE) {
    throw new Error(`The Content-Security-Policy line is ${header.length} characters; Cloudflare allows ${MAX_HEADER_LINE}.`);
  }
  lines.splice(rule + 1, 0, header);
  return lines.join('\n');
}

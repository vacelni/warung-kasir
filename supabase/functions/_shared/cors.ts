/**
 * CORS for privileged Edge Functions (SECURITY E.11, TECHNICAL_SPEC C.5): only the app's own
 * origins, never "*". Plain TypeScript with no Deno globals, so Vitest can import it too.
 *
 * The allowed origins come from the ALLOWED_ORIGINS secret: a comma-separated list such as
 * "https://kasir.example.com". Unset or empty means no browser origin is allowed (fail closed).
 */

const ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type';

/** "https://a.example, http://localhost:3000" → the set of exact origins (no trailing slash). */
export function parseAllowedOrigins(value: string | undefined): ReadonlySet<string> {
  const origins = (value ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter((origin) => origin !== '' && origin !== '*');
  return new Set(origins);
}

/**
 * A request may proceed when it carries no Origin (not a browser: server-to-server or tests;
 * authentication still applies) or an Origin on the list.
 */
export function isOriginAllowed(origin: string | null, allowed: ReadonlySet<string>): boolean {
  return origin === null || allowed.has(origin);
}

/** CORS response headers for an allowed origin; none at all for any other origin. */
export function corsHeaders(origin: string | null, allowed: ReadonlySet<string>): Record<string, string> {
  const headers: Record<string, string> = { Vary: 'Origin' };
  if (origin !== null && allowed.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = ALLOWED_HEADERS;
    headers['Access-Control-Max-Age'] = '600';
  }
  return headers;
}

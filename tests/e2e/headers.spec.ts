import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, FAILED_REQUEST, test, type APIResponse } from './support/test';

// SEC-03: response headers of the production build (out/_headers, written by
// scripts/build-headers.mts), as served by tests/e2e/support/static-server.mts, which applies the
// file the way Cloudflare does. Every page, the 404 page, and the service worker get the same policy.
// That the policy breaks nothing is checked by the CSP guard (support/test.ts) in every static and
// offline test.

test.skip(({ baseURL }) => !baseURL?.endsWith(':3000'), 'headers exist only in the production build (static projects)');

const PATHS = ['/', '/login', '/kasir', '/kasir/bayar', '/riwayat/detail?id=3f9a2c4e-0000-4000-8000-000000000001', '/laporan', '/tidak-ada', '/sw.js', '/manifest.webmanifest'];

function supabaseOrigin(): string {
  const env = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
  const url = /^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m.exec(env)?.[1]?.trim();
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL missing from .env.local');
  return new URL(url).origin;
}

function directives(response: APIResponse): Map<string, string[]> {
  const policy = response.headers()['content-security-policy'] ?? '';
  return new Map(
    policy.split(';').map((part) => {
      const [name = '', ...sources] = part.trim().split(/\s+/);
      return [name, sources];
    }),
  );
}

for (const path of PATHS) {
  test(`${path}: Content-Security-Policy and security headers`, async ({ request }) => {
    const response = await request.get(path);
    expect(response.status()).toBe(path === '/tidak-ada' ? 404 : 200);
    const headers = response.headers();

    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('no-referrer');
    expect(headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(headers['permissions-policy']).toMatch(/camera=\(\).*geolocation=\(\).*microphone=\(\).*payment=\(\)/);

    // One policy (never two merged with a comma), no inline code or eval.
    const policy = headers['content-security-policy'] ?? '';
    expect(policy).not.toContain(',');
    expect(policy).not.toMatch(/unsafe-inline|unsafe-eval|unsafe-hashes|\*/);
    const csp = directives(response);
    expect(csp.get('default-src')).toEqual(["'none'"]);
    expect(csp.get('script-src')?.[0]).toBe("'self'");
    expect(csp.get('script-src')?.slice(1).every((source) => /^'sha256-[A-Za-z0-9+/]+=*'$/.test(source))).toBe(true);
    expect(csp.get('connect-src')).toEqual(["'self'", supabaseOrigin()]);
    for (const name of ['frame-ancestors', 'form-action', 'base-uri', 'object-src']) expect(csp.get(name)).toEqual(["'none'"]);
  });
}

test('every inline script of a served page is allowed by its hash', async ({ request }) => {
  const policy = (await request.get('/login')).headers()['content-security-policy'] ?? '';
  for (const path of ['/login', '/kasir', '/tidak-ada']) {
    const html = await (await request.get(path)).text();
    const inline = [...html.matchAll(/<script\b(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1] ?? '');
    expect(inline.length).toBeGreaterThan(0);
    for (const body of inline) {
      const digest = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))).toString('base64');
      expect(policy, `${path}: inline script ${body.slice(0, 40)}…`).toContain(`'sha256-${digest}'`);
    }
  }
});

test('the 404 page renders under the policy with no inline style', async ({ page, allowConsoleError }) => {
  allowConsoleError(FAILED_REQUEST); // the page itself answers 404
  await page.goto('/tidak-ada');
  await expect(page.getByRole('heading', { name: 'Halaman tidak ditemukan', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'BUKA KASIR' })).toBeVisible();
});

import type { Page, Route } from './test';

// Fault injection for TEST_PLAN G.14. The faults replace the answer to chosen Supabase requests;
// everything else (the app, the browser, the rest of the network) stays real.

export type FaultKind = 'http500' | 'hang' | 'rejected';

export type Fault = {
  /** "METHOD url" of every request the fault caught, in order. */
  readonly requests: string[];
  /** Lets requests through again, as when the server recovers. */
  clear: () => Promise<void>;
};

/**
 * What the app sees when the server fails on its own side: HTTP 500 with a PostgREST-shaped body
 * and CORS headers (without them the browser would report a network error, not a 500).
 */
async function fulfill500(route: Route) {
  await route.fulfill({
    status: 500,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' },
    body: JSON.stringify({ code: 'XX000', message: 'injected server failure' }),
  });
}

/** create_transaction refusing the sale itself (WK001): a permanent error, never worth resending. */
async function fulfillRejected(route: Route) {
  await route.fulfill({
    status: 400,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' },
    body: JSON.stringify({ code: 'WK001', message: 'injected rejection', details: null, hint: null }),
  });
}

/**
 * Makes matching requests fail:
 *  - `http500`: the server answers 500;
 *  - `hang`: the server accepts the request and never answers (a stalled connection);
 *  - `rejected`: the server refuses the sale with WK001 (HTTP 400), a permanent error.
 *
 * `methods` limits the fault to some HTTP methods (default: all); other requests pass through.
 * CORS preflights (OPTIONS) always pass through to the real server, so the real request is made.
 */
export async function injectFault(
  page: Page,
  url: string | RegExp,
  kind: FaultKind,
  options: { methods?: string[] } = {},
): Promise<Fault> {
  const requests: string[] = [];
  const handler = async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS' || (options.methods && !options.methods.includes(request.method()))) {
      await route.fallback();
      return;
    }
    requests.push(`${request.method()} ${request.url()}`);
    if (kind === 'http500') await fulfill500(route);
    else if (kind === 'rejected') await fulfillRejected(route);
    // 'hang': the route is never continued, fulfilled or aborted.
  };
  await page.route(url, handler);
  return {
    requests,
    clear: () => page.unroute(url, handler),
  };
}

/** Matches a PostgREST table or RPC on the local or hosted Supabase project. */
export const rest = (resource: string) => new RegExp(`/rest/v1/${resource}(\\?|$|/)`);
/** The one write path of a sale (DATABASE D.9). */
export const CREATE_TRANSACTION = rest('rpc/create_transaction');
/** The admin-cashier Edge Function. */
export const ADMIN_FUNCTION = /\/functions\/v1\/admin-cashier/;

/**
 * How long the app may wait for the server before it treats a request as failed
 * (lib/supabase.ts REQUEST_TIMEOUT_MS, 15 s), plus time to render the error state.
 */
export const TIMEOUT_WAIT_MS = 25_000;

/**
 * How long a request may wait for the server's answer before it counts as failed. A stalled
 * connection (a captive portal, a dead mobile link, a server that accepted the request and went
 * quiet) never fails by itself; without a limit a screen would load forever and a form could
 * never be closed (TEST_PLAN G.14).
 */
export const REQUEST_TIMEOUT_MS = 15_000;

/**
 * `fetch` that gives up after `timeoutMs` without response headers. The request is aborted, so
 * the caller sees the same failure as for a lost connection (an AbortError, which supabase-js
 * does not retry on its own) and shows its usual error state.
 *
 * A signal passed by the caller still works and aborts the request too. Once the headers have
 * arrived the limit no longer applies: the answer is on its way.
 */
export function fetchWithTimeout(timeoutMs: number = REQUEST_TIMEOUT_MS): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const callerSignal = init?.signal;
    if (callerSignal?.aborted) controller.abort();
    else callerSignal?.addEventListener('abort', () => controller.abort(), { once: true });

    try {
      // globalThis.fetch is read per call, so a replaced fetch (tests, polyfills) is honored.
      return await globalThis.fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };
}

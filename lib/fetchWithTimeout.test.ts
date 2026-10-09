import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithTimeout, REQUEST_TIMEOUT_MS } from './fetchWithTimeout';

/** A fetch that never answers and rejects with an AbortError when its signal aborts, like the browser's. */
function stalledFetch() {
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      const abort = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
      if (init?.signal?.aborted) abort();
      else init?.signal?.addEventListener('abort', abort);
    });
  });
}

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('passes the request and the answer through untouched', async () => {
    const response = new Response('{"ok":true}', { status: 200 });
    const fetchSpy = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchSpy);

    const result = await fetchWithTimeout()('https://example.test/rest/v1/products', { method: 'GET', headers: { apikey: 'k' } });

    expect(result).toBe(response);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.test/rest/v1/products');
    expect(init.method).toBe('GET');
    expect(init.headers).toEqual({ apikey: 'k' });
  });

  it('aborts a request the server never answers, as an AbortError (which supabase-js does not retry)', async () => {
    vi.stubGlobal('fetch', stalledFetch());
    const outcome = fetchWithTimeout()('https://example.test/x').then(
      () => 'answered',
      (error: unknown) => (error as Error).name,
    );

    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
    // One millisecond early: still waiting.
    let settled = false;
    void outcome.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(await outcome).toBe('AbortError');
  });

  it('does not abort a request that was answered in time, and clears its timer', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchSpy);

    await fetchWithTimeout(1_000)('https://example.test/x');
    await vi.advanceTimersByTimeAsync(5_000);

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.signal?.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('honors a limit passed by the caller', async () => {
    vi.stubGlobal('fetch', stalledFetch());
    const outcome = fetchWithTimeout(200)('https://example.test/x').catch((error: unknown) => (error as Error).name);

    await vi.advanceTimersByTimeAsync(200);
    expect(await outcome).toBe('AbortError');
  });

  it('still aborts when the caller aborts first', async () => {
    vi.stubGlobal('fetch', stalledFetch());
    const caller = new AbortController();
    const outcome = fetchWithTimeout()('https://example.test/x', { signal: caller.signal }).catch((error: unknown) => (error as Error).name);

    caller.abort();
    expect(await outcome).toBe('AbortError');
  });

  it('rejects at once when the caller signal is already aborted', async () => {
    vi.stubGlobal('fetch', stalledFetch());
    const caller = new AbortController();
    caller.abort();

    await expect(fetchWithTimeout()('https://example.test/x', { signal: caller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('propagates network failures unchanged', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(fetchWithTimeout()('https://example.test/x')).rejects.toThrow('Failed to fetch');
    expect(vi.getTimerCount()).toBe(0);
  });
});

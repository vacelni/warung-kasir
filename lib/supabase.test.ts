import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ClientOptions = { auth?: object; global?: { fetch?: unknown } };
const createClient = vi.fn<(url: string, key: string, options: ClientOptions) => object>(() => ({ marker: 'client' }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: (url: string, key: string, options: ClientOptions) => createClient(url, key, options),
}));

beforeEach(() => {
  vi.resetModules();
  createClient.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getSupabase', () => {
  it('refuses to start without the project URL and publishable key', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
    const { getSupabase } = await import('./supabase');
    expect(() => getSupabase()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('creates one browser client with the publishable key, a persisted session, and a request timeout', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test-fixture-not-a-real-key');
    const { getSupabase } = await import('./supabase');

    const first = getSupabase();
    expect(getSupabase()).toBe(first);
    expect(createClient).toHaveBeenCalledTimes(1);

    const [url, key, options] = createClient.mock.calls[0]!;
    expect(url).toBe('http://127.0.0.1:54321');
    expect(key).toBe('sb_publishable_test-fixture-not-a-real-key');
    expect(options).toMatchObject({ auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    // Every request goes through the timeout wrapper (a stalled server must end in an error).
    expect(typeof options.global?.fetch).toBe('function');
  });
});

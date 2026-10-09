import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { fetchWithTimeout } from './fetchWithTimeout';

export type Supabase = SupabaseClient<Database>;

let client: Supabase | undefined;

/**
 * localStorage key of the Supabase session; auth-js also writes `<key>-user` and
 * `<key>-code-verifier`. App-owned (not derived from the project URL), so a logout can remove the
 * session itself when auth-js cannot (SEC-01).
 */
export const AUTH_STORAGE_KEY = 'wk-auth';
const AUTH_STORAGE_KEYS = [AUTH_STORAGE_KEY, `${AUTH_STORAGE_KEY}-user`, `${AUTH_STORAGE_KEY}-code-verifier`];

/** Whether a Supabase session is stored on this device, without asking auth-js (which may refresh it). */
export function hasStoredSessionData(): boolean {
  try {
    return localStorage.getItem(AUTH_STORAGE_KEY) !== null;
  } catch (error) {
    console.error('Could not read the stored session:', error);
    return false;
  }
}

/** Deletes the stored Supabase session from this device (SEC-01). Never touches anything else. */
export function removeStoredSession(): void {
  for (const key of AUTH_STORAGE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error('Could not remove the stored session:', error);
    }
  }
}

/**
 * Browser Supabase client (TECHNICAL_SPEC C.3–C.4). Uses only the publishable key;
 * every private read/write is enforced by RLS, never by this client.
 *
 * Created lazily so static prerendering (which never runs effects) does not need
 * the environment variables. The env reads must stay literal so Next.js inlines them.
 */
export function getSupabase(): Supabase {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set (see .env.example).',
    );
  }

  client = createClient<Database>(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Password login only; there are no OAuth/magic-link redirects to parse.
      detectSessionInUrl: false,
      storageKey: AUTH_STORAGE_KEY,
    },
    // Every request (data, auth, Edge Function) ends in an answer or an error, never a hang.
    global: { fetch: fetchWithTimeout() },
  });
  return client;
}

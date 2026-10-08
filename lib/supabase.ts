import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type Supabase = SupabaseClient<Database>;

let client: Supabase | undefined;

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
    },
  });
  return client;
}

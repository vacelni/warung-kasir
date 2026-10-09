import type { Page } from '@playwright/test';
import { AUTH_STORAGE_KEY } from '../../../lib/supabase';

// The Supabase session as the app stores it in localStorage (lib/supabase.ts, SEC-01).

export { AUTH_STORAGE_KEY };

/**
 * `expires_at` of an access token that expired long ago (1970-01-01T00:00:01Z). Not 0: auth-js
 * treats a falsy `expires_at` as "never expires" and would keep using the token (SEC-09).
 */
export const EXPIRED_AT = 1;

/** Edits the stored session (to simulate an expired access token, or a revoked refresh token). */
export function editStoredSession(page: Page, patch: { expires_at?: number; refresh_token?: string }) {
  return page.evaluate(
    ([key, change]) => {
      const stored = localStorage.getItem(key);
      if (!stored) throw new Error('no stored Supabase session');
      localStorage.setItem(key, JSON.stringify({ ...(JSON.parse(stored) as Record<string, unknown>), ...change }));
    },
    [AUTH_STORAGE_KEY, patch] as const,
  );
}

export function storedAccessToken(page: Page): Promise<string | null> {
  return page.evaluate((key) => {
    const session = JSON.parse(localStorage.getItem(key) ?? 'null') as { access_token?: string } | null;
    return session?.access_token ?? null;
  }, AUTH_STORAGE_KEY);
}

/** Every localStorage key the auth client wrote (the session, its user, a PKCE verifier). */
export function storedAuthKeys(page: Page): Promise<string[]> {
  return page.evaluate((key) => Object.keys(localStorage).filter((name) => name.startsWith(key)), AUTH_STORAGE_KEY);
}

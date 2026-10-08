import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  AUTH_MESSAGES,
  loginErrorMessage,
  loginPath,
  signedOutNotice,
  toActiveProfile,
  validateCredentials,
  type ProfileRow,
} from './account';

const cashierRow: ProfileRow = {
  id: 'a2000000-0000-4000-8000-000000000001',
  store_id: '5a000000-0000-4000-8000-000000000001',
  name: 'Andi',
  role: 'cashier',
  is_active: true,
};

describe('toActiveProfile (account validation, SECURITY E.1)', () => {
  it('maps an active profile', () => {
    expect(toActiveProfile(cashierRow)).toEqual({
      id: cashierRow.id,
      storeId: cashierRow.store_id,
      name: 'Andi',
      role: 'cashier',
    });
  });

  it('rejects a missing profile', () => {
    expect(toActiveProfile(null)).toBeNull();
  });

  it('rejects an inactive profile', () => {
    expect(toActiveProfile({ ...cashierRow, is_active: false })).toBeNull();
  });

  it('rejects an unknown role', () => {
    expect(toActiveProfile({ ...cashierRow, role: 'admin' })).toBeNull();
  });
});

describe('loginErrorMessage (PRD §38)', () => {
  it('maps wrong email or password', () => {
    expect(loginErrorMessage(new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'))).toBe(
      'Email atau password salah.',
    );
  });

  it('maps a banned (deactivated) account to the inactive message', () => {
    expect(loginErrorMessage(new AuthApiError('User is banned', 400, 'user_banned'))).toBe(AUTH_MESSAGES.inactive);
  });

  it('maps a network failure to the connection-required message', () => {
    expect(loginErrorMessage(new AuthRetryableFetchError('Failed to fetch', 0))).toBe(
      'Koneksi internet diperlukan untuk masuk.',
    );
  });

  it('maps rate limiting', () => {
    expect(loginErrorMessage(new AuthApiError('Too many', 429, 'over_request_rate_limit'))).toBe(
      AUTH_MESSAGES.rateLimited,
    );
  });

  it('falls back to a generic message', () => {
    expect(loginErrorMessage(new Error('boom'))).toBe(AUTH_MESSAGES.unknown);
  });
});

describe('validateCredentials (UI_SPEC A.8 inline validation)', () => {
  it('requires both fields', () => {
    expect(validateCredentials('', '')).toEqual({
      email: AUTH_MESSAGES.required.email,
      password: AUTH_MESSAGES.required.password,
    });
  });

  it('rejects a malformed email', () => {
    expect(validateCredentials('andi', 'secret')).toEqual({ email: AUTH_MESSAGES.invalidEmail });
  });

  it('accepts well-formed credentials', () => {
    expect(validateCredentials('andi@warung.test', 'secret')).toEqual({});
  });
});

describe('sign-out reasons on the login page', () => {
  it('round-trips through the login URL', () => {
    expect(loginPath(null)).toBe('/login');
    expect(signedOutNotice(new URL(loginPath('inactive'), 'http://x').searchParams)).toBe(AUTH_MESSAGES.inactive);
    expect(signedOutNotice(new URL(loginPath('expired'), 'http://x').searchParams)).toBe(AUTH_MESSAGES.sessionExpired);
  });

  it('ignores unknown reasons', () => {
    expect(signedOutNotice(new URLSearchParams('alasan=<script>'))).toBeNull();
    expect(signedOutNotice(new URLSearchParams())).toBeNull();
  });
});

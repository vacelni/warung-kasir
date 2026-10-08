import { describe, expect, it } from 'vitest';
import { assertPublishableKey } from './env';

function legacyKey(role: string): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ iss: 'supabase-demo', role })}.signature`;
}

describe('assertPublishableKey (SECURITY E.7)', () => {
  it('accepts a publishable key', () => {
    expect(() => assertPublishableKey('sb_publishable_test-fixture-not-a-real-key')).not.toThrow();
  });

  it('rejects a secret key', () => {
    expect(() => assertPublishableKey('sb_secret_test-fixture-not-a-real-key')).toThrow(/secret key/);
  });

  it('accepts the legacy anon JWT key', () => {
    expect(() => assertPublishableKey(legacyKey('anon'))).not.toThrow();
  });

  it('rejects the legacy service_role JWT key', () => {
    expect(() => assertPublishableKey(legacyKey('service_role'))).toThrow(/service_role/);
  });
});

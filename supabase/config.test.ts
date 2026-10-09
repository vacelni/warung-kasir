import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// supabase/config.toml is deployment-facing: `supabase config push` sends its auth settings to the
// hosted project. The E2E suite needs a higher sign-in rate limit on a developer machine
// (docs/RUNBOOK.md); that edit is local and temporary and must never be committed.

const config = readFileSync(new URL('./config.toml', import.meta.url), 'utf8');

describe('supabase/config.toml stays safe to deploy', () => {
  it('keeps the default sign-in rate limit (a raised value is a local test setting)', () => {
    const match = /^sign_in_sign_ups\s*=\s*(\d+)/m.exec(config);
    expect(match, 'sign_in_sign_ups is set').not.toBeNull();
    expect(Number(match![1]), 'revert the local E2E rate limit before committing (docs/RUNBOOK.md)').toBeLessThanOrEqual(30);
  });

  it('allows only the local app origins for the admin-cashier function', () => {
    const match = /^ALLOWED_ORIGINS\s*=\s*"([^"]*)"/m.exec(config);
    expect(match, 'ALLOWED_ORIGINS is set').not.toBeNull();
    const origins = match![1]!.split(',');
    expect(origins.sort()).toEqual(
      ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3100', 'http://127.0.0.1:3100'].sort(),
    );
  });
});

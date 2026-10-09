# Security Tracker — Phase 12 findings

Source: Phase 12 read-only audit (session of 2026-10-09, report reproduced in `PHASE_LOG.md`).
Each finding was re-verified against the current code before remediation.

Status values: OPEN, IN PROGRESS, FIXED (tests prove it), DOCUMENTED (accepted/decided risk), DEFERRED (external).

| ID | Severity | Summary | Re-verified | Status | Fix / tests | Residual risk |
|---|---|---|---|---|---|---|
| SEC-01 | High | Offline "Keluar" with an expired access token leaves the session in storage; the next person is signed in as the previous user | Yes — auth-js 2.117.3 `_signOut` returns the session-load error before `_removeSession` (`GoTrueClient.js:3434`) | OPEN | — | — |
| SEC-02 | Medium | Login form submitted before hydration sends email + password in the URL (GET) | Yes — `LoginForm.tsx` form has no `method`, submit enabled in prerendered HTML | OPEN | — | — |
| SEC-03 | Medium | No CSP; incomplete security headers | Yes — `public/_headers` has nosniff, Referrer-Policy, X-Frame-Options only | OPEN | — | — |
| SEC-04 | Low | Password/email change without reauthentication | Yes — `config.toml` `secure_password_change = false` | OPEN | — | — |
| SEC-05 | Low | RPC conflict branch returns `exists` without checking row ownership | Yes — `20261008000300_create_transaction.sql` conflict branch | OPEN | — | — |
| SEC-06 | Low | Sale date is the device clock; no anomaly signal | Yes — RPC accepts any `created_at` | OPEN | — | — |
| SEC-07 | Low | Unbounded items per sale and name lengths | Yes — no CHECK on lengths, no item-count limit | OPEN | — | — |
| SEC-08 | Low | Default privileges grant EXECUTE on new `public` functions (and sequences) to anon | Yes — `20261008000200_rls.sql` revokes table defaults only | OPEN | — | — |
| SEC-09 | Low | Tests that hid or could hide defects (mocked signOut, broad console allow-lists, loose rejected-session assertion) | Yes; plus a new one: `expires_at: 0` never simulated an expired token | IN PROGRESS | 12R.1: CSP guard + `guard.spec.ts`; narrowed allow-lists; strict rejected-session test; `EXPIRED_AT`. Real-client signOut test lands with SEC-01 (12R.2) | — |
| INFO-1 | Info | Shared-device residue: outbox and cached identity readable with devtools | By design | OPEN (document) | — | — |
| INFO-2 | Info | 5 High advisories in dev tooling (`braces` via `eslint-config-next`); production deps 0 | Yes — baseline `npm audit`: 5 high; `--omit=dev`: 0 | OPEN | — | — |
| INFO-3 | Info | Session behavior after password reset / deactivation / reactivation unverified | — | OPEN (measure first) | — | — |
| INFO-4 | Info | Edge Function reads whole body before size check | To verify | OPEN | — | — |
| INFO-5 | Info | Missing ask-rules for some sensitive CLI commands | Yes — `.claude/settings.json` | OPEN | — | — |
| INFO-6 | Info | Runbook owner-recovery SQL uses `gen_salt('bf')` (cost 6) | To verify against GoTrue | OPEN | — | — |

## Deployment-dependent checks (cannot be verified locally)

Carried into `LAUNCH_READINESS.md` and the runbook: hosted Auth settings, API keys, Edge Function
secrets and `ALLOWED_ORIGINS`, `verify_jwt` with the project's signing keys, Data API surface,
hosted advisors, production CSP origin, HSTS/domain, Cloudflare `_headers` behavior, preview
isolation, seed exclusion.

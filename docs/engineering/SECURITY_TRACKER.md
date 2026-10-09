# Security Tracker — Phase 12 findings

Source: Phase 12 read-only audit (session of 2026-10-09, report reproduced in `PHASE_LOG.md`).
Each finding was re-verified against the current code before remediation.

Status values: OPEN, IN PROGRESS, FIXED (tests prove it), DOCUMENTED (accepted/decided risk), DEFERRED (external).

| ID | Severity | Summary | Re-verified | Status | Fix / tests | Residual risk |
|---|---|---|---|---|---|---|
| SEC-01 | High | Offline "Keluar" with an expired access token leaves the session in storage; the next person is signed in as the previous user | Yes — auth-js 2.117.3 `_signOut` returns the session-load error before `_removeSession` (`GoTrueClient.js:3434`) | FIXED | `lib/supabase.ts` app-owned `storageKey` `wk-auth` + `removeStoredSession`; `features/auth/api.ts` `signOut` bounded server wait (4 s), skipped offline, then deletes the stored session and lets auth-js announce SIGNED_OUT; `onSignedOut` also reacts to a `storage` removal from another tab. Tests: `features/auth/signOut.test.ts` (real client, fresh per test: offline, network failure, server never answering, a refresh answered after logout gave up — auth-js's commit guard discards it, cross-tab); `sync.offline.spec.ts` SEC-01 ×2 (Chromium + Edge) — fails on the old code (stuck on /lainnya > 5 s) | Offline logout cannot revoke the refresh token server-side; it is only deleted from the device (SECURITY E.9). Server-side revocation on password reset/deactivation: INFO-3 |
| SEC-02 | Medium | Login form submitted before hydration sends email + password in the URL (GET) | Yes — `LoginForm.tsx` form has no `method`, submit enabled in prerendered HTML | FIXED (CSP `form-action 'none'` follows in 12R.4) | `LoginForm.tsx`: `method="post"`; submit disabled until hydrated (`useSyncExternalStore`, server snapshot false). Tests: `LoginForm.test.tsx` (server-rendered markup: post + disabled; enabled after hydration); `auth.spec.ts` SEC-02 with JavaScript disabled (dev + static): Enter and click send nothing, no credential in any URL | Without JavaScript the app cannot log in at all (by design) |
| SEC-03 | Medium | No CSP; incomplete security headers | Yes — `public/_headers` had nosniff, Referrer-Policy, X-Frame-Options only | FIXED (local); production origin/HSTS/Cloudflare behavior = Phase 13 | Build-time CSP from the exported HTML (`scripts/headers.mts`, `build-headers.mts`), no `unsafe-*`; COOP, Permissions-Policy, `no-referrer`; custom 404 without inline styles. Tests: `scripts/headers.test.ts`, `tests/e2e/headers.spec.ts`, CSP guard across static + offline matrices (0 app violations) | CSP does not stop an allowed script from reading the token (no third-party scripts allowed). HSTS and Cloudflare's `_headers` handling verified only after deployment |
| SEC-04 | Low | Password/email change without reauthentication | Yes — `config.toml` `secure_password_change = false` | OPEN | — | — |
| SEC-05 | Low | RPC conflict branch returns `exists` without checking row ownership | Yes — reproduced with a real two-session race (`result=exists` for another cashier) | FIXED | Migration `20261009120100`; `tests/functions/create-transaction-race.test.ts` (DB-clock-verified race; fails on the old function) | — |
| SEC-06 | Low | Sale date is the device clock; no anomaly signal | Yes — RPC accepts any `created_at` | OPEN | — | — |
| SEC-07 | Low | Unbounded items per sale and name lengths | Yes | FIXED | ≤ 200 items, names ≤ 120 chars: RPC (WK001), CHECK constraints (`20261009120200`), cart/checkout/product form. pgTAP 01/03, unit tests | Other free-text columns (store profile, category, cashier name) remain unbounded in the DB; owner-only writes |
| SEC-08 | Low | Default privileges grant EXECUTE on new `public` functions (and sequences) to anon | Yes — plus PostgreSQL's built-in PUBLIC default | FIXED | Migration `20261009120000`; pgTAP 01 invariants incl. a probe function/sequence | `supabase_admin` defaults unchanged (platform-owned objects) |
| SEC-09 | Low | Tests that hid or could hide defects (mocked signOut, broad console allow-lists, loose rejected-session assertion) | Yes; plus a new one: `expires_at: 0` never simulated an expired token | FIXED | 12R.1: CSP guard + `guard.spec.ts`; narrowed allow-lists; strict rejected-session test; `EXPIRED_AT`. Real-client signOut test in `signOut.test.ts` (12R.2); misleading mocked test renamed | — |
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

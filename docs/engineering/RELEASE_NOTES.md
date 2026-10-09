# WarungKasir 0.1.0 — Release Candidate Notes

Branch `feature/warungkasir-launch-readiness` (from Phase 11 `a0ddd47`). Not deployed.

## What this release contains

The MVP of PRD §43 (Phases 1–11), plus:

- **Security remediation (Phase 12):** offline logout always ends the session on the device
  (SEC-01); the login form can never send credentials before JavaScript runs (SEC-02); a build-time
  Content-Security-Policy and security headers (SEC-03); concurrent same-id sales from different
  users are refused (SEC-05); default privileges fail closed (SEC-08); payload limits — 200 products
  per sale, 120-character names (SEC-07); sessions ended by a password reset or deactivation lose
  access at once and do not come back after reactivation (INFO-3); password change on older
  sessions needs reauthentication (SEC-04); owner-only "Cek waktu" for implausible sale times (SEC-06).
- **Should Have (PRD §44):** history custom date range; simple on-screen receipt (LIHAT STRUK).

## Behavior changes users may notice

- After the owner resets a cashier's password or deactivates them, that cashier's phone is sent to
  the login page at its next contact with the server ("akun dinonaktifkan atau password diganti
  oleh Owner"). Pending sales are kept and sync after the cashier logs in again (deactivated: they
  show "Gagal sinkron" as before).
- The cart refuses a 201st different product; product names are limited to 120 characters.
- Owner: "Cek waktu" badge in Riwayat; "Diterima server" time in the detail; `time_flag` column in
  the transactions CSV.
- Riwayat: "Rentang Tanggal" filter; detail: LIHAT STRUK.

## Database migrations in this release (apply in order, forward-only)

| Migration | Purpose |
|---|---|
| `20261009120000_default_privileges.sql` | SEC-08 fail-closed defaults |
| `20261009120100_create_transaction_ownership_limits.sql` | SEC-05 race ownership; SEC-07 RPC limits |
| `20261009120200_name_length_limits.sql` | SEC-07 CHECK constraints (fails loudly on longer existing names) |
| `20261009120300_session_revocation.sql` | INFO-3 live-session requirement; `revoke_user_sessions` |

All earlier migrations (Phases 2–8) are also unapplied in production: production does not exist yet.

## Known limitations and residual risks (accepted or external)

| Item | Note |
|---|---|
| Self-service password change on a fresh session | The Auth API still allows it within ~24 h of sign-in; the app has no screen for it (SEC-04, SECURITY E.8) |
| Offline logout | Removes the session from the device; the refresh token cannot be revoked server-side while offline (SECURITY E.9) |
| Shared-device residue | Unsynced sales (and synced ones for 7 days) readable with devtools; no credentials (INFO-1) |
| Sale time | From the device clock; flagged for the owner, never rejected (SEC-06); a clock set back < 24 h and synced at once is not flagged |
| Client price snapshot | Accepted risk D7 / SECURITY E.12 (unchanged) |
| Dev dependency advisory | `braces` via `eslint-config-next`, no compatible fix, lint-time only (INFO-2) |
| CSP headroom | ~10 more pages/inline scripts before the policy line hits Cloudflare's 2,000 characters; the build then fails loudly |
| CI | Playwright and Edge Function tests run locally only (RUNBOOK §6) |
| Dark mode | Deferred: PRD §44 lists it, IMPLEMENTATION_PLAN §5 excludes it; needs a product decision |
| Free tier | Project pause and no automatic backups (RUNBOOK §5, §8) |

## Not yet verified (needs production or a real device)

Hosted Auth settings, `postgres` privileges on `auth.sessions`, Edge Function secrets and origin
check, Cloudflare `_headers` behavior and redirects, Linux build prefetch file names, HSTS/domain,
preview isolation, hosted advisors, and the real Android device test (install, offline sale, kill
app, reconnect, sync). See `LAUNCH_READINESS.md` and RUNBOOK §7.

# Phase Execution Log

Evidence labels: **VERIFIED** (checked in the current repository or re-run now), **REPORTED**
(stated in a past session's final report, not re-run), **INFERRED** (deduced from code/history),
**UNKNOWN** (no evidence available).

## Phases 0–12: reconstructed history

Sources: `git log`, branch list, and the Claude Code session transcripts stored locally for this
repository (one transcript per session; some sessions only contain a security-review sub-task).
No transcript was found that covers the Phase 6 implementation itself; its code is in the commits.

| Phase | Commit(s) | What was built | Results at the time | Label |
|---|---|---|---|---|
| 0 Spec consolidation | `3c19d47`, `efc1173`, `52abf31`, `d237f1a` (also on `main`) | Decisions D1–D11, C19–C31, P1–P18 written into the specs; `.claude` rules, skills, ask-rules | — | VERIFIED |
| 1 Foundation | `1af9207` | Next.js static export, tooling, CI | lint/type/build pass; 2 unit, 9 E2E | VERIFIED commit / REPORTED results |
| 2 Auth + DB + RLS | `167e28d` | Schema, RLS, grants, login/logout, guard, runbook | gates pass | VERIFIED / REPORTED |
| 3 Design system + shell | `9bba290` | Tokens, primitives, nav, manifest | 125 unit; 26 E2E pass, 19 skipped by design | VERIFIED / REPORTED |
| 4 Products + categories | `6314d79` | Owner CRUD, deactivate/reactivate | — | VERIFIED / UNKNOWN |
| 5 POS + cart | `2f9c0a6` | Grid, search, tabs, local cart | 293 unit; 35 E2E pass, 21 skipped | VERIFIED / REPORTED |
| 6 Checkout + outbox | `2196c5b`, `962c2fd` | Payment, `create_transaction`, outbox, sync, success | Later D.9 clarification: another user's id → WK001 | VERIFIED / INFERRED |
| 7 History | `897120c` | Merged list, filters, search, detail | 509 unit | VERIFIED / REPORTED |
| 8 Dashboard | `d55c453` | Report RPCs, 4 metrics, SVG chart, top products | gates pass | VERIFIED / REPORTED |
| 9 Employees, settings, export | `51a2036` | `admin-cashier` Edge Function, store settings, CSV export | 717 unit | VERIFIED / REPORTED |
| 10 Offline + sync + PWA | `cd0b6eb` | Service worker, catalog cache, retry/backoff, Web Locks, logout dialog | gates pass | VERIFIED / REPORTED |
| 11 Testing + debugging | `a0ddd47` | Fault injection, runtime guard, fetch timeout, regression tests | gates pass; one assertion loosened (`sync.offline.spec.ts` rejected-session test accepts `pending` or `syncing`) | VERIFIED / REPORTED |
| 12 Security audit | none (read-only) | Findings SEC-01..09, INFO-1..6, remediation plan | 848 unit, 340 pgTAP at audit time | REPORTED; findings re-verified in code (see `SECURITY_TRACKER.md`) |

Branches `feature/phase-1-…` through `feature/phase-12-security-audit` and `feature/claude` all
point into this one linear history; `feature/phase-12-security-audit` and `feature/claude` are at
`a0ddd47`. `main` is at Phase 0 (`d237f1a`). There is no git remote.

## Requirement coverage audit (2026-10-09)

Every PRD §43 Must Have and AC-01..AC-15 is implemented and tested. Gaps: §44 simple receipt view
(missing), history custom date range (presets only), dark mode (missing; conflicts with
IMPLEMENTATION_PLAN §5); unused `components/shared/PagePlaceholder.tsx`; no direct unit test for
`RouteAccess.tsx` and `features/categories/validation.ts`; CI runs neither Playwright nor
`test:functions`. No TODO/FIXME in source; every `test.skip` restricts a spec to certain
viewports/browsers, none skips a feature.

---

## 12R.0 — Records and baseline (2026-10-09)

Prompt: `prompts/phase-12r-security-remediation.md`.

Baseline on `a0ddd47` after a local `supabase db reset` (target confirmed local: `127.0.0.1:54321`,
CLI not linked):

| Command | Result |
|---|---|
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm run test` | 61 files, 848 passed |
| `npm run test:db` | 6 files, 340 passed |
| `npm run build` | pass; `sw.js` precaches 117 files |
| `npm run test:functions` | 1 file, 14 passed |
| `npm audit` | 5 high (dev tooling, see INFO-2) |
| `npm audit --omit=dev` | 0 |
| `npx playwright test` (full matrix, 610 tests) | 380 passed, **1 failed**, 144 skipped, 85 did not run (8.1 min) |

- **Failure (pre-existing flake):** `history.spec.ts:214` on `390x844`: `expect(await order())`
  read the card list once, right after cards that were already visible in the unfiltered list;
  the debounced search re-query briefly showed the loading state, so the list read `[]`. Test race,
  not an app defect. Fixed in 12R.1 with a polled assertion.
- **85 did not run:** the `mutations*`, `static-mutations` and `offline*` projects depend on the
  read-only projects, so one failure there blocks them. The full matrix is re-run after 12R.1.
- **144 skipped:** every skip restricts a spec to certain viewports/browsers (coverage audit); none
  skips a feature.

## 12R.1 — SEC-09 test harness (2026-10-09)

Changes:
- `tests/e2e/support/test.ts`: CSP guard. Every watched context reports each
  `securitypolicyviolation` event through an exposed binding, and console messages matching
  `CSP_MESSAGE` are recorded **before** any allow-list is consulted. `E2E_LOG_ALLOWED=1` prints the
  allowed messages a test hits.
- New `tests/e2e/guard.spec.ts`: proves the guard fires (strict-CSP page via `page.route`, every
  console error allowed → one violation + one CSP console message still recorded).
- Allow-lists narrowed from evidence (`E2E_LOG_ALLOWED=1` run of the `mutations` project):
  admin → `FAILED_REQUEST` + `admin-cashier create: refused: email_taken`; checkout lost response
  and history pending sale → `FAILED_REQUEST` only; menu → `FAILED_REQUEST` + `Could not create the
  category:`; faults file → `FAILED_REQUEST`, `Could not update the store:`,
  `admin-cashier (reset_password|set_active): (refused|request failed):`. The broad
  `/Could not|failed|refused|Sync pass/i` is gone from all of them.
- `history.spec.ts:233`: order read is now polled (pre-existing flake, see baseline).
- **New defect found and fixed (test-only):** the E2E "expired access token" simulation wrote
  `expires_at: 0`. auth-js treats a falsy `expires_at` as "not expired" (`GoTrueClient.js:2540`),
  so `auth.spec.ts` (rejected session), `sync.offline.spec.ts` G.9 offline session and G.9
  rejected session ran with a still-valid token. They passed because the auto-refresh ticker
  happened to reject the revoked refresh token first; in one of two repeated runs the sync pass
  used the valid token instead. Now `EXPIRED_AT = 1` (a real past time).
- G.9 rejected-session test restored to the strict assertion and tightened: the outbox entry is
  `pending` with `attempts: 0`, **zero** RPC requests before re-login, exactly `[id]` after, one
  server row.

Results:
| Command | Result |
|---|---|
| `playwright test guard.spec.ts --project=360x800` | 1 passed (first run failed on the test's own expectation of the message text: Chromium says "Executing inline script violates … Content Security Policy"; the guard caught it) |
| G.9 tests, `offline` + `offline-edge`, `--repeat-each=3` | 12 passed (before the `EXPIRED_AT` fix: 7 failed / 1 passed with `--repeat-each=4`) |
| `--project=mutations,mutations-edge,static-mutations --no-deps` | 57 passed |
| auth + guard + history specs on `360x800`, `390x844`, `static` | 27 passed |
| lint, typecheck | pass |

## 12R.2 — SEC-01 offline logout (2026-10-09)

Verified in auth-js 2.117.3 before changing anything: `_signOut` returns the session-load error
(`GoTrueClient.js:3434`) before `_removeSession`; the client is lockless by default, so a follow-up
local sign-out does not queue behind a refresh that is still retrying.

Changes: `lib/supabase.ts` (`AUTH_STORAGE_KEY = 'wk-auth'`, `hasStoredSessionData`,
`removeStoredSession`), `features/auth/api.ts` (`signOut`, `onSignedOut` storage listener),
`features/auth/signOut.test.ts` (new, real client), `features/auth/api.test.ts` (partial mock,
honest test name), `tests/e2e/support/session.ts` (new: key, `EXPIRED_AT`, session helpers; the old
`sb-*-auth-token` lookups in 5 places now use it), `tests/e2e/sync.offline.spec.ts` (2 SEC-01
tests), `docs/SECURITY.md` E.9.

Results:
| Check | Result |
|---|---|
| `signOut.test.ts` before the fix (storage key only) | 3 failed: `signOut()` hangs > 5 s (the 25 s refresh retry the audit measured) |
| `signOut.test.ts` after the fix | 4 passed |
| SEC-01 E2E against the old `api.ts` | failed: still on `/lainnya` after 5 s |
| SEC-01 E2E, `offline` + `offline-edge` | 4 passed |
| `npm run test` | 62 files, 852 passed |
| `offline` + `offline-edge` projects (all offline specs) | 31 passed, 1 skipped (PWA install check on Edge, by design) |
| auth + laporan + laporan.mutation on `360x800`, `static`, `mutations` | 23 passed, 1 skipped |
| lint, typecheck | pass |

## 12R.3 — SEC-02 login before hydration (2026-10-09)

Changes: `features/auth/LoginForm.tsx` (`method="post"`; submit disabled until hydrated via
`useSyncExternalStore` — a `useEffect` + `setState` version failed lint `react-hooks/set-state-in-effect`),
`LoginForm.test.tsx` (+2), `tests/e2e/auth.spec.ts` (+1, JavaScript disabled).

Follow-up to 12R.2 (background commit review flagged an "auth-session-race" in `api.ts`, without
details). Analysis: a refresh that logout stopped waiting for could succeed later and save fresh
tokens. auth-js 2.117.3 guards this (`_callRefreshToken` commit guard: storage changed since the
refresh started → tokens discarded, `AuthRefreshDiscardedError`; post-save epoch check for a
removal during the save). New unit test proves it end-to-end with the real client. While writing it,
the test first passed trivially (no refresh request: the shared client singleton had a refresh
left hanging by the previous test, and auth-js runs one refresh at a time); now each test loads a
fresh client (`vi.resetModules`) and asserts the refresh request happened.

Results:
| Check | Result |
|---|---|
| `features/auth` unit tests | 6 files, 84 passed |
| auth + smoke specs on `360x800`, `static`, `static-desktop` | 30 passed, 9 skipped (viewport restrictions) |
| SEC-01 E2E (`offline`) after the LoginForm change | 2 passed |
| lint, typecheck | pass |

## 12R.4 — SEC-03 CSP and security headers (2026-10-09)

Changes: new `scripts/headers.mts` (pure) + `scripts/headers.test.ts` (18 tests),
`scripts/build-headers.mts` (post-build; reads `.env*` through `@next/env` like `next build`),
`package.json` build = `next build && build-sw && build-headers`, `public/_headers` (nosniff, DENY,
`no-referrer`, COOP `same-origin`, Permissions-Policy), new `app/not-found.tsx` (the default 404
had 4 inline `style` attributes), `.github/workflows/ci.yml` (placeholder URL/key for the build),
new `tests/e2e/headers.spec.ts` (22 tests on `static`/`static-desktop`), docs TECHNICAL_SPEC H.5,
SECURITY E.12, TEST_PLAN G.19.

Policy as built: one `/*` rule, 1,304 characters, 19 script hashes from 18 pages,
`connect-src 'self' <supabase origin>`; no `unsafe-*`.

Evidence that the policy breaks nothing: every `static`, `static-desktop`, `static-mutations`,
`offline`, `offline-edge` test ran with the CSP guard. Results: static 155 passed / 2 failed / 19
skipped; static-mutations 19 passed; offline 24 passed / 1 failed / 1 skipped. Every CSP message
came from one test fixture (the layout audit's self-test injected `style=""` HTML; the policy
correctly blocked it → fixture now styles through CSSOM). The offline failure was a pre-existing
race in "logout warning: Sinkronkan sekarang" (the route holding back the automatic sync was
installed after going online) → route installed first; 8/8 repeated runs pass.

## 12R.5 — SEC-08 default privileges (2026-10-09)

Catalog before (`pg_default_acl`): postgres/public functions `anon=X, authenticated=X`; sequences
`anon=rwU, authenticated=rwU`; and no global entry, so PostgreSQL's built-in EXECUTE to PUBLIC
applied as well (a per-schema revoke cannot remove it). Migration
`20261009120000_default_privileges.sql` revokes the global PUBLIC default for functions of
`postgres` and the per-schema anon/authenticated defaults for functions and sequences.
`supabase_admin` defaults are not changeable by `postgres` on the hosted platform (documented).

pgTAP `01_schema` +6: no `public`/`private` function executable by anon; authenticated only on the
allow-list; a function and a sequence created inside the test get no client privileges;
service_role keeps its default. Side effect found: the pgTAP helper functions (`tests.*`) had relied
on the PUBLIC default → each test file now grants its helpers explicitly (schema default).

## 12R.6 — SEC-05 RPC ownership race (+ SEC-07 RPC limits) (2026-10-09)

Migration `20261009120100_create_transaction_ownership_limits.sql` (`create or replace`, generated
from the original text; diff = conflict-branch ownership re-check, ≤ 200 items, product_name ≤ 120;
grants re-asserted). New `tests/functions/create-transaction-race.test.ts`: two real psql sessions
in the local DB container; B starts only after A printed its insert, and DB clock stamps prove B's
call began while A's row was uncommitted. Against the **old** function (installed temporarily):
the other-cashier case **fails** (`result=exists`) — SEC-05 reproduced. With the migration: 2
passed. A first version of the test passed on the old function because B started after A
committed (pre-check path); hence the clock assertions.

## 12R.12 — SEC-07 payload limits (2026-10-09)

Existing data checked: local seed names are short; no production data exists yet. Migration
`20261009120200_name_length_limits.sql` (validated CHECKs; fails loudly on violating rows; check
queries in its header). pgTAP 03 +4 (200 items ok, 201 → WK001, name 120 ok, 121 → WK001), 01 +2
(constraint definitions). Client: `lib/cart.ts` `MAX_CART_LINES`/`canAddProduct` (201st product
refused, more units of a listed product always allowed), `lib/checkout.ts` guard,
`ProductPicker` toast "Satu transaksi paling banyak 200 jenis menu.", product form `maxLength` +
validation (counted per character). Unit tests +7. DATABASE D.5, D.7, D.9, D.11 updated.

Gate results on the tree with 12R.4–12R.6 and 12R.12:
| Command | Result |
|---|---|
| `npm run test` | 63 files, 880 passed |
| `npm run test:db` | 6 files, 352 passed |
| `npm run test:functions` | 2 files, 16 passed |
| lint, typecheck, build | pass |
| `supabase db advisors --local` | No issues found |
| layout + kasir + checkout + headers on `360x800`, `static`, `static-desktop` | 59 passed, 13 skipped |
| menu + kasir mutations (`mutations`) | 2 passed |

## 12R.7 — INFO-3 session lifecycle (2026-10-09)

Measurement first (scratch script against the local stack, GoTrue v2.197.0; old tokens of a fresh
cashier after each owner action):

| Action | Old refresh | `/auth/v1/user` | Table read (RLS) | `create_transaction` | Edge Function auth | Sessions in DB |
|---|---|---|---|---|---|---|
| none | 200 | 200 | rows | created | 403 (not owner) | 1 |
| password reset | 400 not_found | 403 | **rows** | **created** | **500** | 0 |
| deactivate | 400 user_banned | 403 | 0 rows | WK002 | 401 | **1** |
| deactivate → reactivate | **200** | **200** | **rows** | **created** | 403 (passes auth) | 1 |

Fix (migration `20261009120300_session_revocation.sql`, Edge Function, sync): live-session check in
both RLS helpers and `create_transaction` (WK003, after the active-profile check so a deactivated
cashier keeps WK002/failed per SECURITY E.10); `public.revoke_user_sessions` (service_role only)
called on deactivation and reset; `AuthSessionMissingError` → 401; client: WK003 keeps the sale
pending, and when the refresh is refused too the app ends the session itself (auth-js keeps a
session whose access token has not expired after a refused refresh) → login → sync after re-login.

Found while testing: pgTAP `tests.act_as` claims had no `session_id` → every file now opens a real
`auth.sessions` row (`tests.open_session`); the race test also uses live sessions and now fails fast
instead of hanging when a session exits early.

Results:
| Check | Result |
|---|---|
| `tests/functions/session-lifecycle.test.ts` | 4 passed (reset / deactivate / reactivate all refused everywhere; new logins work) |
| `npm run test:db` | 365 passed (+13) |
| `npm run test:functions` | 21 passed |
| function unit tests | 51 passed |
| `features/offline` + `features/auth` unit | 191 passed |
| INFO-3 E2E (`offline`, `offline-edge`) | 2 passed |
| `offline` + `offline-edge` (all) | 33 passed, 1 skipped |
| `mutations`, `mutations-edge`, `static-mutations` | 57 passed |

## 12R.8 — INFO-4 Edge Function body limit (2026-10-09)

`readBodyLimited` refuses a declared Content-Length over 4 KiB before reading and stops a stream at
the limit; same `invalid_request`/`body` answer as before. Caller lookup through the service client
kept: it reads only the profile whose id is the verified token's subject. Logging: only error code
and message (checked `logFailure`). Tests: handler unit +4, real HTTP +1.

## 12R.9 — INFO-5/6 operational safeguards (2026-10-09)

`.claude/settings.json`: +52 ask rules (Bash/PowerShell × plain/npx) for `supabase config push`,
`db query --linked`, `db dump --linked`, `link`, `secrets unset`, `functions delete`,
`migration repair`, `projects delete`, `wrangler secret put/delete`, `pages secret put`,
`pages project delete`, `wrangler delete`; SECURITY E.13 updated. INFO-6: GoTrue-written hashes
start `$2a$10$`, `gen_salt('bf')` gives `$2a$06$` (local catalog) → RUNBOOK uses `gen_salt('bf', 10)`
and points to `revoke_user_sessions`.

## 12R.10 — SEC-04 password and email change (2026-10-09)

Measured with a cashier's own session (scratch script, local stack), before → after setting
`secure_password_change = true` (local stack restarted; `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION=true`):

| Check | Before | After |
|---|---|---|
| change own password, fresh session | 200 | 200 |
| change own password, session backdated 25 h | 200 | 400 `reauthentication_needed` |
| change own email | 500 locally (confirmation mail cannot be sent: mail service excluded); email unchanged | same |
| owner reset via admin-cashier, then login | 200 | 200 |

Decision applied (user): no self-service UI. Documented precisely (SECURITY E.8): the setting does
not disable self-service password change. `enable_confirmations` left false (it governs sign-up
confirmation; sign-up is off; email change already needs confirmation). Guard test in
`supabase/config.test.ts`.

## 12R.11 — SEC-06 sale-time flag (2026-10-09)

Spec first: UI_SPEC A.15, DATABASE D.10, PRD §20. New `lib/saleTimeFlag.ts` (pure); `HistoryEntry.syncedAt`
(server rows; null for device rows), history API reads `synced_at`; owner-only "Cek waktu" badge on
the card, reason Alert + "Diterima server" row on the detail; CSV `time_flag` column. No schema
change, no rejection, `created_at` untouched. The history `api.test` expectation "list does not read
synced_at" changed to "reads it" on purpose (needed for the flag; names and prices still not read).

Tests: `lib/saleTimeFlag.test.ts` 6, HistoryList +2, TransactionDetail +3, datasets +1 (and the
column list), E2E `history.mutation.spec.ts` SEC-06 (cashier sees nothing; owner sees badge, reason,
unchanged sale time). `history.mutation` + `laporan.mutation` on `mutations`: 6 passed (the
dashboard spec's direct-RPC helper moved to `support/offline.ts` `syncSaleAt` and is shared).

Found: 17 working-tree files had CRLF endings (index LF, `core.autocrlf=true`); normalized to LF
in the working tree (no content change in git).

## 12R.13 — INFO-1 and 12R.14 — INFO-2 (2026-10-09)

INFO-1: SECURITY E.12 accepted-risk entry; RUNBOOK §4 shared-device guidance. No auto-deletion.
INFO-2: `npm ls` path `eslint-config-next@16.4.0 → @next/eslint-plugin-next → fast-glob@3.3.1 →
micromatch@4.0.8 → braces@3.0.3`; advisory range `<=3.0.3`; 3.0.3 is the newest braces and 16.4.0
the newest eslint-config-next → no compatible fix; npm's fix is a major downgrade (rejected).
Documented in SECURITY E.12; production audit 0.

## 12R.X — Exit gate (2026-10-09)

Gates on `601ee6c` (local DB reset first):
| Command | Result |
|---|---|
| lint, typecheck | pass |
| `npm run test` | 64 files, 902 passed |
| `npm run test:db` | 6 files, 365 passed |
| `npm run test:functions` | 3 files, 21 passed |
| `npm run build` | pass; CSP 19 hashes / 18 pages |
| `npm audit --omit=dev` | 0 |
| `supabase db advisors --local` | No issues found |
| `out/` secret scan | no keys; the one `sb_secret_` match is supabase-js prefix-checking code; no source maps |
| **full Playwright matrix (710 tests)** | **500 passed, 0 failed, 210 skipped, 0 did not run** (14.1 min) |

Skips: 144 at baseline + 66 new, all project restrictions of new specs: `headers.spec.ts` 11 tests ×
5 non-static read-only projects (55), `guard.spec.ts` on 6 non-360 projects (6), SEC-02 test in
`auth.spec.ts` (360px only) on 5 projects (5). No test skips a feature.

Independent review (read-only reviewer agent over `a0ddd47..HEAD`): no high-severity issue.
Findings and dispositions:
1. Medium — new storage key strands sessions under the old `sb-*-auth-token` key: **not applicable**,
   nothing was ever deployed (no hosted project, no remote); local dev browsers only. No code.
2. Low-medium — after WK003 any non-retryable refresh error (429, 500) signed out: **fixed**, only
   400/401/403 end the session; `sync.test.ts` +2 cases.
3. Low — a session ended by a password reset showed "Akun tidak aktif": **fixed** by wording. The
   device cannot tell deactivation from a reset (both end the session); the login notice now says
   "akun dinonaktifkan atau password diganti oleh Owner". (A logic change that called getUser was
   tried and reverted: it turned the deactivation notice into "expired" and broke
   `sync.offline.spec.ts` "cashier deactivated before sync".) Login errors unchanged.
4. Low — `@next/env` imported but not declared: **fixed**, small env reader `buildEnvValue` with
   Next's production file order; `scripts/headers.test.ts` +3.
5. Note — CSP line headroom: documented in TECHNICAL_SPEC H.5 (build fails loudly when exceeded).

After the fixes: `features/auth` 84 passed, `sync.test.ts` 34 passed, `scripts` 31 passed, build
pass, lint/typecheck pass, `sync.offline.spec.ts` (`offline`) 12 passed, `auth.spec.ts` on
`360x800` + `static` 18 passed.

**Phase 12R verdict: COMPLETE.** All P0/P1 findings fixed with tests; P2 items implemented as
decided or documented; no open Critical/High finding.

---

## 13P.1 — History custom date range (PRD §44, 2026-10-09)

Prompt: `prompts/phase-13-release-prep.md`. Spec first: UI_SPEC A.15 "Filter tanggal".
Changes: day-range helpers moved from `features/reports/range.ts` to `lib/time.ts`
(`validateDayRange`, `dayRangeInstants`, `countJakartaDays`, `jakartaDayInput`; reports keep their
exported names as thin wrappers); history `DATE_PRESETS` + `custom` ("Rentang Tanggal"),
`DateSelection`, `validateHistoryRange` (366 days, like Laporan); `useTransactions` takes
`preset/fromDay/toDay`; `HistoryList` shows the fields, explains an unusable range, hides the list
and loads nothing for it (the query keeps the last valid range); shared
`components/ui/DateRangeFields` (second use) now also used by `PeriodFilter`.
Tests: `filters.test.ts` +3 (inclusive WIB days, boundaries, messages; dateRangeFor calls migrated
to the selection object; `'custom'` is now a known preset), `HistoryList.test.tsx` +2 (+1
expectation: option list), E2E `history.spec.ts` +1. Results: related unit 409 passed; E2E on
`360x800`, `static`, `chromium` 3 passed; lint, typecheck pass.

## 13P.2 — Simple receipt view (PRD §44, 2026-10-09)

Spec first: UI_SPEC A.15 "Struk sederhana". Found: TECHNICAL_SPEC C.10 says the offline catalog
snapshot includes store information, but it held only products and categories → the catalog
fetch now also reads the store (a failure there does not fail the menu), and the snapshot keeps an
optional `store` (no IndexedDB version bump: object stores are schemaless; older snapshots read as
null). `features/transactions/receiptStore.ts` (server first, bounded to 3 s; device copy when the
browser reports no network or the server does not answer), `ReceiptView.tsx`, LIHAT STRUK / TUTUP
STRUK on the detail page. No printing.

Found while testing: offline, a supabase-js read retries for several seconds before failing, so the
first version kept the button on "MEMUAT…" > 5 s → offline uses the device copy at once.

Tests: `receiptStore.test.ts` 5, `TransactionDetail.test.tsx` +2, `catalogCache.test.ts` +1,
`pos/api.test.ts` +1 (menu still loads without store details), fixtures gained `store`.
E2E: `history.spec.ts` receipt (`360x800`, `static`) 2 passed; `sync.offline.spec.ts` receipt offline
(`offline`, `offline-edge`) 2 passed. Unit (transactions) 124 passed; lint, typecheck pass.

## 13P.3 — Debt and test holes (2026-10-09)

- Removed unused `components/shared/PagePlaceholder.tsx` (no importer).
- New `features/auth/RouteAccess.test.tsx` (cashier allowed/denied routes with "Akses ditolak",
  owner allowed) and `features/categories/validation.test.ts`.
- Header sync indicator: already asserted in E2E (`sync.offline.spec.ts` banner "1 belum
  tersinkron" and "1 gagal sinkron"); the coverage audit's "no E2E assertion" was inaccurate. No change.

- Flake found in the full unit run: `SyncStatus.test.tsx` "says so when everything is synced" (findBy default 1 s vs an IndexedDB read under a fully parallel run; passed alone 3/3). The four IndexedDB-backed `findBy*` in that file now wait up to 5 s; assertions unchanged. Note: the 13P.3 commit was made by a command chain that did not stop on that failure; the full suite was re-run twice after the fix.

## 13P.4–13P.6 — CI, runbook, release notes, readiness (2026-10-09)

- CI: Playwright and `test:functions` not added to GitHub Actions — they need the full Supabase
  stack with the edge runtime, the Edge browser, and a temporarily raised sign-in rate limit, and an
  Actions workflow cannot be run or verified from this machine (no remote). Recorded as a known
  limitation; RUNBOOK §6 is the local release-candidate gate. (CI build job already got placeholder
  env in 12R.4.)
- RUNBOOK §6–§9: release-candidate verification, production deployment with every hosted step marked
  for approval (project, link, dry-run push, push, read-only privilege/RLS checks, advisors, Auth
  settings by hand — never `config push`, Edge Function secret + deploy + foreign-origin check,
  owner bootstrap, Cloudflare Pages settings, preview isolation, HSTS), header check, smoke test
  including SEC-01/02 and INFO-3, rollback, monitoring and incidents. No production value invented.
- `RELEASE_NOTES.md` and `LAUNCH_READINESS.md` (PRD §53 DoD matrix; local READY, deployed NO,
  production-verified NO). IMPLEMENTATION_PLAN §7 notes the hosting recommendation.

**Phase 13-prep verdict: COMPLETE.** Phase 14 preparation (DoD matrix, device checklist, owner
briefing items) is in `LAUNCH_READINESS.md` and RUNBOOK §7.7.

## Release-candidate gate on `7051314` (2026-10-09) — INCOMPLETE

| Command | Result |
|---|---|
| lint, typecheck | pass |
| `npm run test` | 942 passed |
| `npm run test:db` | 365 passed |
| `npm run test:functions` | 21 passed |
| `npm run build` | pass |
| `npm audit --omit=dev` | 0 |
| `supabase db advisors --local` | No issues found |
| full Playwright matrix (726 tests) | **interrupted** at test 656/726 (in `mutations-edge`) with 0 failures so far: Claude Code stopped the background run because the machine was critically low on memory. `static-mutations`, `offline`, `offline-edge` did not run in this pass. |

Last complete evidence for those projects: `offline`/`offline-edge` and the three mutation projects
passed after INFO-3 (33 passed / 1 skipped, 57 passed); later changes were covered by targeted runs
(`sync.offline.spec.ts` 12 passed after the review fixes; receipt offline 2 passed; history
mutation 6 passed). **Action:** re-run RUNBOOK §6 in full on the release commit when memory allows,
then `npx supabase db reset` (the interrupted run may have left test data in the local database).

## Release-candidate gate, complete run on `81dfa99` (2026-10-09, second session)

Code identical to `7051314` (the commits after it change documentation only). Memory: about
1.5–3 GB available throughout (held by user applications); no orphaned test processes. Strategy: one
Playwright project per process, `--workers=1`, `--no-deps`, foreground, in the config's dependency
order (the seven read-only projects, then `mutations` → `mutations-edge` → `static-mutations` →
`offline` → `offline-edge`). Target checked before each reset: no `project-ref` in `supabase/.temp`,
API `127.0.0.1:54321`, DB `127.0.0.1:54322`. Sign-in rate limit left at the committed default (30);
no rate-limit failures occurred.

| Gate (RUNBOOK §6) | Result |
|---|---|
| `npx supabase db reset` (before) | local, done |
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm run test -- --maxWorkers=2` | 67 files, **942 passed** |
| `npm run build` | pass; CSP 19 hashes / 18 pages |
| `npm run test:db` | 6 files, **365 passed** |
| `npm run test:functions` | 3 files, **21 passed** |
| Playwright (726 tests, 12 projects) | **516 passed, 0 failed, 210 skipped, 0 interrupted, 0 did not run** |
| `npx supabase db reset` (after) | local, done |
| `npm audit --omit=dev` | **0** |
| `npx supabase db advisors --local` | **No issues found** |
| `npm audit` (including dev) | 5 high: the documented INFO-2 chain (unchanged) |

Per project (passed / skipped / failed, time): 360x800 78/12/0 (6.1 m); 390x844 29/61/0 (1.8 m);
412x915 29/61/0 (1.7 m); chromium 62/28/0 (5.2 m); msedge 62/28/0 (6.0 m); static 88/2/0 (4.7 m);
static-desktop 73/17/0 (4.8 m); mutations 20/0/0 (2.5 m); mutations-edge 20/0/0 (3.1 m);
static-mutations 20/0/0 (2.4 m); offline 18/0/0 (1.6 m); offline-edge 17/1/0 (1.8 m).

Skips: every skip is a viewport/project restriction written as `test.skip(...)` with a reason; none
skips a feature. Accounting against the Phase 11 baseline (144): + `guard.spec.ts` (new; 360 px only,
skipped on 5 projects) + `headers.spec.ts` (new; 11 tests, static build only: 55) + the SEC-02 test
(inherits the existing 360-px rule of `auth.spec.ts`: 5) + the `offline-edge` PWA install check
(pre-existing; the baseline's offline projects did not run) = **210**. Correction to the 12R
exit-gate note, which said 6 for the guard spec: it is 5. Only two skip conditions were added since
`a0ddd47`, both listed above.

**Release-candidate verdict: all local gates of RUNBOOK §6 PASS.**

### SEC-04 residual risk review (self-service password change; interacts with INFO-3)

Re-measured on the release candidate (scratch scripts, local stack, test accounts removed):
- Fresh session (< 24 h): `PUT /auth/v1/user {password}` returns 200; the new password logs in.
- Session backdated 25 h: `reauthentication_needed` (400). Email change: never applied directly.
- After a fresh session changes the password: GoTrue keeps only the changer's session; the account's
  other device loses data access at once (INFO-3 live-session check) and its refresh is refused
  (400); the old password is refused.
- Owner reset afterwards: every session ends (including the changer's), the changer's password stops
  working, the owner-set password works.

Assessment: the absence of a UI is not an API restriction; any holder of a < 24 h session can change
that account's password. Impact: what the session could already do, plus persistence and locking
out the real user. Cashier account: the owner recovers at once (reset). Owner account: recovery via
RUNBOOK §3 (dashboard). Supabase offers no setting or hook that disables self-service password
updates. No code change before launch; operational controls added to RUNBOOK §9 and SECURITY E.8
(owner signs in only on the owner's own device, screen locks, Auth log review).

## SEC-04 final review: "require current password" (2026-10-09) — checkpoint, then result below

Static evidence gathered so far (no configuration or code changed):

| Component | Version | Finding |
|---|---|---|
| `@supabase/supabase-js`, `@supabase/auth-js` | 2.117.3 | `UserAttributes.current_password` (snake_case, not `currentPassword`); `updateUser()` sends attributes unchanged in `PUT /user`. Type comment ties it to `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD`. |
| Local GoTrue | v2.197.0 | Binary contains config `update_password_require_current_password` and error codes `current_password_required`, `current_password_invalid`: the server supports it. Local container env has only `..._REQUIRE_REAUTHENTICATION=true`. |
| Supabase CLI (`supabase.exe`, run by `npx supabase`) | 2.120.0 | `[auth.email]` schema has no current-password key; `secure_password_change` maps only to `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION`. The hosted Management API schema has a separate `security_update_password_require_current_password` ("Require the user's current password when updating their password"). |

Interim conclusions: the two settings are distinct (reauthentication for sessions > 24 h vs current
password on every self-service change); neither is proven to disable `PUT /user`. The local stack
cannot enable the current-password requirement through supported config with CLI 2.120.0; the
hosted project can (Management API field; dashboard location not yet confirmed — web search hit the
session usage limit).

Remaining steps:
1. Confirm the hosted dashboard location in current Supabase docs.
2. Behavioral test on an isolated local probe: a temporary GoTrue container cloned from
   `supabase_auth_warung-kasir` (same image/network/DB) plus
   `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD=true`, on its own host port; test
   missing / incorrect / correct `current_password`, its interaction with reauthentication (> 24 h
   session), an admin-API reset (owner flow), and an admin-generated recovery link; remove the probe.
3. If confirmed: add the hosted setting to RUNBOOK §7.2 and a production smoke check to §7.7
   (expect `current_password_required`), update SECURITY E.8 and SECURITY_TRACKER SEC-04, and note
   that the local stack cannot mirror it with CLI 2.120.0. No app code change is needed (no
   self-service UI).

### SEC-04 final review — result (2026-10-09)

Documentation: Supabase's passwords guide documents only the client parameter
("Verifying the current password": pass `current_password` to `updateUser()`, supabase-js v2.102.0+).
It names no dashboard toggle, config key or env var. No public page names the server field; the
only evidence of a hosted control is the Management API schema inside CLI 2.120.0
(`security_update_password_require_current_password`). Dashboard location: **unconfirmed**.

Behavioral test (isolated probe: a temporary clone of the local GoTrue v2.197.0 container on the
same network and database, port 127.0.0.1:54399, with `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD=true`
plus the stack's `..._REQUIRE_REAUTHENTICATION=true`; throwaway `itest-cp-*` auth users; the probe,
its copied environment file and the users were removed afterwards; the real stack was not changed):

| Case | Result |
|---|---|
| Fresh session, `PUT /user {password}` without `current_password` | 400 `current_password_required` |
| Fresh session, wrong `current_password` | 400 `current_password_invalid`; old password still logs in |
| Fresh session, correct `current_password` | 200; new password logs in |
| Session backdated 25 h, correct or missing `current_password` | 400 `reauthentication_needed` (both checks apply independently) |
| Admin API `PUT /admin/users/{id} {password}` (the owner's reset through admin-cashier) | 200; owner-set password logs in — not affected |
| Recovery: admin-generated recovery link → `/verify` → `PUT /user {password}` without `current_password` | 200 — a recovery session is exempt |

Difference between the settings: `secure_password_change` (`..._REQUIRE_REAUTHENTICATION`) refuses
password updates from sessions older than ~24 h unless a reauthentication nonce is given;
"require current password" refuses every self-service update that does not carry the correct
current password. Neither disables `PUT /user`: with the right credential the update succeeds.

Assessment: enabling "require current password" closes the residual risk measured earlier (a
fresh session alone can no longer take over the account) and does not affect the owner's reset or
the owner's dashboard recovery (admin paths). The remaining path is the recovery flow, which needs
access to the account's mailbox (cashier logins have none; owner recovery uses the dashboard).

Decision: **no local change** — CLI 2.120.0 has no supported `config.toml` key, so the local stack
cannot enforce it reproducibly (hand-editing containers would not be). **Recommended for the
hosted project in Phase 13** (approval): enable it in the dashboard if the toggle exists, otherwise
via the Management API field; verify with a read-only config read and the RUNBOOK §7.7 smoke check.
The app has no self-service password screen, so no app or SDK change is needed; if one is ever
added it must send `current_password` (snake_case, supported by the installed supabase-js 2.117.3).

---

## Phase 13 — production deployment log (each step approved by the user)

| Step | Result |
|---|---|
| Merge `feature/warungkasir-launch-readiness` → `main` | fast-forward, `efa35f0` |
| Remote + push | `origin` = github.com/vacelni/kasir (private: anonymous 404); full-history secret scan clean (only the fake fixture); `origin/main` = `efa35f0` |
| Project | `ojzhdnoknssbmlkejpha` (name "kasir"), created by the user; linked by the user in their own terminal |
| Hosted versions | GoTrue v2.197.0 (= local), Postgres 17.11.0.003 (local 17.11.0.004), PostgREST v14.18 |
| `db push --dry-run` | exactly the 8 migrations, seeds: none, roles: none; nothing changed |
| INFO-3 privilege pre-check (SQL Editor, run by the user) | `postgres` SELECT on `auth.sessions` = true, DELETE = true |

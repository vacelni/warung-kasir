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

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

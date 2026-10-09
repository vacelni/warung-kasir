# Launch Readiness

Evidence column: **LOCAL** = proven by a local test/run (command in `PHASE_LOG.md`), **EXTERNAL**
= needs the production project/hosting, **MANUAL** = needs the user or a real device.
Status: ✅ met · ❌ not met · ⏳ in progress · ⬜ not yet checked.

## Functional

| Requirement | Evidence | Status |
|---|---|---|
| PRD §43 Must Have features | LOCAL — coverage audit + unit/E2E suites | ✅ (re-confirm at release candidate) |
| AC-01..AC-15 | LOCAL — unit, pgTAP, Playwright | ✅ (re-confirm at release candidate) |
| Transactions consistent and idempotent, incl. concurrent same-id | LOCAL — pgTAP 03; `create-transaction-race.test.ts` | ✅ |
| Offline sales survive logout, failures, reloads, reconnects | LOCAL — offline projects incl. SEC-01 and INFO-3 E2E | ✅ |
| Should Have chosen for launch: receipt view, history custom range | LOCAL — 13-prep | ⬜ |

## Security

| Requirement | Evidence | Status |
|---|---|---|
| No open Critical/High finding | `SECURITY_TRACKER.md` | ✅ (local scope) |
| P0 findings fixed and tested | `SECURITY_TRACKER.md` | ✅ |
| RLS, RPC, Edge Function, privileges tested | pgTAP 365, `test:functions` 21 | ✅ |
| No secret in bundles | LOCAL — `out/` scan at 12R exit gate | ✅ |
| CSP and headers pass on the built app | LOCAL — headers spec + CSP guard on all static/offline projects | ✅ (production: EXTERNAL) |
| Hosted Auth / API / function configuration | EXTERNAL — runbook checklist | ⬜ |

## Quality

| Requirement | Evidence | Status |
|---|---|---|
| lint, typecheck, unit, pgTAP, functions, build | LOCAL — baseline green on `a0ddd47` | ✅ baseline |
| Full Playwright matrix | LOCAL — 500 passed, 0 failed, 210 skipped (project restrictions) | ✅ (re-run at release candidate) |
| No new skips / weakened assertions | `PHASE_LOG.md`: new skips are project restrictions only; assertions only tightened or changed for intended behavior (logged) | ✅ |
| Production dependency audit = 0 | LOCAL — `npm audit --omit=dev` | ✅ baseline |

## Operations

| Requirement | Evidence | Status |
|---|---|---|
| Migrations reviewed, replay from zero | LOCAL — `supabase db reset` + pgTAP | ✅ baseline |
| Deployment, backup, recovery, rollback instructions current | RUNBOOK (13-prep) | ⬜ |
| Production configuration checklist | RUNBOOK (13-prep) | ⬜ |
| Production smoke test | EXTERNAL — after approved deployment | ⬜ |
| Real Android device test | MANUAL | ⬜ |

## States

| State | Status |
|---|---|
| Ready for deployment (local evidence) | NOT READY |
| Deployed | NO |
| Verified in production | NO |

# Launch Readiness

Evidence: **LOCAL** = proven by a local test/run (commands and counts in `PHASE_LOG.md`),
**EXTERNAL** = needs the production project/hosting, **MANUAL** = needs the user or a real device.
Status: ✅ met · ❌ not met · ⬜ not yet checked (external/manual).

## States (reported separately)

| State | Status |
|---|---|
| Ready for deployment — local evidence | **READY**: every RUNBOOK §6 gate passed on `81dfa99` (code identical to `7051314`); Playwright 516 passed / 0 failed / 210 skipped (restrictions only) of 726 |
| Deployed | **NO** — no hosted Supabase project, no Cloudflare project, no git remote |
| Verified in production | **NO** — RUNBOOK §7.6–7.7 after an approved deployment |

## PRD §53 Definition of Done

| DoD line | Evidence | Status |
|---|---|---|
| All Must Have features available | LOCAL — coverage audit (PHASE_LOG) + unit/E2E | ✅ |
| Owner and Cashier roles work | LOCAL — `RouteAccess.test.tsx`, `shell.spec.ts`, pgTAP 02 | ✅ |
| Transactions can be created; total and change correct | LOCAL — `lib/*.test.ts`, pgTAP 03, golden path E2E | ✅ |
| Transactions saved; history opens | LOCAL — `history*.spec.ts`, pgTAP 04 | ✅ |
| Dashboard shows real data | LOCAL — `laporan*.spec.ts`, pgTAP 05 | ✅ |
| Owner manages the menu; cashier access limited | LOCAL — `menu*.spec.ts`, pgTAP 02/06 | ✅ |
| No cross-store data access | LOCAL — pgTAP 02/04/05/06 | ✅ |
| Opens on Android; PWA installable | LOCAL — `pwa.offline.spec.ts` (Chromium install check); MANUAL — real Android Chrome | ✅ local / ⬜ device |
| Basic transactions work offline; offline data syncs | LOCAL — `sync.offline.spec.ts`, `pwa.offline.spec.ts` (Chromium + Edge); MANUAL — real device | ✅ local / ⬜ device |
| Export works | LOCAL — `admin.spec.ts`, `datasets.test.ts`, `csv.test.ts` | ✅ |
| No mandatory paid dependency | LOCAL — dependency list; free-tier design (TECH H.8) | ✅ |

## Security

| Requirement | Evidence | Status |
|---|---|---|
| No open Critical/High finding (reviewed scope) | `SECURITY_TRACKER.md`; independent review at 12R exit | ✅ |
| P0 findings fixed and tested (SEC-01/02/03/09) | Tracker + tests that fail on the old code | ✅ |
| RLS, RPC, Edge Function, privileges tested | pgTAP 365, `test:functions` 21, race + session-lifecycle tests | ✅ |
| No secret in bundles | `out/` scan at 12R exit; build refuses secret keys | ✅ |
| CSP and headers pass on the built app | `headers.spec.ts` + CSP guard across static/offline projects | ✅ local / ⬜ production |
| Hosted Auth / API / Edge Function / privileges configuration (incl. "require current password", SEC-04) | RUNBOOK §7.1–7.3, smoke §7.7 step 10 | ⬜ EXTERNAL |
| Preview isolation, seed exclusion, HSTS/domain | RUNBOOK §7.1, §7.5 | ⬜ EXTERNAL |

## Quality

| Requirement | Evidence | Status |
|---|---|---|
| lint, typecheck, unit (942), pgTAP (365), functions (21), build | LOCAL — release-candidate run on `81dfa99` | ✅ |
| Full Playwright matrix | LOCAL — 726 tests on `81dfa99`: 516 passed, 0 failed, 210 skipped, 0 interrupted | ✅ |
| No new feature skips; no weakened assertions | PHASE_LOG: new skips are project restrictions; changed expectations logged with reasons | ✅ |
| Production dependency audit = 0 | `npm audit --omit=dev` | ✅ |
| Dev dependency advisories | INFO-2: documented, no compatible fix | ✅ documented |

## Operations

| Requirement | Evidence | Status |
|---|---|---|
| Migrations reviewed; replay from zero | `supabase db reset` + pgTAP; RELEASE_NOTES migration list | ✅ |
| Deployment, backup, recovery, rollback instructions | RUNBOOK §2, §3, §5, §6–§9 | ✅ written / ⬜ exercised |
| Production smoke test | RUNBOOK §7.7 | ⬜ EXTERNAL |
| Real Android device test | RUNBOOK §7.7 steps 1, 5, 6 | ⬜ MANUAL |
| Owner briefing: CSV export routine, free-tier pause, shared-device guidance, "Cek waktu" | RUNBOOK §4, §5, §9 | ⬜ MANUAL |

## Open decisions for the user

| Decision | Recommendation |
|---|---|
| Hosting (IMPLEMENTATION_PLAN §7) | **Decided:** Cloudflare Pages, preview deployments disabled (RUNBOOK §7.5) |
| Dark mode (PRD §44 vs IMPLEMENTATION_PLAN §5) | **Decided:** deferred until after launch |
| Merge to `main` and add a git remote | Needed before Cloudflare Git builds; requires your approval |

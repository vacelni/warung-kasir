# Engineering State — resume here

Read this file, then `git log --oneline -20` and `git status`, before continuing any work.
Behavior is defined by the specs in `docs/*.md`; phase order by `docs/IMPLEMENTATION_PLAN.md`.
These engineering records track execution only and never override the specs.

## Current position

| Item | Value |
|---|---|
| Mission | Launch readiness: Phase 12 remediation → release preparation → launch-audit preparation |
| Branch | `main` (= `feature/warungkasir-launch-readiness`), pushed to `origin` = https://github.com/vacelni/kasir.git (private; push approved 2026-10-09) |
| Production Supabase project | ref `ojzhdnoknssbmlkejpha` ("kasir"), linked; all 8 migrations applied and verified (RUNBOOK §7.1 done) |
| Commit policy | One local commit per verified sub-step. **No push.** No hosted Supabase/Cloudflare action without explicit approval |
| Current phase | **Launched** (2026-10-10): Phase 13 done; Phase 14 remaining items are operational (owner briefing, routines, handover, portfolio copy) |
| Current sub-step | none in progress. SEC-04 final review done (PHASE_LOG): recommend enabling "require current password" on the hosted project in Phase 13. RUNBOOK §7.1, §7.2, §7.3, §7.5 (https://warungkasir.pages.dev) and §7.6 done. Next: §7.4 owner bootstrap (user, dashboard + SQL), then §7.7 smoke test |
| Local stack | Docker + local Supabase (`supabase/.temp` has no `project-ref`: not linked to any hosted project) |

## Records

| File | Purpose |
|---|---|
| `ROADMAP.md` | Remaining phases, dependencies, gates, completion conditions |
| `PHASE_LOG.md` | Phase 0–12 history with evidence labels; execution log of every sub-step with test results |
| `SECURITY_TRACKER.md` | Phase 12 findings SEC-01..09, INFO-1..6: evidence, status, tests, residual risk |
| `LAUNCH_READINESS.md` | Launch criteria with evidence; external checks still open |
| `prompts/` | The task specification used for each remaining phase |

## Implemented (verified in the current code)

Every PRD §43 Must Have and AC-01..AC-15 is implemented and has tests (coverage audit, 2026-10-09; see `PHASE_LOG.md`).

## Not yet implemented / open

- Phase 13 (production deployment) and the production/device parts of Phase 14: external, need approval or the user.

## Open product decisions

| Item | Conflict / question | Status |
|---|---|---|
| Dark mode | PRD §44 lists it as Should Have; IMPLEMENTATION_PLAN §5 says "no dark mode" | **Decided (user, 2026-10-09): deferred until after launch.** Not part of the MVP release; revisit post-launch |

## User decisions recorded (2026-10-09)

- SEC-04: no self-service password/email change UI; the Owner resets cashier passwords.
- SEC-06: flag (never reject or rewrite) sales dated > 5 min after server receipt, or with |synced_at − created_at| > 24 h.
- SEC-07: at most 200 line items per sale; product names at most 120 characters.
- INFO-1: document the shared-device residue as an accepted risk.
- INFO-3: verify the supported revocation mechanism first; test password reset, deactivation and reactivation separately; a revoked session must not regain access after reactivation; verify database, RPC and Edge Function authorization; outbox sales sync only after an authorized sign-in; claim only what tests prove.
- Should Have to build: simple receipt view, history custom date range.
- Branch name and commit policy as above.

## Release decisions (user, 2026-10-09, second session)

- Hosting: **Cloudflare Pages**. Preview deployments **disabled**; previews never connect to production.
- Dark mode: deferred until after launch.
- Merge to `main`: approved and done (fast-forward). Remote + push of `main`: approved and done. Not authorized yet: production Supabase/Cloudflare projects,
  deployment, linked database operations, hosted Auth changes, secrets.

## Handover decisions (user, 2026-10-10)

- Supabase, GitHub and Cloudflare stay on the developer's personal accounts for now (the developer
  receives platform notices and runs the monthly dump). Transfer to accounts owned by the warung later
  (Supabase supports project transfer between organizations; a Pages project is recreated).
- Production app owner login becomes `owner@bangtoyib.test` (a login-only address; no mailbox;
  recovery via the dashboard, RUNBOOK §3). All trial data (menu, categories, transactions, trial
  owner and cashier profiles) is removed; the store profile is kept. Script:
  `supabase/snippets/go-live-reset.sql` (tested locally, rolled back).
- Portfolio: a separate public copy with its own demo Supabase/Cloudflare on the developer's accounts,
  never the production data (after the warung handover).

## Post-launch features

| Feature | Status |
|---|---|
| Product options: simple menu tiles, then choices (nasi, level, bagian ayam, tambahan, catatan) (user request, 2026-10-18) | **Released 2026-10-18** (commit `1d825c0`): production dump saved outside the repo, migration `20261018000100_product_options.sql` applied with `db push` BEFORE the app, then `git push` to Cloudflare Pages; `/pilihan` is live. Remaining: RUNBOOK §7.8 steps 4-5 on the live app. Spec: PRD §22a, DATABASE D.12, UI_SPEC A.9a/A.17a, TECHNICAL_SPEC C.17, TEST_PLAN G.21. Rehearsed on existing data: menu, categories, profiles, stores, transaction items byte-identical after the migration. pgTAP 407, unit tests, lint, typecheck, build, E2E (360x800 read-only suite, options mutation + offline specs) pass. The production owner still has to create the groups and attach them to Geprek, Bakar, Bebek, etc. |
| Bluetooth receipt printing (user request, 2026-10-18) | **Released 2026-10-18** (commit `1d825c0`, same deploy as product options). Spec: PRD §44a, UI_SPEC A.14/A.15/A.7, TECHNICAL_SPEC C.16, TEST_PLAN G.20. Code: `features/printer/`. No database change, no new package; production data untouched. Unit/component tests, lint, typecheck and `npm run build` pass. **Not yet verified:** a real printer on an Android phone (TEST_PLAN G.20 manual list). Deploy needs approval |

## Known defects / debt

See `SECURITY_TRACKER.md` for security items. Other debt is listed in `ROADMAP.md` (Phase 13-prep).

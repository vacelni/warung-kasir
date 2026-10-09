# Engineering State — resume here

Read this file, then `git log --oneline -20` and `git status`, before continuing any work.
Behavior is defined by the specs in `docs/*.md`; phase order by `docs/IMPLEMENTATION_PLAN.md`.
These engineering records track execution only and never override the specs.

## Current position

| Item | Value |
|---|---|
| Mission | Launch readiness: Phase 12 remediation → release preparation → launch-audit preparation |
| Branch | `feature/warungkasir-launch-readiness` (from `a0ddd47`, Phase 11 checkpoint) |
| Commit policy | One local commit per verified sub-step. **No push.** No hosted Supabase/Cloudflare action without explicit approval |
| Current phase | Release candidate verified locally (`81dfa99`) → waiting for approval of merge/remote and Phase 13 (production deployment) |
| Current sub-step | none in progress. All RUNBOOK §6 gates passed (PHASE_LOG). Next, only with approval: merge to `main` (fast-forward), git remote, then RUNBOOK §7 step by step |
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
- Not authorized yet: merge to `main`, git remote, push, production Supabase/Cloudflare projects,
  deployment, linked database operations, hosted Auth changes, secrets.

## Known defects / debt

See `SECURITY_TRACKER.md` for security items. Other debt is listed in `ROADMAP.md` (Phase 13-prep).

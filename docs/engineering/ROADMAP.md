# Remaining Roadmap

Phases 1–11 are implemented and committed. Phase 12's read-only audit is done; its remediation is
the first remaining phase. Phase numbering follows `docs/IMPLEMENTATION_PLAN.md`; "12R" is the
remediation half of Phase 12 ("all FAIL items fixed before Phase 13").

## Gates for every sub-step

1. Focused tests for the change pass.
2. `npm run lint`, `npm run typecheck`, `npm run test` pass; `npm run test:db` when SQL changed;
   `npm run test:functions` when the Edge Function or Auth behavior changed; affected Playwright
   specs when UI/auth/headers changed.
3. Diff reviewed; `PHASE_LOG.md` and `SECURITY_TRACKER.md` updated; then one local commit.

## Phase 12R — Security remediation

Prompt: `prompts/phase-12r-security-remediation.md`. Order follows dependencies:

| Step | Item | Depends on | Priority |
|---|---|---|---|
| 12R.1 | SEC-09 test harness (CSP-violation guard, narrowed allow-lists, rejected-session assertion) | — | P0 |
| 12R.2 | SEC-01 offline logout with expired token | 12R.1 | P0 |
| 12R.3 | SEC-02 login submission before hydration | — | P0 |
| 12R.4 | SEC-03 CSP + security headers | 12R.1, 12R.3 | P0 |
| 12R.5 | SEC-08 default privileges | — | P1 |
| 12R.6 | SEC-05 RPC ownership race (+ SEC-07 RPC limits folded into the same function redefinition) | 12R.5 | P1 |
| 12R.7 | INFO-3 session lifecycle (evidence first) | 12R.5 | P1 |
| 12R.8 | INFO-4 Edge Function body limit | — | P1 |
| 12R.9 | INFO-5/6 operational safeguards | — | P1 |
| 12R.10 | SEC-04 password/email change settings | — | P2 |
| 12R.11 | SEC-06 timestamp anomaly flag | — | P2 |
| 12R.12 | SEC-07 payload limits (schema + client) | 12R.6 | P2 |
| 12R.13 | INFO-1 shared-device residue documented | 12R.2 | P2 |
| 12R.14 | INFO-2 dependency advisories | — | P2 |
| 12R.X | Exit gate: full gates, full Playwright matrix, advisors, bundle secret scan, independent review | all | — |

**Complete when:** every P0/P1 item is fixed with tests, P2 items are fixed or documented as
decided, and the exit gate passes with recorded results.

## Phase 13-prep — Release preparation (local; deployment itself needs approval)

Prompt: `prompts/phase-13-release-prep.md`.

- Should Have chosen by the user: simple receipt view; history custom date range (spec text first).
- Debt: remove unused `components/shared/PagePlaceholder.tsx`; add unit tests for
  `RouteAccess.tsx` and `features/categories/validation.ts`; E2E assertion for the header sync indicator.
- CI: evaluate running `test:functions`/Playwright in CI against a local stack; otherwise record.
- RUNBOOK completion: hosting, production setup order, hosted Auth checklist, API surface,
  preview isolation, seed exclusion, HSTS/domain, `_headers` verification, rollback, monitoring.
- `LAUNCH_READINESS.md` evidence; `RELEASE_NOTES.md`; production smoke procedure.

**Complete when:** gaps implemented and tested, the runbook lets an operator deploy and roll back
without guessing, and every deployment-dependent check is listed with its exact command.

## Phase 13 — Production deployment (requires explicit approval for every step)

Not executed autonomously. Steps and commands are in `docs/RUNBOOK.md` once 13-prep is done.

## Phase 14 — Final launch audit

Prompt: `prompts/phase-14-launch-audit.md`. PRD §53 Definition-of-Done matrix with evidence; the
real Android device test and owner briefing are manual steps for the user.

# Phase 12R — Security Remediation (task specification)

## 1. Objective and rationale

Fix every Phase 12 finding that blocks a safe launch (P0/P1) and implement the P2 items the user
decided, with tests that would have caught each defect. Rationale: SECURITY E.1–E.13 must hold
before Phase 13 (IMPLEMENTATION_PLAN §4: "all FAIL items fixed before Phase 13").

## 2. Requirements and sources

SECURITY E.1, E.5, E.9–E.13; DATABASE D.5–D.11; TECHNICAL_SPEC C.3–C.5, C.10–C.12, H.5, H.7;
TEST_PLAN G.8, G.9, G.14, G.16; `SECURITY_TRACKER.md`; user decisions in `STATE.md`.

## 3. Existing implementation to preserve

- Local-first outbox as the only write path; pending/failed sales never deleted (C.12, D5).
- Offline start with the cached identity when the server is unreachable (D5).
- `create_transaction` idempotency (`exists` for the same caller's retry), atomicity, WK001/WK002 codes.
- RLS helpers in `private`, column-level profile grant, no product hard delete.
- Edge Function authorization order (origin → JWT → active same-store owner → body).
- The existing tests; none may be removed or weakened.

## 4. Acceptance criteria

- SEC-01: after "Keluar" offline with an expired access token, no `wk-auth*` key remains; `/login`
  appears in < 5 s; reconnecting and opening `/kasir` leads to `/login`; other tabs sign out; the
  outbox keeps pending sales, which sync only after their cashier signs in again.
- SEC-02: with JavaScript disabled, submitting the login form never puts credentials in a URL;
  hydrated login still works.
- SEC-03: the built site serves a CSP without `unsafe-inline`/`unsafe-eval` plus anti-framing,
  referrer, permissions and opener headers; zero `securitypolicyviolation` events across the static
  and offline Playwright projects.
- SEC-05: a concurrent insert of the same id by another user returns WK001, by the same user `exists`.
- SEC-08: no `public` function executable by anon; authenticated only on the allow-list; default
  ACLs no longer grant anon/authenticated on new functions/sequences.
- SEC-09: CSP violations fail any E2E regardless of allow-lists; allow-lists name specific messages;
  the rejected-session test proves zero RPC calls before re-login and exactly one after.
- INFO-3: measured behavior recorded; revoked sessions cannot regain access after reactivation.
- SEC-04, SEC-06, SEC-07, INFO-1..6 per the user decisions in `STATE.md`.

## 5. Expected changes

`lib/supabase.ts`, `features/auth/{api,AuthProvider,LoginForm}.tsx?`, `tests/e2e/support/test.ts`,
mutation specs, `tests/e2e/{sync.offline,auth,headers}.spec.ts`, `scripts/{headers,build-headers}.mts`,
`app/not-found.tsx`, `public/_headers`, `package.json` build script, CI env, new migrations
(default privileges; `create_transaction` redefinition; length/item limits; session checks if
needed), pgTAP 01/03 (+ new), `tests/functions/*`, `supabase/functions/admin-cashier/handler.ts`,
`supabase/config.toml` + test, `.claude/settings.json`, `features/transactions/*` (time flag),
`features/backup/datasets.ts`, `lib/cart.ts`, product validation, specs (SECURITY, DATABASE,
TECHNICAL_SPEC, UI_SPEC, TEST_PLAN), `docs/RUNBOOK.md`.

## 6. Security, privacy and integrity constraints

Never print secrets; local stack only (verify target before resets); never weaken RLS/RPC checks;
never delete or rewrite sales; migrations are additive and fail loudly on violating data.

## 7. Verification gates

Per sub-step: focused tests, lint, typecheck, unit; `test:db` / `test:functions` / Playwright where
touched. Exit: all of them plus the full Playwright matrix, `npm audit --omit=dev` = 0,
`supabase db advisors --local`, secret scan of `out/`, independent review.

## 8. Out of scope

Any hosted Supabase or Cloudflare action; self-service password/email UI; new product features;
dependency major downgrades.

## 9. Completion evidence

`PHASE_LOG.md` entries with exact test counts per sub-step; `SECURITY_TRACKER.md` statuses with
test references; one local commit per sub-step.

## 10. Dependencies and rollback

Order in `ROADMAP.md`. Rollback: revert the sub-step's commit; local `supabase db reset` replays
migrations. Nothing is deployed, so no production rollback is involved.

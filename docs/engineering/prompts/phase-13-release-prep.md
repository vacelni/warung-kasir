# Phase 13-prep — Release Preparation (task specification)

## 1. Objective and rationale

Close the remaining documented gaps the user chose for launch and prepare everything Phase 13
(production deployment) needs, so that deployment is a sequence of approved, scripted steps with
known verification and rollback.

## 2. Requirements and sources

PRD §26, §27, §44, §53; UI_SPEC A.14, A.15, A.19; TECHNICAL_SPEC C.10, H.1–H.8; SECURITY E.4,
E.7, E.12, E.13; `docs/RUNBOOK.md`; `SECURITY_TRACKER.md` deployment-dependent checks.

## 3. Existing implementation to preserve

Static export, service worker and precache rules, generated `_headers`/CSP, all Phase 12R fixes,
history filters/presets, the transaction detail route `/riwayat/detail?id=`, the catalog cache.

## 4. Acceptance criteria

- Simple receipt view (screen only): store name, address, phone, items, total, paid, change,
  code, WIB date/time, cashier, receipt note; works offline for a device-only sale using cached
  store information; specified in UI_SPEC before implementation.
- History custom date range: from/to dates in Asia/Jakarta, inclusive end, bounded range;
  invalid ranges explained; specified in UI_SPEC before implementation.
- Unused `PagePlaceholder` removed; unit tests for `RouteAccess` and category validation; E2E
  assertion for the header sync indicator.
- RUNBOOK lets an operator create the production project, apply migrations, configure Auth,
  deploy the Edge Function with secrets, bootstrap the owner, configure Cloudflare, verify headers,
  run the smoke test, and roll back — each step with exact commands and an "approval required" mark.
- `LAUNCH_READINESS.md` and `RELEASE_NOTES.md` complete with evidence and residual risks.

## 5. Expected changes

`features/transactions/*`, `features/pos/CheckoutSuccess.tsx` (link only if needed),
`features/offline/catalogCache.ts` (store snapshot reuse), `lib/time.ts` (shared range helper if
used twice), tests, `docs/UI_SPEC.md`, `docs/RUNBOOK.md`, `docs/engineering/*`, possibly
`.github/workflows/ci.yml`.

## 6. Constraints

No new dependencies; Asia/Jakarta for all dates; no secrets in docs; production values written
as placeholders (`<project-ref>`, `<production-origin>`), never invented.

## 7. Verification gates

lint, typecheck, unit, build, `test:db`, `test:functions`, full Playwright matrix; local reset after.

## 8. Out of scope

Executing any production step; dark mode (deferred); printing; receipt sharing.

## 9. Completion evidence

`PHASE_LOG.md` entries; `LAUNCH_READINESS.md` with every item marked VERIFIED locally,
EXTERNAL (needs production), or MANUAL (needs the user/device).

## 10. Dependencies and rollback

Depends on 12R being complete. Rollback: revert the commits.

# WarungKasir — Implementation Plan

## 1. Status and Precedence

- Phase 0 (spec consolidation) is complete. Implementation starts at Phase 1.
- The specifications (`PRD.md`, `UI_SPEC.md`, `TECHNICAL_SPEC.md`, `DATABASE.md`, `SECURITY.md`, `TEST_PLAN.md`) define **behavior**. This plan defines **order, gates, and scope per phase**. If they disagree, the specifications win and the conflict must be reported before proceeding.
- Code organization: TECHNICAL_SPEC C.14. Dependency policy: TECHNICAL_SPEC C.15.

## 2. Decision Log

| ID | Decision | Recorded in |
|---|---|---|
| D1 | Cashier sees only own transactions; owner sees all in the store | PRD §8, §19 · SECURITY E.3, E.5 |
| D2 | UUID is the identity; display code `TRX-YYYYMMDD-XXXXXX` (Asia/Jakarta date, first 6 hex uppercase), not unique | PRD §29 · TECH C.8 · DATABASE D.6, D.9 |
| D3 | Server status `completed`/`cancelled`; client sync status `pending`/`syncing`/`synced`/`failed` (IndexedDB only) | PRD §28, §40 · TECH C.12 · DATABASE D.6 |
| D4 | `created_at` = client sale time, preserved on sync; `synced_at` set by server; reports use `created_at` | DATABASE D.6, D.10 · TECH C.12 |
| D5 | Offline refresh failure keeps the user in the app; server rejection/logout → login; blocking logout warning with pending count; pending never auto-deleted | PRD §28 · TECH C.12 · SECURITY E.9 · UI_SPEC A.24 |
| D6 | No product hard delete; "Hapus" = `is_active=false`; FK backstop; UI shows Edit / Nonaktifkan / Aktifkan | PRD §22–§23 · UI_SPEC A.17 · DATABASE D.5 |
| D7 | RPC accepts client `unit_price` snapshot; validates store ownership, quantity, arithmetic, payment; accepted risk | DATABASE D.9 · SECURITY E.12 |
| D8 | Two fixed roles; exactly one owner per store; cashier create/activate/deactivate/password reset only via Edge Function (name edit via RLS); owner cannot self-deactivate | PRD §8, §25 · DATABASE D.3 · SECURITY E.10 |
| D9 | Email/password; owner assigns cashier email + password; cashier reset via Edge Function; owner recovery via dashboard runbook | PRD §25 · SECURITY E.8, E.10 |
| D10 | Business timezone `Asia/Jakarta` everywhere | TECH C.13 · DATABASE D.10 |
| D11 | `transaction_items.store_id` + composite FK `(transaction_id, store_id) → transactions(id, store_id)` | DATABASE D.7 · SECURITY E.4 |
| C19 | 4 metrics (Omzet, Transaksi, Item Terjual, Rata-rata) in a 2×2 mobile grid; `Math.round`, Rp0 when no transactions | PRD §21 · UI_SPEC A.16 |
| C20 | Quick amounts Rp10.000–Rp200.000 + Uang Pas; tapping sets (not adds); manual input always possible | PRD §16 · UI_SPEC A.12 |
| C26/C27 | Backup = CSV export (store, categories, products, transactions, items, optional profiles without credentials); no restore; images/logo deferred | PRD §26–§27, §45 · DATABASE D.2, D.5 |
| C29 | No cancel UI; `cancelled` reserved; reports exclude cancelled | PRD §40 · DATABASE D.6 |
| C30 | Default branch `main` (renamed from `master` in Phase 0) | TECH H.1 |
| C31 | Local outbox is the single checkout write path from Phase 6; Phase 10 hardens | PRD §28, §52 · TECH C.9, C.12 |
| P1–P18 | Phase 0 resolutions (Lainnya contents, header, card tap target, sidebar, search by code, settings groups, overflow guard, export semantics, etc.) | Respective spec sections |

## 3. Phase Gates (every phase)

1. Work on a `feature/<phase-name>` branch.
2. Inspect relevant code and read the relevant spec sections first.
3. Before declaring a phase complete, all pass:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run test`
   - `npm run build`
   - `supabase test db` (from Phase 2)
4. Verify the phase's acceptance criteria.
5. Review against the checklist in §5.
6. No commit unless explicitly requested. No push, database push, function deploy, or site deploy without explicit approval.
7. End each phase with a READY / NOT READY verdict for the next phase.

## 4. Phases

### Phase 1 — Foundation

- **Objective:** buildable empty app with tooling and CI; no features.
- **Files:** `package.json` (scripts `dev`, `build`, `lint` = ESLint CLI, `typecheck` = `tsc --noEmit`, `test` = `vitest run`, `test:e2e`), `next.config.ts` (`output: 'export'`, `images.unoptimized`), `tsconfig.json` (strict), `eslint.config.mjs`, `postcss.config.mjs`, `app/layout.tsx`, `app/page.tsx` (client redirect to `/kasir`), `app/globals.css`, `vitest.config.ts`, `playwright.config.ts` (360×800, 390×844, 412×915), `.nvmrc` (24), `.github/workflows/ci.yml`, `.gitignore` additions (`supabase/.temp/`, `.wrangler/`).
- **Dependencies:** Phase 1 subset of TECH C.15 baseline.
- **Database:** none.
- **Order:** Node pin → Next/TS/Tailwind config → ESLint → Vitest/Playwright → CI.
- **Tests:** smoke unit test; Playwright renders `/` at 360px without horizontal overflow.
- **Acceptance:** all four npm scripts pass; `out/index.html` produced; no server-runtime features.
- **Risks:** scaffolding generators adding extras; Node version mismatch with Cloudflare.
- **Rollback:** discard the feature branch.

### Phase 2 — Authentication + Database + RLS

- **Objective:** schema, RLS, grants, login/logout, session guard, owner bootstrap.
- **Files:** `supabase/config.toml` (sign-up disabled), `supabase/migrations/*_schema.sql`, `*_rls.sql`, `supabase/tests/*.sql` (pgTAP), `supabase/seed.sql` (dev only, placeholder credentials, stores A and B), `lib/supabase.ts`, `lib/database.types.ts` (generated), `lib/permissions.ts`, `features/auth/*`, `app/(auth)/login/page.tsx`, `app/(app)/layout.tsx`, `docs/RUNBOOK.md` (owner bootstrap, owner recovery, free-tier pause/restore).
- **Dependencies:** `@supabase/supabase-js`, `supabase` (CLI, dev).
- **Database:** all six tables per DATABASE D.2–D.8, `private` helpers, policies per SECURITY E.5, grants per DATABASE D.11, `updated_at` trigger.
- **Order:** schema → helpers → denied-case tests first → policies/grants → type generation → client → auth provider → login page → guard → runbook.
- **Tests:** TEST_PLAN G.8 and G.9 (online cases).
- **Acceptance:** AC-08, AC-13, AC-14, AC-15; `supabase db reset` reproduces the schema.
- **Risks:** RLS recursion on `profiles`; policy performance; Docker on Windows.
- **Rollback:** local reset; no production yet. After production exists: fix-forward migrations only.

### Phase 3 — Design System + Application Shell

- **Objective:** tokens, minimal primitives, role-aware navigation, manifest.
- **Files:** `app/globals.css` (`@theme` tokens), `components/ui/*` (Button, Input, Sheet via native `<dialog>`, EmptyState, Skeleton — only as used), `components/layout/{AppShell,BottomNav,Sidebar}`, `app/(app)/lainnya/page.tsx`, access-denied view, `public/manifest.webmanifest`, icons.
- **Dependencies:** none (inline SVG icons).
- **Database:** none.
- **Tests:** owner sees 4 tabs, cashier 3; cashier on an owner route sees access denied (AC-07); Lainnya contents per UI_SPEC A.7; no overflow and ≥48px targets at 360/390/412.
- **Acceptance:** UI_SPEC A.7, A.23; AC-07; AC-09 (UI side).
- **Risks:** premature design system.
- **Rollback:** discard the feature branch.

### Phase 4 — Products + Categories

- **Objective:** owner CRUD for categories; create/edit/deactivate/reactivate products; cashier read access.
- **Files:** `features/products/*`, `features/categories/*`, `app/(app)/menu/`, `app/(app)/kategori/`.
- **Database:** none expected.
- **Tests:** TEST_PLAN G.5; inactive product hidden from the cashier; category deletion blocked when used.
- **Acceptance:** US-02, US-03, AC-09; UI_SPEC A.17 (Edit / Nonaktifkan / Aktifkan).
- **Risks:** generic CRUD abstraction — keep two explicit modules.

### Phase 5 — POS + Cart

- **Objective:** product grid, search, category tabs, local cart.
- **Files:** `lib/money.ts`, `lib/cart.ts` (+ tests), `features/pos/*`, `app/(app)/kasir/layout.tsx`, `kasir/page.tsx`, `kasir/pesanan/page.tsx`.
- **Database:** none.
- **Tests:** TEST_PLAN G.2, G.3; no network requests during cart operations.
- **Acceptance:** AC-01, AC-02, AC-03; UI_SPEC A.9–A.11.
- **Risks:** currency formatting inserting a space.

### Phase 6 — Checkout + Payment (local-first outbox)

- **Objective:** payment screen, `create_transaction` RPC, IndexedDB outbox as the single write path, basic sync, success screen.
- **Files:** `lib/checkout.ts` (payment validation, snapshot, display code), `lib/time.ts` (Asia/Jakarta helpers), `lib/idb.ts`, `features/offline/{outbox,sync}.ts`, `features/pos/{PaymentForm,QuickAmounts}`, `app/(app)/kasir/bayar/`, `app/(app)/kasir/selesai/`, `supabase/migrations/*_create_transaction.sql` + pgTAP.
- **Dependencies:** `idb`; `fake-indexeddb` (dev).
- **Database:** `create_transaction` RPC per DATABASE D.9.
- **Order:** pure logic + tests → RPC + pgTAP → outbox + tests → basic sync → UI.
- **Tests:** TEST_PLAN G.4, G.16, G.11 (basic); golden path up to success.
- **Acceptance:** AC-04, AC-05; UI_SPEC A.12–A.14; same flow online and offline.
- **Risks:** double tap; UUID must stay stable across retries.
- **Rollback:** discard the feature branch; local DB reset.

### Phase 7 — Transaction History

- **Objective:** list merging server and local pending transactions, filters, search by code, detail.
- **Files:** `features/transactions/*`, `app/(app)/riwayat/page.tsx`, `app/(app)/riwayat/detail/page.tsx` (`?id=`).
- **Database:** none expected.
- **Tests:** TEST_PLAN G.6, G.15 (full golden path), G.17 (history parts).
- **Acceptance:** AC-06; PRD §19–§20; cashier scope per D1.

### Phase 8 — Owner Dashboard

- **Objective:** 4-metric 2×2 grid, simple SVG sales chart, best sellers, time filter.
- **Files:** `supabase/migrations/*_reports.sql` (aggregate functions, owner only, cancelled excluded, Asia/Jakarta boundaries), `features/reports/*`, `app/(app)/laporan/`.
- **Database:** report functions.
- **Tests:** pgTAP (cashier denied, cancelled excluded, day boundaries); unit tests for ranges and average rounding; G.17.
- **Acceptance:** PRD §21; UI_SPEC A.16; US-04.
- **Risks:** timezone off-by-one; chart library creep.

### Phase 9 — Employees + Settings + Export

- **Objective:** cashier administration via Edge Function; store profile; CSV export.
- **Files:** `supabase/functions/admin-cashier/index.ts` (create, set active incl. ban, reset password), `supabase/functions/_shared/cors.ts`, `features/employees/*`, `features/settings/*`, `lib/csv.ts`, `app/(app)/{karyawan,pengaturan,backup}/`.
- **Database:** none expected.
- **Tests:** TEST_PLAN G.7, G.18; Edge Function owner check, self-deactivation blocked, compensation on partial failure.
- **Acceptance:** US-06, US-07, AC-14; PRD §25–§27; no images/logo.

### Phase 10 — Offline + Sync Hardening

- **Objective:** harden the system introduced in Phase 6.
- **Scope:** service worker (static assets + app shell, never Supabase), catalog cache in IndexedDB, sync triggers, retry/backoff, persistent outbox (`storage.persist`), network recovery, multi-tab locking, offline authentication behavior (D5), logout dialog (A.24), sync status indicator, synced-entry retention.
- **Files:** service worker source + post-build manifest step, `features/offline/*`, `public/_headers`.
- **Dependencies:** at most one service worker build tool, if justified.
- **Tests:** TEST_PLAN G.9 (offline cases), G.10, G.11; PWA installability.
- **Acceptance:** AC-10, AC-11, AC-12.
- **Risks:** stale app after deploy; storage eviction; auth expiry while offline.

### Phase 11 — Testing + Debugging

- **Objective:** close gaps across all TEST_PLAN G.1 layers; G.12–G.14; fix defects.
- **Acceptance:** zero crashes in fault injection; golden path green; full coverage of `lib/` business logic.

### Phase 12 — Security Audit

- **Objective:** verify SECURITY E.1–E.13 and the RLS matrix; Supabase Security and Performance Advisors; secret scan of history; `npm audit`; CSP/headers; service worker cache scope; sign-up disabled.
- **Output:** PASS / FAIL / WARNING report; all FAIL items fixed before Phase 13.
- **Status (2026-10-09):** audit done (read-only); remediation is "Phase 12R", tracked in `docs/engineering/` (`ROADMAP.md`, `SECURITY_TRACKER.md`, `PHASE_LOG.md`).

### Phase 13 — Production Deployment

- **Objective:** production Supabase project, migrations, Auth settings, Edge Functions + secrets, owner bootstrap (runbook), Cloudflare project on `main`, smoke test (TECH H.6).
- **Every step requires explicit approval.**
- **Rollback:** Cloudflare instant rollback; database fix-forward migrations; CSV export before each migration.

### Phase 14 — Final Launch Audit

- `/production-check` skill; PRD §53 Definition of Done; real Android Chrome device test (install, offline sale, kill app, reconnect, verify sync); owner briefing on export routine and free-tier pause.

## 5. Review Checklist (anti-overbuild)

- One code organization (TECH C.14); no parallel `services/`, `hooks/`, `types/` layers.
- No repository/service classes and no wrapper API over PostgREST; one `api.ts` per feature domain.
- No generic CRUD components or hooks.
- No global state library; Context only for Auth and Cart.
- No UI kit or design-system package; create a primitive on second use.
- Money/cart/checkout logic lives once in `lib/`; components never compute money; the RPC re-validation is a security boundary, not duplication — do not add a third copy.
- No Edge Function for anything RLS or an RPC can do.
- No libraries from the TECH C.15 "not used" list without explicit justification.
- No unrequested features (dark mode, background sync, push, printing, discount, cancel UI, images, i18n).
- No decorative gradients, glassmorphism, or animation that does not aid usability.
- No whole-page snapshot tests; test behavior.

## 6. Accepted Risks

See SECURITY E.12.

## 7. Items Decided Later (non-blocking)

| Item | Decide in |
|---|---|
| Service worker build tooling (one tool or hand-written) | Phase 10 — decided: hand-written `features/offline/sw.ts`, compiled with the project's TypeScript by `scripts/build-sw.mts` after `next build`; no new dependency |
| Retention period for synced outbox entries | Phase 10 — decided: 7 days after server confirmation (`SYNCED_RETENTION_MS`); pending/syncing/failed are never removed |
| Cloudflare Pages vs Workers static assets | Phase 13 — recommended (13-prep): Pages with Git integration, previews disabled (RUNBOOK §7.5); awaiting the user's decision |
| `docs/RUNBOOK.md` content | Phase 2 (created); release procedure §6–§9 written in 13-prep; exercised in Phase 13 |

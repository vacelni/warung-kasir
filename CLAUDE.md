# WarungKasir — Claude Code Project Rules

## Project

WarungKasir is a single-store internal POS/PWA for a small food stall.

Users:

* Owner
* Cashier

Customers do not use this application.

Primary platform:

* Android smartphone
* Chrome
* PWA

Secondary platform:

* Desktop browser

---

## Source of Truth

Always follow these documents:

@docs/PRD.md
@docs/UI_SPEC.md
@docs/TECHNICAL_SPEC.md
@docs/DATABASE.md
@docs/SECURITY.md
@docs/TEST_PLAN.md

Phase order, phase gates, and the decision log are in `docs/IMPLEMENTATION_PLAN.md` (read it when starting or reviewing a phase).

Execution state (current phase, open items, logs, security tracker) is in `docs/engineering/STATE.md`; read it first when resuming work. It tracks progress only and never overrides the specifications.

If implementation conflicts with documentation, identify the conflict before proceeding.

Do not silently invent a third behavior.

---

## Core Goal

The most important workflow is:

Select product
→ Cart
→ Checkout
→ Enter payment
→ Calculate change
→ Save transaction
→ Success

Transaction speed and correctness are the highest priorities.

---

## Stack

Use:

* Next.js
* React
* TypeScript
* Tailwind CSS
* Supabase
* PostgreSQL
* Supabase Auth
* Supabase Edge Functions when privileged operations are required
* IndexedDB
* PWA
* Git

Deployment target:

* Cloudflare

Use Next.js App Router.

Use static export where specified by the technical specification.

---

## Coding Rules

* TypeScript only.
* Avoid `any`.
* Prefer small, reusable components.
* Keep business logic separate from UI.
* Avoid unnecessary dependencies.
* Do not install packages without justification.
* Do not duplicate business logic.
* Do not create giant components.
* Preserve existing architecture unless there is a documented reason to change it.
* Code organization: TECHNICAL_SPEC C.14. Dependency policy (including packages not to add): TECHNICAL_SPEC C.15.

---

## Money Rules

Never use floating-point arithmetic for Rupiah.

Store money as integer values.

Example:

15000
40000
50000

Display:

Rp15.000
Rp40.000
Rp50.000

Formula:

subtotal = unit_price * quantity

total = sum(subtotals)

change = paid_amount - total

average transaction = Math.round(revenue / transactionCount), Rp0 when there are no transactions

All money calculations must have automated tests.

---

## Transaction Rules

Every transaction must have a unique client-generated UUID. The UUID is the real identity.

The human-readable code `TRX-YYYYMMDD-XXXXXX` (Asia/Jakarta sale date + first 6 hex chars of the UUID, uppercase) is for display/search only and is not required to be unique.

Transaction items must preserve:

* product_id
* product_name
* unit_price
* quantity
* subtotal

Historical transactions must not change when current product prices change.

Server transaction status is `completed` or `cancelled` (`cancelled` is reserved; no cancel UI in MVP). Sync status (`pending`, `syncing`, `synced`, `failed`) exists only in IndexedDB and is never stored as the server status.

`created_at` is the client sale time and is preserved on sync; `synced_at` is set by the server. Reports use `created_at`.

The only transaction write path is one atomic Postgres RPC (`create_transaction`). Never insert a transaction header and its items through separate requests. Never move transaction integrity into an Edge Function.

---

## Cart Rules

Cart operations are local.

Do not make a server request for every:

* add item
* remove item
* increase quantity
* decrease quantity

---

## Authentication

Use Supabase Auth.

Private application pages require an authenticated session.

Do not expose authentication secrets.

---

## Authorization

Only two roles exist:

* owner
* cashier

Owner:

* full access within the store

Cashier:

* cashier
* transaction history of their own transactions only

Exactly one Owner per store. Roles are fixed and cannot be changed through the client. Cashier accounts are created, activated/deactivated, and password-reset only by the Owner through a secure Edge Function (the Owner may edit a cashier's name directly, protected by RLS). The Owner cannot deactivate themselves.

Cashier cannot perform owner-only actions.

Frontend permission checks are for UX only.

Security must also be enforced with database/backend controls.

---

## Database

Use migrations for schema changes.

Do not manually modify production schema without a corresponding migration.

Every business record must be correctly associated with the store.

Use RLS for private data.

Never bypass RLS as a frontend security mechanism.

---

## Product Deletion

There is no hard delete for products in the MVP. "Hapus" means deactivate:

is_active = false

Products used in historical transactions remain in the database; foreign keys are the backstop.

---

## Offline

Offline transaction support is required.

Pending transactions must survive:

* refresh
* browser close
* network failure

Failed synchronization must never silently delete a transaction.

Sync must be idempotent.

The same transaction UUID must never create duplicate transactions.

Checkout is local-first: every sale (online or offline) is written to the IndexedDB outbox first, then synced. There is one write path.

If token refresh fails only because the device is offline, keep the user in the app with the cached identity and keep selling; sync waits for a valid session. Redirect to login only when the server rejects the session or the user logs out. Logging out with pending transactions shows a blocking warning with the pending count. Never delete pending transactions automatically.

Details: TECHNICAL_SPEC C.12.

---

## Timezone

Business timezone is `Asia/Jakarta`, used for reports, date filters, transaction codes, history grouping, and sales date boundaries. Never rely on the device timezone for business dates.

---

## UI

Mobile-first.

Primary target:
360–430px smartphone width.

Requirements:

* large touch targets
* readable typography
* no unnecessary horizontal scrolling
* clear visual hierarchy
* fast transaction flow
* no hover-dependent interaction

Use orange as primary action color.

---

## Testing

Before declaring a feature complete:

* run relevant tests
* run typecheck
* run lint
* verify acceptance criteria

Business-critical logic must have automated tests.

Do not delete or weaken tests simply to make CI/build pass.

---

## Git

Prefer small, focused commits.

Never commit:

* `.env.local`
* service role keys
* API secrets
* database passwords
* credentials

Do not create commits unless explicitly requested.

The default branch is `main`.

`git push`, `supabase db push`, `supabase functions deploy`, `supabase db reset --linked`, `supabase secrets set`, `wrangler deploy`, and `wrangler pages deploy` require explicit approval (enforced as `ask` rules in `.claude/settings.json`).

---

## Development Workflow

For every major feature:

1. Inspect relevant code.
2. Read relevant specification.
3. Plan implementation.
4. Implement.
5. Run tests.
6. Run typecheck.
7. Run lint.
8. Review changes.
9. Fix issues.
10. Verify acceptance criteria.

Do not mark work complete without verification.

---

## Do Not Overbuild

MVP does not include:

* QRIS
* payment gateway
* inventory
* supplier management
* customer ordering
* loyalty
* accounting
* multi-store
* multi-branch
* WhatsApp integration
* AI features
* native Android application
* discounts
* product images or store logo
* transaction cancellation UI
* data restore

Do not implement future features without explicit instruction.

---

## Security Principle

Never trade security for convenience.

Never put secrets in frontend code.

Never treat hidden UI controls as authorization.

Never use production data for development testing unless explicitly required.

---

## Final Principle

Prefer:

simple + reliable + tested

over:

complex + impressive + fragile

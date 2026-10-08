---
name: supabase-security
description: WarungKasir Supabase security rules and RLS guidance. Use when working on authentication, authorization, Supabase queries, migrations, RLS, grants, RPCs, profiles, stores, employee management, Edge Functions, or privileged operations.
---

# WarungKasir Supabase Security

Authoritative sources: `docs/SECURITY.md` (E.1–E.13) and `docs/DATABASE.md` (D.3, D.6–D.11). If this skill and the docs disagree, the docs win; report the conflict.

## Roles

Only `owner` and `cashier`. Exactly one owner per store (partial unique index). Roles are fixed; no client can change `role`, `store_id`, or `is_active`.

## Store Isolation

Every business record belongs to a store. A user must never access another store's data. `transaction_items` has `store_id` with the composite FK `(transaction_id, store_id) → transactions(id, store_id)`.

## Owner

May manage products, categories, employees (via Edge Function), settings, reports, export, and perform all cashier operations. Cannot deactivate themselves.

## Cashier

May use the cashier, create transactions (via RPC), and read **only their own** transactions.

May not change prices, manage products/categories/employees, export, or modify settings.

## Authentication

- Public sign-up disabled (dashboard and `supabase/config.toml`).
- Account validation after login: profile exists and `is_active = true`.
- Offline session behavior: TECHNICAL_SPEC C.12 / SECURITY E.9.

## RLS

RLS enforces actual security; never rely on route hiding.

- Helpers `private.current_store_id()` / `private.current_role()`: `SECURITY DEFINER STABLE`, `search_path = ''`, read the caller's active profile, live in a non-exposed `private` schema, `EXECUTE` revoked from `public`/`anon`. Call as `(select private.fn())` in policies.
- Never grant anything to bare `authenticated` without an active profile. Never `using (true)` on business data.
- Per-table matrix: SECURITY E.5.

## Writes and Grants

- Transactions are written only through the `create_transaction` RPC (`SECURITY DEFINER`, `search_path = ''`, `store_id`/`cashier_id` from `auth.uid()`). Direct DML on `transactions`/`transaction_items` is revoked.
- No DELETE on `products` (no hard delete in the MVP).
- `profiles`: clients may update `name` only (owner, same store).
- Write grants and revokes explicitly in migrations.

## Accepted Risk

The RPC accepts the client's `unit_price` snapshot without comparing it to the current price (offline sales). It still validates product ownership by store, quantity, arithmetic, and payment. See SECURITY E.12.

## Privileged Auth Operations (Edge Function)

Create cashier, activate/deactivate (deactivation also bans the Auth user), reset cashier password:

- run server-side in a Supabase Edge Function;
- verify the caller's JWT, then verify **in code** that the caller is the active owner of the same store;
- never create a role other than `cashier`;
- restrict CORS to the app origin;
- compensate on partial failure (delete the just-created Auth user if profile creation fails);
- never expose the secret/service-role key to the browser.

## Secrets

Never expose service-role/secret keys (`sb_secret_…`) or private credentials. They live only in Edge Function secrets.

## Testing

pgTAP via `supabase test db`, with fixtures for **store A and store B** (owner + two cashiers each). Test allowed and denied operations, including: cross-store reads, other-cashier transactions, anon, user without profile, inactive user, direct transaction DML, product DELETE, profile role/store/is_active updates, composite FK mismatch, second owner, and all `create_transaction` cases (TEST_PLAN G.8, G.16).

## Review Requirement

When changing security-sensitive code, inspect: client authorization, RLS policies, grants, RPCs, Edge Functions, data ownership, and privilege-escalation paths.

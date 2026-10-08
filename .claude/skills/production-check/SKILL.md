---
name: production-check
description: Final WarungKasir production readiness checklist. Use only when explicitly requested for release, production audit, deployment verification, or launch readiness.
disable-model-invocation: true
---

# WarungKasir Production Check

Do not deploy, push, or modify infrastructure automatically.

First inspect and report.

Verify:

## Code

- lint passes
- typecheck passes
- unit tests pass
- integration tests pass
- database tests pass (`supabase test db`)
- E2E tests pass (including the G.15 golden path)
- production build passes and produces `out/`

## Security

- RLS enabled on every business table
- RLS tests pass (store A / store B fixtures)
- owner permissions correct
- cashier permissions correct (own transactions only)
- public sign-up disabled
- direct DML on `transactions` / `transaction_items` revoked; writes only via `create_transaction`
- Edge Functions verify owner role in code
- no service-role/secret key in frontend
- no secrets in repository
- Supabase Security Advisor reviewed

## Data

- transaction integrity verified
- historical prices preserved
- duplicate transaction protection verified
- `created_at` preserved for offline sales; `synced_at` set by server
- business dates use Asia/Jakarta
- export works; CSV is protected against formula injection
- owner knows the export routine (CSV export is not a full disaster-recovery backup; the free tier has no automatic backups)

## Offline

- pending transactions survive refresh
- pending transactions survive browser restart
- synchronization works
- failed sync is recoverable and never deletes data
- duplicate sync is prevented
- service worker does not cache Supabase responses

## Mobile

Verify:

360px
390px
412px

Check:

- overflow
- text clipping
- touch targets
- keyboard
- checkout
- navigation

## Production

Verify:

- environment variables
- Supabase production configuration
- migrations applied from the repository
- runbook covers owner bootstrap, owner recovery, and free-tier project pause/restore
- PWA installable
- HTTPS
- default branch is `main`
- production smoke test (TECHNICAL_SPEC H.6)

Classify every result:

PASS
FAIL
WARNING

Never report READY when a critical or high-severity issue remains.

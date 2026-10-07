---

name: production-check
description: Final WarungKasir production readiness checklist. Use only when explicitly requested for release, production audit, deployment verification, or launch readiness.
disable-model-invocation: true
------------------------------

# WarungKasir Production Check

Do not deploy or modify infrastructure automatically.

First inspect and report.

Verify:

## Code

* lint passes
* typecheck passes
* unit tests pass
* integration tests pass
* E2E tests pass
* production build passes

## Security

* RLS enabled
* RLS tests pass
* owner permissions correct
* cashier permissions correct
* no service-role key in frontend
* no secrets in repository

## Data

* transaction integrity verified
* historical prices preserved
* duplicate transaction protection verified
* export works

## Offline

* pending transactions survive refresh
* pending transactions survive browser restart
* synchronization works
* failed sync is recoverable
* duplicate sync is prevented

## Mobile

Verify:

360px
390px
412px

Check:

* overflow
* text clipping
* touch targets
* keyboard
* checkout
* navigation

## Production

Verify:

* environment variables
* Supabase production configuration
* migrations
* PWA
* HTTPS
* production smoke test

Classify every result:

PASS
FAIL
WARNING

Never report READY when a critical or high-severity issue remains.

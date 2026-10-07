# Security Rules

Security-sensitive code must be treated as correctness-critical.

## Authentication

Use Supabase Auth.

Private application routes require authenticated sessions.

## Authorization

Only two roles exist:

* owner
* cashier

Do not invent additional roles without explicit approval.

Frontend permission checks are UX only.

They are not security controls.

## Store Isolation

Users must only access data belonging to their own store.

## Secrets

Never expose:

* service role key
* secret keys
* database passwords
* private API credentials

Never place secrets in:

* source code
* public files
* `NEXT_PUBLIC_*`
* Git
* documentation

## Sensitive Operations

Treat these as privileged:

* employee management
* price changes
* product administration
* settings changes
* data export
* privileged authentication operations

## RLS

RLS must be enabled and tested.

Test both allowed and denied operations.

## Security Changes

Do not weaken authentication, authorization, or RLS to make a feature easier to implement.

Prefer fixing the architecture instead.

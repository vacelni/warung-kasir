---

name: supabase-security
description: WarungKasir Supabase security rules and RLS guidance. Use when working on authentication, authorization, Supabase queries, migrations, RLS, profiles, stores, employee management, or privileged operations.
-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

# WarungKasir Supabase Security

## Roles

Only:

* owner
* cashier

## Store Isolation

Every business record must belong to the correct store.

A user must never access another store's data.

## Owner

Owner may:

* manage products
* manage categories
* manage employees
* manage settings
* access reports
* export data
* perform all cashier operations

## Cashier

Cashier may:

* use cashier
* create transactions
* access permitted transaction history

Cashier may not:

* change product price
* manage products
* manage categories
* manage employees
* export data
* modify owner settings

## RLS

RLS must enforce actual security.

Do not rely on frontend route hiding.

Test both:

* allowed access
* denied access

## Privileged Auth Operations

If creating or managing Auth users requires a privileged key:

* perform the operation server-side;
* use a Supabase Edge Function;
* verify the caller's authenticated identity;
* verify owner role;
* never expose the service-role key to the browser.

## Secrets

Never expose service-role or private credentials.

## Review Requirement

When changing security-sensitive code, inspect:

* client authorization
* RLS
* database policies
* Edge Functions
* data ownership
* privilege escalation risks

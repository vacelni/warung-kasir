# Database Rules

These rules apply to database schema, migrations, Supabase queries, and database-related services.

## Schema

Use Supabase PostgreSQL.

Required business tables:

* stores
* profiles
* categories
* products
* transactions
* transaction_items

Business records must be associated with the correct store.

## Migrations

Every schema change must use a migration.

Do not rely on undocumented manual dashboard changes.

Migrations must be reproducible.

## Money

Store Rupiah as integer values.

Never store formatted strings such as:

"Rp15.000"

Use:

15000

## Transactions

Transaction item records must preserve:

* product_id
* product_name
* unit_price
* quantity
* subtotal

Historical transactions must remain unchanged when product prices change.

The only write path for transactions is the atomic `create_transaction` RPC (DATABASE D.9). Direct INSERT/UPDATE/DELETE on `transactions` and `transaction_items` is revoked for clients.

`transaction_items` carries `store_id` with the composite foreign key `(transaction_id, store_id) → transactions(id, store_id)`.

`transactions.created_at` is the client sale time (preserved on sync); `synced_at` is set by the server. `status` is `completed` or `cancelled` only; sync status never goes into the database.

Business dates use `Asia/Jakarta` (DATABASE D.10).

## Integrity

Database/backend validation must not blindly trust frontend-calculated totals.

Validate:

subtotal = unit_price × quantity

total = sum(item subtotals)

change = paid_amount - total

paid_amount >= total

## Deletion

Products are never hard-deleted in the MVP (no DELETE grant/policy for clients).

Use `is_active = false`.

## Security

All exposed business tables must use appropriate Row Level Security.

Never bypass RLS as a substitute for proper authorization.

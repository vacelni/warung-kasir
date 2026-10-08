G. TEST PLAN
G.1 Test Layers

Wajib memiliki:

1. Unit Test
2. Component Test
3. Integration Test
4. E2E Test
5. Security Test
6. Offline Test
7. Responsive/Mobile Test
8. Production Smoke Test
G.2 Unit Tests — Money

Test:

15000 × 1 = 15000
15000 × 2 = 30000
15000 + 5000 = 20000
50000 - 40000 = 10000
40000 - 40000 = 0
30000 - 40000 = invalid

Average transaction (rounding):

Math.round(1250000 / 32) = 39063
0 transactions → 0 (displayed Rp0)

Formatting:

15000 → "Rp15.000" (no space between Rp and the number)
0 → "Rp0"
1250000 → "Rp1.250.000"
G.3 Unit Tests — Cart

Test:

Add item
Add same item
Increase quantity
Decrease quantity
Remove item
Empty cart
Multiple products

Expected:

subtotal correct
total correct
quantity correct

No network request is made for any cart operation.
G.4 Checkout Tests

Scenario:

Total 40000
Paid 50000

Expected:

Change 10000

Scenario:

Total 40000
Paid 30000

Expected:

Checkout denied

Quick amount:

Paid 20000, tap Rp50.000 → Paid = 50000 (set, not 70000)
Tap Uang Pas → Paid = Total, Change = 0
Manual input after a quick amount replaces the value

Transaction identity:

display code = TRX-YYYYMMDD-XXXXXX (Asia/Jakarta date of created_at, first 6 hex of UUID, uppercase)
the UUID stays the same across retries of the same checkout
double tap on Bayar creates exactly one outbox entry
G.5 Product Tests

Test:

Create product
Edit product
Change price
Deactivate product
Reactivate product

Verify:

inactive product
→ does not appear in cashier

price change
→ historical transaction_items keep their original unit_price

DELETE on products
→ denied at database level (no hard delete in MVP)

delete category used by any product (active or inactive)
→ denied
G.6 History Tests

After transaction:

create transaction
 ↓
open history
 ↓
transaction exists
 ↓
open detail
 ↓
all amounts correct

Scope:

Cashier sees only own transactions
Owner sees all store transactions
locally pending transaction is visible with a sync badge
search by transaction code works
date filter uses Asia/Jakarta
G.7 Permission Tests

Cashier must NOT:

open reports
edit products
change price
manage employees
export data
open settings
call the admin-cashier Edge Function (expect 403)

Owner must:

access all owner features

Owner must NOT:

deactivate own account
change any role
G.8 RLS Tests

Test at database level (fixtures: store A and store B, each with an owner and two cashiers):

Owner store A
→ can read store A

Owner store A
→ cannot read store B

Cashier store A
→ cannot read store B

Cashier
→ cannot update product price

Cashier A1
→ cannot read transactions of cashier A2

anon
→ cannot read any business table

authenticated user without a profile
→ cannot read anything

inactive user
→ cannot read anything

direct INSERT/UPDATE/DELETE on transactions or transaction_items
→ denied (owner and cashier)

DELETE on products
→ denied

profile update of role, store_id, or is_active by any client
→ denied

transaction_items row whose store_id differs from its transaction
→ rejected by the composite foreign key

second owner in the same store
→ rejected by the unique constraint

Supabase documentation specifically recommends database tests that assert allowed and denied operations for RLS policies.

G.9 Authentication Tests

Test:

Valid login
Invalid email
Invalid password
Empty fields
Logout
Expired session
Refresh browser
Close/reopen browser
Inactive account login

Expected:

session rejected by the server
→ redirect login

Offline session:

offline + access token cannot be refreshed
→ user stays in the app and can create transactions

connection restored + refresh rejected by the server
→ redirect login, pending transactions still on the device

logout with pending transactions
→ blocking dialog shows the pending count; nothing is deleted
G.10 Offline Tests

Mandatory test:

1. Login while online
2. Load products
3. Disconnect internet
4. Open cashier
5. Create transaction
6. Close browser
7. Reopen app
8. Verify pending transaction
9. Restore internet
10. Sync
11. Verify transaction in database

Also verify:

created_at in the database equals the sale time, not the sync time
synced_at is set by the server
display code date uses Asia/Jakarta
G.11 Offline Duplicate Test
Create transaction
 ↓
Sync starts
 ↓
Network interrupted
 ↓
Retry

Expected:

exactly 1 transaction

not:

2 transactions
G.12 Mobile Tests

Test at minimum:

360×800
390×844
412×915

Check:

buttons;
text;
bottom navigation;
cart;
keyboard;
payment input;
scrolling;
dashboard 2×2 metric grid.
G.13 Browser Tests

Minimum:

Chrome Android
Chrome Desktop
Edge Desktop

Safari is not primary target for MVP but should not break basic layout.

G.14 Error Tests

Simulate:

Network timeout
Database error
Auth error
Invalid data
Sync failure
Empty database

Application must not crash.

G.15 E2E Golden Path

The most important E2E scenario:

Login
 ↓
Open Kasir
 ↓
Add Nasi Goreng ×2
 ↓
Add Es Teh ×2
 ↓
Checkout
 ↓
Enter 50000
 ↓
Verify change 10000
 ↓
Bayar
 ↓
Verify success
 ↓
Open history
 ↓
Open transaction
 ↓
Verify all values

This is the "golden path" and must always pass.

G.16 RPC Tests — create_transaction

Test at database level:

valid sale → 'created'; header and items stored atomically
same id submitted again → 'exists'; exactly 1 transaction, unchanged
underpayment (paid_amount < total) → rejected
arithmetic mismatch (subtotal, total, or change) → rejected
empty items → rejected
product from another store → rejected
inactive product of the same store → accepted
unit_price different from the current product price → accepted (accepted risk, SECURITY E.12)
code inconsistent with id or created_at → rejected
value beyond the integer limit → rejected
inactive caller → rejected
store_id / cashier_id taken from the caller, never from the payload
created_at preserved as sent; synced_at set by the server
validation failures return a distinguishable error (client marks failed, not pending)

G.17 Timezone Tests

sale at 23:30 WIB → counted on that WIB date
sale at 00:30 WIB → counted on that WIB date (not the previous UTC date)
device timezone set to UTC (Playwright timezoneId) → reports, filters, and codes still use Asia/Jakarta

G.18 Export Tests

CSV escaping of commas, quotes, and newlines
cells starting with =, +, -, @ are neutralized (formula injection)
profile export contains no credentials or secrets
exported files: store, categories, products, transactions, transaction_items (+ profiles, optional)
cashier cannot access the export screen

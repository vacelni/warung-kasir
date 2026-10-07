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
G.7 Permission Tests

Cashier must NOT:

open reports
edit products
change price
manage employees
export data
open settings

Owner must:

access all owner features
G.8 RLS Tests

Test at database level:

Owner store A
→ can read store A

Owner store A
→ cannot read store B

Cashier store A
→ cannot read store B

Cashier
→ cannot update product price

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

Expected:

invalid session
→ redirect login
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
scrolling.
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

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
same id from another cashier or another store → rejected (WK001); the existing transaction is unchanged
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

G.19 Security Headers and CSP Tests (Phase 12)

Unit (scripts/headers.test.ts): inline-script hashes, Supabase origin parsing, policy contents (no 'unsafe-inline'/'unsafe-eval'), inline style/handler refusal, Cloudflare line limit.

E2E on the production build (tests/e2e/headers.spec.ts, static projects): every page, the 404 page, /sw.js, and the manifest carry one CSP plus X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Cross-Origin-Opener-Policy, Permissions-Policy; every inline script served is allowed by its hash.

Every E2E test fails on any securitypolicyviolation event or CSP console message, whatever its console allow-list (tests/e2e/support/test.ts; proven by tests/e2e/guard.spec.ts).

Login before hydration (tests/e2e/auth.spec.ts, JavaScript disabled): submitting the form sends nothing and puts no credential in any URL.

Logout offline with an expired access token (tests/e2e/sync.offline.spec.ts): the session is removed from the device within 5 s; the next visit reaches login; pending sales stay and sync only after their cashier logs in again.

G.20 Receipt Printing Tests (Bluetooth printer)

Unit (features/printer/escpos.test.ts): ESC @ first; store header, code, WIB date and time (including a sale whose UTC date differs from the WIB date), cashier, items, Total, Bayar, Kembalian, receipt note; header and note omitted when empty; every line at most 32 characters (58 mm) or 48 (80 mm); only printable ASCII and commands (accents removed, emoji and other characters become "?").

Transport (features/printer/bluetooth.test.ts, fake Web Bluetooth): chooser opens with the printer services allowed; closing the chooser is a cancel and shows no error; remembered printer reused without the chooser; chunked writes arrive complete and in order (100 bytes with response, 20 bytes with a pause without); reconnect after sleep; no writable characteristic, connection failure, and write failure give distinct messages; browser without Web Bluetooth gets a clear message.

Component (PrintReceiptButton.test.tsx, PrinterPanel.test.tsx): a second tap while printing prints once; failure shows the reason and a retry works; paper width and the paired printer persist on the device and "Lupakan printer" keeps the width; corrupted or blocked localStorage falls back to the defaults.

Manual, on a real Android phone with the actual printer (cannot be proven by automated tests; record the model and result in PHASE_LOG):

1. Lainnya → Hubungkan printer → choose the printer → Cetak tes prints on the right paper width.
2. Complete a sale → CETAK STRUK on the success screen prints the receipt.
3. Riwayat → open a transaction → CETAK STRUK reprints it.
4. Printer off or out of range → clear message; the sale and its sync are unaffected.
5. Offline sale → printing still works.
6. Close and reopen the app → printing works again (the chooser may open once if Chrome forgot the printer).

G.21 Product Options Tests (DATABASE D.12)

Database (supabase/tests/07_product_options.test.sql, pgTAP): anon tidak membaca; Cashier membaca hanya store sendiri dan tidak dapat membuat, mengubah, atau menghapus grup/pilihan; Owner mengelola; harga tambahan negatif, nama ganda, dan rujukan lintas store (pilihan ke grup store lain, menu ke grup store lain) ditolak; create_transaction menerima options dan note, menyimpannya apa adanya, menerima item tanpa options (perangkat lama), dan menolak (WK001) options bukan array, nama kosong atau lebih dari 60 karakter, price hilang/negatif/pecahan, jumlah price >= unit_price, lebih dari 20 pilihan, note lebih dari 120 karakter atau bukan teks; pengiriman ulang tetap 'exists'; Owner pun tidak dapat mengubah options baris yang sudah terjual.

Migrasi di atas data yang ada (latihan produksi): database pada skema sebelum fitur + seed, lalu migration baru; sidik jari data menu, kategori, profil, store, dan item transaksi identik sebelum dan sesudah; semua item lama berisi options = [] dan note null.

Unit: lib/cart (lineId, harga = menu + pilihan, gabung/pisah baris, urutan pilihan tidak berpengaruh, catatan, jumlah, batas 200 baris), lib/options (default, toggle, wajib, habis, urutan, ringkasan), lib/checkout (snapshot options/note), sync (payload membawa options/note; entri lama dikirim sebagai [] dan null), katalog offline (grup tersimpan; snapshot lama dibaca tanpa grup), fetchCatalog (grup terpasang, pilihan habis disembunyikan, gagal baca pilihan = gagal seluruhnya), model/riwayat/api (baca options dan note, entri lama), escpos (pilihan dan catatan tercetak, pemisah koma, lebar baris), export CSV (kolom options dan note, dataset pilihan).

Komponen: alur kasir (menu berpilihan membuka sheet, menu biasa tidak; TAMBAH nonaktif sampai wajib terisi dan menyebut yang kurang; harga bertambah; default; opsional dapat dikosongkan; gabung/pisah baris; catatan; jumlah; sheet baru setiap dibuka; tanpa request jaringan), layar Owner (grup, pilihan, habis, default, ubah, hapus dengan konfirmasi, validasi, error), form menu (grup terpasang sesuai urutan centang, tidak dipanggil jika tidak berubah, gagal sebagian dilaporkan).

E2E (tests/e2e/options.mutation.spec.ts, serial): Owner membuat grup dan pilihan bertarif dan memasangnya pada menu baru; kasir menjual (harga, pilihan, catatan, sinkron), payload RPC dan baris database memuat pilihan; riwayat dan struk menampilkannya; setelah pilihan diubah, transaksi lama tetap; CSV memuatnya; tata letak 360px sheet, pesanan, dan sheet grup bebas overflow. tests/e2e/options.offline.spec.ts: menu berpilihan dijual offline dari salinan perangkat, bertahan di outbox, tampil di riwayat offline, sinkron satu kali dengan pilihan utuh.

Manual: di HP Android sungguhan, jual Geprek dengan beberapa kombinasi, cetak struk, periksa keterbacaan pilihan pada struk.

D. DATABASE SPECIFICATION

Dokumen ini adalah definisi otoritatif untuk tabel, kolom, constraint, index, dan kontrak RPC. Dokumen lain (PRD, SECURITY) merujuk ke sini.

D.1 Tables

Gunakan:

stores
profiles
categories
products
transactions
transaction_items
D.2 stores
id uuid primary key
name text not null
address text
phone text
receipt_note text
created_at timestamptz
updated_at timestamptz

MVP hanya memiliki satu store.

Namun seluruh tabel tetap memiliki store_id.

Logo warung ditunda (post-MVP). Kolom logo_url ditambahkan melalui migration saat fitur tersebut disetujui.

D.3 profiles
id uuid primary key references auth.users(id)
store_id uuid not null references stores(id)
name text not null
role text not null
is_active boolean not null default true
created_at timestamptz
updated_at timestamptz

Constraint role:

owner
cashier

Tepat satu Owner per store:

unique (store_id) where role = 'owner'

Client tidak dapat mengubah role, store_id, atau is_active. Profil Cashier dibuat dan diaktifkan/dinonaktifkan hanya melalui Edge Function (SECURITY E.10–E.11). Client hanya boleh mengubah kolom name (column-level grant), dan RLS membatasinya ke Owner dari store yang sama.
D.4 categories
id uuid primary key
store_id uuid not null
name text not null
created_at timestamptz
updated_at timestamptz

Unique:

(store_id, name)

Kategori hanya dapat dihapus jika tidak ada produk (aktif maupun tidak aktif) yang memakainya. Ditegakkan oleh foreign key products.category_id → categories(id) ON DELETE RESTRICT.
D.5 products
id uuid primary key
store_id uuid not null
category_id uuid not null references categories(id) on delete restrict
name text not null
price integer not null
is_active boolean not null default true
created_at timestamptz
updated_at timestamptz

Constraint:

price > 0
char_length(name) <= 120   (SEC-07)

category_id harus merujuk kategori dari store yang sama (ditegakkan oleh RLS WITH CHECK pada insert/update).

Tidak ada hard delete produk pada MVP: tidak ada DELETE grant/policy untuk client. "Menghapus" produk = is_active = false.

Gambar produk ditunda (post-MVP). Kolom image_url ditambahkan melalui migration saat fitur tersebut disetujui.
D.6 transactions
id uuid primary key            -- UUID dari client, identitas sebenarnya
store_id uuid not null references stores(id)
cashier_id uuid not null references profiles(id)
code text not null             -- kode tampilan TRX-YYYYMMDD-XXXXXX, tidak unik
total integer not null
paid_amount integer not null
change_amount integer not null
status text not null default 'completed'
created_at timestamptz not null   -- waktu penjualan dari client; dipertahankan saat sinkronisasi
synced_at timestamptz not null default now()   -- waktu diterima server

Status (status bisnis server):

completed
cancelled

Semua transaksi yang dibuat pada MVP berstatus completed. cancelled dicadangkan untuk fitur pembatalan terkontrol di masa depan; tidak ada jalur client untuk mengubah status pada MVP. Laporan tidak menghitung transaksi cancelled.

Status sinkronisasi (pending/syncing/synced/failed) hanya ada di IndexedDB dan tidak disimpan di tabel ini.

Constraint:

status in ('completed', 'cancelled')
total > 0
paid_amount >= total
change_amount = paid_amount - total
unique (id, store_id)          -- target composite FK dari transaction_items

MVP tidak menggunakan refund kompleks.

D.7 transaction_items
id uuid primary key
transaction_id uuid not null
store_id uuid not null
product_id uuid not null references products(id) on delete restrict
product_name text not null
unit_price integer not null
quantity integer not null
subtotal integer not null

Foreign key komposit:

(transaction_id, store_id) references transactions(id, store_id)

Item dan transaksinya tidak dapat berada di store yang berbeda.

Constraint:

quantity > 0
unit_price > 0
subtotal > 0
subtotal::bigint = unit_price::bigint * quantity
char_length(product_name) <= 120   (SEC-07)

Product name dan unit price adalah snapshot pada saat penjualan.

D.8 Indexes

Minimum:

transactions(store_id, created_at)
transactions(cashier_id, created_at)
transactions(store_id, code)
transaction_items(transaction_id)
products(store_id, is_active)
categories(store_id)
profiles(store_id, role)
D.9 Database Calculation Integrity

Frontend calculates totals for UX.

Database/backend must still validate:

subtotal = unit_price × quantity
total = SUM(items.subtotal)
change = paid_amount - total
paid_amount >= total

Frontend calculation tidak boleh dianggap sebagai security boundary.

Kontrak RPC create_transaction (satu-satunya jalur penulisan transaksi):

create_transaction(id, code, created_at, total, paid_amount, change_amount, items[])
  → 'created' | 'exists'

Sifat:

SECURITY DEFINER dengan search_path = '';
EXECUTE hanya untuk role authenticated;
header dan seluruh item ditulis dalam satu transaksi database (atomik).

Validasi:

caller = auth.uid(); profil harus ada dan is_active = true;
store_id dan cashier_id diambil dari profil caller, tidak pernah dari payload;
jika id sudah ada dengan store_id dan cashier_id yang sama dengan caller → kembalikan 'exists' tanpa perubahan apa pun;
jika id sudah ada milik cashier atau store lain → tolak (kode validasi, mis. WK001) tanpa perubahan apa pun, agar transaksi orang lain tidak pernah dilaporkan sebagai tersinkron di perangkat caller;
items tidak boleh kosong dan paling banyak 200 item per transaksi (SEC-07);
product_name wajib diisi dan paling banyak 120 karakter (SEC-07);
setiap product_id harus milik store caller (produk aktif maupun tidak aktif diterima);
quantity ≥ 1, unit_price ≥ 1, subtotal = unit_price × quantity;
total = SUM(subtotal), paid_amount >= total, change_amount = paid_amount - total;
nilai total/paid_amount/change_amount dari client harus sama dengan hasil hitung server; jika berbeda → tolak;
code harus berformat TRX-YYYYMMDD-XXXXXX, dengan XXXXXX = 6 karakter heksadesimal pertama id (huruf besar) dan YYYYMMDD = tanggal created_at dalam Asia/Jakarta;
perhitungan dilakukan dalam bigint; nilai yang melebihi batas integer PostgreSQL (2.147.483.647) → tolak.

unit_price TIDAK dibandingkan dengan harga produk saat ini. Penjualan offline yang sah dapat menggunakan harga cache. Ini adalah accepted risk (SECURITY E.12).

Penulisan menggunakan INSERT … ON CONFLICT (id) DO NOTHING; jika konflik terjadi karena race, baris yang sudah di-commit dibaca ulang: kembalikan 'exists' hanya jika store_id dan cashier_id-nya sama dengan caller, selain itu tolak dengan WK001 seperti pengecekan awal (SEC-05). Diuji dengan dua sesi database yang benar-benar bersamaan (tests/functions/create-transaction-race.test.ts).

Penolakan validasi menggunakan kode error yang dapat dibedakan sehingga client dapat menandai transaksi sebagai failed (permanen) dan bukan pending (sementara).

D.10 Timezone & Dates

Semua timestamp disimpan sebagai timestamptz.

Batas hari bisnis menggunakan Asia/Jakarta (mis. (created_at at time zone 'Asia/Jakarta')::date) untuk laporan, filter tanggal, dan pengelompokan riwayat.

Laporan dan perhitungan penjualan menggunakan created_at (waktu penjualan), bukan synced_at.

D.11 Grants

Ditulis eksplisit di migration (tidak mengandalkan default):

anon: tidak ada akses ke tabel bisnis;
transactions, transaction_items: REVOKE INSERT, UPDATE, DELETE dari anon dan authenticated (penulisan hanya via create_transaction);
products: tidak ada DELETE untuk client;
profiles: client hanya UPDATE (name);
helper function RLS berada di schema private yang tidak diekspos API, EXECUTE dicabut dari public/anon;
default privileges (SEC-08): function dan sequence baru yang dibuat migration (role postgres) tidak mendapat hak apa pun untuk PUBLIC, anon, atau authenticated; setiap function yang boleh dipanggil client harus di-GRANT secara eksplisit. Daftar yang diizinkan untuk authenticated di schema public: create_transaction, sales_summary, sales_series, top_products (diuji pgTAP).

Kebijakan RLS per tabel: SECURITY E.5.

C. TECHNICAL SPECIFICATION
C.1 Architecture

Gunakan:

Next.js
React
TypeScript
Tailwind CSS
Supabase
IndexedDB
PWA
Cloudflare
GitHub

Arsitektur:

Android Browser / PWA
          │
          ▼
   Next.js Static App
          │
          ├───────────────┐
          ▼               ▼
   IndexedDB          Supabase
    Offline            Auth
     Data              Postgres
          │               │
          └────── Sync ───┘
C.2 Rendering Strategy

Gunakan Next.js App Router dengan static export.

Target:

output: 'export'

Aplikasi tidak boleh bergantung pada server-side rendering untuk core functionality.

Alasan:

deployment sederhana;
hosting murah/gratis;
tidak membutuhkan dedicated server;
cocok untuk SPA/PWA;
sebagian besar logic adalah client-side.

Cloudflare saat ini menyediakan deployment resmi untuk Next.js static export dengan output out.

C.3 Important Static Export Rule

Jangan menggunakan:

Server Actions;
Route Handlers sebagai backend utama;
server-only database credentials;
middleware yang diperlukan untuk business logic;
service_role / secret key di browser;
dynamic route segment untuk ID yang dibuat saat runtime (mis. app/riwayat/[id]).

Detail transaksi menggunakan query parameter:

/riwayat/detail?id=<uuid>

(useSearchParams di dalam Suspense boundary).

Gunakan images.unoptimized (atau elemen img biasa) karena image optimization Next.js tidak tersedia pada static export.

Lint dijalankan melalui ESLint CLI (npm run lint), karena next build tidak menjalankan lint.

Authentication dilakukan menggunakan Supabase browser client.

Auth guard berjalan di client (layout aplikasi). Halaman statis tidak memuat data privat; seluruh data privat dilindungi RLS.

Privileged operations menggunakan Supabase Edge Functions (lihat C.5). Integritas transaksi menggunakan Postgres RPC (lihat C.11).

C.4 Supabase

Gunakan:

Supabase Auth
Supabase PostgreSQL
Supabase Edge Functions

Client frontend: @supabase/supabase-js saja (session disimpan oleh Supabase Auth di browser). Tidak menggunakan @supabase/ssr.

Database accessed from frontend hanya menggunakan publishable key (sb_publishable_…).

Supabase menjelaskan bahwa frontend dapat menggunakan publishable key ketika RLS dikonfigurasi dengan benar; service/secret key (sb_secret_… / service_role) tidak boleh dikirim ke browser karena bypass RLS.

Public sign-up harus dinonaktifkan (Auth settings dan supabase/config.toml). Akun hanya dibuat oleh Owner melalui Edge Function, atau saat bootstrap Owner melalui runbook.

C.5 Privileged Backend Operation

Edge Function hanya digunakan untuk operasi yang membutuhkan privileged Auth API:

Create cashier account
Activate / deactivate cashier account (termasuk ban/unban Auth user)
Reset cashier password

Contoh:

admin-cashier

Flow:

Owner browser
 ↓
Supabase session
 ↓
Edge Function
 ↓
Verify JWT/session
 ↓
Verify caller is active owner of the same store (query profiles)
 ↓
Use server-side secret
 ↓
Create/update auth user
 ↓
Create/update profile
 ↓
If profile step fails: compensate (delete the just-created auth user)

Platform verify_jwt hanya membuktikan session valid; pengecekan role Owner wajib dilakukan di dalam kode function.

Owner tidak dapat menonaktifkan akunnya sendiri. Function tidak pernah membuat role selain cashier.

CORS Edge Function dibatasi ke origin aplikasi.

Edge Function TIDAK digunakan untuk integritas transaksi, laporan, atau CRUD produk/kategori.

Secret tidak pernah masuk frontend.

C.6 State Management

Tidak menggunakan library state management global (lihat C.15).

Untuk MVP gunakan:

React state;
Context jika diperlukan (Auth, Cart);
custom hooks;
IndexedDB.

Pisahkan:

UI State
Cart State
Auth State
Persistent Local State
Server Data
C.7 Currency

Gunakan integer Rupiah.

Contoh:

type Money = number

Nilai:

15000
40000
50000

Formatting hanya saat render:

Rp15.000
Rp40.000
Rp50.000

Format tanpa spasi antara "Rp" dan angka (jangan gunakan Intl currency style yang menyisipkan spasi).

Jangan menyimpan:

"Rp15.000"

sebagai nilai database.

Satu-satunya pembagian adalah Rata-rata Transaksi: Math.round(omzet / jumlahTransaksi); hasil Rp0 jika jumlah transaksi 0.

C.8 Transaction ID

Client membuat UUID (crypto.randomUUID) sebelum transaksi disimpan.

UUID menjadi id transaksi (primary key) dan identitas yang sebenarnya.

Tujuan:

offline support;
retry;
idempotency;
duplicate prevention.

Kode tampilan (untuk referensi/pencarian manusia):

TRX-YYYYMMDD-XXXXXX

YYYYMMDD = tanggal penjualan (created_at) dalam Asia/Jakarta;
XXXXXX = 6 karakter heksadesimal pertama UUID, huruf besar.

Contoh:

id   = 3f9a2c4e-…
code = TRX-20261007-3F9A2C

Kode tampilan dibuat di client, disimpan di kolom code, dan TIDAK wajib unik. UUID tetap identitas yang sebenarnya.

UUID dibuat sekali per checkout (saat halaman pembayaran dibuka) dan tidak berubah selama retry.

C.9 No Server Request Per Cart Action

Cart:

Add
+
-
Delete

harus berjalan lokal.

Request database baru terjadi saat:

sinkronisasi transaksi (lihat C.11, C.12)

atau ketika perlu refresh master data.

Checkout selalu menyimpan transaksi ke local outbox (IndexedDB) terlebih dahulu, lalu sinkronisasi mengirimnya ke server. Online dan offline menggunakan alur yang sama; tidak ada jalur penyimpanan kedua.

C.10 Caching

Service worker hanya meng-cache:

static assets (/_next/static/*, icons, manifest);
application shell (seluruh HTML route hasil export).

Service worker TIDAK PERNAH meng-cache request ke Supabase (*.supabase.co).

Snapshot master data untuk offline (menu, kategori, store information) disimpan secara eksplisit oleh aplikasi di IndexedDB (catalog), bukan melalui HTTP cache service worker. Catalog dihapus saat logout.

Outbox transaksi tidak pernah dihapus otomatis (termasuk saat logout).

Jangan cache sembarangan:

authenticated API response melalui service worker;
password;
session token sebagai custom cache;
sensitive data.

Session tetap dikelola Supabase Auth.

C.11 Transaction Write Path

Satu-satunya jalur penulisan transaksi adalah satu Postgres RPC atomik:

create_transaction(payload)

Client TIDAK BOLEH meng-insert header transaksi dan transaction_items melalui request terpisah.

Akses INSERT/UPDATE/DELETE langsung ke transactions dan transaction_items dicabut untuk role client.

Integritas transaksi tidak dipindahkan ke Edge Function.

Kontrak RPC (validasi, idempotency, hasil created/exists) didefinisikan di DATABASE D.9.

C.12 Offline & Sync

Status sinkronisasi (hanya di IndexedDB, bukan status transaksi server):

pending
syncing
synced
failed

Record outbox menyimpan:

id (uuid), code, store_id, cashier_id, created_at (waktu penjualan), items (product_id, product_name, unit_price, quantity, subtotal), total, paid_amount, change_amount, sync_status, attempts, last_error, last_attempt_at.

Sinkronisasi dipicu saat:

aplikasi dibuka;
session tersedia/berhasil diperbarui;
event online;
tab kembali visible;
setelah checkout;
user menekan Coba Lagi.

Tidak ada polling agresif. Retry menggunakan exponential backoff (maksimum ±5 menit) selama aplikasi terbuka. Jangan hanya mengandalkan navigator.onLine.

Idempotency:

RPC menggunakan ON CONFLICT (id) DO NOTHING dan mengembalikan created atau exists. Keduanya berarti tersinkron (synced). Retry setelah response hilang aman.

Klasifikasi error:

sementara (network, timeout, 5xx, session belum dapat diperbarui) → tetap pending, retry dengan backoff;
permanen (validasi RPC ditolak, akun tidak aktif) → failed, tetap disimpan, tampil di UI dengan aksi Coba Lagi.

Transaksi pending/syncing/failed tidak pernah dihapus otomatis. Entri synced boleh dipangkas setelah konfirmasi server; periode retensi ditetapkan pada Phase 10.

Session saat offline:

jika token tidak dapat diperbarui karena jaringan tidak tersedia, user tetap di aplikasi dengan identitas tersimpan dan tetap dapat membuat transaksi;
sinkronisasi menunggu sampai session valid berhasil diperbarui;
jika server menolak session secara eksplisit, atau user logout, arahkan ke login; outbox tetap tersimpan.

Kepemilikan outbox:

setiap entri menyimpan cashier_id;
sinkronisasi hanya mengirim entri milik user yang sedang login;
logout dengan entri pending/failed menampilkan dialog blokir (UI_SPEC A.24).

Lain-lain:

Web Locks API (navigator.locks) mencegah sinkronisasi paralel antar tab;
minta navigator.storage.persist() untuk mengurangi risiko eviction;
service worker baru aktif pada peluncuran berikutnya, tidak di tengah transaksi.

C.13 Timezone

Zona waktu bisnis: Asia/Jakarta (konstanta).

Digunakan secara konsisten untuk:

laporan hari ini;
filter tanggal;
kode tampilan transaksi;
pengelompokan riwayat per hari;
batas hari penjualan.

Jangan bergantung pada zona waktu perangkat untuk perhitungan bisnis. Timestamp disimpan sebagai timestamptz.

C.14 Code Organization

app/                    route saja (tipis)
  (auth)/login/
  (app)/                layout = auth guard + shell
  (app)/kasir/          cart provider; sub-route pesanan/, bayar/, selesai/
  (app)/riwayat/        page + detail/ (?id=)
  (app)/laporan, menu, kategori, karyawan, pengaturan, backup, lainnya
components/ui/          primitive UI bersama (dibuat saat dipakai ≥2 kali)
components/layout/      AppShell, BottomNav, Sidebar
features/<domain>/      komponen, hooks, dan api.ts khusus domain
lib/                    flat, logic bisnis/utility bersama:
                        money.ts, cart.ts, checkout.ts, time.ts, csv.ts,
                        permissions.ts, supabase.ts, idb.ts, database.types.ts
supabase/               config.toml, migrations/, functions/, tests/ (pgTAP), seed.sql
tests/e2e/              Playwright; unit test berada di samping source (*.test.ts)

Aturan:

tidak ada generic CRUD framework;
tidak ada repository/service abstraction layer kecuali ada kebutuhan nyata;
tidak ada folder paralel services/, hooks/, types/ global.

C.15 Dependency Policy

Package hanya ditambahkan jika ada kebutuhan teknis yang konkret dan dijelaskan.

Baseline runtime:

next, react, react-dom, @supabase/supabase-js, idb

Baseline dev:

typescript, tailwindcss (+ postcss plugin), eslint (+ eslint-config-next), vitest, @testing-library/react, jsdom, fake-indexeddb, @playwright/test, supabase (CLI)

Satu tool build service worker dapat ditambahkan pada Phase 10 jika dibutuhkan.

Tidak digunakan tanpa justifikasi eksplisit:

Redux / Zustand;
TanStack Query;
Zod;
react-hook-form;
date-fns / dayjs (gunakan Intl dengan timeZone);
package uuid (gunakan crypto.randomUUID);
chart library (gunakan SVG sederhana);
UI component library;
next-pwa;
@supabase/ssr.

# H. DEPLOYMENT SPECIFICATION

## H.1 Source Control

GitHub repository:

```text
warung-kasir
```

Branches:

```text
main
develop
feature/*
```

For a solo MVP, at minimum:

```text
main
feature/*
```

The default branch is `main`. The local branch was renamed from `master` to `main` before any GitHub remote is added.

`git push` and any deploy command require explicit approval (see SECURITY E.13).

---

# H.2 Environment

Local:

```text
.env.local
```

Repository:

```text
.env.example
```

`.env.local` must never be committed.

---

# H.3 Required Environment Variables

Frontend:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Server-side Edge Function secrets are managed separately.

Never expose:

```text
SERVICE_ROLE_KEY
SECRET_KEY
DATABASE_PASSWORD
```

---

# H.4 Build

Node.js: 24 LTS (pinned via `.nvmrc` and `package.json` engines; same version on Cloudflare).

Expected:

```text
npm run lint
npm run typecheck
npm run test
npm run build
```

Database tests (from Phase 2):

```text
supabase test db
```

All must pass before production.

---

# H.5 Production Build

Static output:

```text
out/
```

Deploy output to Cloudflare.

Cloudflare's current Next.js static export guide uses:

```text
Build command:
npx next build

Build directory:
out
```

and provides automatic Git-based deployments/preview deployments.

WarungKasir adds a post-build step (Phase 10) that writes `out/sw.js` with the precache list of the exported files, so the build command must be `npm run build` (`next build && node scripts/build-sw.mts`), not `npx next build`; otherwise the deployed app has no service worker and does not open offline.

---

# H.6 Production Smoke Test

After deployment:

```text
Open URL
 ↓
Login
 ↓
Open cashier
 ↓
Add product
 ↓
Checkout
 ↓
Verify transaction
 ↓
Open history
 ↓
Verify dashboard
```

---

# H.7 Production Security Check

Before launch:

```text
✓ No secrets in GitHub
✓ RLS enabled
✓ RLS policies tested
✓ Cashier access restricted
✓ Owner access works
✓ Service role not exposed
✓ Public sign-up disabled
✓ Direct DML on transactions/transaction_items revoked
✓ Service worker does not cache Supabase responses
✓ Supabase Security Advisor reviewed
✓ Production environment variables configured
✓ Debug logs disabled
```

Supabase menyediakan production checklist dan Security Advisor untuk pemeriksaan keamanan database sebelum masuk production.

---

# H.8 Free-Tier Monitoring

Monitor:

```text
Supabase
- database size
- storage
- egress
- MAU
- Edge Function invocation

Cloudflare
- requests
- worker usage
- deployment usage
```

Do not add paid services automatically.

If free quota is near limit:

```text
first:
optimize

second:
reduce unnecessary requests

third:
archive/clean unused data

only last:
consider paid upgrade
```

Free-tier operational notes (procedures documented in `docs/RUNBOOK.md`, created in Phase 2):

- A free-tier Supabase project may be paused after a period of inactivity (e.g., a long closure). Pending transactions stay in the device outbox until the project is restored from the dashboard.
- The free tier has no automatic database backups. The owner's regular CSV export (PRD §27) is the only data export; it is not a full disaster-recovery backup.

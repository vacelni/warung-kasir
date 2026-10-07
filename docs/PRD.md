# PRODUCT REQUIREMENTS DOCUMENT (PRD)

## 1. Informasi Produk

**Nama Produk:** WarungKasir
**Tipe Produk:** Mobile-first Web Application / Progressive Web App (PWA)
**Kategori:** Internal Point of Sale (POS) & Sales Management
**Target Pengguna:** Warung makan skala kecil
**Model Operasional:** Single-store
**Akses:** Internal warung, bukan untuk pelanggan umum
**Platform Utama:** Android melalui browser/PWA
**Platform Tambahan:** Desktop/Laptop
**Target Biaya:** Rp0 untuk MVP
**Status:** Product Specification — MVP

---

# 2. Ringkasan Produk

WarungKasir adalah aplikasi kasir berbasis web yang dirancang untuk membantu pemilik dan karyawan warung makan melakukan transaksi secara cepat melalui smartphone Android.

Fungsi utama aplikasi adalah:

1. memilih menu yang dipesan;
2. menentukan jumlah item;
3. menghitung subtotal dan total;
4. menerima input pembayaran;
5. menghitung kembalian otomatis;
6. menyimpan transaksi;
7. melihat riwayat transaksi;
8. melihat laporan penjualan;
9. mengelola menu dan harga;
10. melakukan backup/export data.

Aplikasi digunakan secara internal oleh **Owner** dan **Cashier**. Pelanggan tidak membuat akun dan tidak menggunakan aplikasi.

---

# 3. Problem Statement

Warung makan skala kecil sering melakukan transaksi menggunakan kalkulator, catatan manual, atau aplikasi kasir yang terlalu kompleks.

Masalah yang ingin diselesaikan:

* perhitungan total masih dilakukan secara manual;
* risiko salah menghitung kembalian;
* pencatatan transaksi tidak terstruktur;
* sulit mengetahui omzet harian;
* sulit mengetahui menu yang paling laris;
* pemilik sulit memantau transaksi karyawan;
* data transaksi dapat hilang jika hanya dicatat secara manual;
* aplikasi POS yang terlalu kompleks dapat menyulitkan operasional warung.

---

# 4. Product Goal

WarungKasir harus memungkinkan pengguna menyelesaikan satu transaksi sederhana dengan cepat:

**Pilih menu → atur jumlah → lihat total → masukkan pembayaran → lihat kembalian → simpan transaksi.**

Selain transaksi, pemilik harus dapat memahami kondisi penjualan warung melalui laporan sederhana tanpa membutuhkan kemampuan akuntansi.

---

# 5. Product Principles

Produk mengikuti prinsip:

### Simple

Jumlah fitur dibatasi agar aplikasi mudah dipelajari.

### Fast

Transaksi harus membutuhkan sesedikit mungkin langkah.

### Mobile First

UI dirancang terlebih dahulu untuk smartphone Android.

### Reliable

Perhitungan harga, total, dan kembalian harus akurat.

### Offline Friendly

Fungsi transaksi dasar harus tetap dapat digunakan ketika koneksi internet bermasalah.

### Secure

Data dan hak akses dibedakan antara Owner dan Cashier.

### Free First

MVP tidak bergantung pada layanan berbayar.

---

# 6. Target User

## 6.1 Owner

Owner adalah pemilik warung yang bertanggung jawab terhadap pengaturan dan pemantauan bisnis.

Kebutuhan:

* mengetahui omzet;
* melihat transaksi;
* mengelola menu;
* mengubah harga;
* menambah/menghapus menu;
* mengelola karyawan;
* melakukan backup data;
* mengatur profil warung.

## 6.2 Cashier

Cashier adalah karyawan yang melakukan transaksi.

Kebutuhan:

* membuka kasir dengan cepat;
* memilih menu;
* mengubah jumlah item;
* melihat total;
* memasukkan pembayaran;
* menghitung kembalian;
* menyelesaikan transaksi;
* melihat riwayat transaksi sesuai hak akses.

## 6.3 Customer

Customer bukan pengguna aplikasi.

Customer hanya:

* memesan makanan;
* membayar ke kasir;
* menerima informasi total/kembalian;
* menerima struk jika tersedia.

---

# 7. Scope MVP

## 7.1 Authentication

MVP memiliki authentication.

Fitur:

* login;
* logout;
* session persistence;
* password-based authentication;
* protected routes;
* validasi akun.

MVP tidak membutuhkan:

* SMS OTP;
* WhatsApp OTP;
* social login;
* biometrik;
* multi-factor authentication.

---

# 8. Authorization

Aplikasi memiliki dua role:

### Owner

Akses:

* Kasir
* Riwayat
* Laporan
* Menu
* Kategori
* Karyawan
* Backup/Export
* Pengaturan

### Cashier

Akses:

* Kasir
* Riwayat transaksi

Cashier tidak memiliki akses untuk:

* mengubah harga;
* menambah/menghapus menu;
* menghapus data penting;
* mengelola karyawan;
* pengaturan sistem;
* backup/export;
* administrasi owner.

Authorization harus diterapkan pada **frontend dan database/backend**, bukan hanya dengan menyembunyikan tombol.

---

# 9. Information Architecture

Struktur utama:

```text
WarungKasir
│
├── Login
│
└── Application
    │
    ├── Kasir
    │   ├── Search Menu
    │   ├── Category Filter
    │   ├── Product List
    │   ├── Cart
    │   ├── Checkout
    │   ├── Payment
    │   └── Transaction Success
    │
    ├── Riwayat
    │   ├── Transaction List
    │   ├── Search
    │   ├── Filter
    │   └── Transaction Detail
    │
    ├── Laporan
    │   ├── Summary
    │   ├── Sales Chart
    │   └── Best Selling Products
    │
    └── Lainnya
        ├── Menu
        ├── Kategori
        ├── Karyawan
        ├── Backup / Export
        ├── Pengaturan
        └── Tentang
```

---

# 10. Navigation

Pada smartphone, aplikasi menggunakan bottom navigation.

```text
┌─────────────────────────────┐
│                             │
│        PAGE CONTENT         │
│                             │
├─────────────────────────────┤
│ Kasir │ Riwayat │ Laporan │ ⋯ │
└─────────────────────────────┘
```

Menu:

* Kasir
* Riwayat
* Laporan
* Lainnya

Untuk Cashier, menu yang tidak memiliki izin tidak ditampilkan.

---

# 11. User Flow — Login

```text
Open App
   ↓
Check Session
   ↓
Session Exists?
 ┌───────┴───────┐
 Yes             No
 ↓               ↓
Open Kasir      Login
                  ↓
            Validate Account
                  ↓
                Login
                  ↓
            Open Kasir
```

---

# 12. User Flow — Transaction

```text
Kasir
 ↓
Cari/Pilih Menu
 ↓
Tambah ke Cart
 ↓
Ubah Quantity
 ↓
Lihat Total
 ↓
Lanjut Bayar
 ↓
Input Uang
 ↓
Sistem menghitung Kembalian
 ↓
Bayar
 ↓
Validasi
 ↓
Simpan Transaksi
 ↓
Transaction Success
 ↓
Transaksi Baru
```

---

# 13. Business Rules — Transaction

## 13.1 Quantity

Quantity minimal:

```text
1
```

Tidak boleh:

```text
0
-1
angka negatif
```

## 13.2 Harga

Harga harus:

* angka;
* lebih besar dari 0;
* menggunakan Rupiah;
* tidak boleh menghasilkan nilai negatif.

## 13.3 Total

Formula:

```text
Subtotal = Harga × Quantity
```

```text
Total = Σ seluruh subtotal
```

MVP tidak menggunakan pajak otomatis.

Diskon dapat disiapkan sebagai field tetapi tidak wajib diaktifkan pada tahap pertama.

## 13.4 Pembayaran

Formula:

```text
Kembalian = Uang Dibayar - Total
```

Ketentuan:

```text
Uang Dibayar >= Total
```

Jika:

```text
Uang Dibayar < Total
```

maka transaksi tidak dapat diselesaikan.

## 13.5 Uang Pas

Tombol:

```text
Uang Pas
```

secara otomatis mengisi:

```text
Uang Dibayar = Total
Kembalian = Rp0
```

---

# 14. Halaman Kasir

## Tujuan

Menjadi halaman utama untuk melakukan transaksi.

## Komponen

### Header

```text
☰   WarungKasir          ⋮
```

### Search

```text
Cari menu...
```

### Category Tabs

```text
Semua | Makanan | Minuman | Snack
```

### Product Card

Setiap produk menampilkan:

* nama;
* harga;
* status;
* tombol tambah.

Contoh:

```text
┌─────────────────────┐
│ Nasi Goreng         │
│ Rp15.000             │
│               [+]   │
└─────────────────────┘
```

### Floating/Bottom Cart

```text
3 item       Rp40.000
[ LIHAT PESANAN ]
```

---

# 15. Cart / Pesanan

Menampilkan:

* nama menu;
* harga;
* quantity;
* subtotal;
* tombol tambah;
* tombol kurang;
* tombol hapus.

Contoh:

```text
Nasi Goreng
Rp15.000 × 2
[-] [2] [+]

Subtotal                Rp30.000
```

Bagian bawah:

```text
Subtotal                 Rp40.000
Total                    Rp40.000

[ LANJUT BAYAR ]
```

---

# 16. Payment Screen

Komponen:

* total;
* input uang;
* quick amount buttons;
* kembalian;
* tombol bayar.

Contoh quick amount:

```text
[10K] [20K] [50K]
[100K] [200K] [UANG PAS]
```

Input menggunakan numeric keyboard pada Android.

---

# 17. Payment Validation

### Kondisi valid

```text
Total = Rp40.000
Bayar = Rp50.000
Kembalian = Rp10.000
```

### Kondisi invalid

```text
Total = Rp40.000
Bayar = Rp30.000
```

Sistem menampilkan:

```text
Uang pembayaran kurang Rp10.000
```

Tombol Bayar disabled.

---

# 18. Transaction Success

Setelah transaksi berhasil:

```text
✓ Transaksi Berhasil

Total
Rp40.000

Dibayar
Rp50.000

Kembalian
Rp10.000

[ Lihat Detail ]
[ Transaksi Baru ]
```

Data langsung masuk ke riwayat.

---

# 19. Riwayat Transaksi

Menampilkan transaksi dari yang terbaru.

Setiap item:

```text
#TRX-000125
07 Okt 2026 • 10:32

3 item
Rp40.000

Kasir: Andi
```

Fitur:

* pencarian;
* filter tanggal;
* melihat detail;
* sorting terbaru/terlama.

Cashier hanya dapat melihat data yang diizinkan.

Owner dapat melihat seluruh transaksi.

---

# 20. Transaction Detail

Menampilkan:

```text
TRX-000125

Nasi Goreng ×2       Rp30.000
Es Teh ×2            Rp10.000
────────────────────────────
Total                Rp40.000

Bayar                Rp50.000
Kembalian            Rp10.000

Kasir                Andi
Tanggal              07/10/2026
Waktu                10:32
```

---

# 21. Dashboard / Laporan

Dashboard hanya untuk Owner.

## Summary Cards

Menampilkan:

```text
Omzet Hari Ini
Rp1.250.000

Transaksi
32

Item Terjual
117

Rata-rata Transaksi
Rp39.063
```

## Time Filter

```text
Hari Ini | 7 Hari | 30 Hari | Custom
```

## Sales Chart

Grafik sederhana yang memperlihatkan penjualan berdasarkan waktu.

## Best Selling Products

Contoh:

```text
1. Es Teh             35
2. Nasi Goreng        28
3. Ayam Goreng        20
```

---

# 22. Menu Management

Owner dapat:

* melihat menu;
* menambah menu;
* mengubah menu;
* menghapus menu;
* mengubah harga;
* mengaktifkan/nonaktifkan menu.

Data produk minimum:

```text
id
name
category_id
price
image
is_active
created_at
updated_at
```

Image bersifat optional.

---

# 23. Product Status

Menu dapat:

```text
Aktif
Tidak Aktif
```

Jika tidak aktif:

* tidak tampil di kasir;
* tetap tersimpan di database;
* histori transaksi lama tetap menggunakan data transaksi lama.

Produk sebaiknya **tidak benar-benar dihapus** apabila pernah digunakan dalam transaksi.

Pendekatan yang dipakai:

```text
is_active = false
```

bukan hard delete.

---

# 24. Category Management

Owner dapat:

* membuat kategori;
* mengubah nama kategori;
* menghapus kategori yang belum digunakan.

Contoh:

```text
Makanan
Minuman
Snack
Paket
Lainnya
```

---

# 25. Employee Management

Hanya Owner.

Fitur:

* tambah Cashier;
* melihat daftar Cashier;
* mengubah status;
* menonaktifkan akun;
* mengubah profil.

Contoh:

```text
Andi
Cashier
Aktif

Budi
Cashier
Aktif
```

Tidak diperbolehkan membuat role tambahan pada MVP.

---

# 26. Store Profile

Owner dapat mengatur:

* nama warung;
* alamat;
* nomor telepon;
* logo;
* catatan struk.

Contoh:

```text
Warung Makan Bu Sari

Jl. Contoh No. 10
Semarang

Terima kasih :)
```

---

# 27. Backup dan Export

Owner dapat melakukan:

```text
Export Transaksi
Export Menu
Backup Data
```

Format minimum:

```text
CSV
```

Tujuan:

* pencadangan;
* analisis manual;
* mengurangi risiko kehilangan data.

MVP tidak membutuhkan cloud backup berbayar.

---

# 28. Offline Mode

Aplikasi dirancang agar fungsi transaksi dasar dapat berjalan saat koneksi internet terputus.

## Offline-capable features

* membuka aplikasi;
* melihat menu yang telah tersimpan;
* menambah item;
* menghitung total;
* menghitung kembalian;
* membuat transaksi;
* menyimpan transaksi lokal.

## Sync

Ketika koneksi tersedia kembali:

```text
Local Transaction
       ↓
Connection Available
       ↓
Sync Queue
       ↓
Cloud Database
```

Transaksi memiliki status sinkronisasi:

```text
pending
synced
failed
```

---

# 29. Offline Conflict Rule

MVP menggunakan pendekatan sederhana:

Setiap transaksi diberikan ID unik dari sisi client sebelum sinkronisasi.

Contoh:

```text
TRX-20261007-AB12
```

Jika transaksi berhasil masuk database, transaksi tidak boleh dibuat ulang.

Tujuan:

menghindari transaksi duplikat ketika koneksi kembali.

---

# 30. Database Schema

Struktur konseptual:

```text
auth.users
     │
     ▼
profiles
     │
     └── role
          ├── owner
          └── cashier

store
  │
  ├── categories
  │       │
  │       └── products
  │
  └── transactions
           │
           └── transaction_items
```

## profiles

```text
id
name
role
store_id
created_at
updated_at
```

## store

```text
id
name
address
phone
logo_url
created_at
updated_at
```

## categories

```text
id
store_id
name
created_at
updated_at
```

## products

```text
id
store_id
category_id
name
price
image_url
is_active
created_at
updated_at
```

## transactions

```text
id
store_id
cashier_id
total
paid_amount
change_amount
status
created_at
```

## transaction_items

```text
id
transaction_id
product_id
product_name
price
quantity
subtotal
```

`product_name` dan `price` disimpan pada `transaction_items` sebagai snapshot transaksi agar perubahan harga produk di masa depan tidak mengubah histori transaksi lama.

---

# 31. Security Requirements

## Authentication

Setiap pengguna harus memiliki akun.

## Authorization

Semua data harus dibatasi berdasarkan store.

## Database Security

Access control harus diterapkan pada database.

Secara konseptual:

```text
Owner
→ full access dalam store

Cashier
→ transaction-related access
```

User tidak boleh membaca data store lain.

---

# 32. UI/UX Design

## Design Direction

Karakter visual:

* clean;
* sederhana;
* modern;
* friendly;
* mobile-first;
* mudah dibaca;
* tidak terlalu banyak dekorasi.

## Color Direction

Primary:

**Orange**

Neutral:

* white;
* light gray;
* dark gray.

Semantic:

* green untuk sukses;
* red untuk error;
* yellow/orange untuk warning.

## Typography

Gunakan font sans-serif modern yang mudah dibaca.

Hierarki:

```text
Page Title
Section Title
Product Name
Price
Secondary Information
```

---

# 33. Mobile Design Requirements

Target utama:

**Android smartphone 360–430 px width.**

Ketentuan:

* tombol utama minimal sekitar 48 px tinggi;
* touch target besar;
* tidak mengandalkan hover;
* input angka menggunakan numeric keyboard;
* tidak menggunakan horizontal scrolling pada halaman utama;
* teks tidak terpotong;
* informasi penting harus berada dalam visual hierarchy yang jelas.

---

# 34. Desktop Responsive Design

Pada ukuran tablet/laptop:

```text
Sidebar
+
Main Content
```

Pada smartphone:

```text
Bottom Navigation
+
Full-width Content
```

Fungsi tetap sama.

---

# 35. PWA Requirements

Aplikasi harus:

* memiliki manifest;
* dapat ditambahkan ke Home Screen;
* memiliki application icon;
* berjalan melalui HTTPS;
* memiliki service worker;
* melakukan caching aset utama;
* dapat membuka shell aplikasi ketika offline.

Tujuan:

Bagi pengguna, aplikasi terasa seperti aplikasi Android meskipun sebenarnya menggunakan web technology.

---

# 36. Free Technology Strategy

MVP ditargetkan menggunakan teknologi dan layanan yang tersedia dalam free tier.

Contoh arsitektur:

```text
Frontend
Next.js / React
       │
       ▼
PWA
       │
       ├── Browser Storage / IndexedDB
       │
       ▼
Supabase
       │
       ├── Authentication
       └── PostgreSQL Database
       │
       ▼
Free Web Hosting
```

Tidak menggunakan pada MVP:

* VPS berbayar;
* domain berbayar;
* SMS gateway;
* WhatsApp API berbayar;
* payment gateway;
* paid storage;
* paid analytics;
* printer khusus.

---

# 37. Transaction Data Model Example

Contoh transaksi:

```text
Transaction
TRX-000125

Nasi Goreng
price: 15000
quantity: 2
subtotal: 30000

Es Teh
price: 5000
quantity: 2
subtotal: 10000

Total:
40000

Paid:
50000

Change:
10000

Cashier:
Andi
```

---

# 38. Error Handling

Aplikasi harus menangani:

### Tidak ada menu

```text
Belum ada menu.
Tambah menu terlebih dahulu.
```

### Pembayaran kurang

```text
Uang pembayaran kurang Rp10.000.
```

### Network unavailable

```text
Koneksi internet tidak tersedia.
Transaksi akan disimpan dan disinkronkan nanti.
```

### Sync failure

```text
Transaksi tersimpan di perangkat.
Sinkronisasi akan dicoba kembali.
```

### Authentication failure

```text
Email atau password salah.
```

---

# 39. Data Integrity

Sistem harus memastikan:

* total tidak dapat diedit manual;
* subtotal dihitung sistem;
* kembalian dihitung sistem;
* transaksi yang sudah selesai tidak dapat diubah sembarangan;
* histori menyimpan harga saat transaksi;
* transaksi memiliki ID unik;
* data yang gagal sync tidak hilang.

---

# 40. Transaction Status

Transaksi dapat memiliki status:

```text
pending_sync
synced
failed
cancelled
```

MVP tidak perlu fitur refund kompleks.

---

# 41. Performance Requirements

Untuk operasi normal:

* halaman kasir harus terasa responsif;
* penambahan item ke cart tidak boleh memerlukan request server setiap kali tombol ditekan;
* perhitungan total dilakukan secara lokal;
* pencarian menu berlangsung cepat;
* aplikasi tetap nyaman digunakan pada HP Android kelas menengah.

---

# 42. Accessibility

Minimum requirement:

* kontras teks memadai;
* ukuran font dapat dibaca;
* tombol tidak terlalu kecil;
* informasi error jelas;
* jangan hanya mengandalkan warna untuk menyampaikan status.

---

# 43. MVP — Must Have

Fitur yang wajib ada:

```text
✓ Login
✓ Owner/Cashier role
✓ Kasir
✓ Product selection
✓ Category
✓ Cart
✓ Quantity
✓ Total calculation
✓ Payment input
✓ Change calculation
✓ Save transaction
✓ Transaction history
✓ Owner dashboard
✓ Product management
✓ Category management
✓ Employee management
✓ Store settings
✓ CSV export
✓ PWA
✓ Offline transaction foundation
```

---

# 44. MVP — Should Have

Fitur penting tetapi dapat menyusul setelah core POS berjalan:

```text
- Quick payment buttons
- Search history
- Date filtering
- Product image
- Simple receipt view
- Sync status indicator
- Dark mode
- Custom dashboard date range
```

---

# 45. Post-MVP / Future Features

Tidak menjadi bagian MVP:

```text
- QRIS/payment gateway
- Bluetooth printer
- Inventory/stok
- Ingredient management
- Purchase management
- Supplier
- Customer management
- Loyalty
- Multi-store
- Multi-branch
- Cloud accounting
- Advanced financial reports
- Mobile native Android application
- AI recommendation
- WhatsApp integration
```

---

# 46. User Stories

## Owner

**US-01**
Sebagai Owner, saya ingin login agar data warung saya terlindungi.

**US-02**
Sebagai Owner, saya ingin menambahkan menu agar produk tersedia di kasir.

**US-03**
Sebagai Owner, saya ingin mengubah harga agar harga jual selalu sesuai.

**US-04**
Sebagai Owner, saya ingin melihat omzet agar mengetahui performa penjualan.

**US-05**
Sebagai Owner, saya ingin melihat transaksi kasir agar mengetahui aktivitas penjualan.

**US-06**
Sebagai Owner, saya ingin menambahkan Cashier agar karyawan dapat melakukan transaksi.

**US-07**
Sebagai Owner, saya ingin export data agar memiliki cadangan transaksi.

## Cashier

**US-08**
Sebagai Cashier, saya ingin memilih menu agar dapat mencatat pesanan.

**US-09**
Sebagai Cashier, saya ingin mengubah quantity agar pesanan sesuai permintaan customer.

**US-10**
Sebagai Cashier, saya ingin melihat total otomatis agar tidak perlu menghitung manual.

**US-11**
Sebagai Cashier, saya ingin memasukkan nominal pembayaran agar sistem menghitung kembalian.

**US-12**
Sebagai Cashier, saya ingin menyelesaikan transaksi agar penjualan tersimpan.

---

# 47. Acceptance Criteria — Kasir

### AC-01

**Given** produk tersedia
**When** Cashier menekan produk
**Then** produk masuk ke cart.

### AC-02

**Given** produk quantity = 1
**When** tombol `+` ditekan
**Then** quantity menjadi 2.

### AC-03

**Given** harga Rp15.000 dan quantity 2
**Then** subtotal = Rp30.000.

### AC-04

**Given** total Rp40.000 dan pembayaran Rp50.000
**Then** kembalian = Rp10.000.

### AC-05

**Given** total Rp40.000 dan pembayaran Rp30.000
**Then** tombol Bayar tidak dapat menyelesaikan transaksi.

### AC-06

**Given** transaksi berhasil
**Then** transaksi muncul di Riwayat.

---

# 48. Acceptance Criteria — Authorization

### AC-07

**Given** user role = Cashier
**When** membuka halaman Menu Management
**Then** akses ditolak.

### AC-08

**Given** user role = Cashier
**When** mencoba mengakses fungsi Owner melalui request langsung
**Then** database/backend menolak request.

### AC-09

**Given** user role = Owner
**When** membuka Menu Management
**Then** halaman dapat diakses.

---

# 49. Acceptance Criteria — Offline

### AC-10

**Given** perangkat kehilangan koneksi
**When** Cashier membuat transaksi
**Then** transaksi tetap dapat dibuat secara lokal.

### AC-11

**Given** koneksi kembali tersedia
**Then** transaksi pending disinkronkan.

### AC-12

**Given** transaksi telah berhasil disinkronkan
**Then** transaksi tidak dibuat dua kali.

---

# 50. Acceptance Criteria — Security

### AC-13

User tanpa session tidak dapat membuka halaman aplikasi internal.

### AC-14

Cashier tidak dapat mengubah data yang hanya dimiliki Owner.

### AC-15

User hanya dapat mengakses data store yang terkait dengan akunnya.

---

# 51. Success Metrics

MVP dianggap berhasil apabila:

1. Cashier dapat menyelesaikan transaksi tanpa kalkulator eksternal.
2. Total dan kembalian selalu dihitung sistem.
3. Transaksi tersimpan dan dapat dilihat kembali.
4. Owner dapat mengetahui omzet.
5. Owner dapat mengelola menu.
6. Aplikasi dapat digunakan melalui smartphone Android.
7. Fungsi transaksi dasar tetap dapat berjalan saat internet sementara terputus.
8. Tidak ada biaya operasional wajib pada MVP.

---

# 52. Prioritas Development

Urutan pengembangan:

```text
Phase 1
Project setup
        ↓
Phase 2
Authentication + Authorization
        ↓
Phase 3
Database
        ↓
Phase 4
Menu + Category
        ↓
Phase 5
Kasir + Cart
        ↓
Phase 6
Payment + Change
        ↓
Phase 7
Transaction History
        ↓
Phase 8
Owner Dashboard
        ↓
Phase 9
Employee Management
        ↓
Phase 10
Backup / Export
        ↓
Phase 11
PWA
        ↓
Phase 12
Offline + Sync
        ↓
Phase 13
Testing + Security Review
        ↓
MVP Release
```

---

# 53. Definition of Done

MVP dianggap selesai apabila:

* semua fitur Must Have tersedia;
* role Owner dan Cashier berjalan;
* transaksi dapat dibuat;
* total benar;
* kembalian benar;
* transaksi tersimpan;
* riwayat dapat dibuka;
* dashboard menampilkan data nyata;
* menu dapat dikelola Owner;
* akses Cashier dibatasi;
* data tidak dapat diakses lintas store;
* aplikasi dapat dibuka dari Android;
* PWA dapat di-install ke Home Screen;
* transaksi dasar dapat bekerja secara offline;
* data offline dapat disinkronkan;
* export data berfungsi;
* tidak ada dependency wajib berbayar pada MVP.

---

# 54. Final Product Definition

WarungKasir pada MVP didefinisikan sebagai:

> **Aplikasi POS internal single-store berbasis Web/PWA yang digunakan Owner dan Cashier untuk melakukan transaksi warung makan, menghitung total dan kembalian secara otomatis, mencatat histori penjualan, mengelola menu, serta menyediakan dashboard penjualan sederhana.**

Produk tidak ditujukan sebagai aplikasi marketplace makanan, aplikasi customer ordering, atau sistem ERP.

Fokus MVP adalah:

**TRANSAKSI → DATA → LAPORAN**

dengan prioritas:

**Cepat → Sederhana → Akurat → Aman → Gratis**

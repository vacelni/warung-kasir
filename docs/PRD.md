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
* melihat riwayat transaksi miliknya sendiri.

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
* Riwayat transaksi — **hanya transaksi miliknya sendiri** (`cashier_id` = akun Cashier tersebut)

Owner dapat melihat seluruh transaksi dalam store.

Hanya ada dua role (`owner`, `cashier`) dan tepat **satu Owner per store** pada MVP. Role bersifat tetap dan tidak dapat diubah melalui aplikasi.

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

Catatan:

* Validate Account = profil ada dan `is_active = true`.
* Login pertama (dan login setelah logout) memerlukan koneksi internet.
* Perilaku session saat offline mengikuti §28.

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

"Simpan Transaksi" berarti transaksi disimpan terlebih dahulu di perangkat (local outbox), lalu disinkronkan ke server. Alur ini sama untuk kondisi online maupun offline (lihat §28).

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

MVP tidak menggunakan diskon dan tidak menyiapkan field diskon. Diskon adalah fitur post-MVP (§45) dan akan ditambahkan melalui migration jika disetujui.

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
WarungKasir
Nama kasir
```

Tidak menggunakan hamburger menu pada mobile. Navigasi menggunakan bottom navigation (§10). Detail layout mengikuti UI_SPEC A.9.

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
* tombol tambah;
* badge jumlah jika produk sudah ada di cart.

Seluruh card dapat ditekan untuk menambahkan produk ke cart (bukan hanya tombol [+]).

Hanya produk aktif yang tampil di kasir, sehingga card tidak menampilkan status.

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

Quick amount:

```text
[Rp10.000]  [Rp20.000]  [Rp50.000]
[Rp100.000] [Rp200.000] [UANG PAS]
```

Ketentuan:

* menekan tombol quick amount **mengisi (set)** Uang Dibayar dengan nominal tersebut, bukan menambahkan ke nominal sebelumnya;
* Rp200.000 hanya nominal pembayaran cepat, bukan pecahan uang kertas;
* Cashier selalu dapat mengetik nominal lain secara manual.

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

TRX-20261007-3F9A2C

Total
Rp40.000

Dibayar
Rp50.000

Kembalian
Rp10.000

[ Lihat Detail ]
[ Transaksi Baru ]
```

Transaksi langsung muncul di Riwayat. Jika belum tersinkron ke server, transaksi ditampilkan dengan badge status sinkronisasi (lihat §28).

---

# 19. Riwayat Transaksi

Menampilkan transaksi dari yang terbaru.

Setiap item:

```text
TRX-20261007-3F9A2C
07 Okt 2026 • 10:32

3 item
Rp40.000

Kasir: Andi
```

Fitur:

* pencarian berdasarkan kode transaksi;
* filter tanggal;
* melihat detail;
* sorting terbaru/terlama.

Tanggal, waktu, filter tanggal, dan pengelompokan hari menggunakan zona waktu Asia/Jakarta (WIB), bukan zona waktu perangkat.

Cashier hanya dapat melihat transaksi miliknya sendiri.

Owner dapat melihat seluruh transaksi dalam store.

Transaksi yang masih tersimpan lokal (belum tersinkron) ditampilkan dengan badge status sinkronisasi.

---

# 20. Transaction Detail

Menampilkan:

```text
TRX-20261007-3F9A2C

Nasi Goreng ×2       Rp30.000
Es Teh ×2            Rp10.000
────────────────────────────
Total                Rp40.000

Bayar                Rp50.000
Kembalian            Rp10.000

Kasir                Andi
Tanggal              07/10/2026
Waktu                10:32 WIB
```

Tanggal dan waktu adalah waktu penjualan (`created_at`) dalam Asia/Jakarta.

Untuk Owner, transaksi yang waktu penjualannya tidak wajar dibanding waktu diterima server diberi penanda "Cek waktu" (UI_SPEC A.15, SEC-06). Penanda tidak mengubah atau menolak transaksi.

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

Ketentuan:

* tepat 4 metrik: Omzet, Transaksi, Item Terjual, Rata-rata Transaksi;
* pada mobile ditampilkan sebagai grid 2×2 yang ringkas;
* Rata-rata Transaksi = `Math.round(omzet / jumlahTransaksi)`; jika jumlah transaksi 0, tampilkan Rp0;
* seluruh perhitungan menggunakan waktu penjualan (`created_at`) dengan batas hari Asia/Jakarta;
* transaksi berstatus `cancelled` tidak dihitung.

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
* menghapus menu (= menonaktifkan, lihat §23);
* mengubah harga;
* mengaktifkan/nonaktifkan menu.

Data produk minimum:

```text
id
name
category_id
price
is_active
created_at
updated_at
```

Gambar produk ditunda (post-MVP, lihat §45). Definisi kolom otoritatif: `docs/DATABASE.md`.

---

# 22a. Pilihan Menu (ditambahkan setelah peluncuran, 2026-10-18)

Atas permintaan pemilik warung (ayam dan bebek crispy, geprek, bakar): layar kasir menampilkan menu utama yang sederhana (Geprek, Bakar, Nyemek, Geprek Bakar, Bebek, dst.). Saat Cashier atau Owner mengetuk menu yang memiliki pilihan, muncul pilihan yang tinggal diketuk, lalu menu masuk ke pesanan dengan total harganya.

* Owner membuat **grup pilihan** yang dapat dipakai ulang (mis. Nasi, Level, Bagian ayam, Tambahan), masing-masing dengan **pilihan** dan **tambahan harga** per pilihan (boleh Rp0);
* jenis grup: pilih satu atau boleh banyak; wajib dipilih atau opsional; satu pilihan dapat ditandai terpilih otomatis;
* Owner memasang grup pada menu (Menu → Edit) dan mengatur urutannya;
* pilihan yang sedang habis dapat ditandai tidak tersedia sehingga hilang dari kasir;
* kasir dapat menambahkan catatan bebas (mis. "sambal dipisah") dan jumlah sebelum menambahkan;
* harga satuan = harga menu + tambahan harga semua pilihan; pilihan yang sama digabung, pilihan berbeda menjadi baris terpisah;
* pilihan dan catatan tampil di pesanan, struk (layar dan cetak), riwayat, dan export, sesuai saat penjualan; mengubah atau menghapus pilihan tidak mengubah transaksi lama;
* berfungsi offline; menu tanpa pilihan (mis. Es Teh) tetap langsung masuk ke pesanan;
* data yang sudah ada (menu, kategori, profil, store, transaksi) tidak diubah.

Detail: UI_SPEC A.9a dan A.17a, DATABASE D.12, TECHNICAL_SPEC C.17.

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

Pada MVP **tidak ada hard delete produk**. Aksi menghapus menu berarti:

```text
is_active = false
```

Produk yang pernah digunakan dalam transaksi tetap tersimpan di database. Foreign key dari `transaction_items` ke `products` menjadi pengaman tambahan.

---

# 24. Category Management

Owner dapat:

* membuat kategori;
* mengubah nama kategori;
* menghapus kategori yang belum digunakan.

"Belum digunakan" berarti tidak ada produk (aktif maupun tidak aktif) yang memakai kategori tersebut. Database menolak penghapusan kategori yang masih dipakai produk.

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
* mengubah status (aktif/nonaktif);
* menonaktifkan akun;
* mengubah profil (nama);
* reset password Cashier.

Ketentuan:

* tambah Cashier, aktif/nonaktif, dan reset password dilakukan melalui Supabase Edge Function yang aman (server-side);
* Owner menentukan email login dan password Cashier; Cashier tidak wajib memiliki mailbox email pribadi yang aktif;
* MVP tidak menggunakan pemulihan password berbasis email untuk Cashier;
* pemulihan akun Owner menggunakan proses Supabase Dashboard yang terdokumentasi di runbook;
* Owner tidak dapat menonaktifkan akunnya sendiri;
* role tidak dapat diubah melalui aplikasi.

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
* catatan struk.

Logo warung ditunda (post-MVP, lihat §45).

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

Pada MVP, "Backup Data" berarti **export data**, bukan backup lengkap yang dapat di-restore.

Data yang di-export:

* data store;
* categories;
* products;
* grup dan pilihan menu, serta grup yang dipasang pada setiap menu;
* transactions;
* transaction_items (termasuk pilihan dan catatan setiap item);
* profil karyawan (opsional) — hanya jika tidak memuat credential atau secret apa pun.

Ketentuan:

* tidak ada fitur restore pada MVP;
* export CSV tidak boleh diklaim sebagai backup disaster-recovery yang lengkap;
* CSV harus aman dari formula injection saat dibuka di spreadsheet.

Tujuan:

* pencadangan data;
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

## Local-first

Checkout selalu menyimpan transaksi ke local outbox (IndexedDB) terlebih dahulu, kemudian menyinkronkannya ke server. Online dan offline menggunakan alur yang sama; tidak ada jalur penyimpanan terpisah.

## Sync

Ketika koneksi tersedia:

```text
Local Transaction
       ↓
Connection Available
       ↓
Sync Queue
       ↓
Cloud Database
```

Status sinkronisasi (hanya di perangkat/IndexedDB, **bukan** status transaksi di server):

```text
pending
syncing
synced
failed
```

Status transaksi di server didefinisikan di §40.

Transaksi pending tidak pernah dihapus secara otomatis. Sinkronisasi yang gagal tidak boleh menghapus transaksi.

## Session saat Offline

* Jika perangkat offline dan token tidak dapat diperbarui karena jaringan tidak tersedia, user **tidak** langsung diarahkan ke login. User tetap berada di aplikasi dengan identitas yang tersimpan dan tetap dapat membuat transaksi offline.
* Sinkronisasi menunggu sampai session valid berhasil diperbarui.
* Jika server secara eksplisit menolak session, atau user logout secara eksplisit, user diarahkan ke login. Transaksi pending tetap tersimpan di perangkat.
* Saat logout dan masih ada transaksi pending, aplikasi menampilkan peringatan yang memblokir (modal) dengan jumlah transaksi yang belum tersinkron. Detail dialog: UI_SPEC A.24.

---

# 29. Offline Conflict Rule

MVP menggunakan pendekatan sederhana:

Setiap transaksi diberikan UUID dari sisi client sebelum disimpan. UUID ini adalah identitas transaksi yang sebenarnya (primary key).

Selain itu, transaksi memiliki kode tampilan untuk referensi dan pencarian manusia:

```text
TRX-YYYYMMDD-XXXXXX

Contoh:
TRX-20261007-3F9A2C
```

* `YYYYMMDD` = tanggal penjualan dalam Asia/Jakarta;
* `XXXXXX` = 6 karakter heksadesimal pertama UUID transaksi, huruf besar;
* kode tampilan tidak wajib unik secara global; UUID tetap identitas yang sebenarnya.

Jika transaksi dengan UUID yang sama sudah masuk database, transaksi tidak boleh dibuat ulang.

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

stores
  │
  ├── categories
  │       │
  │       └── products
  │
  └── transactions
           │
           └── transaction_items
```

Tabel MVP: `stores`, `profiles`, `categories`, `products`, `transactions`, `transaction_items`.

**Definisi kolom, constraint, dan index yang otoritatif ada di `docs/DATABASE.md`.** Bagian ini hanya gambaran konseptual.

`product_name` dan `unit_price` disimpan pada `transaction_items` sebagai snapshot transaksi agar perubahan harga produk di masa depan tidak mengubah histori transaksi lama.

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
→ riwayat hanya transaksi miliknya sendiri
```

User tidak boleh membaca data store lain.

Detail kebijakan keamanan: `docs/SECURITY.md`.

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
* paid analytics.

Catatan: cetak struk ke printer Bluetooth portable ditambahkan setelah peluncuran (§44a); printer dibeli sendiri oleh warung dan bukan layanan berbayar.

---

# 37. Transaction Data Model Example

Contoh transaksi:

```text
Transaction
id: 3f9a2c4e-…  (UUID, identitas sebenarnya)
code: TRX-20261007-3F9A2C

Nasi Goreng
unit_price: 15000
quantity: 2
subtotal: 30000

Es Teh
unit_price: 5000
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
* transaksi yang sudah selesai tidak dapat diubah atau dibatalkan melalui aplikasi pada MVP;
* histori menyimpan harga saat transaksi;
* transaksi memiliki ID unik;
* data yang gagal sync tidak hilang.

---

# 40. Transaction Status

Status bisnis transaksi di server:

```text
completed
cancelled
```

* semua transaksi yang disimpan pada MVP berstatus `completed`;
* `cancelled` dicadangkan untuk fitur pembatalan terkontrol di masa depan; **tidak ada UI pembatalan pada MVP**;
* laporan tidak menghitung transaksi `cancelled` jika suatu saat ada.

Status sinkronisasi (`pending`, `syncing`, `synced`, `failed`) adalah konsep terpisah yang hanya ada di perangkat (lihat §28) dan tidak boleh disimpan sebagai status transaksi di server.

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
- Pencarian riwayat (berdasarkan kode transaksi)
- Date filtering
- Simple receipt view
- Sync status indicator ringkas di header (status di Lainnya dan peringatan logout tetap wajib, lihat §28)
- Dark mode
- Custom dashboard date range
```

---

# 44a. Cetak Struk Bluetooth (ditambahkan setelah peluncuran, 2026-10-18)

Atas permintaan pemilik warung, struk dapat dicetak ke printer thermal portable melalui Bluetooth.

* Owner dan Cashier dapat mencetak dan mencetak ulang struk transaksi yang dapat mereka lihat;
* cetak adalah tombol manual [ CETAK STRUK ] di layar sukses dan detail transaksi, tidak otomatis;
* printer dipasang di HP kasir (Lainnya → Printer struk), lebar kertas 58 mm atau 80 mm;
* hanya printer Bluetooth LE (Web Bluetooth, Chrome); printer Bluetooth Classic tidak didukung;
* kegagalan printer tidak memengaruhi transaksi, penyimpanan lokal, atau sinkronisasi;
* tanpa perubahan database. Detail: UI_SPEC A.15, TECHNICAL_SPEC C.16.

---

# 45. Post-MVP / Future Features

Tidak menjadi bagian MVP:

```text
- QRIS/payment gateway
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
- Product image
- Logo warung
- Diskon
- Pembatalan transaksi (UI)
- Restore data
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

Urutan pengembangan yang berlaku didefinisikan di **`docs/IMPLEMENTATION_PLAN.md`** (Phase 1–14).

Catatan: checkout menggunakan local outbox sebagai satu-satunya jalur penyimpanan sejak Phase 6; phase Offline + Sync memperkuat (hardening) sistem offline, bukan memperkenalkannya pertama kali.

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

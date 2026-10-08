A. UX/UI SPECIFICATION
A.1 Design Goal

Aplikasi harus terasa seperti aplikasi kasir sungguhan, bukan seperti website administratif.

Prioritas UX:

transaksi cepat;
mudah dipahami;
tombol mudah disentuh;
informasi harga sangat jelas;
tidak banyak langkah;
cocok digunakan satu tangan pada smartphone;
tetap usable pada layar kecil.

Target utama:

Android smartphone 360–430 px;
browser Chrome Android;
portrait orientation.

Tablet dan desktop harus tetap responsive.

A.2 Visual Direction

Style:

clean;
modern;
minimal;
friendly;
professional;
food/retail oriented.

Jangan menggunakan desain:

terlalu banyak gradient;
terlalu banyak card;
terlalu banyak animasi;
glassmorphism berlebihan;
dashboard enterprise yang kompleks.
A.3 Color System

Gunakan warna utama bernuansa orange.

Semantic color:

Primary     = Orange
Success     = Green
Warning     = Amber
Danger      = Red
Background  = Very Light Gray / White
Surface     = White
Text        = Dark Gray
Muted       = Medium Gray
Border      = Light Gray

Warna primary harus konsisten untuk action utama seperti:

Tambah
Bayar
Simpan
Lanjut

Success digunakan untuk:

transaksi berhasil;
sinkronisasi berhasil.

Danger digunakan untuk:

error;
hapus;
pembatalan.
A.4 Typography

Gunakan font sans-serif modern.

Hierarki:

Page Title
24–28 px

Section Title
18–20 px

Product Name
15–17 px

Price
14–18 px

Body
14–16 px

Supporting Text
12–14 px

Harga dan total harus memiliki visual emphasis tinggi.

A.5 Spacing

Gunakan spacing system konsisten.

Base unit:

4 px
8 px
12 px
16 px
20 px
24 px
32 px

Jangan menggunakan spacing acak.

A.6 Button Specification

Primary button:

tinggi minimum 48 px;
border radius 10–14 px;
font medium/semibold;
area sentuh besar.

Important action pada mobile:

[ BAYAR ]
[ LANJUT BAYAR ]
[ TRANSAKSI BARU ]

harus memiliki width besar.

Destructive action seperti Hapus tidak boleh berada terlalu dekat dengan tombol utama.

A.7 Mobile Navigation

Bottom navigation:

┌─────────────────────────────────┐
│                                 │
│          PAGE CONTENT           │
│                                 │
├─────────────────────────────────┤
│  🛒       📋        📊       ⋯  │
│ Kasir   Riwayat   Laporan  Lainnya
└─────────────────────────────────┘

Kasir adalah primary navigation.

Cashier:

Kasir
Riwayat
Lainnya

Owner:

Kasir
Riwayat
Laporan
Lainnya

Isi halaman Lainnya:

Owner:

Menu
Kategori
Karyawan
Backup / Export
Pengaturan
Status sinkronisasi
Tentang
Keluar

Cashier:

Nama/profil (hanya tampilan)
Status sinkronisasi + jumlah transaksi pending
Tentang
Keluar
A.8 Page: Login

Layout:

┌──────────────────────────────┐
│                              │
│        WARUNGKASIR           │
│                              │
│   Sistem Kasir Warung        │
│                              │
│ Email                        │
│ ┌──────────────────────────┐ │
│ │                          │ │
│ └──────────────────────────┘ │
│                              │
│ Password                     │
│ ┌──────────────────────────┐ │
│ │                    👁     │ │
│ └──────────────────────────┘ │
│                              │
│         [ MASUK ]            │
│                              │
│        Versi 1.0             │
└──────────────────────────────┘

Behavior:

submit dengan Enter;
validation inline;
loading state;
error state;
disabled button saat request berlangsung.

Login memerlukan koneksi internet. Jika offline, tampilkan:

Koneksi internet diperlukan untuk masuk.
A.9 Page: Cashier

Header:

WarungKasir
Nama kasir

Search:

🔍 Cari menu...

Category:

Semua | Makanan | Minuman | Snack

Product grid:

┌────────────────┐ ┌────────────────┐
│ Nasi Goreng    │ │ Mie Goreng     │
│ Rp15.000       │ │ Rp12.000       │
│          [+]   │ │          [+]   │
└────────────────┘ └────────────────┘

Pada mobile:

2 kolom;
card compact;
harga selalu terlihat;
seluruh card dapat ditekan untuk menambah produk ke cart;
badge jumlah tampil pada card jika produk sudah ada di cart;
tidak ada hamburger menu; navigasi melalui bottom navigation.

Hanya produk aktif yang tampil, sehingga card tidak menampilkan status.

Bottom cart:

┌─────────────────────────────────┐
│ 3 item              Rp40.000   │
│         [ LIHAT PESANAN ]       │
└─────────────────────────────────┘
A.10 Empty Product State

Jika belum ada menu:

Belum ada menu

Tambahkan menu terlebih dahulu
agar transaksi dapat dilakukan.

Owner:

[ TAMBAH MENU ]

Cashier:

Hubungi Owner untuk menambahkan menu.
A.11 Cart
← Pesanan

Nasi Goreng
Rp15.000

[-]    2    [+]

Subtotal                 Rp30.000

Es Teh
Rp5.000

[-]    2    [+]

Subtotal                 Rp10.000

─────────────────────────────

Subtotal                 Rp40.000
Total                    Rp40.000

[ LANJUT BAYAR ]

Jika kosong:

Keranjang masih kosong.

[ PILIH MENU ]
A.12 Payment Page
← Pembayaran

TOTAL

Rp40.000

UANG DITERIMA

┌──────────────────────────────┐
│ Rp50.000                     │
└──────────────────────────────┘

[Rp10.000]  [Rp20.000]  [Rp50.000]
[Rp100.000] [Rp200.000] [UANG PAS]

KEMBALIAN

Rp10.000

[ BAYAR ]

Input pembayaran menggunakan numeric keyboard.

Quick amount:

menekan tombol mengisi (set) Uang Diterima dengan nominal tersebut, bukan menambahkan;
UANG PAS mengisi Uang Diterima = Total;
Rp200.000 hanya nominal pembayaran cepat, bukan pecahan uang kertas;
Cashier tetap dapat mengetik nominal lain secara manual.

UUID transaksi dibuat sekali saat halaman pembayaran dibuka dan tidak berubah selama retry. Tombol BAYAR disabled setelah ditekan pertama kali.

A.13 Payment Error

Jika pembayaran kurang:

Uang pembayaran kurang

Total:
Rp40.000

Dibayar:
Rp30.000

Kurang:
Rp10.000

Button:

[ BAYAR ]

disabled.

A.14 Transaction Success
✓

Transaksi Berhasil

TRX-20261007-3F9A2C

Total
Rp40.000

Dibayar
Rp50.000

Kembalian
Rp10.000

Tersimpan • Menunggu sinkronisasi
(atau: Tersinkron)

[ LIHAT DETAIL ]
[ TRANSAKSI BARU ]

Layar sukses tampil setelah transaksi tersimpan di perangkat (local outbox). Baris status menunjukkan status sinkronisasi saat ini.

Transaksi baru harus membersihkan cart.

A.15 History

Filter:

🔍 Cari kode transaksi

[ Hari Ini ▼ ]

List:

TRX-20261007-3F9A2C
10:32
3 item
Rp40.000
Kasir: Andi

Klik item membuka detail.

Ketentuan:

Cashier hanya melihat transaksi miliknya sendiri; Owner melihat seluruh transaksi store;
pencarian berdasarkan kode transaksi;
filter tanggal dan pengelompokan hari menggunakan Asia/Jakarta (WIB);
transaksi lokal yang belum tersinkron tampil dengan badge "Belum tersinkron" (atau "Gagal sinkron");
detail dibuka melalui /riwayat/detail?id=<uuid>.

A.16 Dashboard

Owner only.

Atas:

Penjualan

Hari Ini ▼

Grid 2×2 (mobile):

┌──────────────┬──────────────┐
│ Rp1.250.000  │ 32           │
│ Omzet        │ Transaksi    │
├──────────────┼──────────────┤
│ 117          │ Rp39.063     │
│ Item Terjual │ Rata-rata    │
└──────────────┴──────────────┘

Tepat 4 metrik. Rata-rata = Math.round(omzet / transaksi); Rp0 jika tidak ada transaksi. Perhitungan berdasarkan waktu penjualan dengan batas hari Asia/Jakarta; transaksi cancelled tidak dihitung.

Kemudian:

Penjualan
       ╭──╮
   ╭───╯  ╰──╮
───╯         ╰──

Kemudian:

Menu Terlaris

1. Es Teh          35
2. Nasi Goreng     28
3. Ayam Goreng     20

Dashboard tidak boleh menampilkan terlalu banyak metrik.

A.17 Product Management

Owner only.

List:

Menu                         [+]

Nasi Goreng
Rp15.000
Aktif                  ⋮

Mie Goreng
Rp12.000
Aktif                  ⋮

Action menu:

Edit
Nonaktifkan (untuk produk aktif)
Aktifkan (untuk produk tidak aktif)

Tidak ada aksi Hapus terpisah. "Menghapus menu" pada PRD diimplementasikan sebagai Nonaktifkan (is_active=false).

Tidak ada hard delete produk pada MVP.

Gambar produk ditunda (post-MVP).

A.18 Employee Management

Owner only.

Karyawan                    [+]

Andi
Cashier
Aktif                  ⋮

Budi
Cashier
Aktif                  ⋮

Action:

Edit Profil (nama)
Reset Password
Nonaktifkan
Aktifkan

Form tambah Cashier:

Nama
Email login
Password

Ketentuan:

[+] hanya membuat akun Cashier;
role tetap dan tidak dapat diubah melalui aplikasi;
Owner tidak dapat menonaktifkan akunnya sendiri (aksi tidak ditampilkan untuk Owner);
tambah, aktif/nonaktif, dan reset password diproses oleh Edge Function server-side.
A.19 Settings
Profil Warung
Transaksi
Struk
Tampilan
Data
Keamanan
Tentang

Jangan membuat settings sebagai halaman yang penuh form.

Gunakan grouped sections.

Grup yang tidak memiliki pengaturan pada MVP tidak ditampilkan (tidak ada section kosong).

A.20 Loading State

Tidak boleh menampilkan halaman kosong ketika request berlangsung.

Gunakan:

skeleton;
spinner kecil;
disabled button.
A.21 Error State

Error harus menjelaskan:

apa yang gagal;
apa dampaknya;
apa yang dapat dilakukan user.

Contoh:

Gagal menyimpan transaksi.

Transaksi tetap tersimpan di perangkat
dan akan dicoba disinkronkan kembali.

[ COBA LAGI ]
A.22 Touch Interaction

Semua interaction harus bisa digunakan tanpa mouse.

Tidak boleh mengandalkan:

hover-only information;
right click;
tiny icon-only actions.
A.23 Desktop

Desktop layout:

┌──────────────┬──────────────────────────┐
│              │                          │
│   Sidebar    │        Main Content      │
│              │                          │
│ Kasir        │                          │
│ Riwayat      │                          │
│ Laporan      │                          │
│ Menu         │                          │
│ Kategori     │                          │
│ Karyawan     │                          │
│ Backup       │                          │
│ Pengaturan   │                          │
│ Tentang      │                          │
│              │                          │
└──────────────┴──────────────────────────┘

Sidebar menampilkan seluruh route yang diizinkan untuk role user. Untuk Cashier: Kasir, Riwayat, dan item Lainnya untuk Cashier (A.7).

Mobile menggunakan bottom navigation.

A.24 Sync Status & Logout

Indikator status sinkronisasi:

tampil di Lainnya (wajib MVP);
indikator ringkas di header jika ada transaksi pending/failed (Should Have, PRD §44);
menampilkan jumlah transaksi pending dan failed;
tombol [ COBA LAGI ] untuk transaksi failed.

Logout saat masih ada transaksi pending/failed menampilkan modal yang memblokir:

Masih ada 3 transaksi belum tersinkron.

Transaksi tetap tersimpan di perangkat ini
dan akan disinkronkan saat akun yang sama
masuk kembali di perangkat ini.

[ SINKRONKAN SEKARANG ]   (hanya saat online)
[ BATAL ]                 (default)
Tetap keluar              (aksi sekunder)

Transaksi pending tidak pernah dihapus secara otomatis, termasuk saat logout.

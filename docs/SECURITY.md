E. SECURITY SPECIFICATION
E.1 Authentication

Supabase Auth (email/password).

Semua route kecuali /login memerlukan session yang valid.

Hanya halaman login yang public.

Validasi akun setelah login:

profil ada untuk auth.uid();
profiles.is_active = true.

Jika tidak memenuhi, sign out dan tampilkan pesan yang jelas.

Public sign-up dinonaktifkan (Supabase Auth settings dan supabase/config.toml). Akun dibuat hanya oleh Owner melalui Edge Function, atau saat bootstrap Owner melalui runbook.

Login pertama (dan login setelah logout) memerlukan koneksi internet.

E.2 Authorization

Role:

owner
cashier

Hanya dua role ini yang ada. Tepat satu Owner per store pada MVP.

Permission:

Owner:
full access dalam store

Cashier:
transaction access; riwayat hanya transaksi miliknya sendiri
E.3 Permission Matrix
Resource	Owner	Cashier
Cashier (kasir)	✅	✅
Create transaction (RPC)	✅	✅
History	✅ seluruh transaksi store	✅ hanya transaksi milik sendiri
Cancel transaction	❌ tidak ada UI pada MVP	❌
Reports	✅	❌
Products	✅	❌ (baca produk untuk kasir saja)
Categories	✅	❌ (baca kategori untuk kasir saja)
Employees	✅	❌
Settings	✅	❌
Backup	✅	❌
Export	✅	❌
E.4 Store Isolation

Setiap data harus terkait:

store_id

RLS memastikan user hanya melihat dan memodifikasi data store miliknya.

transaction_items memiliki store_id dengan foreign key komposit (transaction_id, store_id) → transactions(id, store_id), sehingga item dan transaksinya tidak dapat berada di store yang berbeda (DATABASE D.7).

Supabase merekomendasikan RLS pada setiap tabel exposed dan policy terpisah untuk operasi SELECT/INSERT/UPDATE/DELETE yang memang dibutuhkan.

E.5 RLS Principles

Rules:

anon
→ no private data

authenticated
→ only own store, dan hanya jika memiliki profil aktif

owner
→ full permissions within own store

cashier
→ transaction-specific permissions

Helper function:

private.current_store_id() dan private.current_role(), SECURITY DEFINER STABLE, search_path = '', membaca profiles where id = auth.uid() and is_active;
berada di schema private yang tidak diekspos API;
dipanggil di policy sebagai (select private.fn()).

Policy tidak pernah memberikan akses hanya berdasarkan role authenticated tanpa profil aktif.

Matrix per tabel:

stores
  SELECT: anggota store
  UPDATE: Owner
  INSERT/DELETE: tidak ada (client)

profiles
  SELECT: diri sendiri; Owner melihat seluruh profil store
  UPDATE: Owner, kolom name saja
  INSERT/DELETE, perubahan role/store_id/is_active: tidak ada (client) — melalui Edge Function

categories
  SELECT: anggota store
  INSERT/UPDATE/DELETE: Owner

products
  SELECT: anggota store
  INSERT/UPDATE: Owner (category harus dari store yang sama)
  DELETE: tidak ada (tidak ada hard delete pada MVP)

transactions
  SELECT: Owner → seluruh transaksi store; Cashier → cashier_id = auth.uid()
  INSERT/UPDATE/DELETE: tidak ada (client) — hanya melalui RPC create_transaction

transaction_items
  SELECT: mengikuti scope transaksi induk
  INSERT/UPDATE/DELETE: tidak ada (client) — hanya melalui RPC create_transaction

Jangan menggunakan:

using (true)

untuk private business data tanpa pembatasan store.

E.6 Sensitive Operations

Sensitive actions:

change product price;
deactivate product;
employee management;
store settings;
export;
privileged auth management.

Semua harus diverifikasi server/database.

Export: UI export hanya untuk Owner. Karena CSV dibuat di browser dari data yang dapat dibaca user, jaminan server-side untuk export adalah scope baca RLS (E.5). File CSV harus aman dari formula injection (sel yang diawali =, +, -, @ di-escape) dan export profil karyawan tidak boleh memuat credential atau secret.

E.7 Service Role

Service role/secret key (sb_secret_… / service_role):

NEVER IN FRONTEND
NEVER IN PUBLIC REPOSITORY
NEVER IN NEXT_PUBLIC_*

Simpan hanya di:

Supabase Edge Function secret
E.8 Password

Password tidak disimpan di application database.

Supabase Auth yang menangani credential.

MVP tidak bergantung pada pemulihan password berbasis email:

password Cashier di-reset oleh Owner melalui Edge Function;
pemulihan akun Owner menggunakan proses Supabase Dashboard yang terdokumentasi di docs/RUNBOOK.md (dibuat pada Phase 2).

E.9 Session

Session persistence:

enabled

Saat session tidak dapat diperbarui karena perangkat offline:

user tetap di aplikasi dengan identitas tersimpan;
transaksi offline tetap dapat dibuat;
sinkronisasi menunggu sampai session valid berhasil diperbarui.

Saat server secara eksplisit menolak session (expired/revoked), atau user logout:

redirect → login

Transaksi pending tetap tersimpan di perangkat dalam kedua kondisi. Detail: TECHNICAL_SPEC C.12.

Logout (SEC-01):

session selalu dihapus dari perangkat (localStorage key wk-auth, wk-auth-user, wk-auth-code-verifier), termasuk saat offline dengan access token yang sudah kedaluwarsa;
saat online, server diminta mencabut session terlebih dahulu dengan batas tunggu ±4 detik;
saat offline (atau server tidak menjawab), refresh token tidak dapat dicabut di server; token hanya dihapus dari perangkat;
tab lain ikut keluar (event SIGNED_OUT auth-js, atau event storage saat key session dihapus);
outbox tidak pernah disentuh.

E.10 Roles & Accounts

Role tetap; tidak dapat diubah melalui aplikasi.

Tepat satu Owner per store (DATABASE D.3).

Akun Cashier dibuat, diaktifkan/dinonaktifkan, dan di-reset password-nya hanya melalui Edge Function oleh Owner.

Owner menentukan email login dan password Cashier; Cashier tidak wajib memiliki mailbox pribadi yang aktif.

Owner tidak dapat menonaktifkan akunnya sendiri.

Menonaktifkan Cashier:

profiles.is_active = false (berlaku langsung di RLS);
Auth user di-ban agar refresh token tidak dapat dipakai.

Transaksi offline dari Cashier yang sudah dinonaktifkan akan ditolak saat sinkronisasi, ditandai failed, dan tetap tersimpan (tidak dihapus).

E.11 Edge Functions

Setiap Edge Function privileged:

memverifikasi JWT/session caller;
memverifikasi di dalam kode bahwa caller adalah Owner aktif dari store yang sama (platform verify_jwt saja tidak cukup);
tidak pernah membuat role selain cashier;
membatasi CORS ke origin aplikasi;
melakukan kompensasi jika langkah kedua gagal (mis. hapus Auth user yang baru dibuat jika pembuatan profil gagal).

Edge Function tidak digunakan untuk integritas transaksi (gunakan RPC, DATABASE D.9).

E.12 Accepted Risks

Harga snapshot dari client: RPC menerima unit_price dari cache client tanpa membandingkan dengan harga produk saat ini, agar penjualan offline yang sah tetap dapat disinkronkan. Server tetap memvalidasi kepemilikan produk, quantity, aritmetika, dan pembayaran. Risiko: Cashier secara teknis dapat mengirim harga berbeda melalui request langsung.

Session token di localStorage: konsekuensi arsitektur SPA statis. Mitigasi: tanpa script pihak ketiga, tanpa dangerouslySetInnerHTML, Content-Security-Policy melalui header Cloudflare.

Export CSV bukan backup disaster-recovery yang lengkap dan tidak ada fitur restore pada MVP.

Free tier Supabase: project dapat di-pause setelah tidak aktif dan tidak memiliki backup otomatis. Transaksi tetap aman di outbox perangkat sampai project dipulihkan (prosedur di runbook).

E.13 Development Safeguards

.claude/settings.json mewajibkan persetujuan eksplisit (permissions.ask) sebelum Claude menjalankan:

git push;
supabase db push, supabase db reset --linked, supabase functions deploy, supabase secrets set;
wrangler deploy, wrangler pages deploy;

(termasuk varian npx, untuk tool Bash dan PowerShell).

Ini adalah guardrail, bukan security boundary: variasi perintah dengan urutan argumen berbeda (mis. git -C . push) tidak tercakup. Keamanan sebenarnya tetap berada di RLS, RPC, dan Edge Function.

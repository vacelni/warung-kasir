-- WarungKasir local development seed. NEVER run against production.
--
-- Loaded by `supabase db reset` (local only). Every account uses the
-- placeholder password below; production accounts are created through the
-- owner bootstrap in docs/RUNBOOK.md and the admin-cashier Edge Function.
--
--   Store A "Warung Makan Bu Sari"            Store B "Warung Soto Pak Budi"
--   owner.a@warungkasir.test   (owner)        owner.b@warungkasir.test  (owner)
--   kasir1.a@warungkasir.test  (cashier)      kasir1.b@warungkasir.test (cashier)
--   kasir2.a@warungkasir.test  (cashier)      kasir2.b@warungkasir.test (cashier)
--   nonaktif.a@warungkasir.test (cashier, profile inactive)
--
--   Password for all: password123

-- ---------------------------------------------------------------------------
-- Auth users (email/password, confirmed). Token columns must be '' rather
-- than NULL or GoTrue fails to sign the user in.
-- ---------------------------------------------------------------------------
with seed_users (id, email) as (
  values
    ('a1000000-0000-4000-8000-000000000001'::uuid, 'owner.a@warungkasir.test'),
    ('a2000000-0000-4000-8000-000000000001'::uuid, 'kasir1.a@warungkasir.test'),
    ('a2000000-0000-4000-8000-000000000002'::uuid, 'kasir2.a@warungkasir.test'),
    ('a2000000-0000-4000-8000-000000000003'::uuid, 'nonaktif.a@warungkasir.test'),
    ('b1000000-0000-4000-8000-000000000001'::uuid, 'owner.b@warungkasir.test'),
    ('b2000000-0000-4000-8000-000000000001'::uuid, 'kasir1.b@warungkasir.test'),
    ('b2000000-0000-4000-8000-000000000002'::uuid, 'kasir2.b@warungkasir.test')
)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
  extensions.crypt('password123', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', ''
from seed_users;

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select
  u.id::text, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u
where u.email like '%@warungkasir.test';

-- ---------------------------------------------------------------------------
-- Stores and profiles
-- ---------------------------------------------------------------------------
insert into public.stores (id, name, address, phone, receipt_note) values
  ('5a000000-0000-4000-8000-000000000001', 'Warung Makan Bu Sari', 'Jl. Contoh No. 10, Semarang', '081200000001', 'Terima kasih :)'),
  ('5b000000-0000-4000-8000-000000000001', 'Warung Soto Pak Budi', 'Jl. Contoh No. 20, Semarang', '081200000002', null);

-- nonaktif.a simulates a cashier whose profile was deactivated; it exercises
-- the client account validation (SECURITY E.1). Real deactivation through the
-- Edge Function also bans the auth user (E.10).
insert into public.profiles (id, store_id, name, role, is_active) values
  ('a1000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000001', 'Bu Sari', 'owner', true),
  ('a2000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000001', 'Andi', 'cashier', true),
  ('a2000000-0000-4000-8000-000000000002', '5a000000-0000-4000-8000-000000000001', 'Budi', 'cashier', true),
  ('a2000000-0000-4000-8000-000000000003', '5a000000-0000-4000-8000-000000000001', 'Citra', 'cashier', false),
  ('b1000000-0000-4000-8000-000000000001', '5b000000-0000-4000-8000-000000000001', 'Pak Budi', 'owner', true),
  ('b2000000-0000-4000-8000-000000000001', '5b000000-0000-4000-8000-000000000001', 'Dewi', 'cashier', true),
  ('b2000000-0000-4000-8000-000000000002', '5b000000-0000-4000-8000-000000000001', 'Eko', 'cashier', true);

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------
insert into public.categories (id, store_id, name) values
  ('ca000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000001', 'Makanan'),
  ('ca000000-0000-4000-8000-000000000002', '5a000000-0000-4000-8000-000000000001', 'Minuman'),
  ('ca000000-0000-4000-8000-000000000003', '5a000000-0000-4000-8000-000000000001', 'Snack'),
  ('cb000000-0000-4000-8000-000000000001', '5b000000-0000-4000-8000-000000000001', 'Makanan'),
  ('cb000000-0000-4000-8000-000000000002', '5b000000-0000-4000-8000-000000000001', 'Minuman');

insert into public.products (id, store_id, category_id, name, price, is_active) values
  ('d0000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001', 'Nasi Goreng', 15000, true),
  ('d0000000-0000-4000-8000-000000000002', '5a000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001', 'Mie Goreng', 12000, true),
  ('d0000000-0000-4000-8000-000000000003', '5a000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001', 'Ayam Goreng', 18000, true),
  ('d0000000-0000-4000-8000-000000000004', '5a000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000002', 'Es Teh', 5000, true),
  ('d0000000-0000-4000-8000-000000000005', '5a000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000002', 'Es Jeruk', 7000, true),
  ('d0000000-0000-4000-8000-000000000006', '5a000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000003', 'Kerupuk', 2000, true),
  ('d0000000-0000-4000-8000-000000000007', '5a000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001', 'Nasi Rames', 13000, false),
  ('db000000-0000-4000-8000-000000000001', '5b000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001', 'Soto Ayam', 12000, true),
  ('db000000-0000-4000-8000-000000000002', '5b000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000002', 'Teh Hangat', 4000, true);

-- ---------------------------------------------------------------------------
-- Sample history. Seeded directly for development; the app writes
-- transactions only through the create_transaction RPC (Phase 6).
-- Code = TRX-<Asia/Jakarta date>-<first 6 hex of the UUID, uppercase>.
-- ---------------------------------------------------------------------------
insert into public.transactions (id, store_id, cashier_id, code, total, paid_amount, change_amount, created_at) values
  ('3f9a2c4e-7b1d-4c2a-9e10-000000000001', '5a000000-0000-4000-8000-000000000001',
   'a2000000-0000-4000-8000-000000000001', 'TRX-20261007-3F9A2C', 40000, 50000, 10000, '2026-10-07 10:32:00+07'),
  ('8c41e07a-2d3f-4b6e-8a21-000000000002', '5a000000-0000-4000-8000-000000000001',
   'a2000000-0000-4000-8000-000000000002', 'TRX-20261007-8C41E0', 25000, 25000, 0, '2026-10-07 12:05:00+07'),
  ('b7d2093e-5f4a-4e8b-9c32-000000000003', '5b000000-0000-4000-8000-000000000001',
   'b2000000-0000-4000-8000-000000000001', 'TRX-20261007-B7D209', 16000, 20000, 4000, '2026-10-07 09:15:00+07');

insert into public.transaction_items (transaction_id, store_id, product_id, product_name, unit_price, quantity, subtotal) values
  ('3f9a2c4e-7b1d-4c2a-9e10-000000000001', '5a000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Nasi Goreng', 15000, 2, 30000),
  ('3f9a2c4e-7b1d-4c2a-9e10-000000000001', '5a000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000004', 'Es Teh', 5000, 2, 10000),
  ('8c41e07a-2d3f-4b6e-8a21-000000000002', '5a000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003', 'Ayam Goreng', 18000, 1, 18000),
  ('8c41e07a-2d3f-4b6e-8a21-000000000002', '5a000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000005', 'Es Jeruk', 7000, 1, 7000),
  ('b7d2093e-5f4a-4e8b-9c32-000000000003', '5b000000-0000-4000-8000-000000000001', 'db000000-0000-4000-8000-000000000001', 'Soto Ayam', 12000, 1, 12000),
  ('b7d2093e-5f4a-4e8b-9c32-000000000003', '5b000000-0000-4000-8000-000000000001', 'db000000-0000-4000-8000-000000000002', 'Teh Hangat', 4000, 1, 4000);

-- ---------------------------------------------------------------------------
-- Report fixtures (Phase 8 dashboard E2E). A fixed August 2026 window with known answers, far from
-- "today", so the Laporan tests can pick it with the custom date range on any day. Times sit on the
-- Asia/Jakarta day edges on purpose: e2 and e4 fall on a different UTC day than their Jakarta day.
--
--   e1  09 Aug 23:59 WIB  Andi  Kerupuk x1                           Rp2.000   (just before 10 Aug)
--   e2  10 Aug 00:30 WIB  Andi  Nasi Goreng x2, Es Teh x2            Rp40.000
--   e3  10 Aug 23:30 WIB  Budi  Ayam Goreng x1, Es Jeruk x1          Rp25.000
--   e4  11 Aug 00:30 WIB  Andi  Es Teh x3                           Rp15.000
--   e5  11 Aug 12:00 WIB  Andi  Nasi Goreng x10   CANCELLED          Rp150.000 (never counted)
--   e6  13 Aug 11:00 WIB  Budi  Mie Goreng x1, Kerupuk x1            Rp14.000
--   e7  14 Aug 00:00 WIB  Andi  Kerupuk x5                           Rp10.000  (first instant of 14 Aug)
--   f1  10 Aug 10:00 WIB  store B (Dewi)  Soto Ayam x4               Rp48.000  (another store)
--
--   10-11 Aug: omzet 80.000, 3 sales, 9 items, average 26.667 (80000 / 3, rounded)
--   10-13 Aug: omzet 94.000, 4 sales, 11 items, average 23.500; 12 Aug has no sales
-- ---------------------------------------------------------------------------
insert into public.transactions (id, store_id, cashier_id, code, total, paid_amount, change_amount, status, created_at) values
  ('e1000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'TRX-20260809-E10000', 2000, 5000, 3000, 'completed', '2026-08-09 23:59:00+07'),
  ('e2000000-0000-4000-8000-000000000002', '5a000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'TRX-20260810-E20000', 40000, 50000, 10000, 'completed', '2026-08-10 00:30:00+07'),
  ('e3000000-0000-4000-8000-000000000003', '5a000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', 'TRX-20260810-E30000', 25000, 25000, 0, 'completed', '2026-08-10 23:30:00+07'),
  ('e4000000-0000-4000-8000-000000000004', '5a000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'TRX-20260811-E40000', 15000, 20000, 5000, 'completed', '2026-08-11 00:30:00+07'),
  ('e5000000-0000-4000-8000-000000000005', '5a000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'TRX-20260811-E50000', 150000, 150000, 0, 'cancelled', '2026-08-11 12:00:00+07'),
  ('e6000000-0000-4000-8000-000000000006', '5a000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', 'TRX-20260813-E60000', 14000, 20000, 6000, 'completed', '2026-08-13 11:00:00+07'),
  ('e7000000-0000-4000-8000-000000000007', '5a000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'TRX-20260814-E70000', 10000, 10000, 0, 'completed', '2026-08-14 00:00:00+07'),
  ('f1000000-0000-4000-8000-000000000001', '5b000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'TRX-20260810-F10000', 48000, 50000, 2000, 'completed', '2026-08-10 10:00:00+07');

insert into public.transaction_items (transaction_id, store_id, product_id, product_name, unit_price, quantity, subtotal) values
  ('e1000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000006', 'Kerupuk', 2000, 1, 2000),
  ('e2000000-0000-4000-8000-000000000002', '5a000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Nasi Goreng', 15000, 2, 30000),
  ('e2000000-0000-4000-8000-000000000002', '5a000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000004', 'Es Teh', 5000, 2, 10000),
  ('e3000000-0000-4000-8000-000000000003', '5a000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003', 'Ayam Goreng', 18000, 1, 18000),
  ('e3000000-0000-4000-8000-000000000003', '5a000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000005', 'Es Jeruk', 7000, 1, 7000),
  ('e4000000-0000-4000-8000-000000000004', '5a000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000004', 'Es Teh', 5000, 3, 15000),
  ('e5000000-0000-4000-8000-000000000005', '5a000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Nasi Goreng', 15000, 10, 150000),
  ('e6000000-0000-4000-8000-000000000006', '5a000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 'Mie Goreng', 12000, 1, 12000),
  ('e6000000-0000-4000-8000-000000000006', '5a000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000006', 'Kerupuk', 2000, 1, 2000),
  ('e7000000-0000-4000-8000-000000000007', '5a000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000006', 'Kerupuk', 2000, 5, 10000),
  ('f1000000-0000-4000-8000-000000000001', '5b000000-0000-4000-8000-000000000001', 'db000000-0000-4000-8000-000000000001', 'Soto Ayam', 12000, 4, 48000);

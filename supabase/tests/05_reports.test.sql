-- Owner dashboard report functions (Phase 8; TEST_PLAN G.6, G.17; PRD §21; decisions C19, C29, D4, D10).
-- sales_summary, sales_series and top_products are called as the real roles. Fixtures use the -9100-
-- namespace and sit on Asia/Jakarta day edges; every created row is rolled back.
--
-- Store A window W = [10 Mar 00:00 WIB, 12 Mar 00:00 WIB):
--   x0  09 Mar 23:59:59 WIB  Rp3.000   before W
--   x1  10 Mar 00:30 WIB     Rp10.000  P1 x5 @2000          (UTC day: 9 Mar)
--   x2  10 Mar 23:30 WIB     Rp5.001   P2 x1 @5001          (UTC day: 10 Mar)
--   x3  11 Mar 00:30 WIB     Rp99.000  P1 x9 ... CANCELLED  (never counted)
--   x4  11 Mar 12:00 WIB     Rp11.000  P1 x2 @2000 (renamed) + P3 x1 @7000
--   x5  12 Mar 00:00 WIB     Rp7.000   P3 x1                (first instant after W)
--   x7  15 Mar 10:00 WIB     Rp14.000  P3 x1 'Soto' @7000 + P4 x1 'Bakso' @7000
-- Store B: y1  10 Mar 12:00 WIB  Rp50.000  PB x1
begin;
create extension if not exists pgtap with schema extensions;

select plan(46);

create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.act_as(user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_id, 'role', 'authenticated')::text,
    true
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a1000000-0000-4000-9100-000000000001', 'owner.a@reports.test'),
  ('a2000000-0000-4000-9100-000000000001', 'kasir1.a@reports.test'),
  ('b1000000-0000-4000-9100-000000000001', 'owner.b@reports.test'),
  ('c1000000-0000-4000-9100-000000000001', 'noprofile@reports.test');

insert into public.stores (id, name) values
  ('5a000000-0000-4000-9100-000000000001', 'Warung A'),
  ('5b000000-0000-4000-9100-000000000001', 'Warung B');

insert into public.profiles (id, store_id, name, role, is_active) values
  ('a1000000-0000-4000-9100-000000000001', '5a000000-0000-4000-9100-000000000001', 'Owner A', 'owner', true),
  ('a2000000-0000-4000-9100-000000000001', '5a000000-0000-4000-9100-000000000001', 'Kasir A1', 'cashier', true),
  ('b1000000-0000-4000-9100-000000000001', '5b000000-0000-4000-9100-000000000001', 'Owner B', 'owner', true);

insert into public.categories (id, store_id, name) values
  ('ca000000-0000-4000-9100-00000000000a', '5a000000-0000-4000-9100-000000000001', 'Makanan'),
  ('cb000000-0000-4000-9100-00000000000b', '5b000000-0000-4000-9100-000000000001', 'Makanan');

-- The current product names differ from the names on the sales: reports must use the sale snapshot.
insert into public.products (id, store_id, category_id, name, price) values
  ('d1000000-0000-4000-9100-000000000001', '5a000000-0000-4000-9100-000000000001', 'ca000000-0000-4000-9100-00000000000a', 'Nama Produk Sekarang', 2000),
  ('d2000000-0000-4000-9100-000000000002', '5a000000-0000-4000-9100-000000000001', 'ca000000-0000-4000-9100-00000000000a', 'Produk Dua', 5001),
  ('d3000000-0000-4000-9100-000000000003', '5a000000-0000-4000-9100-000000000001', 'ca000000-0000-4000-9100-00000000000a', 'Produk Tiga', 7000),
  ('d4000000-0000-4000-9100-000000000004', '5a000000-0000-4000-9100-000000000001', 'ca000000-0000-4000-9100-00000000000a', 'Produk Empat', 7000),
  ('db000000-0000-4000-9100-00000000000b', '5b000000-0000-4000-9100-000000000001', 'cb000000-0000-4000-9100-00000000000b', 'Produk B', 50000);

insert into public.transactions (id, store_id, cashier_id, code, total, paid_amount, change_amount, status, created_at) values
  ('e0000000-0000-4000-9100-000000000000', '5a000000-0000-4000-9100-000000000001', 'a2000000-0000-4000-9100-000000000001', 'TRX-20260309-E00000', 3000, 3000, 0, 'completed', '2026-03-09 23:59:59+07'),
  ('e1000000-0000-4000-9100-000000000001', '5a000000-0000-4000-9100-000000000001', 'a2000000-0000-4000-9100-000000000001', 'TRX-20260310-E10000', 10000, 10000, 0, 'completed', '2026-03-10 00:30:00+07'),
  ('e2000000-0000-4000-9100-000000000002', '5a000000-0000-4000-9100-000000000001', 'a1000000-0000-4000-9100-000000000001', 'TRX-20260310-E20000', 5001, 6000, 999, 'completed', '2026-03-10 23:30:00+07'),
  ('e3000000-0000-4000-9100-000000000003', '5a000000-0000-4000-9100-000000000001', 'a2000000-0000-4000-9100-000000000001', 'TRX-20260311-E30000', 99000, 99000, 0, 'cancelled', '2026-03-11 00:30:00+07'),
  ('e4000000-0000-4000-9100-000000000004', '5a000000-0000-4000-9100-000000000001', 'a2000000-0000-4000-9100-000000000001', 'TRX-20260311-E40000', 11000, 11000, 0, 'completed', '2026-03-11 12:00:00+07'),
  ('e5000000-0000-4000-9100-000000000005', '5a000000-0000-4000-9100-000000000001', 'a2000000-0000-4000-9100-000000000001', 'TRX-20260312-E50000', 7000, 7000, 0, 'completed', '2026-03-12 00:00:00+07'),
  ('e7000000-0000-4000-9100-000000000007', '5a000000-0000-4000-9100-000000000001', 'a2000000-0000-4000-9100-000000000001', 'TRX-20260315-E70000', 14000, 14000, 0, 'completed', '2026-03-15 10:00:00+07'),
  ('f1000000-0000-4000-9100-000000000001', '5b000000-0000-4000-9100-000000000001', 'b1000000-0000-4000-9100-000000000001', 'TRX-20260310-F10000', 50000, 50000, 0, 'completed', '2026-03-10 12:00:00+07');

insert into public.transaction_items (transaction_id, store_id, product_id, product_name, unit_price, quantity, subtotal) values
  ('e0000000-0000-4000-9100-000000000000', '5a000000-0000-4000-9100-000000000001', 'd1000000-0000-4000-9100-000000000001', 'Nasi', 2000, 1, 2000),
  ('e0000000-0000-4000-9100-000000000000', '5a000000-0000-4000-9100-000000000001', 'd4000000-0000-4000-9100-000000000004', 'Bakso', 1000, 1, 1000),
  ('e1000000-0000-4000-9100-000000000001', '5a000000-0000-4000-9100-000000000001', 'd1000000-0000-4000-9100-000000000001', 'Nasi', 2000, 5, 10000),
  ('e2000000-0000-4000-9100-000000000002', '5a000000-0000-4000-9100-000000000001', 'd2000000-0000-4000-9100-000000000002', 'Produk Dua', 5001, 1, 5001),
  ('e3000000-0000-4000-9100-000000000003', '5a000000-0000-4000-9100-000000000001', 'd1000000-0000-4000-9100-000000000001', 'Nasi', 11000, 9, 99000),
  ('e4000000-0000-4000-9100-000000000004', '5a000000-0000-4000-9100-000000000001', 'd1000000-0000-4000-9100-000000000001', 'Nasi (baru)', 2000, 2, 4000),
  ('e4000000-0000-4000-9100-000000000004', '5a000000-0000-4000-9100-000000000001', 'd3000000-0000-4000-9100-000000000003', 'Produk Tiga', 7000, 1, 7000),
  ('e5000000-0000-4000-9100-000000000005', '5a000000-0000-4000-9100-000000000001', 'd3000000-0000-4000-9100-000000000003', 'Produk Tiga', 7000, 1, 7000),
  ('e7000000-0000-4000-9100-000000000007', '5a000000-0000-4000-9100-000000000001', 'd3000000-0000-4000-9100-000000000003', 'Soto', 7000, 1, 7000),
  ('e7000000-0000-4000-9100-000000000007', '5a000000-0000-4000-9100-000000000001', 'd4000000-0000-4000-9100-000000000004', 'Bakso', 7000, 1, 7000),
  ('f1000000-0000-4000-9100-000000000001', '5b000000-0000-4000-9100-000000000001', 'db000000-0000-4000-9100-00000000000b', 'Produk B', 50000, 1, 50000);

-- ===========================================================================
-- Authorization: the owner reads reports; everyone else is refused
-- ===========================================================================
select tests.act_as('c1000000-0000-4000-9100-000000000001');

select throws_ok(
  $$ select * from public.sales_summary('2026-03-10 00:00+07', '2026-03-12 00:00+07') $$,
  '42501', null, 'a user without a profile cannot read sales_summary'
);

reset role;
select tests.act_as('a2000000-0000-4000-9100-000000000001');

select throws_ok(
  $$ select * from public.sales_summary('2026-03-10 00:00+07', '2026-03-12 00:00+07') $$,
  '42501', null, 'a cashier cannot read sales_summary'
);
select throws_ok(
  $$ select * from public.sales_series('2026-03-10 00:00+07', '2026-03-12 00:00+07', 'day') $$,
  '42501', null, 'a cashier cannot read sales_series'
);
select throws_ok(
  $$ select * from public.top_products('2026-03-10 00:00+07', '2026-03-12 00:00+07') $$,
  '42501', null, 'a cashier cannot read top_products'
);

reset role;
set local role anon;

select throws_ok(
  $$ select * from public.sales_summary('2026-03-10 00:00+07', '2026-03-12 00:00+07') $$,
  '42501', null, 'anon cannot execute sales_summary'
);
select throws_ok(
  $$ select * from public.sales_series('2026-03-10 00:00+07', '2026-03-12 00:00+07', 'day') $$,
  '42501', null, 'anon cannot execute sales_series'
);
select throws_ok(
  $$ select * from public.top_products('2026-03-10 00:00+07', '2026-03-12 00:00+07') $$,
  '42501', null, 'anon cannot execute top_products'
);

reset role;

-- ===========================================================================
-- sales_summary (owner A)
-- ===========================================================================
select tests.act_as('a1000000-0000-4000-9100-000000000001');

select results_eq(
  $$ select revenue, transaction_count, item_count, average_amount
     from public.sales_summary('2026-03-10 00:00+07', '2026-03-12 00:00+07') $$,
  $$ values (26001::bigint, 3::bigint, 9::bigint, 8667::bigint) $$,
  'W: omzet, sales, items and average count x1, x2, x4 only (not the cancelled x3, the 23:59:59 x0 before, the 00:00:00 x5 after, or store B)'
);

select results_eq(
  $$ select revenue, transaction_count, item_count, average_amount
     from public.sales_summary('2026-03-10 00:00+07', '2026-03-11 00:00+07') $$,
  $$ values (15001::bigint, 2::bigint, 6::bigint, 7501::bigint) $$,
  'Jakarta 10 Mar holds the 00:30 and 23:30 WIB sales; 15001 / 2 = 7500.5 rounds half up to 7501'
);

select results_eq(
  $$ select revenue, transaction_count, item_count, average_amount
     from public.sales_summary('2026-03-11 00:00+07', '2026-03-12 00:00+07') $$,
  $$ values (11000::bigint, 1::bigint, 3::bigint, 11000::bigint) $$,
  'Jakarta 11 Mar holds 00:30 WIB (cancelled, ignored) and 12:00 WIB'
);

select results_eq(
  $$ select revenue, transaction_count, item_count, average_amount
     from public.sales_summary('2026-03-09 00:00+07', '2026-03-10 00:00+07') $$,
  $$ values (3000::bigint, 1::bigint, 2::bigint, 3000::bigint) $$,
  '23:59:59 WIB belongs to 9 Mar'
);

select results_eq(
  $$ select revenue, transaction_count, item_count, average_amount
     from public.sales_summary('2026-04-01 00:00+07', '2026-04-02 00:00+07') $$,
  $$ values (0::bigint, 0::bigint, 0::bigint, 0::bigint) $$,
  'a window with no sales returns one row of zeros and an average of Rp0, not NULL'
);

select results_eq(
  $$ select revenue, transaction_count, item_count, average_amount
     from public.sales_summary('2026-03-10 00:00+07', '2026-03-10 00:00:00.000001+07') $$,
  $$ values (0::bigint, 0::bigint, 0::bigint, 0::bigint) $$,
  'the lower bound is inclusive at the instant: 00:30 is after a window that ends at 00:00:00.000001'
);

-- The session timezone must not matter: the same window, evaluated as a UTC session.
set local timezone = 'UTC';
select results_eq(
  $$ select revenue, transaction_count, item_count, average_amount
     from public.sales_summary('2026-03-09T17:00:00Z', '2026-03-10T17:00:00Z') $$,
  $$ values (15001::bigint, 2::bigint, 6::bigint, 7501::bigint) $$,
  'UTC session: the Jakarta day 10 Mar is [09 Mar 17:00Z, 10 Mar 17:00Z) and gives the same answer'
);
set local timezone = 'Asia/Jakarta';

-- ===========================================================================
-- sales_series (owner A)
-- ===========================================================================
select results_eq(
  $$ select bucket_start, revenue, transaction_count
     from public.sales_series('2026-03-10 00:00+07', '2026-03-12 00:00+07', 'day') $$,
  $$ values
       ('2026-03-10 00:00+07'::timestamptz, 15001::bigint, 2::bigint),
       ('2026-03-11 00:00+07'::timestamptz, 11000::bigint, 1::bigint) $$,
  'day series over W: 10 Mar and 11 Mar buckets, cancelled x3 excluded'
);

select results_eq(
  $$ select bucket_start, revenue, transaction_count
     from public.sales_series('2026-03-09 00:00+07', '2026-03-13 00:00+07', 'day') $$,
  $$ values
       ('2026-03-09 00:00+07'::timestamptz, 3000::bigint, 1::bigint),
       ('2026-03-10 00:00+07'::timestamptz, 15001::bigint, 2::bigint),
       ('2026-03-11 00:00+07'::timestamptz, 11000::bigint, 1::bigint),
       ('2026-03-12 00:00+07'::timestamptz, 7000::bigint, 1::bigint) $$,
  'day series: a sale at 23:59:59 WIB lands on its own Jakarta day and one at 00:00:00 WIB on the next'
);

select results_eq(
  $$ select bucket_start, revenue, transaction_count
     from public.sales_series('2026-03-18 00:00+07', '2026-03-21 00:00+07', 'day') $$,
  $$ values
       ('2026-03-18 00:00+07'::timestamptz, 0::bigint, 0::bigint),
       ('2026-03-19 00:00+07'::timestamptz, 0::bigint, 0::bigint),
       ('2026-03-20 00:00+07'::timestamptz, 0::bigint, 0::bigint) $$,
  'day series with no sales is zero-filled, one row per day'
);

select is(
  (select count(*)::int from public.sales_series('2026-03-10 00:00+07', '2026-03-11 00:00+07', 'day')),
  1,
  'a one-day window gives exactly one day bucket'
);

select is(
  (select count(*)::int from public.sales_series('2026-03-10 00:00+07', '2026-03-11 00:00+07', 'hour')),
  24,
  'an hour series over one Jakarta day has 24 buckets'
);

select results_eq(
  $$ select bucket_start, revenue, transaction_count
     from public.sales_series('2026-03-10 00:00+07', '2026-03-11 00:00+07', 'hour')
     where revenue > 0 order by bucket_start $$,
  $$ values
       ('2026-03-10 00:00+07'::timestamptz, 10000::bigint, 1::bigint),
       ('2026-03-10 23:00+07'::timestamptz, 5001::bigint, 1::bigint) $$,
  'hour series: 00:30 WIB is in the 00:00 bucket and 23:30 WIB in the 23:00 bucket'
);

select is(
  (select sum(revenue)::bigint from public.sales_series('2026-03-09 00:00+07', '2026-03-16 00:00+07', 'day')),
  (select revenue from public.sales_summary('2026-03-09 00:00+07', '2026-03-16 00:00+07')),
  'the series adds up to the summary over the same window'
);

set local timezone = 'UTC';
select results_eq(
  $$ select bucket_start, revenue, transaction_count
     from public.sales_series('2026-03-09T17:00:00Z', '2026-03-11T17:00:00Z', 'day') $$,
  $$ values
       ('2026-03-10 00:00+07'::timestamptz, 15001::bigint, 2::bigint),
       ('2026-03-11 00:00+07'::timestamptz, 11000::bigint, 1::bigint) $$,
  'UTC session: buckets are still Jakarta days'
);
set local timezone = 'Asia/Jakarta';

-- ===========================================================================
-- top_products (owner A)
-- ===========================================================================
select results_eq(
  $$ select product_id, product_name, quantity, revenue
     from public.top_products('2026-03-10 00:00+07', '2026-03-12 00:00+07') $$,
  $$ values
       ('d1000000-0000-4000-9100-000000000001'::uuid, 'Nasi (baru)', 7::bigint, 14000::bigint),
       ('d3000000-0000-4000-9100-000000000003'::uuid, 'Produk Tiga', 1::bigint, 7000::bigint),
       ('d2000000-0000-4000-9100-000000000002'::uuid, 'Produk Dua', 1::bigint, 5001::bigint) $$,
  'W: P1 first with 7 units (the 9 cancelled units are not counted), then P3 over P2 on revenue; the name is the latest sale snapshot, not products.name'
);

select results_eq(
  $$ select product_name from public.top_products('2026-03-15 00:00+07', '2026-03-16 00:00+07') $$,
  $$ values ('Bakso'::text), ('Soto'::text) $$,
  'equal units and equal revenue fall back to name order'
);

select results_eq(
  $$ select product_name from public.top_products('2026-03-10 00:00+07', '2026-03-12 00:00+07', 1) $$,
  $$ values ('Nasi (baru)'::text) $$,
  'p_limit caps the list'
);

select is(
  (select count(*)::int from public.top_products('2026-04-01 00:00+07', '2026-04-02 00:00+07')),
  0,
  'a window with no sales returns no products'
);

select is(
  (select sum(revenue)::bigint from public.top_products('2026-03-10 00:00+07', '2026-03-12 00:00+07', 50)),
  26001::bigint,
  'item revenue in W adds up to the omzet'
);

-- ===========================================================================
-- Input validation
-- ===========================================================================
select throws_ok(
  $$ select * from public.sales_summary('2026-03-12 00:00+07', '2026-03-10 00:00+07') $$,
  '22023', null, 'sales_summary: an inverted range is refused'
);
select throws_ok(
  $$ select * from public.sales_summary('2026-03-10 00:00+07', '2026-03-10 00:00+07') $$,
  '22023', null, 'sales_summary: an empty range is refused'
);
select throws_ok(
  $$ select * from public.sales_summary(null, '2026-03-10 00:00+07') $$,
  '22023', null, 'sales_summary: an open range is refused (no unbounded scans)'
);
select throws_ok(
  $$ select * from public.sales_summary('2024-01-01 00:00+07', '2026-03-10 00:00+07') $$,
  '22023', null, 'sales_summary: a range over 366 days is refused'
);
select lives_ok(
  $$ select * from public.sales_summary('2025-03-10 00:00+07', '2026-03-10 00:00+07') $$,
  'sales_summary: 365 days is accepted'
);
select throws_ok(
  $$ select * from public.sales_series('2026-03-10 00:00+07', '2026-03-12 00:00+07', 'week') $$,
  '22023', null, 'sales_series: an unknown bucket is refused'
);
select throws_ok(
  $$ select * from public.sales_series('2026-03-10 00:00+07', '2026-03-13 00:00+07', 'hour') $$,
  '22023', null, 'sales_series: an hour series over 72 hours is refused'
);
select throws_ok(
  $$ select * from public.top_products('2026-03-10 00:00+07', '2026-03-12 00:00+07', 0) $$,
  '22023', null, 'top_products: a limit of 0 is refused'
);
select throws_ok(
  $$ select * from public.top_products('2026-03-12 00:00+07', '2026-03-10 00:00+07') $$,
  '22023', null, 'top_products: an inverted range is refused'
);

-- ===========================================================================
-- Store isolation: owner B sees only store B
-- ===========================================================================
reset role;
select tests.act_as('b1000000-0000-4000-9100-000000000001');

select results_eq(
  $$ select revenue, transaction_count, item_count, average_amount
     from public.sales_summary('2026-03-10 00:00+07', '2026-03-12 00:00+07') $$,
  $$ values (50000::bigint, 1::bigint, 1::bigint, 50000::bigint) $$,
  'owner B: the summary holds only store B sales'
);

select results_eq(
  $$ select product_name, quantity from public.top_products('2026-03-10 00:00+07', '2026-03-12 00:00+07') $$,
  $$ values ('Produk B'::text, 1::bigint) $$,
  'owner B: top products hold only store B products'
);

select results_eq(
  $$ select bucket_start, revenue from public.sales_series('2026-03-10 00:00+07', '2026-03-12 00:00+07', 'day') $$,
  $$ values ('2026-03-10 00:00+07'::timestamptz, 50000::bigint), ('2026-03-11 00:00+07'::timestamptz, 0::bigint) $$,
  'owner B: the series holds only store B sales'
);

-- ===========================================================================
-- Owner A again: nothing of store B, and the report does not depend on a caller-supplied store
-- ===========================================================================
reset role;
select tests.act_as('a1000000-0000-4000-9100-000000000001');

select is(
  (select count(*)::int from public.top_products('2026-03-10 00:00+07', '2026-03-12 00:00+07', 50) where product_name = 'Produk B'),
  0,
  'owner A never sees a store B product'
);

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('sales_summary', 'sales_series', 'top_products')
     and (p.proargnames::text ~ 'store')),
  0,
  'no report function takes a store argument'
);

-- ===========================================================================
-- A deactivated owner is refused (the helpers return NULL for an inactive profile)
-- ===========================================================================
reset role;
update public.profiles set is_active = false where id = 'a1000000-0000-4000-9100-000000000001';
select tests.act_as('a1000000-0000-4000-9100-000000000001');

select throws_ok(
  $$ select * from public.sales_summary('2026-03-10 00:00+07', '2026-03-12 00:00+07') $$,
  '42501', null, 'an inactive owner cannot read sales_summary'
);
select throws_ok(
  $$ select * from public.top_products('2026-03-10 00:00+07', '2026-03-12 00:00+07') $$,
  '42501', null, 'an inactive owner cannot read top_products'
);

reset role;

-- ===========================================================================
-- Grants and security mode
-- ===========================================================================
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('sales_summary', 'sales_series', 'top_products') and p.prosecdef),
  0,
  'report functions are SECURITY INVOKER: every read goes through the caller''s RLS'
);

select ok(
  not has_function_privilege('anon', 'public.sales_summary(timestamptz, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.sales_series(timestamptz, timestamptz, text)', 'execute')
  and not has_function_privilege('anon', 'public.top_products(timestamptz, timestamptz, integer)', 'execute'),
  'anon has no EXECUTE on any report function'
);

select ok(
  has_function_privilege('authenticated', 'public.sales_summary(timestamptz, timestamptz)', 'execute')
  and has_function_privilege('authenticated', 'public.sales_series(timestamptz, timestamptz, text)', 'execute')
  and has_function_privilege('authenticated', 'public.top_products(timestamptz, timestamptz, integer)', 'execute'),
  'authenticated has EXECUTE on the report functions'
);

select * from finish();
rollback;

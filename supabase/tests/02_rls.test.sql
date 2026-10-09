-- RLS allowed/denied tests (SECURITY E.3–E.5, TEST_PLAN G.7, G.8; AC-08, AC-14, AC-15).
-- Fixtures: store A and store B, each with an owner and two cashiers, plus an
-- inactive cashier in A and an authenticated user without a profile. Fixture
-- UUIDs use the -9000- namespace; seeded stores act as further "other stores".
-- Read-only sections run first so the expected counts match the fixtures; the
-- owner write section runs last.
begin;
create extension if not exists pgtap with schema extensions;

select plan(113);

-- ---------------------------------------------------------------------------
-- Impersonation helpers (rolled back with the test transaction)
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to anon, authenticated;
-- Helpers are called as anon/authenticated. Since SEC-08 new functions get no EXECUTE by
-- default (not even through PUBLIC), so grant the helpers of this schema explicitly.
alter default privileges in schema tests grant execute on functions to anon, authenticated;

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

create function tests.act_as_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a1000000-0000-4000-9000-000000000001', 'owner.a@rls.test'),
  ('a2000000-0000-4000-9000-000000000001', 'kasir1.a@rls.test'),
  ('a2000000-0000-4000-9000-000000000002', 'kasir2.a@rls.test'),
  ('a2000000-0000-4000-9000-000000000003', 'nonaktif.a@rls.test'),
  ('b1000000-0000-4000-9000-000000000001', 'owner.b@rls.test'),
  ('b2000000-0000-4000-9000-000000000001', 'kasir1.b@rls.test'),
  ('b2000000-0000-4000-9000-000000000002', 'kasir2.b@rls.test'),
  ('0f000000-0000-4000-9000-000000000001', 'tanpa.profil@rls.test');

insert into public.stores (id, name) values
  ('5a000000-0000-4000-9000-000000000001', 'Warung A'),
  ('5b000000-0000-4000-9000-000000000001', 'Warung B');

insert into public.profiles (id, store_id, name, role, is_active) values
  ('a1000000-0000-4000-9000-000000000001', '5a000000-0000-4000-9000-000000000001', 'Owner A', 'owner', true),
  ('a2000000-0000-4000-9000-000000000001', '5a000000-0000-4000-9000-000000000001', 'Kasir A1', 'cashier', true),
  ('a2000000-0000-4000-9000-000000000002', '5a000000-0000-4000-9000-000000000001', 'Kasir A2', 'cashier', true),
  ('a2000000-0000-4000-9000-000000000003', '5a000000-0000-4000-9000-000000000001', 'Kasir A3', 'cashier', false),
  ('b1000000-0000-4000-9000-000000000001', '5b000000-0000-4000-9000-000000000001', 'Owner B', 'owner', true),
  ('b2000000-0000-4000-9000-000000000001', '5b000000-0000-4000-9000-000000000001', 'Kasir B1', 'cashier', true),
  ('b2000000-0000-4000-9000-000000000002', '5b000000-0000-4000-9000-000000000001', 'Kasir B2', 'cashier', true);

insert into public.categories (id, store_id, name) values
  ('ca000000-0000-4000-9000-00000000000a', '5a000000-0000-4000-9000-000000000001', 'Makanan'),
  ('ca000000-0000-4000-9000-00000000000b', '5a000000-0000-4000-9000-000000000001', 'Minuman'),
  ('ca000000-0000-4000-9000-0000000000aa', '5a000000-0000-4000-9000-000000000001', 'Belum Dipakai'),
  ('cb000000-0000-4000-9000-00000000000a', '5b000000-0000-4000-9000-000000000001', 'Makanan');

insert into public.products (id, store_id, category_id, name, price) values
  ('d0000000-0000-4000-9000-00000000000a', '5a000000-0000-4000-9000-000000000001',
   'ca000000-0000-4000-9000-00000000000a', 'Nasi Goreng', 15000),
  ('d0000000-0000-4000-9000-00000000000b', '5a000000-0000-4000-9000-000000000001',
   'ca000000-0000-4000-9000-00000000000b', 'Es Teh', 5000),
  ('db000000-0000-4000-9000-00000000000a', '5b000000-0000-4000-9000-000000000001',
   'cb000000-0000-4000-9000-00000000000a', 'Soto Ayam', 12000);

insert into public.transactions (id, store_id, cashier_id, code, total, paid_amount, change_amount, created_at) values
  ('7a100000-0000-4000-9000-000000000001', '5a000000-0000-4000-9000-000000000001',
   'a2000000-0000-4000-9000-000000000001', 'TRX-20261007-7A1000', 40000, 50000, 10000, '2026-10-07 10:32:00+07'),
  ('7a200000-0000-4000-9000-000000000001', '5a000000-0000-4000-9000-000000000001',
   'a2000000-0000-4000-9000-000000000002', 'TRX-20261007-7A2000', 15000, 20000, 5000, '2026-10-07 11:00:00+07'),
  ('7b100000-0000-4000-9000-000000000001', '5b000000-0000-4000-9000-000000000001',
   'b2000000-0000-4000-9000-000000000001', 'TRX-20261007-7B1000', 12000, 12000, 0, '2026-10-07 12:00:00+07');

insert into public.transaction_items (transaction_id, store_id, product_id, product_name, unit_price, quantity, subtotal) values
  ('7a100000-0000-4000-9000-000000000001', '5a000000-0000-4000-9000-000000000001',
   'd0000000-0000-4000-9000-00000000000a', 'Nasi Goreng', 15000, 2, 30000),
  ('7a100000-0000-4000-9000-000000000001', '5a000000-0000-4000-9000-000000000001',
   'd0000000-0000-4000-9000-00000000000b', 'Es Teh', 5000, 2, 10000),
  ('7a200000-0000-4000-9000-000000000001', '5a000000-0000-4000-9000-000000000001',
   'd0000000-0000-4000-9000-00000000000a', 'Nasi Goreng', 15000, 1, 15000),
  ('7b100000-0000-4000-9000-000000000001', '5b000000-0000-4000-9000-000000000001',
   'db000000-0000-4000-9000-00000000000a', 'Soto Ayam', 12000, 1, 12000);

-- ===========================================================================
-- anon: no access to any business table
-- ===========================================================================
select tests.act_as_anon();

select throws_ok('select * from public.stores', '42501', null, 'anon cannot read stores');
select throws_ok('select * from public.profiles', '42501', null, 'anon cannot read profiles');
select throws_ok('select * from public.categories', '42501', null, 'anon cannot read categories');
select throws_ok('select * from public.products', '42501', null, 'anon cannot read products');
select throws_ok('select * from public.transactions', '42501', null, 'anon cannot read transactions');
select throws_ok('select * from public.transaction_items', '42501', null, 'anon cannot read transaction_items');
select throws_ok('select private.current_store_id()', '42501', null, 'anon cannot call RLS helpers');

reset role;

-- ===========================================================================
-- Authenticated user without a profile: sees nothing
-- ===========================================================================
select tests.act_as('0f000000-0000-4000-9000-000000000001');

select is((select private.current_store_id()), null::uuid, 'no profile: no store');
select is_empty('select 1 from public.stores', 'no profile: reads no stores');
select is_empty('select 1 from public.profiles', 'no profile: reads no profiles');
select is_empty('select 1 from public.categories', 'no profile: reads no categories');
select is_empty('select 1 from public.products', 'no profile: reads no products');
select is_empty('select 1 from public.transactions', 'no profile: reads no transactions');
select is_empty('select 1 from public.transaction_items', 'no profile: reads no transaction items');

reset role;

-- ===========================================================================
-- Inactive cashier: sees nothing, not even their own profile
-- ===========================================================================
select tests.act_as('a2000000-0000-4000-9000-000000000003');

select is((select private.current_store_id()), null::uuid, 'inactive: no store');
select is((select private.current_role()), null::text, 'inactive: no role');
select is_empty('select 1 from public.stores', 'inactive: reads no stores');
select is_empty('select 1 from public.profiles', 'inactive: reads no profiles (own included)');
select is_empty('select 1 from public.categories', 'inactive: reads no categories');
select is_empty('select 1 from public.products', 'inactive: reads no products');
select is_empty('select 1 from public.transactions', 'inactive: reads no transactions');
select is_empty('select 1 from public.transaction_items', 'inactive: reads no transaction items');

reset role;

-- ===========================================================================
-- Cashier A1: own store, own transactions, no owner operations
-- ===========================================================================
select tests.act_as('a2000000-0000-4000-9000-000000000001');

select is((select private.current_store_id()), '5a000000-0000-4000-9000-000000000001'::uuid, 'cashier A1: store A');
select is((select private.current_role()), 'cashier', 'cashier A1: role cashier');

select results_eq('select id from public.stores',
  $$ values ('5a000000-0000-4000-9000-000000000001'::uuid) $$,
  'cashier A1 reads store A only');
select results_eq('select id from public.profiles',
  $$ values ('a2000000-0000-4000-9000-000000000001'::uuid) $$,
  'cashier A1 reads only their own profile');
select results_eq('select count(*)::int from public.categories', 'values (3)',
  'cashier A1 reads the categories of store A (for the cashier screen)');
select results_eq('select count(*)::int from public.products', 'values (2)',
  'cashier A1 reads the products of store A (for the cashier screen)');
select results_eq('select id from public.transactions',
  $$ values ('7a100000-0000-4000-9000-000000000001'::uuid) $$,
  'cashier A1 reads only their own transactions');
select is_empty($$ select 1 from public.transactions where id = '7a200000-0000-4000-9000-000000000001' $$,
  'cashier A1 cannot read the transactions of cashier A2');
select results_eq('select count(*)::int from public.transaction_items', 'values (2)',
  'cashier A1 reads only the items of their own transactions');
select is_empty($$ select 1 from public.transaction_items where transaction_id = '7a200000-0000-4000-9000-000000000001' $$,
  'cashier A1 cannot read the items of cashier A2');
select is_empty($$ select 1 from public.stores where id = '5b000000-0000-4000-9000-000000000001' $$,
  'cashier A1 cannot read store B');
select is_empty($$ select 1 from public.products where store_id = '5b000000-0000-4000-9000-000000000001' $$,
  'cashier A1 cannot read store B products');

-- Owner-only writes are denied.
with u as (
  update public.products set price = 1 where id = 'd0000000-0000-4000-9000-00000000000a' returning 1
)
select is(count(*)::int, 0, 'cashier A1 cannot change a product price') from u;

with u as (
  update public.products set is_active = false where id = 'd0000000-0000-4000-9000-00000000000a' returning 1
)
select is(count(*)::int, 0, 'cashier A1 cannot deactivate a product') from u;

select throws_ok(
  $$ insert into public.products (store_id, category_id, name, price)
     values ('5a000000-0000-4000-9000-000000000001', 'ca000000-0000-4000-9000-00000000000a', 'Mie Goreng', 12000) $$,
  '42501', null,
  'cashier A1 cannot create products');

select throws_ok(
  $$ delete from public.products where id = 'd0000000-0000-4000-9000-00000000000a' $$,
  '42501', null,
  'cashier A1 cannot delete products');

select throws_ok(
  $$ insert into public.categories (store_id, name) values ('5a000000-0000-4000-9000-000000000001', 'Snack') $$,
  '42501', null,
  'cashier A1 cannot create categories');

with u as (
  update public.categories set name = 'Diubah' where id = 'ca000000-0000-4000-9000-00000000000a' returning 1
)
select is(count(*)::int, 0, 'cashier A1 cannot rename categories') from u;

with d as (
  delete from public.categories where id = 'ca000000-0000-4000-9000-0000000000aa' returning 1
)
select is(count(*)::int, 0, 'cashier A1 cannot delete categories') from d;

with u as (
  update public.stores set name = 'Diubah' where id = '5a000000-0000-4000-9000-000000000001' returning 1
)
select is(count(*)::int, 0, 'cashier A1 cannot change store settings') from u;

with u as (
  update public.profiles set name = 'Diubah' where id = 'a2000000-0000-4000-9000-000000000001' returning 1
)
select is(count(*)::int, 0, 'cashier A1 cannot edit profiles (own included)') from u;

select throws_ok(
  $$ update public.profiles set role = 'owner' where id = 'a2000000-0000-4000-9000-000000000001' $$,
  '42501', null,
  'cashier A1 cannot promote themselves to owner');

select throws_ok(
  $$ update public.profiles set is_active = true where id = 'a2000000-0000-4000-9000-000000000003' $$,
  '42501', null,
  'cashier A1 cannot activate accounts');

select throws_ok(
  $$ insert into public.profiles (id, store_id, name, role)
     values ('0f000000-0000-4000-9000-000000000001', '5a000000-0000-4000-9000-000000000001', 'Baru', 'cashier') $$,
  '42501', null,
  'cashier A1 cannot create profiles');

select throws_ok(
  $$ insert into public.transactions (id, store_id, cashier_id, code, total, paid_amount, change_amount, created_at)
     values (gen_random_uuid(), '5a000000-0000-4000-9000-000000000001', 'a2000000-0000-4000-9000-000000000001',
             'TRX-20261008-000000', 5000, 5000, 0, now()) $$,
  '42501', null,
  'cashier A1 cannot insert transactions directly (RPC only)');

select throws_ok(
  $$ insert into public.transaction_items (transaction_id, store_id, product_id, product_name, unit_price, quantity, subtotal)
     values ('7a100000-0000-4000-9000-000000000001', '5a000000-0000-4000-9000-000000000001',
             'd0000000-0000-4000-9000-00000000000b', 'Es Teh', 5000, 1, 5000) $$,
  '42501', null,
  'cashier A1 cannot insert transaction items directly');

select throws_ok(
  $$ update public.transactions set paid_amount = 40000, change_amount = 0
     where id = '7a100000-0000-4000-9000-000000000001' $$,
  '42501', null,
  'cashier A1 cannot edit their own transaction');

select throws_ok(
  $$ delete from public.transactions where id = '7a100000-0000-4000-9000-000000000001' $$,
  '42501', null,
  'cashier A1 cannot delete their own transaction');

reset role;

select is(
  (select price from public.products where id = 'd0000000-0000-4000-9000-00000000000a'),
  15000,
  'the price is unchanged after the cashier attempts');
select is(
  (select is_active from public.products where id = 'd0000000-0000-4000-9000-00000000000a'),
  true,
  'the product is still active after the cashier attempts');
select isnt_empty(
  $$ select 1 from public.categories where id = 'ca000000-0000-4000-9000-0000000000aa' $$,
  'the category still exists after the cashier attempts');

-- ===========================================================================
-- Cashier A2: symmetric own-transaction scope
-- ===========================================================================
select tests.act_as('a2000000-0000-4000-9000-000000000002');

select results_eq('select id from public.transactions',
  $$ values ('7a200000-0000-4000-9000-000000000001'::uuid) $$,
  'cashier A2 reads only their own transactions');
select is_empty($$ select 1 from public.profiles where id = 'a2000000-0000-4000-9000-000000000001' $$,
  'cashier A2 cannot read the profile of cashier A1');

reset role;

-- ===========================================================================
-- Store B users cannot see store A
-- ===========================================================================
select tests.act_as('b1000000-0000-4000-9000-000000000001');

select results_eq('select id from public.stores',
  $$ values ('5b000000-0000-4000-9000-000000000001'::uuid) $$,
  'owner B reads store B only');
select is_empty($$ select 1 from public.profiles where store_id = '5a000000-0000-4000-9000-000000000001' $$,
  'owner B cannot read store A profiles');
select is_empty($$ select 1 from public.categories where store_id = '5a000000-0000-4000-9000-000000000001' $$,
  'owner B cannot read store A categories');
select is_empty($$ select 1 from public.products where store_id = '5a000000-0000-4000-9000-000000000001' $$,
  'owner B cannot read store A products');
select is_empty($$ select 1 from public.transactions where store_id = '5a000000-0000-4000-9000-000000000001' $$,
  'owner B cannot read store A transactions');
select is_empty($$ select 1 from public.transaction_items where store_id = '5a000000-0000-4000-9000-000000000001' $$,
  'owner B cannot read store A transaction items');

with u as (
  update public.products set price = 1 where id = 'd0000000-0000-4000-9000-00000000000a' returning 1
)
select is(count(*)::int, 0, 'owner B cannot change store A prices') from u;

with u as (
  update public.profiles set name = 'Diambil' where id = 'a2000000-0000-4000-9000-000000000001' returning 1
)
select is(count(*)::int, 0, 'owner B cannot rename store A cashiers') from u;

reset role;

select tests.act_as('b2000000-0000-4000-9000-000000000001');

select results_eq('select id from public.transactions',
  $$ values ('7b100000-0000-4000-9000-000000000001'::uuid) $$,
  'cashier B1 reads only their own transaction in store B');
select is_empty($$ select 1 from public.products where store_id = '5a000000-0000-4000-9000-000000000001' $$,
  'cashier B1 cannot read store A products');

reset role;

-- ===========================================================================
-- Owner A: full access within store A only
-- ===========================================================================
select tests.act_as('a1000000-0000-4000-9000-000000000001');

select is((select private.current_role()), 'owner', 'owner A: role owner');
select results_eq('select id from public.stores',
  $$ values ('5a000000-0000-4000-9000-000000000001'::uuid) $$,
  'owner A reads store A only');
select results_eq('select count(*)::int from public.profiles', 'values (4)',
  'owner A reads every profile of store A, inactive included');
select is_empty($$ select 1 from public.profiles where store_id = '5b000000-0000-4000-9000-000000000001' $$,
  'owner A cannot read store B profiles');
select results_eq('select count(*)::int from public.categories', 'values (3)',
  'owner A reads the categories of store A only');
select results_eq('select count(*)::int from public.products', 'values (2)',
  'owner A reads the products of store A only');
select results_eq('select id from public.transactions order by id',
  $$ values ('7a100000-0000-4000-9000-000000000001'::uuid), ('7a200000-0000-4000-9000-000000000001'::uuid) $$,
  'owner A reads every transaction of store A');
select results_eq('select count(*)::int from public.transaction_items', 'values (3)',
  'owner A reads every transaction item of store A');
select is_empty($$ select 1 from public.transactions where store_id = '5b000000-0000-4000-9000-000000000001' $$,
  'owner A cannot read store B transactions');

-- Store settings
with u as (
  update public.stores set name = 'Warung Makan Bu Sari', receipt_note = 'Terima kasih :)'
  where id = '5a000000-0000-4000-9000-000000000001' returning 1
)
select is(count(*)::int, 1, 'owner A updates the store profile') from u;

with u as (
  update public.stores set name = 'Diambil' where id = '5b000000-0000-4000-9000-000000000001' returning 1
)
select is(count(*)::int, 0, 'owner A cannot update store B') from u;

select throws_ok(
  $$ insert into public.stores (name) values ('Cabang Baru') $$,
  '42501', null,
  'owner A cannot create stores (single store, no multi-store)');

select throws_ok(
  $$ delete from public.stores where id = '5a000000-0000-4000-9000-000000000001' $$,
  '42501', null,
  'owner A cannot delete the store');

-- Categories
select lives_ok(
  $$ insert into public.categories (store_id, name) values ('5a000000-0000-4000-9000-000000000001', 'Snack') $$,
  'owner A creates a category');

select throws_ok(
  $$ insert into public.categories (store_id, name) values ('5b000000-0000-4000-9000-000000000001', 'Snack') $$,
  '42501', null,
  'owner A cannot create a category in store B');

with u as (
  update public.categories set name = 'Makanan Berat' where id = 'ca000000-0000-4000-9000-00000000000a' returning 1
)
select is(count(*)::int, 1, 'owner A renames a category') from u;

with d as (
  delete from public.categories where id = 'ca000000-0000-4000-9000-0000000000aa' returning 1
)
select is(count(*)::int, 1, 'owner A deletes an unused category') from d;

select throws_ok(
  $$ delete from public.categories where id = 'ca000000-0000-4000-9000-00000000000b' $$,
  '23503', null,
  'owner A cannot delete a category that is still used by a product');

with d as (
  delete from public.categories where id = 'cb000000-0000-4000-9000-00000000000a' returning 1
)
select is(count(*)::int, 0, 'owner A cannot delete store B categories') from d;

-- Products
select lives_ok(
  $$ insert into public.products (store_id, category_id, name, price)
     values ('5a000000-0000-4000-9000-000000000001', 'ca000000-0000-4000-9000-00000000000a', 'Mie Goreng', 12000) $$,
  'owner A creates a product');

select throws_ok(
  $$ insert into public.products (store_id, category_id, name, price)
     values ('5a000000-0000-4000-9000-000000000001', 'cb000000-0000-4000-9000-00000000000a', 'Salah Kategori', 12000) $$,
  '42501', null,
  'owner A cannot create a product with a store B category');

select throws_ok(
  $$ insert into public.products (store_id, category_id, name, price)
     values ('5b000000-0000-4000-9000-000000000001', 'cb000000-0000-4000-9000-00000000000a', 'Titipan', 12000) $$,
  '42501', null,
  'owner A cannot create a product in store B');

with u as (
  update public.products set price = 16000 where id = 'd0000000-0000-4000-9000-00000000000a' returning price
)
select is(max(price), 16000, 'owner A changes a price') from u;

select throws_ok(
  $$ update public.products set category_id = 'cb000000-0000-4000-9000-00000000000a'
     where id = 'd0000000-0000-4000-9000-00000000000a' $$,
  '42501', null,
  'owner A cannot move a product into a store B category');

select throws_ok(
  $$ update public.products set store_id = '5b000000-0000-4000-9000-000000000001'
     where id = 'd0000000-0000-4000-9000-00000000000a' $$,
  '42501', null,
  'owner A cannot move a product to another store');

with u as (
  update public.products set price = 1 where id = 'db000000-0000-4000-9000-00000000000a' returning 1
)
select is(count(*)::int, 0, 'owner A cannot change store B prices') from u;

with u as (
  update public.products set is_active = false where id = 'd0000000-0000-4000-9000-00000000000b' returning is_active
)
select is(bool_and(is_active), false, 'owner A deactivates a product') from u;

select results_eq(
  $$ select count(*)::int from public.transaction_items where product_id = 'd0000000-0000-4000-9000-00000000000b' $$,
  'values (1)',
  'the deactivated product keeps its historical items');

with u as (
  update public.products set is_active = true where id = 'd0000000-0000-4000-9000-00000000000b' returning is_active
)
select is(bool_and(is_active), true, 'owner A reactivates a product') from u;

select throws_ok(
  $$ delete from public.products where id = 'd0000000-0000-4000-9000-00000000000b' $$,
  '42501', null,
  'owner A cannot hard-delete products');

select results_eq(
  $$ select unit_price from public.transaction_items
     where transaction_id = '7a100000-0000-4000-9000-000000000001'
       and product_id = 'd0000000-0000-4000-9000-00000000000a' $$,
  'values (15000)',
  'historical unit_price is unchanged after the owner changes the price');

-- Profiles
with u as (
  update public.profiles set name = 'Andi' where id = 'a2000000-0000-4000-9000-000000000001' returning 1
)
select is(count(*)::int, 1, 'owner A renames a cashier') from u;

with u as (
  update public.profiles set name = 'Diambil' where id = 'b2000000-0000-4000-9000-000000000001' returning 1
)
select is(count(*)::int, 0, 'owner A cannot rename store B cashiers') from u;

select throws_ok(
  $$ update public.profiles set role = 'owner' where id = 'a2000000-0000-4000-9000-000000000001' $$,
  '42501', null,
  'owner A cannot change a role');

select throws_ok(
  $$ update public.profiles set is_active = false where id = 'a1000000-0000-4000-9000-000000000001' $$,
  '42501', null,
  'owner A cannot deactivate their own account');

select throws_ok(
  $$ update public.profiles set is_active = false where id = 'a2000000-0000-4000-9000-000000000002' $$,
  '42501', null,
  'owner A cannot change is_active through the Data API (Edge Function only)');

select throws_ok(
  $$ update public.profiles set store_id = '5b000000-0000-4000-9000-000000000001'
     where id = 'a2000000-0000-4000-9000-000000000001' $$,
  '42501', null,
  'owner A cannot move a profile to another store');

select throws_ok(
  $$ insert into public.profiles (id, store_id, name, role)
     values ('0f000000-0000-4000-9000-000000000001', '5a000000-0000-4000-9000-000000000001', 'Baru', 'cashier') $$,
  '42501', null,
  'owner A cannot create profiles directly (Edge Function only)');

select throws_ok(
  $$ delete from public.profiles where id = 'a2000000-0000-4000-9000-000000000002' $$,
  '42501', null,
  'owner A cannot delete profiles');

-- Transactions are read-only for every client.
select throws_ok(
  $$ insert into public.transactions (id, store_id, cashier_id, code, total, paid_amount, change_amount, created_at)
     values (gen_random_uuid(), '5a000000-0000-4000-9000-000000000001', 'a1000000-0000-4000-9000-000000000001',
             'TRX-20261008-000000', 5000, 5000, 0, now()) $$,
  '42501', null,
  'owner A cannot insert transactions directly (RPC only)');

select throws_ok(
  $$ update public.transactions set status = 'cancelled' where id = '7a100000-0000-4000-9000-000000000001' $$,
  '42501', null,
  'owner A cannot cancel or edit transactions');

select throws_ok(
  $$ delete from public.transactions where id = '7a100000-0000-4000-9000-000000000001' $$,
  '42501', null,
  'owner A cannot delete transactions');

select throws_ok(
  $$ insert into public.transaction_items (transaction_id, store_id, product_id, product_name, unit_price, quantity, subtotal)
     values ('7a100000-0000-4000-9000-000000000001', '5a000000-0000-4000-9000-000000000001',
             'd0000000-0000-4000-9000-00000000000b', 'Es Teh', 5000, 1, 5000) $$,
  '42501', null,
  'owner A cannot insert transaction items directly');

select throws_ok(
  $$ update public.transaction_items set unit_price = 1, subtotal = 2
     where transaction_id = '7a100000-0000-4000-9000-000000000001' $$,
  '42501', null,
  'owner A cannot edit historical items');

select throws_ok(
  $$ delete from public.transaction_items where transaction_id = '7a100000-0000-4000-9000-000000000001' $$,
  '42501', null,
  'owner A cannot delete historical items');

select throws_ok(
  'truncate public.transaction_items',
  '42501', null,
  'owner A cannot truncate business tables');

reset role;

-- ===========================================================================
-- Deactivation takes effect immediately (SECURITY E.10)
-- ===========================================================================
update public.profiles set is_active = false where id = 'a2000000-0000-4000-9000-000000000002';

select tests.act_as('a2000000-0000-4000-9000-000000000002');

select is_empty('select 1 from public.transactions', 'a just-deactivated cashier loses access to their transactions');
select is_empty('select 1 from public.products', 'a just-deactivated cashier loses access to products');

reset role;

select * from finish();
rollback;

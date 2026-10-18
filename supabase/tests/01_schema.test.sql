-- Schema, constraint, and privilege tests (DATABASE D.2–D.11, TEST_PLAN G.5, G.8).
-- Runs as postgres inside a transaction that is rolled back. Fixture UUIDs use
-- the -9000- namespace so they never collide with supabase/seed.sql.
begin;
create extension if not exists pgtap with schema extensions;

select plan(75);

-- ---------------------------------------------------------------------------
-- Fixtures: store A (owner + cashier) and store B (owner).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a1000000-0000-4000-9000-000000000001', 'owner.a@schema.test'),
  ('a2000000-0000-4000-9000-000000000001', 'kasir1.a@schema.test'),
  ('a2000000-0000-4000-9000-000000000009', 'extra.a@schema.test'),
  ('b1000000-0000-4000-9000-000000000001', 'owner.b@schema.test');

insert into public.stores (id, name) values
  ('5a000000-0000-4000-9000-000000000001', 'Warung A'),
  ('5b000000-0000-4000-9000-000000000001', 'Warung B');

insert into public.profiles (id, store_id, name, role) values
  ('a1000000-0000-4000-9000-000000000001', '5a000000-0000-4000-9000-000000000001', 'Owner A', 'owner'),
  ('a2000000-0000-4000-9000-000000000001', '5a000000-0000-4000-9000-000000000001', 'Kasir A1', 'cashier'),
  ('b1000000-0000-4000-9000-000000000001', '5b000000-0000-4000-9000-000000000001', 'Owner B', 'owner');

insert into public.categories (id, store_id, name) values
  ('ca000000-0000-4000-9000-00000000000a', '5a000000-0000-4000-9000-000000000001', 'Makanan'),
  ('ca000000-0000-4000-9000-0000000000aa', '5a000000-0000-4000-9000-000000000001', 'Kosong');

insert into public.products (id, store_id, category_id, name, price, updated_at) values
  ('d0000000-0000-4000-9000-00000000000a', '5a000000-0000-4000-9000-000000000001',
   'ca000000-0000-4000-9000-00000000000a', 'Nasi Goreng', 15000, '2000-01-01 00:00:00+00');

insert into public.transactions (id, store_id, cashier_id, code, total, paid_amount, change_amount, created_at) values
  ('3f9a2c4e-0000-4000-9000-000000000001', '5a000000-0000-4000-9000-000000000001',
   'a2000000-0000-4000-9000-000000000001', 'TRX-20261007-3F9A2C', 30000, 50000, 20000,
   '2026-10-07 10:32:00+07');

insert into public.transaction_items (transaction_id, store_id, product_id, product_name, unit_price, quantity, subtotal) values
  ('3f9a2c4e-0000-4000-9000-000000000001', '5a000000-0000-4000-9000-000000000001',
   'd0000000-0000-4000-9000-00000000000a', 'Nasi Goreng', 15000, 2, 30000);

-- ---------------------------------------------------------------------------
-- Tables, RLS, helpers
-- ---------------------------------------------------------------------------
select tables_are(
  'public',
  array[
    'stores', 'profiles', 'categories', 'products', 'transactions', 'transaction_items',
    'option_groups', 'option_choices', 'product_option_groups'
  ],
  'public schema has exactly the six MVP tables plus the three product-option tables (D.12)'
);

select is_empty(
  $$ select c.relname from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity $$,
  'RLS is enabled on every public table'
);

select is(
  (select prosecdef from pg_proc where oid = 'private.current_store_id()'::regprocedure),
  true,
  'private.current_store_id() is SECURITY DEFINER'
);

select is(
  (select prosecdef from pg_proc where oid = 'private.current_role()'::regprocedure),
  true,
  'private.current_role() is SECURITY DEFINER'
);

select ok(
  (select proconfig @> array['search_path=""'] from pg_proc where oid = 'private.current_store_id()'::regprocedure)
  and (select proconfig @> array['search_path=""'] from pg_proc where oid = 'private.current_role()'::regprocedure),
  'RLS helpers pin search_path to empty'
);

select is(
  (select provolatile from pg_proc where oid = 'private.current_store_id()'::regprocedure)::text,
  's',
  'private.current_store_id() is STABLE'
);

select ok(
  not has_function_privilege('anon', 'private.current_store_id()', 'execute')
  and not has_function_privilege('anon', 'private.current_role()', 'execute'),
  'anon cannot execute the RLS helpers'
);

select ok(
  not has_schema_privilege('anon', 'private', 'usage'),
  'anon has no usage on the private schema'
);

-- ---------------------------------------------------------------------------
-- Grants (D.11)
-- ---------------------------------------------------------------------------
select table_privs_are('public', 'stores', 'anon', array[]::text[], 'anon: no privileges on stores');
select table_privs_are('public', 'profiles', 'anon', array[]::text[], 'anon: no privileges on profiles');
select table_privs_are('public', 'categories', 'anon', array[]::text[], 'anon: no privileges on categories');
select table_privs_are('public', 'products', 'anon', array[]::text[], 'anon: no privileges on products');
select table_privs_are('public', 'transactions', 'anon', array[]::text[], 'anon: no privileges on transactions');
select table_privs_are('public', 'transaction_items', 'anon', array[]::text[], 'anon: no privileges on transaction_items');

select table_privs_are('public', 'transactions', 'authenticated', array['SELECT'],
  'authenticated: transactions are read-only (writes only through the RPC)');
select table_privs_are('public', 'transaction_items', 'authenticated', array['SELECT'],
  'authenticated: transaction_items are read-only (writes only through the RPC)');
select table_privs_are('public', 'products', 'authenticated', array['SELECT'],
  'authenticated: no table-wide write and no DELETE on products');
select table_privs_are('public', 'profiles', 'authenticated', array['SELECT'],
  'authenticated: no table-wide write on profiles');
select table_privs_are('public', 'stores', 'authenticated', array['SELECT'],
  'authenticated: no table-wide write on stores');
select table_privs_are('public', 'categories', 'authenticated', array['DELETE', 'SELECT'],
  'authenticated: categories have table-wide SELECT and DELETE only');

select column_privs_are('public', 'profiles', 'name', 'authenticated', array['SELECT', 'UPDATE'],
  'authenticated may update profiles.name');
select column_privs_are('public', 'profiles', 'role', 'authenticated', array['SELECT'],
  'authenticated may not write profiles.role');
select column_privs_are('public', 'profiles', 'is_active', 'authenticated', array['SELECT'],
  'authenticated may not write profiles.is_active');
select column_privs_are('public', 'profiles', 'store_id', 'authenticated', array['SELECT'],
  'authenticated may not write profiles.store_id');
select column_privs_are('public', 'products', 'store_id', 'authenticated', array['INSERT', 'SELECT'],
  'products.store_id is set on insert and never updated by clients');
select column_privs_are('public', 'products', 'price', 'authenticated', array['INSERT', 'SELECT', 'UPDATE'],
  'products.price is writable (RLS limits it to the owner)');

-- ---------------------------------------------------------------------------
-- Profiles and roles (D.3)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.profiles (id, store_id, name, role)
     values ('a2000000-0000-4000-9000-000000000009', '5a000000-0000-4000-9000-000000000001', 'Owner Kedua', 'owner') $$,
  '23505', null,
  'a second owner in the same store is rejected'
);

select throws_ok(
  $$ insert into public.profiles (id, store_id, name, role)
     values ('a2000000-0000-4000-9000-000000000009', '5a000000-0000-4000-9000-000000000001', 'Admin', 'admin') $$,
  '23514', null,
  'roles other than owner/cashier are rejected'
);

select throws_ok(
  $$ insert into public.profiles (id, store_id, name, role)
     values ('a2000000-0000-4000-9000-000000000009', '5a000000-0000-4000-9000-000000000001', '   ', 'cashier') $$,
  '23514', null,
  'blank profile names are rejected'
);

select throws_ok(
  $$ delete from auth.users where id = 'a2000000-0000-4000-9000-000000000001' $$,
  '23503', null,
  'an auth user with a profile cannot be deleted (deactivate instead)'
);

-- ---------------------------------------------------------------------------
-- Money constraints: products (D.5)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.products (store_id, category_id, name, price)
     values ('5a000000-0000-4000-9000-000000000001', 'ca000000-0000-4000-9000-00000000000a', 'Gratis', 0) $$,
  '23514', null,
  'product price 0 is rejected'
);

select throws_ok(
  $$ insert into public.products (store_id, category_id, name, price)
     values ('5a000000-0000-4000-9000-000000000001', 'ca000000-0000-4000-9000-00000000000a', 'Minus', -1000) $$,
  '23514', null,
  'negative product price is rejected'
);

select throws_ok(
  $$ insert into public.products (store_id, category_id, name, price)
     values ('5a000000-0000-4000-9000-000000000001', 'ca000000-0000-4000-9000-00000000000a', 'Mahal', 2147483648) $$,
  '22003', null,
  'product price beyond the integer limit is rejected'
);

select throws_ok(
  $$ insert into public.products (store_id, category_id, name, price)
     values ('5a000000-0000-4000-9000-000000000001', 'ca000000-0000-4000-9000-00000000000a', 'Pecahan', '15000.5') $$,
  '22P02', null,
  'fractional Rupiah (as sent in JSON by the Data API) is rejected'
);

-- ---------------------------------------------------------------------------
-- Money constraints: transactions (D.6)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.transactions (id, store_id, cashier_id, code, total, paid_amount, change_amount, created_at)
     values (gen_random_uuid(), '5a000000-0000-4000-9000-000000000001', 'a2000000-0000-4000-9000-000000000001',
             'TRX-20261007-000000', 0, 0, 0, now()) $$,
  '23514', null,
  'transaction total 0 is rejected'
);

select throws_ok(
  $$ insert into public.transactions (id, store_id, cashier_id, code, total, paid_amount, change_amount, created_at)
     values (gen_random_uuid(), '5a000000-0000-4000-9000-000000000001', 'a2000000-0000-4000-9000-000000000001',
             'TRX-20261007-000000', 40000, 30000, -10000, now()) $$,
  '23514', null,
  'underpayment (paid_amount < total) is rejected'
);

select throws_ok(
  $$ insert into public.transactions (id, store_id, cashier_id, code, total, paid_amount, change_amount, created_at)
     values (gen_random_uuid(), '5a000000-0000-4000-9000-000000000001', 'a2000000-0000-4000-9000-000000000001',
             'TRX-20261007-000000', 40000, 50000, 5000, now()) $$,
  '23514', null,
  'change_amount must equal paid_amount - total'
);

select lives_ok(
  $$ insert into public.transactions (id, store_id, cashier_id, code, total, paid_amount, change_amount, created_at)
     values ('00000000-0000-4000-9000-0000000000a0', '5a000000-0000-4000-9000-000000000001',
             'a2000000-0000-4000-9000-000000000001', 'TRX-20261007-000000', 40000, 40000, 0, now()) $$,
  'exact payment (change 0) is accepted'
);

select throws_ok(
  $$ insert into public.transactions (id, store_id, cashier_id, code, total, paid_amount, change_amount, status, created_at)
     values (gen_random_uuid(), '5a000000-0000-4000-9000-000000000001', 'a2000000-0000-4000-9000-000000000001',
             'TRX-20261007-000000', 40000, 50000, 10000, 'pending', now()) $$,
  '23514', null,
  'sync statuses are never valid server statuses'
);

select is(
  (select status from public.transactions where id = '3f9a2c4e-0000-4000-9000-000000000001'),
  'completed',
  'server status defaults to completed'
);

select throws_ok(
  $$ insert into public.transactions (id, store_id, cashier_id, code, total, paid_amount, change_amount, created_at)
     values ('3f9a2c4e-0000-4000-9000-000000000001', '5a000000-0000-4000-9000-000000000001',
             'a2000000-0000-4000-9000-000000000001', 'TRX-20261007-3F9A2C', 30000, 50000, 20000, now()) $$,
  '23505', null,
  'the same transaction UUID cannot be stored twice'
);

select lives_ok(
  $$ insert into public.transactions (id, store_id, cashier_id, code, total, paid_amount, change_amount, created_at)
     values ('3f9a2c4e-0000-4000-9000-0000000000ff', '5a000000-0000-4000-9000-000000000001',
             'a2000000-0000-4000-9000-000000000001', 'TRX-20261007-3F9A2C', 5000, 5000, 0, now()) $$,
  'display code is not unique (UUID is the identity)'
);

select throws_ok(
  $$ insert into public.transactions (id, store_id, cashier_id, code, total, paid_amount, change_amount)
     values (gen_random_uuid(), '5a000000-0000-4000-9000-000000000001', 'a2000000-0000-4000-9000-000000000001',
             'TRX-20261007-000000', 5000, 5000, 0) $$,
  '23502', null,
  'created_at (sale time) is required and has no server default'
);

select is(
  (select created_at from public.transactions where id = '3f9a2c4e-0000-4000-9000-000000000001'),
  '2026-10-07 10:32:00+07'::timestamptz,
  'created_at keeps the client sale time'
);

select is(
  (select synced_at from public.transactions where id = '3f9a2c4e-0000-4000-9000-000000000001'),
  now(),
  'synced_at is set by the server'
);

-- ---------------------------------------------------------------------------
-- Money constraints: transaction_items (D.7)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.transaction_items (transaction_id, store_id, product_id, product_name, unit_price, quantity, subtotal)
     values ('3f9a2c4e-0000-4000-9000-000000000001', '5a000000-0000-4000-9000-000000000001',
             'd0000000-0000-4000-9000-00000000000a', 'Nasi Goreng', 15000, 0, 0) $$,
  '23514', null,
  'quantity 0 is rejected'
);

select throws_ok(
  $$ insert into public.transaction_items (transaction_id, store_id, product_id, product_name, unit_price, quantity, subtotal)
     values ('3f9a2c4e-0000-4000-9000-000000000001', '5a000000-0000-4000-9000-000000000001',
             'd0000000-0000-4000-9000-00000000000a', 'Nasi Goreng', 15000, -1, -15000) $$,
  '23514', null,
  'negative quantity is rejected'
);

select throws_ok(
  $$ insert into public.transaction_items (transaction_id, store_id, product_id, product_name, unit_price, quantity, subtotal)
     values ('3f9a2c4e-0000-4000-9000-000000000001', '5a000000-0000-4000-9000-000000000001',
             'd0000000-0000-4000-9000-00000000000a', 'Nasi Goreng', 0, 1, 0) $$,
  '23514', null,
  'unit_price 0 is rejected'
);

select throws_ok(
  $$ insert into public.transaction_items (transaction_id, store_id, product_id, product_name, unit_price, quantity, subtotal)
     values ('3f9a2c4e-0000-4000-9000-000000000001', '5a000000-0000-4000-9000-000000000001',
             'd0000000-0000-4000-9000-00000000000a', 'Nasi Goreng', 15000, 2, 25000) $$,
  '23514', null,
  'subtotal must equal unit_price x quantity'
);

select throws_ok(
  $$ insert into public.transaction_items (transaction_id, store_id, product_id, product_name, unit_price, quantity, subtotal)
     values ('3f9a2c4e-0000-4000-9000-000000000001', '5a000000-0000-4000-9000-000000000001',
             'd0000000-0000-4000-9000-00000000000a', 'Nasi Goreng', 2000000000, 2, 2147483647) $$,
  '23514', null,
  'a subtotal that overflows integer fails the check instead of wrapping'
);

select lives_ok(
  $$ insert into public.transaction_items (transaction_id, store_id, product_id, product_name, unit_price, quantity, subtotal)
     values ('3f9a2c4e-0000-4000-9000-000000000001', '5a000000-0000-4000-9000-000000000001',
             'd0000000-0000-4000-9000-00000000000a', 'Nasi Goreng', 15000, 1, 15000) $$,
  'a consistent item is accepted'
);

select throws_ok(
  $$ insert into public.transaction_items (transaction_id, store_id, product_id, product_name, unit_price, quantity, subtotal)
     values ('3f9a2c4e-0000-4000-9000-000000000001', '5b000000-0000-4000-9000-000000000001',
             'd0000000-0000-4000-9000-00000000000a', 'Nasi Goreng', 15000, 1, 15000) $$,
  '23503', null,
  'an item whose store_id differs from its transaction is rejected by the composite FK'
);

-- ---------------------------------------------------------------------------
-- History is preserved (PRD §23, D.5, D.7)
-- ---------------------------------------------------------------------------
update public.products set price = 18000, name = 'Nasi Goreng Spesial'
where id = 'd0000000-0000-4000-9000-00000000000a';

select results_eq(
  $$ select product_name, unit_price, subtotal from public.transaction_items
     where transaction_id = '3f9a2c4e-0000-4000-9000-000000000001' and quantity = 2 $$,
  $$ values ('Nasi Goreng'::text, 15000, 30000) $$,
  'a price/name change does not alter historical items'
);

select is(
  (select updated_at from public.products where id = 'd0000000-0000-4000-9000-00000000000a'),
  now(),
  'updated_at is maintained by trigger'
);

update public.products set is_active = false where id = 'd0000000-0000-4000-9000-00000000000a';

select is(
  (select count(*)::int from public.transaction_items where product_id = 'd0000000-0000-4000-9000-00000000000a'),
  2,
  'deactivating a product keeps its historical items'
);

select throws_ok(
  $$ delete from public.products where id = 'd0000000-0000-4000-9000-00000000000a' $$,
  '23503', null,
  'a product used in a transaction cannot be deleted even by a privileged role (FK backstop)'
);

select throws_ok(
  $$ delete from public.categories where id = 'ca000000-0000-4000-9000-00000000000a' $$,
  '23503', null,
  'a category used by a product (inactive included) cannot be deleted'
);

select lives_ok(
  $$ delete from public.categories where id = 'ca000000-0000-4000-9000-0000000000aa' $$,
  'an unused category can be deleted'
);

select throws_ok(
  $$ insert into public.categories (store_id, name) values ('5a000000-0000-4000-9000-000000000001', 'Makanan') $$,
  '23505', null,
  'category names are unique per store'
);

select lives_ok(
  $$ insert into public.categories (store_id, name) values ('5b000000-0000-4000-9000-000000000001', 'Makanan') $$,
  'the same category name is allowed in another store'
);

-- ---------------------------------------------------------------------------
-- Indexes (D.8)
-- ---------------------------------------------------------------------------
select has_index('public', 'transactions', 'transactions_store_id_created_at_idx', array['store_id', 'created_at'],
  'index transactions(store_id, created_at)');
select has_index('public', 'transactions', 'transactions_cashier_id_created_at_idx', array['cashier_id', 'created_at'],
  'index transactions(cashier_id, created_at)');
select has_index('public', 'transactions', 'transactions_store_id_code_idx', array['store_id', 'code'],
  'index transactions(store_id, code)');
select has_index('public', 'transaction_items', 'transaction_items_transaction_id_idx', array['transaction_id'],
  'index transaction_items(transaction_id)');
select has_index('public', 'products', 'products_store_id_is_active_idx', array['store_id', 'is_active'],
  'index products(store_id, is_active)');
select has_index('public', 'categories', 'categories_store_id_name_key', array['store_id', 'name'],
  'categories(store_id) is served by the unique (store_id, name) index');
select has_index('public', 'profiles', 'profiles_store_id_role_idx', array['store_id', 'role'],
  'index profiles(store_id, role)');

-- SEC-08: function and sequence privileges --------------------------------

select is(
  (select count(*)::int from pg_proc p
   where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'execute')),
  0,
  'anon can execute no function in public'
);

select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p
   where p.pronamespace = 'public'::regnamespace and has_function_privilege('authenticated', p.oid, 'execute')),
  array['create_transaction', 'sales_series', 'sales_summary', 'top_products'],
  'authenticated can execute only the allow-listed functions in public'
);

select is(
  (select count(*)::int from pg_proc p
   where p.pronamespace = 'private'::regnamespace and has_function_privilege('anon', p.oid, 'execute')),
  0,
  'anon can execute no function in private'
);

-- A function and a sequence created now, as a future migration would, get no client privileges.
create function public.sec08_probe() returns int language sql as 'select 1';
create sequence public.sec08_probe_seq;

select ok(
  not has_function_privilege('anon', 'public.sec08_probe()', 'execute')
  and not has_function_privilege('authenticated', 'public.sec08_probe()', 'execute'),
  'a new function in public is not executable by anon or authenticated (nor through PUBLIC)'
);

select ok(
  not has_sequence_privilege('anon', 'public.sec08_probe_seq', 'usage, select, update')
  and not has_sequence_privilege('authenticated', 'public.sec08_probe_seq', 'usage, select, update'),
  'a new sequence in public is not usable by anon or authenticated'
);

select ok(
  has_function_privilege('service_role', 'public.sec08_probe()', 'execute'),
  'service_role keeps its default privileges (server-side only)'
);

-- SEC-07: name length constraints (the backstop behind create_transaction and the forms).
select is(
  (select pg_get_constraintdef(c.oid) from pg_constraint c where c.conname = 'products_name_length'),
  'CHECK ((char_length(name) <= 120))',
  'products.name is at most 120 characters'
);
select is(
  (select pg_get_constraintdef(c.oid) from pg_constraint c where c.conname = 'transaction_items_product_name_length'),
  'CHECK ((char_length(product_name) <= 120))',
  'transaction_items.product_name is at most 120 characters'
);

select * from finish();
rollback;

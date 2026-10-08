-- create_transaction RPC tests (DATABASE D.9, SECURITY E.12, TEST_PLAN G.16; AC-04, AC-05, AC-12).
-- Fixtures: store A (owner, two active cashiers, one inactive cashier) and store B
-- (owner, cashier), plus an authenticated user without a profile. Fixture UUIDs use
-- the -9000- namespace. Every sale id starts with e1000000, so the matching display
-- code for a 2026-10-07 WIB sale is TRX-20261007-E10000.
begin;
create extension if not exists pgtap with schema extensions;

select plan(73);

-- ---------------------------------------------------------------------------
-- Helpers (rolled back with the test transaction)
-- ---------------------------------------------------------------------------
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

create function tests.act_as_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
end;
$$;

-- One item object, as the client sends it.
create function tests.item(product_id uuid, unit_price numeric, quantity numeric, subtotal numeric, product_name text default 'Nasi Goreng')
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'product_id', product_id, 'product_name', product_name,
    'unit_price', unit_price, 'quantity', quantity, 'subtotal', subtotal
  )
$$;

-- Nasi Goreng ×2 (30.000) + Es Teh ×2 (10.000) = 40.000: the golden path order.
create function tests.golden()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_array(
    tests.item('d0000000-0000-4000-9000-00000000000a', 15000, 2, 30000, 'Nasi Goreng'),
    tests.item('d0000000-0000-4000-9000-00000000000b', 5000, 2, 10000, 'Es Teh')
  )
$$;

-- create_transaction with the default code and sale time of a 2026-10-07 10:32 WIB sale.
create function tests.sell(
  id uuid, items jsonb, total bigint, paid bigint, change bigint,
  code text default 'TRX-20261007-E10000',
  created_at timestamptz default '2026-10-07 10:32:00+07'
)
returns text
language sql
as $$
  select public.create_transaction(id, code, created_at, total, paid, change, items)
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a1000000-0000-4000-9000-000000000001', 'owner.a@rpc.test'),
  ('a2000000-0000-4000-9000-000000000001', 'kasir1.a@rpc.test'),
  ('a2000000-0000-4000-9000-000000000002', 'kasir2.a@rpc.test'),
  ('a2000000-0000-4000-9000-000000000003', 'nonaktif.a@rpc.test'),
  ('b1000000-0000-4000-9000-000000000001', 'owner.b@rpc.test'),
  ('b2000000-0000-4000-9000-000000000001', 'kasir1.b@rpc.test'),
  ('0f000000-0000-4000-9000-000000000001', 'tanpa.profil@rpc.test');

insert into public.stores (id, name) values
  ('5a000000-0000-4000-9000-000000000001', 'Warung A'),
  ('5b000000-0000-4000-9000-000000000001', 'Warung B');

insert into public.profiles (id, store_id, name, role, is_active) values
  ('a1000000-0000-4000-9000-000000000001', '5a000000-0000-4000-9000-000000000001', 'Owner A', 'owner', true),
  ('a2000000-0000-4000-9000-000000000001', '5a000000-0000-4000-9000-000000000001', 'Kasir A1', 'cashier', true),
  ('a2000000-0000-4000-9000-000000000002', '5a000000-0000-4000-9000-000000000001', 'Kasir A2', 'cashier', true),
  ('a2000000-0000-4000-9000-000000000003', '5a000000-0000-4000-9000-000000000001', 'Kasir A3', 'cashier', false),
  ('b1000000-0000-4000-9000-000000000001', '5b000000-0000-4000-9000-000000000001', 'Owner B', 'owner', true),
  ('b2000000-0000-4000-9000-000000000001', '5b000000-0000-4000-9000-000000000001', 'Kasir B1', 'cashier', true);

insert into public.categories (id, store_id, name) values
  ('ca000000-0000-4000-9000-00000000000a', '5a000000-0000-4000-9000-000000000001', 'Makanan'),
  ('cb000000-0000-4000-9000-00000000000a', '5b000000-0000-4000-9000-000000000001', 'Makanan');

insert into public.products (id, store_id, category_id, name, price, is_active) values
  ('d0000000-0000-4000-9000-00000000000a', '5a000000-0000-4000-9000-000000000001',
   'ca000000-0000-4000-9000-00000000000a', 'Nasi Goreng', 15000, true),
  ('d0000000-0000-4000-9000-00000000000b', '5a000000-0000-4000-9000-000000000001',
   'ca000000-0000-4000-9000-00000000000a', 'Es Teh', 5000, true),
  ('d0000000-0000-4000-9000-00000000000c', '5a000000-0000-4000-9000-000000000001',
   'ca000000-0000-4000-9000-00000000000a', 'Nasi Rames', 13000, false),
  ('db000000-0000-4000-9000-00000000000a', '5b000000-0000-4000-9000-000000000001',
   'cb000000-0000-4000-9000-00000000000a', 'Soto Ayam', 12000, true);

-- ===========================================================================
-- Shape and privileges (D.9, D.11)
-- ===========================================================================
select has_function(
  'public', 'create_transaction',
  array['uuid', 'text', 'timestamp with time zone', 'bigint', 'bigint', 'bigint', 'jsonb'],
  'create_transaction exists with the D.9 parameters'
);
select is_definer(
  'public', 'create_transaction',
  array['uuid', 'text', 'timestamp with time zone', 'bigint', 'bigint', 'bigint', 'jsonb'],
  'create_transaction is SECURITY DEFINER'
);
select ok(
  (select proconfig @> array['search_path=""'] from pg_proc
   where oid = 'public.create_transaction(uuid, text, timestamptz, bigint, bigint, bigint, jsonb)'::regprocedure),
  'create_transaction pins an empty search_path'
);
select ok(
  not has_function_privilege('anon', 'public.create_transaction(uuid, text, timestamptz, bigint, bigint, bigint, jsonb)', 'execute'),
  'anon cannot execute create_transaction'
);
select ok(
  has_function_privilege('authenticated', 'public.create_transaction(uuid, text, timestamptz, bigint, bigint, bigint, jsonb)', 'execute'),
  'authenticated can execute create_transaction'
);
select ok(
  not has_function_privilege('authenticated', 'private.jsonb_positive_integer(jsonb)', 'execute')
  and not has_function_privilege('anon', 'private.jsonb_positive_integer(jsonb)', 'execute'),
  'the private validation helper is not callable by clients'
);

-- ===========================================================================
-- Callers that may not sell
-- ===========================================================================
select tests.act_as_anon();
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000001', tests.golden(), 40000, 50000, 10000) $$,
  '42501', null, 'anon cannot call create_transaction'
);
reset role;

select tests.act_as('0f000000-0000-4000-9000-000000000001');
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000001', tests.golden(), 40000, 50000, 10000) $$,
  'WK002', 'create_transaction: the caller has no active profile',
  'a user without a profile is rejected with WK002'
);
reset role;

select tests.act_as('a2000000-0000-4000-9000-000000000003');
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000001', tests.golden(), 40000, 50000, 10000) $$,
  'WK002', 'create_transaction: the caller has no active profile',
  'an inactive cashier is rejected with WK002 (the client marks the sale failed, SECURITY E.10)'
);
reset role;

select is_empty(
  $$ select 1 from public.transactions where id = 'e1000000-0000-4000-9000-000000000001' $$,
  'rejected callers wrote nothing'
);

-- ===========================================================================
-- Valid sale (cashier A1): created, atomic, identity from the caller
-- ===========================================================================
select tests.act_as('a2000000-0000-4000-9000-000000000001');
select is(
  public.create_transaction(
    'e1000000-0000-4000-9000-000000000001', 'TRX-20261007-E10000', '2026-10-07 10:32:00+07',
    40000, 50000, 10000, tests.golden()
  ),
  'created',
  'a valid sale returns created'
);
select isnt_empty(
  $$ select 1 from public.transactions where id = 'e1000000-0000-4000-9000-000000000001' $$,
  'the cashier reads their new sale back through RLS'
);
reset role;

select results_eq(
  $$ select store_id, cashier_id, code, total, paid_amount, change_amount, status, created_at
     from public.transactions where id = 'e1000000-0000-4000-9000-000000000001' $$,
  $$ values ('5a000000-0000-4000-9000-000000000001'::uuid, 'a2000000-0000-4000-9000-000000000001'::uuid,
             'TRX-20261007-E10000', 40000, 50000, 10000, 'completed', '2026-10-07 10:32:00+07'::timestamptz) $$,
  'header: store and cashier from the caller, status completed, created_at kept as sent'
);
select is(
  (select synced_at from public.transactions where id = 'e1000000-0000-4000-9000-000000000001'),
  now(),
  'synced_at is set by the server at receive time'
);
select isnt(
  (select synced_at from public.transactions where id = 'e1000000-0000-4000-9000-000000000001'),
  (select created_at from public.transactions where id = 'e1000000-0000-4000-9000-000000000001'),
  'created_at is the sale time, not the sync time'
);
select results_eq(
  $$ select store_id, product_id, product_name, unit_price, quantity, subtotal
     from public.transaction_items where transaction_id = 'e1000000-0000-4000-9000-000000000001'
     order by product_name desc $$,
  $$ values
       ('5a000000-0000-4000-9000-000000000001'::uuid, 'd0000000-0000-4000-9000-00000000000a'::uuid, 'Nasi Goreng', 15000, 2, 30000),
       ('5a000000-0000-4000-9000-000000000001'::uuid, 'd0000000-0000-4000-9000-00000000000b'::uuid, 'Es Teh', 5000, 2, 10000) $$,
  'items: snapshot names and prices, in the caller''s store'
);

select tests.act_as('a2000000-0000-4000-9000-000000000002');
select is_empty(
  $$ select 1 from public.transactions where id = 'e1000000-0000-4000-9000-000000000001' $$,
  'another cashier still cannot read the sale (D1)'
);
reset role;

-- ===========================================================================
-- Idempotency (G.11, G.16, AC-12)
-- ===========================================================================
select tests.act_as('a2000000-0000-4000-9000-000000000001');
select is(
  tests.sell('e1000000-0000-4000-9000-000000000001', tests.golden(), 40000, 50000, 10000),
  'exists',
  'the same id again (lost-response retry) returns exists'
);
select is(
  tests.sell('e1000000-0000-4000-9000-000000000001',
    jsonb_build_array(tests.item('d0000000-0000-4000-9000-00000000000a', 15000, 1, 15000)), 15000, 20000, 5000),
  'exists',
  'the same id with a different payload returns exists and changes nothing'
);
reset role;

select is(
  (select count(*)::int from public.transactions where id = 'e1000000-0000-4000-9000-000000000001'),
  1, 'exactly one transaction for the id'
);
select is(
  (select count(*)::int from public.transaction_items where transaction_id = 'e1000000-0000-4000-9000-000000000001'),
  2, 'items are not duplicated by retries'
);
select results_eq(
  $$ select total, paid_amount, change_amount from public.transactions where id = 'e1000000-0000-4000-9000-000000000001' $$,
  $$ values (40000, 50000, 10000) $$,
  'the original transaction is unchanged by retries'
);

-- Another user's id is never reported as this caller's sale.
select tests.act_as('a2000000-0000-4000-9000-000000000002');
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000001', tests.golden(), 40000, 50000, 10000) $$,
  'WK001', 'create_transaction: id belongs to another transaction',
  'another cashier of the same store cannot claim an existing id'
);
reset role;

select tests.act_as('b2000000-0000-4000-9000-000000000001');
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000001',
       jsonb_build_array(tests.item('db000000-0000-4000-9000-00000000000a', 12000, 1, 12000, 'Soto Ayam')), 12000, 12000, 0) $$,
  'WK001', 'create_transaction: id belongs to another transaction',
  'a cashier of another store cannot claim an existing id'
);
reset role;

select is(
  (select cashier_id from public.transactions where id = 'e1000000-0000-4000-9000-000000000001'),
  'a2000000-0000-4000-9000-000000000001'::uuid,
  'the existing sale still belongs to its cashier'
);

-- ===========================================================================
-- Rejected sales (cashier A1). Ids e1000000-…-00000000001x; none may be written.
-- ===========================================================================
select tests.act_as('a2000000-0000-4000-9000-000000000001');

-- Payment (AC-05)
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000010', tests.golden(), 40000, 30000, -10000) $$,
  'WK001', 'create_transaction: paid_amount is less than total',
  'underpayment (paid 30000 < total 40000) is rejected'
);

-- Arithmetic
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000011',
       jsonb_build_array(tests.item('d0000000-0000-4000-9000-00000000000a', 15000, 2, 25000)), 25000, 25000, 0) $$,
  'WK001', 'create_transaction: subtotal does not equal unit_price × quantity',
  'a subtotal that is not unit_price × quantity is rejected'
);
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000011', tests.golden(), 35000, 50000, 15000) $$,
  'WK001', 'create_transaction: total does not equal the sum of subtotals',
  'a total that is not the sum of subtotals is rejected'
);
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000011', tests.golden(), 40000, 50000, 5000) $$,
  'WK001', 'create_transaction: change_amount does not equal paid_amount - total',
  'a change that is not paid − total is rejected'
);
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000011', tests.golden(), null, 50000, 10000) $$,
  'WK001', 'create_transaction: total does not equal the sum of subtotals',
  'a missing total is rejected'
);

-- Items
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000012', '[]', 0, 0, 0) $$,
  'WK001', 'create_transaction: items must be a non-empty array',
  'empty items are rejected'
);
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000012', null, 0, 0, 0) $$,
  'WK001', 'create_transaction: items must be a non-empty array',
  'missing items are rejected'
);
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000012', '{"quantity": 1}', 0, 0, 0) $$,
  'WK001', 'create_transaction: items must be a non-empty array',
  'items that are not an array are rejected'
);
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000012', '[1]', 0, 0, 0) $$,
  'WK001', 'create_transaction: each item must be an object',
  'an item that is not an object is rejected'
);
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000012',
       jsonb_build_array(tests.item('d0000000-0000-4000-9000-00000000000a', 15000, 0, 15000)), 15000, 15000, 0) $$,
  'WK001', 'create_transaction: quantity, unit_price, and subtotal must be whole numbers from 1 to 2147483647',
  'quantity 0 is rejected'
);
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000012',
       jsonb_build_array(tests.item('d0000000-0000-4000-9000-00000000000a', 15000, -1, -15000)), 15000, 15000, 0) $$,
  'WK001', 'create_transaction: quantity, unit_price, and subtotal must be whole numbers from 1 to 2147483647',
  'a negative quantity is rejected'
);
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000012',
       jsonb_build_array(tests.item('d0000000-0000-4000-9000-00000000000a', 10000, 1.5, 15000)), 15000, 15000, 0) $$,
  'WK001', 'create_transaction: quantity, unit_price, and subtotal must be whole numbers from 1 to 2147483647',
  'a fractional quantity is rejected'
);
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000012',
       '[{"product_id": "d0000000-0000-4000-9000-00000000000a", "product_name": "Nasi Goreng",
          "unit_price": 15000, "quantity": "2", "subtotal": 30000}]', 30000, 30000, 0) $$,
  'WK001', 'create_transaction: quantity, unit_price, and subtotal must be whole numbers from 1 to 2147483647',
  'a quantity sent as a string is rejected'
);
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000012',
       jsonb_build_array(tests.item('d0000000-0000-4000-9000-00000000000a', -15000, 1, -15000)), 15000, 15000, 0) $$,
  'WK001', 'create_transaction: quantity, unit_price, and subtotal must be whole numbers from 1 to 2147483647',
  'a negative unit price is rejected'
);
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000012',
       jsonb_build_array(tests.item('d0000000-0000-4000-9000-00000000000a', 15000, 2, 30000, '  ')), 30000, 30000, 0) $$,
  'WK001', 'create_transaction: product_name is required',
  'a blank product name is rejected'
);
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000012',
       '[{"product_id": "bukan-uuid", "product_name": "Nasi Goreng", "unit_price": 15000, "quantity": 1, "subtotal": 15000}]',
       15000, 15000, 0) $$,
  'WK001', 'create_transaction: product_id must be a UUID',
  'a product_id that is not a UUID is rejected'
);

-- Store isolation
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000013',
       jsonb_build_array(tests.item('db000000-0000-4000-9000-00000000000a', 12000, 1, 12000, 'Soto Ayam')), 12000, 12000, 0) $$,
  'WK001', 'create_transaction: product does not belong to the caller''s store',
  'a product of another store is rejected'
);
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000013',
       jsonb_build_array(tests.golden() -> 0, tests.item('db000000-0000-4000-9000-00000000000a', 12000, 1, 12000, 'Soto Ayam')),
       42000, 50000, 8000) $$,
  'WK001', 'create_transaction: product does not belong to the caller''s store',
  'one foreign product among valid ones rejects the whole sale'
);
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000013',
       jsonb_build_array(tests.item('d0000000-0000-4000-9000-0000000000ff', 15000, 1, 15000)), 15000, 15000, 0) $$,
  'WK001', 'create_transaction: product does not belong to the caller''s store',
  'an unknown product is rejected'
);

-- Integer limits (bigint arithmetic, 2147483647 cap)
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000014',
       jsonb_build_array(tests.item('d0000000-0000-4000-9000-00000000000a', 2147483648, 1, 2147483648)),
       2147483648, 2147483648, 0) $$,
  'WK001', 'create_transaction: quantity, unit_price, and subtotal must be whole numbers from 1 to 2147483647',
  'a unit price beyond the integer limit is rejected'
);
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000014',
       jsonb_build_array(tests.item('d0000000-0000-4000-9000-00000000000a', 2000000000, 2, 4000000000)),
       4000000000, 4000000000, 0) $$,
  'WK001', 'create_transaction: quantity, unit_price, and subtotal must be whole numbers from 1 to 2147483647',
  'a subtotal beyond the integer limit is rejected'
);
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000014',
       jsonb_build_array(
         tests.item('d0000000-0000-4000-9000-00000000000a', 2000000000, 1, 2000000000),
         tests.item('d0000000-0000-4000-9000-00000000000b', 2000000000, 1, 2000000000, 'Es Teh')),
       4000000000, 4000000000, 0) $$,
  'WK001', 'create_transaction: total exceeds 2147483647',
  'a total beyond the integer limit is rejected'
);
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000014', tests.golden(), 40000, 2147483648, 2147443648) $$,
  'WK001', 'create_transaction: paid_amount must be at most 2147483647',
  'a paid amount beyond the integer limit is rejected'
);

-- Display code (D2): must match the id and the Asia/Jakarta sale date
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000015', tests.golden(), 40000, 50000, 10000, 'TRX-20261007-ABCDEF') $$,
  'WK001', 'create_transaction: code does not match id and created_at',
  'a code whose hex part does not match the id is rejected'
);
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000015', tests.golden(), 40000, 50000, 10000, 'TRX-20261007-e10000') $$,
  'WK001', 'create_transaction: code does not match id and created_at',
  'a lowercase code is rejected'
);
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000015', tests.golden(), 40000, 50000, 10000,
       'TRX-20261007-E10000', '2026-10-08 00:30:00+07') $$,
  'WK001', 'create_transaction: code does not match id and created_at',
  'a code dated with the UTC day (00:30 WIB = previous UTC day) is rejected'
);
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000015', tests.golden(), 40000, 50000, 10000, 'TRX-20261007-E10000', null) $$,
  'WK001', 'create_transaction: created_at is required',
  'a missing sale time is rejected'
);
select throws_ok(
  $$ select tests.sell(null, tests.golden(), 40000, 50000, 10000) $$,
  'WK001', 'create_transaction: id is required',
  'a missing id is rejected'
);

reset role;

select is_empty(
  $$ select 1 from public.transactions where id::text like 'e1000000-0000-4000-9000-00000000001%' $$,
  'rejected sales wrote no header'
);
select is_empty(
  $$ select 1 from public.transaction_items where transaction_id::text like 'e1000000-0000-4000-9000-00000000001%' $$,
  'rejected sales wrote no items (atomic)'
);

-- ===========================================================================
-- Accepted edge cases
-- ===========================================================================
select tests.act_as('a2000000-0000-4000-9000-000000000001');

select is(
  tests.sell('e1000000-0000-4000-9000-000000000020',
    jsonb_build_array(tests.item('d0000000-0000-4000-9000-00000000000a', 12000, 1, 12000)), 12000, 12000, 0),
  'created',
  'a unit price different from the current product price is accepted (D7, SECURITY E.12)'
);
select is(
  tests.sell('e1000000-0000-4000-9000-000000000021',
    jsonb_build_array(tests.item('d0000000-0000-4000-9000-00000000000c', 13000, 1, 13000, 'Nasi Rames')), 13000, 20000, 7000),
  'created',
  'an inactive product of the same store is accepted (a sale made before it was deactivated)'
);
select is(
  tests.sell('e1000000-0000-4000-9000-000000000022', tests.golden(), 40000, 40000, 0),
  'created',
  'exact payment (change 0) is accepted'
);
select is(
  tests.sell('e1000000-0000-4000-9000-000000000023', tests.golden(), 40000, 50000, 10000,
    'TRX-20261008-E10000', '2026-10-08 00:30:00+07'),
  'created',
  'a 00:30 WIB sale is coded with its Asia/Jakarta date'
);
select is(
  tests.sell('e1000000-0000-4000-9000-000000000024',
    jsonb_build_array(tests.item('d0000000-0000-4000-9000-00000000000a', 15000, 1, 15000)
      || '{"store_id": "5b000000-0000-4000-9000-000000000001", "cashier_id": "b2000000-0000-4000-9000-000000000001"}'),
    15000, 15000, 0),
  'created',
  'store_id / cashier_id smuggled into an item are ignored'
);

reset role;

select is(
  (select unit_price from public.transaction_items where transaction_id = 'e1000000-0000-4000-9000-000000000020'),
  12000, 'the snapshot unit price is stored as sent'
);
select is(
  (select price from public.products where id = 'd0000000-0000-4000-9000-00000000000a'),
  15000, 'the current product price is untouched by the sale'
);
select is(
  (select created_at from public.transactions where id = 'e1000000-0000-4000-9000-000000000023'),
  '2026-10-07 17:30:00+00'::timestamptz,
  'the 00:30 WIB sale keeps its exact sale time'
);
select results_eq(
  $$ select t.store_id, t.cashier_id, i.store_id
     from public.transactions t join public.transaction_items i on i.transaction_id = t.id
     where t.id = 'e1000000-0000-4000-9000-000000000024' $$,
  $$ values ('5a000000-0000-4000-9000-000000000001'::uuid, 'a2000000-0000-4000-9000-000000000001'::uuid,
             '5a000000-0000-4000-9000-000000000001'::uuid) $$,
  'store and cashier always come from the caller''s profile'
);

-- The owner sells too, as themselves.
select tests.act_as('a1000000-0000-4000-9000-000000000001');
select is(
  tests.sell('e1000000-0000-4000-9000-000000000030', tests.golden(), 40000, 50000, 10000),
  'created',
  'the owner can create a sale'
);
reset role;
select is(
  (select cashier_id from public.transactions where id = 'e1000000-0000-4000-9000-000000000030'),
  'a1000000-0000-4000-9000-000000000001'::uuid,
  'the owner''s sale is recorded under the owner'
);

-- Store B sells only its own products, into store B.
select tests.act_as('b2000000-0000-4000-9000-000000000001');
select is(
  tests.sell('e1000000-0000-4000-9000-000000000031',
    jsonb_build_array(tests.item('db000000-0000-4000-9000-00000000000a', 12000, 1, 12000, 'Soto Ayam')), 12000, 12000, 0),
  'created',
  'a store B cashier sells a store B product'
);
reset role;
select is(
  (select store_id from public.transactions where id = 'e1000000-0000-4000-9000-000000000031'),
  '5b000000-0000-4000-9000-000000000001'::uuid,
  'the store B sale is in store B'
);

-- ===========================================================================
-- Direct writes stay denied: the RPC is the only write path (C.11, D.11)
-- ===========================================================================
select tests.act_as('a2000000-0000-4000-9000-000000000001');
select throws_ok(
  $$ insert into public.transactions (id, store_id, cashier_id, code, total, paid_amount, change_amount, created_at)
     values ('e1000000-0000-4000-9000-000000000040', '5a000000-0000-4000-9000-000000000001',
             'a2000000-0000-4000-9000-000000000001', 'TRX-20261007-E10000', 15000, 15000, 0, now()) $$,
  '42501', null, 'a cashier cannot insert a transaction directly'
);
select throws_ok(
  $$ insert into public.transaction_items (transaction_id, store_id, product_id, product_name, unit_price, quantity, subtotal)
     values ('e1000000-0000-4000-9000-000000000001', '5a000000-0000-4000-9000-000000000001',
             'd0000000-0000-4000-9000-00000000000a', 'Nasi Goreng', 15000, 1, 15000) $$,
  '42501', null, 'a cashier cannot insert transaction items directly'
);
select throws_ok(
  $$ update public.transactions set paid_amount = 100000, change_amount = 60000
     where id = 'e1000000-0000-4000-9000-000000000001' $$,
  '42501', null, 'a cashier cannot edit a synced sale'
);
reset role;

select tests.act_as('a1000000-0000-4000-9000-000000000001');
select throws_ok(
  $$ insert into public.transactions (id, store_id, cashier_id, code, total, paid_amount, change_amount, created_at)
     values ('e1000000-0000-4000-9000-000000000041', '5a000000-0000-4000-9000-000000000001',
             'a1000000-0000-4000-9000-000000000001', 'TRX-20261007-E10000', 15000, 15000, 0, now()) $$,
  '42501', null, 'the owner cannot insert a transaction directly'
);
select throws_ok(
  $$ delete from public.transaction_items where transaction_id = 'e1000000-0000-4000-9000-000000000001' $$,
  '42501', null, 'the owner cannot delete transaction items'
);
reset role;

select * from finish();
rollback;

-- Product options (DATABASE D.12): table access, store isolation, and the options/note part of
-- create_transaction. Fixtures: store A (owner, cashier) and store B (owner), -9000- namespace.
begin;
create extension if not exists pgtap with schema extensions;

select plan(42);

create schema tests;
grant usage on schema tests to anon, authenticated;
alter default privileges in schema tests grant execute on functions to anon, authenticated;

create function tests.open_session(user_id uuid)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into auth.sessions (id, user_id, created_at, updated_at)
  values (gen_random_uuid(), user_id, now(), now())
  returning id
$$;

create function tests.act_as(user_id uuid)
returns void
language plpgsql
as $$
declare
  v_session uuid := tests.open_session(user_id);
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_id, 'role', 'authenticated', 'session_id', v_session)::text,
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

-- One sale line of Geprek (15.000 base) with the given options/note, qty 1.
create function tests.geprek_line(unit_price numeric, options jsonb, note jsonb default 'null'::jsonb)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'product_id', 'd0000000-0000-4000-9000-00000000000a', 'product_name', 'Geprek',
    'unit_price', unit_price, 'quantity', 1, 'subtotal', unit_price,
    'options', options, 'note', note
  )
$$;

create function tests.sell(id uuid, item jsonb, total bigint)
returns text
language sql
as $$
  select public.create_transaction(id, 'TRX-20261007-E10000', '2026-10-07 10:32:00+07', total, total, 0, jsonb_build_array(item))
$$;

-- Number of rows a data-changing statement touched, as the calling role (RLS hides what it may not change).
create function tests.rows_changed(statement text)
returns bigint
language plpgsql
as $$
declare
  n bigint;
begin
  execute statement;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Fixtures ---------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a1000000-0000-4000-9000-000000000001', 'owner.a@options.test'),
  ('a2000000-0000-4000-9000-000000000001', 'kasir1.a@options.test'),
  ('b1000000-0000-4000-9000-000000000001', 'owner.b@options.test');

insert into public.stores (id, name) values
  ('5a000000-0000-4000-9000-000000000001', 'Warung A'),
  ('5b000000-0000-4000-9000-000000000001', 'Warung B');

insert into public.profiles (id, store_id, name, role, is_active) values
  ('a1000000-0000-4000-9000-000000000001', '5a000000-0000-4000-9000-000000000001', 'Owner A', 'owner', true),
  ('a2000000-0000-4000-9000-000000000001', '5a000000-0000-4000-9000-000000000001', 'Kasir A1', 'cashier', true),
  ('b1000000-0000-4000-9000-000000000001', '5b000000-0000-4000-9000-000000000001', 'Owner B', 'owner', true);

insert into public.categories (id, store_id, name) values
  ('ca000000-0000-4000-9000-00000000000a', '5a000000-0000-4000-9000-000000000001', 'Makanan'),
  ('cb000000-0000-4000-9000-00000000000a', '5b000000-0000-4000-9000-000000000001', 'Makanan');

insert into public.products (id, store_id, category_id, name, price, is_active) values
  ('d0000000-0000-4000-9000-00000000000a', '5a000000-0000-4000-9000-000000000001', 'ca000000-0000-4000-9000-00000000000a', 'Geprek', 15000, true),
  ('db000000-0000-4000-9000-00000000000a', '5b000000-0000-4000-9000-000000000001', 'cb000000-0000-4000-9000-00000000000a', 'Soto', 12000, true);

insert into public.option_groups (id, store_id, name, allow_multiple, required) values
  ('90000000-0000-4000-9000-00000000000a', '5a000000-0000-4000-9000-000000000001', 'Level', false, true),
  ('90000000-0000-4000-9000-00000000000b', '5b000000-0000-4000-9000-000000000001', 'Level', false, true);

insert into public.option_choices (id, store_id, group_id, name, price_delta, is_default, position) values
  ('c0000000-0000-4000-9000-00000000000a', '5a000000-0000-4000-9000-000000000001', '90000000-0000-4000-9000-00000000000a', 'Level 1', 0, true, 0),
  ('c0000000-0000-4000-9000-00000000000b', '5a000000-0000-4000-9000-000000000001', '90000000-0000-4000-9000-00000000000a', 'Level 5', 0, false, 1),
  ('c0000000-0000-4000-9000-00000000000c', '5b000000-0000-4000-9000-000000000001', '90000000-0000-4000-9000-00000000000b', 'Level 1', 0, true, 0);

insert into public.product_option_groups (product_id, group_id, store_id, position) values
  ('d0000000-0000-4000-9000-00000000000a', '90000000-0000-4000-9000-00000000000a', '5a000000-0000-4000-9000-000000000001', 0);

-- Shape ------------------------------------------------------------------------
select has_column('public', 'transaction_items', 'options', 'transaction_items has options');
select has_column('public', 'transaction_items', 'note', 'transaction_items has note');

-- Store isolation and roles ----------------------------------------------------
select tests.act_as_anon();
select throws_ok($$ select * from public.option_groups $$, '42501', null, 'anon cannot read option groups');
reset role;

select tests.act_as('a2000000-0000-4000-9000-000000000001');
select is((select count(*) from public.option_groups), 1::bigint, 'a cashier reads only their own store''s groups');
select is((select count(*) from public.option_choices), 2::bigint, 'a cashier reads only their own store''s choices');
select is((select count(*) from public.product_option_groups), 1::bigint, 'a cashier reads the product links of their store');
select throws_ok(
  $$ insert into public.option_groups (store_id, name) values ('5a000000-0000-4000-9000-000000000001', 'Nasi') $$,
  '42501', null, 'a cashier cannot create a group'
);
select is(
  tests.rows_changed($$ update public.option_choices set price_delta = 5000 where id = 'c0000000-0000-4000-9000-00000000000a' $$),
  0::bigint, 'a cashier cannot change a choice price (RLS hides the row from the update)'
);
select is(
  tests.rows_changed($$ delete from public.option_choices where id = 'c0000000-0000-4000-9000-00000000000a' $$),
  0::bigint, 'a cashier cannot delete a choice'
);
reset role;

select tests.act_as('a1000000-0000-4000-9000-000000000001');
select lives_ok(
  $$ insert into public.option_groups (store_id, name, allow_multiple, required) values ('5a000000-0000-4000-9000-000000000001', 'Nasi', false, false) $$,
  'the owner creates a group'
);
select lives_ok(
  $$ insert into public.option_choices (store_id, group_id, name, price_delta)
     select '5a000000-0000-4000-9000-000000000001', id, 'Pakai nasi', 4000 from public.option_groups where name = 'Nasi' $$,
  'the owner creates a priced choice'
);
select lives_ok(
  $$ update public.option_choices set price_delta = 5000 where name = 'Pakai nasi' $$,
  'the owner changes a choice price'
);
select throws_ok(
  $$ insert into public.option_choices (store_id, group_id, name, price_delta)
     select '5a000000-0000-4000-9000-000000000001', id, 'Gratis', -1 from public.option_groups where name = 'Nasi' $$,
  '23514', null, 'a negative price addition is rejected'
);
select throws_ok(
  $$ insert into public.option_groups (store_id, name) values ('5a000000-0000-4000-9000-000000000001', 'Level') $$,
  '23505', null, 'group names are unique within the store'
);
select throws_ok(
  $$ insert into public.option_groups (store_id, name) values ('5b000000-0000-4000-9000-000000000001', 'Spy') $$,
  '42501', null, 'the owner cannot create a group in another store'
);
select throws_ok(
  $$ insert into public.option_choices (store_id, group_id, name)
     values ('5a000000-0000-4000-9000-000000000001', '90000000-0000-4000-9000-00000000000b', 'Cross store') $$,
  '23503', null, 'a choice cannot point at a group of another store (composite foreign key)'
);
select throws_ok(
  $$ insert into public.product_option_groups (product_id, group_id, store_id)
     values ('d0000000-0000-4000-9000-00000000000a', '90000000-0000-4000-9000-00000000000b', '5a000000-0000-4000-9000-000000000001') $$,
  '23503', null, 'a product cannot be linked to a group of another store'
);
select is(
  (select count(*) from public.option_groups where store_id = '5b000000-0000-4000-9000-000000000001'), 0::bigint,
  'the owner of store A cannot read store B''s groups'
);
select is(
  tests.rows_changed($$ update public.option_groups set name = 'Hacked' where id = '90000000-0000-4000-9000-00000000000b' $$),
  0::bigint, 'the owner cannot rename a group of another store'
);
select lives_ok(
  $$ delete from public.option_groups where name = 'Nasi' $$,
  'the owner deletes an option group (its choices go with it)'
);
select is(
  (select count(*) from public.option_choices where name = 'Pakai nasi'), 0::bigint,
  'deleting a group removes its choices'
);
reset role;

-- create_transaction: options and note -----------------------------------------
select tests.act_as('a2000000-0000-4000-9000-000000000001');

select is(
  tests.sell('e1000000-0000-4000-9000-000000000001',
    tests.geprek_line(22000, '[{"group":"Level","name":"Level 5","price":0},{"group":"Nasi","name":"Pakai nasi","price":4000},{"group":"Bagian","name":"Dada","price":3000}]'::jsonb, '"sambal dipisah"'::jsonb),
    22000),
  'created', 'a sale line with options and a note is accepted'
);
reset role;

select is(
  (select options from public.transaction_items where transaction_id = 'e1000000-0000-4000-9000-000000000001'),
  '[{"group":"Level","name":"Level 5","price":0},{"group":"Nasi","name":"Pakai nasi","price":4000},{"group":"Bagian","name":"Dada","price":3000}]'::jsonb,
  'the chosen options are stored as sent'
);
select is(
  (select note from public.transaction_items where transaction_id = 'e1000000-0000-4000-9000-000000000001'),
  'sambal dipisah', 'the note is stored'
);

select tests.act_as('a2000000-0000-4000-9000-000000000001');
select is(
  tests.sell('e1000000-0000-4000-9000-000000000002', tests.geprek_line(15000, '[]'::jsonb), 15000),
  'created', 'a line with empty options is accepted'
);
select is(
  public.create_transaction(
    'e1000000-0000-4000-9000-000000000003', 'TRX-20261007-E10000', '2026-10-07 10:32:00+07', 15000, 15000, 0,
    jsonb_build_array(jsonb_build_object('product_id', 'd0000000-0000-4000-9000-00000000000a', 'product_name', 'Geprek',
                                         'unit_price', 15000, 'quantity', 1, 'subtotal', 15000))
  ),
  'created', 'a line without options or note (an older device) is accepted'
);
reset role;

select is(
  (select options from public.transaction_items where transaction_id = 'e1000000-0000-4000-9000-000000000003'),
  '[]'::jsonb, 'a line sent without options stores an empty list'
);
select is(
  (select note from public.transaction_items where transaction_id = 'e1000000-0000-4000-9000-000000000003'),
  null, 'a line sent without a note stores null'
);

select tests.act_as('a2000000-0000-4000-9000-000000000001');

select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000004', tests.geprek_line(15000, '{"group":"Level"}'::jsonb), 15000) $$,
  'WK001', null, 'options that are not an array are rejected'
);
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000005', tests.geprek_line(15000, '[{"group":"Level","name":"","price":0}]'::jsonb), 15000) $$,
  'WK001', null, 'a blank option name is rejected'
);
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000006', tests.geprek_line(15000, '[{"group":"Level","name":"Level 1"}]'::jsonb), 15000) $$,
  'WK001', null, 'an option without a price is rejected'
);
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000007', tests.geprek_line(15000, '[{"group":"Level","name":"Level 1","price":-1}]'::jsonb), 15000) $$,
  'WK001', null, 'a negative option price is rejected'
);
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000008', tests.geprek_line(15000, '[{"group":"Level","name":"Level 1","price":1.5}]'::jsonb), 15000) $$,
  'WK001', null, 'a fractional option price is rejected'
);
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-000000000009', tests.geprek_line(15000, '[{"group":"Nasi","name":"Pakai nasi","price":15000}]'::jsonb), 15000) $$,
  'WK001', null, 'option prices that add up to the whole unit price or more are rejected'
);
select throws_ok(
  format($$ select tests.sell('e1000000-0000-4000-9000-00000000000a', tests.geprek_line(15000, %L::jsonb), 15000) $$,
         (select jsonb_agg(jsonb_build_object('group', 'G', 'name', 'N' || n, 'price', 0))::text from generate_series(1, 21) n)),
  'WK001', null, 'more than 20 options on a line are rejected'
);
select throws_ok(
  format($$ select tests.sell('e1000000-0000-4000-9000-00000000000b', tests.geprek_line(15000, %L::jsonb), 15000) $$,
         (select jsonb_build_array(jsonb_build_object('group', 'G', 'name', repeat('x', 61), 'price', 0))::text)),
  'WK001', null, 'an option name longer than 60 characters is rejected'
);
select throws_ok(
  format($$ select tests.sell('e1000000-0000-4000-9000-00000000000c', tests.geprek_line(15000, '[]'::jsonb, to_jsonb(%L::text)), 15000) $$, repeat('x', 121)),
  'WK001', null, 'a note longer than 120 characters is rejected'
);
select throws_ok(
  $$ select tests.sell('e1000000-0000-4000-9000-00000000000d', tests.geprek_line(15000, '[]'::jsonb, '5'::jsonb), 15000) $$,
  'WK001', null, 'a note that is not text is rejected'
);
reset role;

select is_empty(
  $$ select 1 from public.transactions where id::text between 'e1000000-0000-4000-9000-000000000004' and 'e1000000-0000-4000-9000-00000000000d' $$,
  'every rejected sale wrote nothing'
);

-- Idempotency still holds with options -----------------------------------------
select tests.act_as('a2000000-0000-4000-9000-000000000001');
select is(
  tests.sell('e1000000-0000-4000-9000-000000000001',
    tests.geprek_line(22000, '[{"group":"Level","name":"Level 5","price":0},{"group":"Nasi","name":"Pakai nasi","price":4000},{"group":"Bagian","name":"Dada","price":3000}]'::jsonb),
    22000),
  'exists', 'resending the same sale returns exists'
);
reset role;
select is(
  (select count(*) from public.transaction_items where transaction_id = 'e1000000-0000-4000-9000-000000000001'),
  1::bigint, 'and the lines are not duplicated'
);

-- Clients cannot write sale lines directly --------------------------------------
select tests.act_as('a1000000-0000-4000-9000-000000000001');
select throws_ok(
  $$ update public.transaction_items set options = '[]'::jsonb $$,
  '42501', null, 'not even the owner can edit the options of a sold line'
);
reset role;

select * from finish();
rollback;

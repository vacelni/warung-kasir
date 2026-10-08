-- Transaction history query shapes (Phase 7; TEST_PLAN G.6, G.17; decision D1).
-- The app's history list reads `transactions` with RLS only. These tests run the same shapes the
-- client sends (keyset paging on (created_at, id), a Jakarta-day window, a code search, the cashier
-- profile join) as the real roles, so a paging or scope mistake shows up in the database, not in a
-- browser. Fixtures use the -9000- namespace; every created row is rolled back.
begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

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

-- Walks the whole list page by page the way the client does (a cursor of the last row's
-- created_at and id, never an offset) and returns the ids in the order they were shown.
create function tests.page_through(p_ascending boolean, p_size int)
returns uuid[]
language plpgsql
as $$
declare
  result uuid[] := '{}';
  cursor_time timestamptz;
  cursor_id uuid;
  r record;
  got int;
begin
  loop
    got := 0;
    if p_ascending then
      for r in
        select t.id, t.created_at from public.transactions t
        where cursor_time is null
           or t.created_at > cursor_time
           or (t.created_at = cursor_time and t.id > cursor_id)
        order by t.created_at asc, t.id asc
        limit p_size
      loop
        result := result || r.id;
        cursor_time := r.created_at;
        cursor_id := r.id;
        got := got + 1;
      end loop;
    else
      for r in
        select t.id, t.created_at from public.transactions t
        where cursor_time is null
           or t.created_at < cursor_time
           or (t.created_at = cursor_time and t.id < cursor_id)
        order by t.created_at desc, t.id desc
        limit p_size
      loop
        result := result || r.id;
        cursor_time := r.created_at;
        cursor_id := r.id;
        got := got + 1;
      end loop;
    end if;
    exit when got < p_size;
  end loop;
  return result;
end;
$$;
grant execute on function tests.page_through(boolean, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures: store A (owner, cashiers A1 and A2) and store B (owner, cashier B1)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a1000000-0000-4000-9000-000000000001', 'owner.a@history.test'),
  ('a2000000-0000-4000-9000-000000000001', 'kasir1.a@history.test'),
  ('a2000000-0000-4000-9000-000000000002', 'kasir2.a@history.test'),
  ('b1000000-0000-4000-9000-000000000001', 'owner.b@history.test'),
  ('b2000000-0000-4000-9000-000000000001', 'kasir1.b@history.test');

insert into public.stores (id, name) values
  ('5a000000-0000-4000-9000-000000000001', 'Warung A'),
  ('5b000000-0000-4000-9000-000000000001', 'Warung B');

insert into public.profiles (id, store_id, name, role, is_active) values
  ('a1000000-0000-4000-9000-000000000001', '5a000000-0000-4000-9000-000000000001', 'Owner A', 'owner', true),
  ('a2000000-0000-4000-9000-000000000001', '5a000000-0000-4000-9000-000000000001', 'Kasir A1', 'cashier', true),
  ('a2000000-0000-4000-9000-000000000002', '5a000000-0000-4000-9000-000000000001', 'Kasir A2', 'cashier', true),
  ('b1000000-0000-4000-9000-000000000001', '5b000000-0000-4000-9000-000000000001', 'Owner B', 'owner', true),
  ('b2000000-0000-4000-9000-000000000001', '5b000000-0000-4000-9000-000000000001', 'Kasir B1', 'cashier', true);

insert into public.categories (id, store_id, name) values
  ('ca000000-0000-4000-9000-00000000000a', '5a000000-0000-4000-9000-000000000001', 'Makanan');

insert into public.products (id, store_id, category_id, name, price) values
  ('d0000000-0000-4000-9000-00000000000a', '5a000000-0000-4000-9000-000000000001',
   'ca000000-0000-4000-9000-00000000000a', 'Nasi Goreng', 15000);

-- Cashier A1: three sales at exactly the same minute (ties), two more on 7 Oct, and the two
-- Jakarta day edges: 23:30 WIB on 7 Oct and 00:30 WIB on 8 Oct. Cashier A2: three sales, one of
-- them tied with A1's. Store B: two tied sales.
insert into public.transactions (id, store_id, cashier_id, code, total, paid_amount, change_amount, created_at) values
  ('7a000000-0000-4000-9000-0000000000a1', '5a000000-0000-4000-9000-000000000001', 'a2000000-0000-4000-9000-000000000001', 'TRX-20261007-7A00A1', 10000, 10000, 0, '2026-10-07 10:00:00+07'),
  ('7a000000-0000-4000-9000-0000000000a2', '5a000000-0000-4000-9000-000000000001', 'a2000000-0000-4000-9000-000000000001', 'TRX-20261007-7A00A2', 10000, 10000, 0, '2026-10-07 10:00:00+07'),
  ('7a000000-0000-4000-9000-0000000000a3', '5a000000-0000-4000-9000-000000000001', 'a2000000-0000-4000-9000-000000000001', 'TRX-20261007-7A00A3', 10000, 10000, 0, '2026-10-07 10:00:00+07'),
  ('7a000000-0000-4000-9000-0000000000a4', '5a000000-0000-4000-9000-000000000001', 'a2000000-0000-4000-9000-000000000001', 'TRX-20261007-7A00A4', 10000, 10000, 0, '2026-10-07 11:00:00+07'),
  ('7a000000-0000-4000-9000-0000000000a5', '5a000000-0000-4000-9000-000000000001', 'a2000000-0000-4000-9000-000000000001', 'TRX-20261007-7A00A5', 10000, 10000, 0, '2026-10-07 09:00:00+07'),
  ('7a000000-0000-4000-9000-0000000000e1', '5a000000-0000-4000-9000-000000000001', 'a2000000-0000-4000-9000-000000000001', 'TRX-20261007-7A00E1', 10000, 10000, 0, '2026-10-07 23:30:00+07'),
  ('7a000000-0000-4000-9000-0000000000e2', '5a000000-0000-4000-9000-000000000001', 'a2000000-0000-4000-9000-000000000001', 'TRX-20261008-7A00E2', 10000, 10000, 0, '2026-10-08 00:30:00+07'),
  ('7a000000-0000-4000-9000-0000000000b1', '5a000000-0000-4000-9000-000000000001', 'a2000000-0000-4000-9000-000000000002', 'TRX-20261007-7A00B1', 10000, 10000, 0, '2026-10-07 10:00:00+07'),
  ('7a000000-0000-4000-9000-0000000000b2', '5a000000-0000-4000-9000-000000000001', 'a2000000-0000-4000-9000-000000000002', 'TRX-20261007-7A00B2', 10000, 10000, 0, '2026-10-07 12:00:00+07'),
  ('7a000000-0000-4000-9000-0000000000b3', '5a000000-0000-4000-9000-000000000001', 'a2000000-0000-4000-9000-000000000002', 'TRX-20261007-7A00B3', 10000, 10000, 0, '2026-10-07 08:00:00+07'),
  ('7b000000-0000-4000-9000-0000000000c1', '5b000000-0000-4000-9000-000000000001', 'b2000000-0000-4000-9000-000000000001', 'TRX-20261007-7B00C1', 10000, 10000, 0, '2026-10-07 10:00:00+07'),
  ('7b000000-0000-4000-9000-0000000000c2', '5b000000-0000-4000-9000-000000000001', 'b2000000-0000-4000-9000-000000000001', 'TRX-20261007-7B00C2', 10000, 10000, 0, '2026-10-07 10:00:00+07');

-- Sale a1 has two lines of two units each (the list shows "4 item").
insert into public.transaction_items (transaction_id, store_id, product_id, product_name, unit_price, quantity, subtotal) values
  ('7a000000-0000-4000-9000-0000000000a1', '5a000000-0000-4000-9000-000000000001', 'd0000000-0000-4000-9000-00000000000a', 'Nasi Goreng', 3000, 2, 6000),
  ('7a000000-0000-4000-9000-0000000000a1', '5a000000-0000-4000-9000-000000000001', 'd0000000-0000-4000-9000-00000000000a', 'Es Teh', 2000, 2, 4000);

-- ===========================================================================
-- Owner A: the whole store, paged without a repeat or a gap
-- ===========================================================================
select tests.act_as('a1000000-0000-4000-9000-000000000001');

select is((select count(*)::int from public.transactions), 10, 'owner A reads all 10 sales of store A and none of store B');

select is(
  tests.page_through(false, 3),
  (select array_agg(id order by created_at desc, id desc) from public.transactions),
  'owner A: paging newest first by cursor visits every sale once, in order, across tied sale times'
);

select is(
  tests.page_through(true, 3),
  (select array_agg(id order by created_at asc, id asc) from public.transactions),
  'owner A: paging oldest first by cursor visits every sale once, in order, across tied sale times'
);

select is(
  (select count(distinct x)::int from unnest(tests.page_through(false, 2)) as x),
  10,
  'owner A: no sale appears twice when paged two at a time'
);

select is(
  tests.page_through(false, 10),
  (select array_agg(id order by created_at desc, id desc) from public.transactions),
  'owner A: a page size equal to the row count ends cleanly (no empty trailing page issue)'
);

-- Jakarta day window: today = [00:00 WIB, next 00:00 WIB) = [2026-10-06 17:00Z, 2026-10-07 17:00Z)
select is(
  (select count(*)::int from public.transactions
   where created_at >= '2026-10-06T17:00:00Z' and created_at < '2026-10-07T17:00:00Z'),
  9,
  '7 Oct (WIB) holds the 23:30 WIB sale and not the 00:30 WIB sale of 8 Oct'
);

select is(
  (select array_agg(code) from public.transactions
   where created_at >= '2026-10-07T17:00:00Z' and created_at < '2026-10-08T17:00:00Z'),
  array['TRX-20261008-7A00E2'],
  '8 Oct (WIB) starts at 00:30 WIB, although it is still 7 Oct in UTC'
);

-- Search by display code: case-insensitive contains, never by UUID
select is(
  (select count(*)::int from public.transactions where code ilike '%7a00a%'),
  5,
  'search by code part finds the matching sales, whatever the case'
);

select is_empty(
  $$ select 1 from public.transactions where code ilike '%7B00C1%' $$,
  'owner A: searching the code of a store B sale finds nothing'
);

-- Profile join for the cashier name (what the list embeds)
select is(
  (select p.name from public.transactions t join public.profiles p on p.id = t.cashier_id
   where t.id = '7a000000-0000-4000-9000-0000000000b1'),
  'Kasir A2',
  'owner A sees the cashier name of any cashier of the store'
);

-- The unit count the list shows is the sum of the item quantities
select is(
  (select sum(quantity)::int from public.transaction_items where transaction_id = '7a000000-0000-4000-9000-0000000000a1'),
  4,
  'a sale with two lines of two units counts as 4 units'
);

reset role;

-- ===========================================================================
-- Cashier A1: own sales only, with or without the client-side filter
-- ===========================================================================
select tests.act_as('a2000000-0000-4000-9000-000000000001');

select is((select count(*)::int from public.transactions), 7, 'cashier A1 reads only their own 7 sales');

select is(
  tests.page_through(false, 3),
  (select array_agg(id order by created_at desc, id desc) from public.transactions
   where cashier_id = 'a2000000-0000-4000-9000-000000000001'),
  'cashier A1: paging by cursor returns exactly their own sales, in order'
);

select is(
  (select count(*)::int from unnest(tests.page_through(false, 3)) as x
   where x in ('7a000000-0000-4000-9000-0000000000b1', '7a000000-0000-4000-9000-0000000000b2', '7a000000-0000-4000-9000-0000000000b3')),
  0,
  'cashier A1: paging never reaches a sale of cashier A2'
);

select is(
  (select array_agg(id order by created_at desc, id desc) from public.transactions),
  (select array_agg(id order by created_at desc, id desc) from public.transactions
   where cashier_id = 'a2000000-0000-4000-9000-000000000001'),
  'cashier A1: the cashier_id filter the UI adds changes nothing, RLS already scopes the rows'
);

select is_empty(
  $$ select 1 from public.transactions where code ilike '%7A00B%' $$,
  'cashier A1: searching the code of a sale of cashier A2 finds nothing'
);

select is(
  (select p.name from public.transactions t join public.profiles p on p.id = t.cashier_id
   where t.id = '7a000000-0000-4000-9000-0000000000a1'),
  'Kasir A1',
  'cashier A1 sees their own name on their own sale'
);

select is_empty(
  $$ select 1 from public.transactions t join public.profiles p on p.id = t.cashier_id where t.cashier_id = 'a2000000-0000-4000-9000-000000000002' $$,
  'cashier A1: no sale of cashier A2 joins to a visible profile'
);

reset role;

-- ===========================================================================
-- Cashier A2 and store isolation
-- ===========================================================================
select tests.act_as('a2000000-0000-4000-9000-000000000002');

select is(
  tests.page_through(true, 2),
  (select array_agg(id order by created_at asc, id asc) from public.transactions
   where cashier_id = 'a2000000-0000-4000-9000-000000000002'),
  'cashier A2: paging oldest first returns exactly their own 3 sales'
);

reset role;

select tests.act_as('b1000000-0000-4000-9000-000000000001');

select is(
  (select array_agg(code order by code) from public.transactions where code like 'TRX-%7%' and store_id = '5b000000-0000-4000-9000-000000000001'
     and id in ('7b000000-0000-4000-9000-0000000000c1', '7b000000-0000-4000-9000-0000000000c2')),
  array['TRX-20261007-7B00C1', 'TRX-20261007-7B00C2'],
  'owner B reads their own two tied sales'
);

reset role;

select * from finish();
rollback;

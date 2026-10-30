-- AI sales insight quota (docs/AI_INSIGHT.md). consume_ai_insight() is called as the real roles;
-- fixtures use the -9800- namespace and every created row is rolled back.
begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

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

insert into auth.users (id, email) values
  ('a1000000-0000-4000-9800-000000000001', 'owner.a@ai.test'),
  ('a2000000-0000-4000-9800-000000000001', 'kasir.a@ai.test'),
  ('b1000000-0000-4000-9800-000000000001', 'owner.b@ai.test');

insert into public.stores (id, name) values
  ('5a000000-0000-4000-9800-000000000001', 'Warung A'),
  ('5b000000-0000-4000-9800-000000000001', 'Warung B');

insert into public.profiles (id, store_id, name, role, is_active) values
  ('a1000000-0000-4000-9800-000000000001', '5a000000-0000-4000-9800-000000000001', 'Owner A', 'owner', true),
  ('a2000000-0000-4000-9800-000000000001', '5a000000-0000-4000-9800-000000000001', 'Kasir A', 'cashier', true),
  ('b1000000-0000-4000-9800-000000000001', '5b000000-0000-4000-9800-000000000001', 'Owner B', 'owner', true);

-- Yesterday's calls (Asia/Jakarta) do not count toward today's cap.
insert into public.ai_insight_usage (store_id, created_by, created_at)
select '5a000000-0000-4000-9800-000000000001', 'a1000000-0000-4000-9800-000000000001',
  date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta' - interval '1 second'
from generate_series(1, 25);

-- ---------------------------------------------------------------------------
-- Who may call it
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok($$ select public.consume_ai_insight() $$, '42501', null, 'anon cannot reserve an AI call');
reset role;

select tests.act_as('a2000000-0000-4000-9800-000000000001');
select throws_ok($$ select public.consume_ai_insight() $$, '42501', null, 'a cashier cannot reserve an AI call');
reset role;

select tests.act_as('a1000000-0000-4000-9800-000000000001');
select throws_ok($$ select * from public.ai_insight_usage $$, '42501', null, 'the owner cannot read the usage table directly');
select throws_ok(
  $$ insert into public.ai_insight_usage (store_id, created_by) values ('5a000000-0000-4000-9800-000000000001', auth.uid()) $$,
  '42501', null, 'the owner cannot write usage rows directly'
);

-- ---------------------------------------------------------------------------
-- The daily cap
-- ---------------------------------------------------------------------------
select is(public.consume_ai_insight(), 19, 'the first call today leaves 19 (yesterday does not count)');

select is(
  (select count(*)::integer from (select public.consume_ai_insight() from generate_series(1, 19)) calls),
  19, 'the owner can make 20 calls in a day'
);

select throws_ok($$ select public.consume_ai_insight() $$, 'P0001', 'Daily AI insight limit reached.', 'call 21 is refused');
reset role;

select is(
  (select count(*)::integer from public.ai_insight_usage
   where store_id = '5a000000-0000-4000-9800-000000000001'
     and created_at >= date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta'),
  20, 'a refused call writes no row'
);
select is(
  (select count(distinct created_by)::integer from public.ai_insight_usage where store_id = '5a000000-0000-4000-9800-000000000001'),
  1, 'every row records the owner who asked'
);

-- Another store has its own cap.
select tests.act_as('b1000000-0000-4000-9800-000000000001');
select is(public.consume_ai_insight(), 19, 'store B is not affected by store A');
reset role;

select * from finish();
rollback;

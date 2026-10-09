-- Phase 9 regression: the database guarantees employee administration, store settings, and the
-- CSV export rely on (SECURITY E.3, E.6, E.10; DATABASE D.3, D.11; TEST_PLAN G.7, G.8, G.18).
-- No schema change in Phase 9: these assertions pin the existing grants and RLS that the
-- admin-cashier Edge Function, Pengaturan, and Backup / Export are built on.
-- Fixture UUIDs use the -9600- namespace.
begin;
create extension if not exists pgtap with schema extensions;

select plan(21);

create schema tests;
grant usage on schema tests to anon, authenticated;
-- Helpers are called as anon/authenticated. Since SEC-08 new functions get no EXECUTE by
-- default (not even through PUBLIC), so grant the helpers of this schema explicitly.
alter default privileges in schema tests grant execute on functions to anon, authenticated;

-- Opens a session the way GoTrue does at sign-in: authorization also requires the token's
-- session to exist (INFO-3). SECURITY DEFINER so it works while already acting as a client.
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
  ('a1000000-0000-4000-9600-000000000001', 'owner.a@phase9.test'),
  ('a2000000-0000-4000-9600-000000000001', 'kasir1.a@phase9.test'),
  ('b1000000-0000-4000-9600-000000000001', 'owner.b@phase9.test'),
  ('b2000000-0000-4000-9600-000000000001', 'kasir1.b@phase9.test');

insert into public.stores (id, name, receipt_note) values
  ('5a000000-0000-4000-9600-000000000001', 'Warung A', 'Terima kasih'),
  ('5b000000-0000-4000-9600-000000000001', 'Warung B', null);

insert into public.profiles (id, store_id, name, role, is_active) values
  ('a1000000-0000-4000-9600-000000000001', '5a000000-0000-4000-9600-000000000001', 'Owner A', 'owner', true),
  ('a2000000-0000-4000-9600-000000000001', '5a000000-0000-4000-9600-000000000001', 'Kasir A1', 'cashier', true),
  ('b1000000-0000-4000-9600-000000000001', '5b000000-0000-4000-9600-000000000001', 'Owner B', 'owner', true),
  ('b2000000-0000-4000-9600-000000000001', '5b000000-0000-4000-9600-000000000001', 'Kasir B1', 'cashier', true);

-- ---------------------------------------------------------------------------
-- Structure and grants (as postgres)
-- ---------------------------------------------------------------------------

-- The profile export reads public.profiles: it has no place for an email, password, or token.
select columns_are('public', 'profiles',
  array['id', 'store_id', 'name', 'role', 'is_active', 'created_at', 'updated_at'],
  'profiles holds no credential columns (export safety)');

-- Owner edits a cashier's name only; role, store and status change only through admin-cashier.
select column_privs_are('public', 'profiles', 'name', 'authenticated', array['SELECT', 'UPDATE'],
  'authenticated may update profiles.name');
select column_privs_are('public', 'profiles', 'role', 'authenticated', array['SELECT'],
  'authenticated may not update profiles.role');
select column_privs_are('public', 'profiles', 'is_active', 'authenticated', array['SELECT'],
  'authenticated may not update profiles.is_active');
select column_privs_are('public', 'profiles', 'store_id', 'authenticated', array['SELECT'],
  'authenticated may not update profiles.store_id');

-- Pengaturan writes exactly the four store profile columns.
select column_privs_are('public', 'stores', 'receipt_note', 'authenticated', array['SELECT', 'UPDATE'],
  'authenticated may update stores.receipt_note');
select column_privs_are('public', 'stores', 'id', 'authenticated', array['SELECT'],
  'authenticated may not update stores.id');
select column_privs_are('public', 'stores', 'created_at', 'authenticated', array['SELECT'],
  'authenticated may not update stores.created_at');

-- The admin-cashier function writes profiles with the server-side secret key (service_role).
select table_privs_are('public', 'profiles', 'service_role', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  'service_role keeps the profile privileges admin-cashier needs');

-- ---------------------------------------------------------------------------
-- Owner A
-- ---------------------------------------------------------------------------
select tests.act_as('a1000000-0000-4000-9600-000000000001');

select throws_ok('select 1 from auth.users', '42501', null,
  'owner cannot read auth.users (no credentials reachable from the app)');
select throws_ok('select 1 from auth.identities', '42501', null,
  'owner cannot read auth.identities');

with u as (
  update public.stores set receipt_note = 'Sampai jumpa', phone = '0812', address = 'Jl. Baru'
  where id = '5a000000-0000-4000-9600-000000000001' returning 1
)
select is(count(*)::int, 1, 'owner updates the settings of their own store') from u;

with u as (
  update public.stores set receipt_note = 'Diambil' where id = '5b000000-0000-4000-9600-000000000001' returning 1
)
select is(count(*)::int, 0, 'owner cannot update the settings of another store') from u;

select throws_ok(
  $$ update public.stores set created_at = now() where id = '5a000000-0000-4000-9600-000000000001' $$,
  '42501', null,
  'owner cannot update store columns outside the settings');

-- Export scope: exactly the own store's rows.
select results_eq(
  'select id from public.profiles order by id',
  $$ values ('a1000000-0000-4000-9600-000000000001'::uuid), ('a2000000-0000-4000-9600-000000000001'::uuid) $$,
  'owner export of profiles contains only store A');
select results_eq('select id from public.stores',
  $$ values ('5a000000-0000-4000-9600-000000000001'::uuid) $$,
  'owner export of stores contains only store A');

with u as (
  update public.profiles set name = 'Diambil' where id = 'b2000000-0000-4000-9600-000000000001' returning 1
)
select is(count(*)::int, 0, 'owner cannot rename a cashier of another store') from u;

-- ---------------------------------------------------------------------------
-- Cashier A1
-- ---------------------------------------------------------------------------
select tests.act_as('a2000000-0000-4000-9600-000000000001');

with u as (
  update public.stores set receipt_note = 'Diubah kasir' where id = '5a000000-0000-4000-9600-000000000001' returning 1
)
select is(count(*)::int, 0, 'cashier cannot change store settings') from u;

with u as (
  update public.profiles set name = 'Nama Baru' where id = 'a2000000-0000-4000-9600-000000000001' returning 1
)
select is(count(*)::int, 0, 'cashier cannot rename themselves') from u;

select results_eq('select id from public.profiles',
  $$ values ('a2000000-0000-4000-9600-000000000001'::uuid) $$,
  'cashier reads only their own profile (no employee export)');

reset role;
select is(
  (select receipt_note from public.stores where id = '5a000000-0000-4000-9600-000000000001'),
  'Sampai jumpa',
  'the cashier''s attempt left the owner''s setting unchanged');

select * from finish();
rollback;

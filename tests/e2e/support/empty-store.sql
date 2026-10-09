-- E2E fixture: a store with NO business data, for the empty-state specs (TEST_PLAN G.14).
-- Local development database only; applied by tests/e2e/support/global-setup.ts before the run and
-- removed by the run's teardown. It is not a migration and not part of supabase/seed.sql.
--
--   Store C "Warung Kosong"
--   owner.c@warungkasir.test   (owner, "Pak Kosong")
--   kasir.c@warungkasir.test   (cashier, "Wati")
--   Store D "Warung Sepi"      (an owner and nothing else: not even a cashier)
--   owner.d@warungkasir.test   (owner, "Bu Sepi")
--   Password for all: password123
--
-- No categories, products or transactions in either store.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000', v.id, 'authenticated', 'authenticated', v.email,
  extensions.crypt('password123', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', ''
from (values
  ('c1000000-0000-4000-8000-000000000001'::uuid, 'owner.c@warungkasir.test'),
  ('c2000000-0000-4000-8000-000000000001'::uuid, 'kasir.c@warungkasir.test'),
  ('d1000000-0000-4000-8000-000000000001'::uuid, 'owner.d@warungkasir.test')
) as v (id, email)
on conflict (id) do nothing;

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select
  u.id::text, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u
where u.email in ('owner.c@warungkasir.test', 'kasir.c@warungkasir.test', 'owner.d@warungkasir.test')
on conflict do nothing;

insert into public.stores (id, name) values
  ('5c000000-0000-4000-8000-000000000001', 'Warung Kosong'),
  ('5d000000-0000-4000-8000-000000000001', 'Warung Sepi')
on conflict (id) do nothing;

insert into public.profiles (id, store_id, name, role, is_active) values
  ('c1000000-0000-4000-8000-000000000001', '5c000000-0000-4000-8000-000000000001', 'Pak Kosong', 'owner', true),
  ('c2000000-0000-4000-8000-000000000001', '5c000000-0000-4000-8000-000000000001', 'Wati', 'cashier', true),
  ('d1000000-0000-4000-8000-000000000001', '5d000000-0000-4000-8000-000000000001', 'Bu Sepi', 'owner', true)
on conflict (id) do nothing;

-- WarungKasir public demo: one fictional store with a full menu and 30 days of sales.
-- NEVER run against production. demo.reset() refuses to run if the database holds any
-- store other than the demo store, so it cannot touch a real warung's data.
--
-- Used for:
--   * the hosted demo project (docs/DEMO.md): applied once, then demo.reset() runs hourly
--     through pg_cron (supabase/demo/schedule.sql) so visitors always find a clean store;
--   * local screenshots: `supabase db reset --no-seed`, then run this file.
--
-- Accounts (password for both: demo12345):
--   owner@demo.warungkasir.test   owner   "Pak Joko"
--   kasir@demo.warungkasir.test   cashier "Rina"
-- A second cashier ("Dimas", no known password) only appears in history and reports.

create schema if not exists demo;
revoke all on schema demo from public;

create or replace function demo.reset()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_store   constant uuid := '5d000000-0000-4000-8000-000000000001';
  c_owner   constant uuid := '5d100000-0000-4000-8000-000000000001';
  c_kasir   constant uuid := '5d200000-0000-4000-8000-000000000001';
  c_kasir2  constant uuid := '5d200000-0000-4000-8000-000000000002';
  c_users   constant uuid[] := array[c_owner, c_kasir, c_kasir2];
  -- Weighted pick list: each product id appears as often as it sells.
  v_pool    uuid[] := '{}';
  v_today   date := (now() at time zone 'Asia/Jakarta')::date;
  v_day     date;
  v_sales   int;
  v_lines   int;
  v_id      uuid;
  v_at      timestamptz;
  v_total   int;
  v_paid    int;
  v_product record;
  v_pick    uuid;
  v_qty     int;
  v_cashier uuid;
  v_round   int;
begin
  if exists (select 1 from public.stores where id <> c_store) then
    raise exception 'demo.reset: this database holds a store other than the demo store; refusing to run';
  end if;

  -- ---- wipe the demo store (children first) ------------------------------------------------
  delete from public.transaction_items where store_id = c_store;
  delete from public.transactions where store_id = c_store;
  delete from public.product_option_groups where store_id = c_store;
  delete from public.option_choices where store_id = c_store;
  delete from public.option_groups where store_id = c_store;
  delete from public.products where store_id = c_store;
  delete from public.categories where store_id = c_store;
  delete from public.ai_insight_usage where store_id = c_store;

  -- Cashiers a visitor created through the app: drop the profile and the auth user.
  create temporary table extra_users on commit drop as
    select id from public.profiles where store_id = c_store and id <> all (c_users);
  delete from public.profiles where id in (select id from extra_users);
  delete from auth.users where id in (select id from extra_users);
  delete from public.profiles where store_id = c_store;
  delete from public.stores where id = c_store;

  -- ---- accounts: recreate, reset passwords, end every session, lift bans ------------------
  delete from auth.sessions where user_id = any (c_users);
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  )
  select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
         extensions.crypt('demo12345', extensions.gen_salt('bf')), now(),
         '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
  from (values (c_owner, 'owner@demo.warungkasir.test'),
               (c_kasir, 'kasir@demo.warungkasir.test'),
               (c_kasir2, 'dimas@demo.warungkasir.test')) as u (id, email)
  on conflict (id) do update
    set encrypted_password = excluded.encrypted_password,
        email = excluded.email,
        banned_until = null,
        updated_at = now();

  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
         'email', now(), now(), now()
  from auth.users u
  where u.id = any (c_users)
  on conflict (provider_id, provider) do nothing;

  -- ---- store, staff, catalog ---------------------------------------------------------------
  insert into public.stores (id, name, address, phone, receipt_note)
  values (c_store, 'Warung Makan Sederhana', 'Jl. Contoh No. 1, Semarang', '081200000000',
          'Terima kasih, sampai jumpa lagi!');

  insert into public.profiles (id, store_id, name, role, is_active) values
    (c_owner, c_store, 'Pak Joko', 'owner', true),
    (c_kasir, c_store, 'Rina', 'cashier', true),
    (c_kasir2, c_store, 'Dimas', 'cashier', true);

  insert into public.categories (id, store_id, name) values
    ('5dca0000-0000-4000-8000-000000000001', c_store, 'Makanan'),
    ('5dca0000-0000-4000-8000-000000000002', c_store, 'Minuman'),
    ('5dca0000-0000-4000-8000-000000000003', c_store, 'Camilan');

  insert into public.products (id, store_id, category_id, name, price, is_active)
  select ('5dd00000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, c_store,
         ('5dca0000-0000-4000-8000-00000000000' || cat)::uuid, name, price, active
  from (values
    (1, 1, 'Nasi Goreng', 15000, true),
    (2, 1, 'Mie Goreng', 14000, true),
    (3, 1, 'Mie Rebus', 14000, true),
    (4, 1, 'Ayam Geprek', 17000, true),
    (5, 1, 'Soto Ayam', 13000, true),
    (6, 1, 'Nasi Rames', 12000, true),
    (7, 1, 'Pecel Lele', 16000, true),
    (8, 1, 'Nasi Rawon', 18000, false),
    (9, 2, 'Es Teh Manis', 4000, true),
    (10, 2, 'Teh Hangat', 3000, true),
    (11, 2, 'Es Jeruk', 6000, true),
    (12, 2, 'Kopi Hitam', 4000, true),
    (13, 2, 'Es Kopi Susu', 10000, true),
    (14, 2, 'Air Mineral', 4000, true),
    (15, 3, 'Kerupuk', 2000, true),
    (16, 3, 'Tempe Mendoan', 5000, true),
    (17, 3, 'Pisang Goreng', 6000, true)
  ) as p (n, cat, name, price, active);

  insert into public.option_groups (id, store_id, name, allow_multiple, required) values
    ('5d0a0000-0000-4000-8000-000000000001', c_store, 'Level Pedas', false, true),
    ('5d0a0000-0000-4000-8000-000000000002', c_store, 'Tambahan', true, false),
    ('5d0a0000-0000-4000-8000-000000000003', c_store, 'Es / Panas', false, true);

  insert into public.option_choices (store_id, group_id, name, price_delta, is_default, position) values
    (c_store, '5d0a0000-0000-4000-8000-000000000001', 'Tidak pedas', 0, false, 0),
    (c_store, '5d0a0000-0000-4000-8000-000000000001', 'Sedang', 0, true, 1),
    (c_store, '5d0a0000-0000-4000-8000-000000000001', 'Pedas', 0, false, 2),
    (c_store, '5d0a0000-0000-4000-8000-000000000001', 'Pedas banget', 0, false, 3),
    (c_store, '5d0a0000-0000-4000-8000-000000000002', 'Telur ceplok', 4000, false, 0),
    (c_store, '5d0a0000-0000-4000-8000-000000000002', 'Ayam suwir', 5000, false, 1),
    (c_store, '5d0a0000-0000-4000-8000-000000000002', 'Kerupuk', 2000, false, 2),
    (c_store, '5d0a0000-0000-4000-8000-000000000003', 'Es', 0, true, 0),
    (c_store, '5d0a0000-0000-4000-8000-000000000003', 'Panas', 0, false, 1);

  insert into public.product_option_groups (product_id, group_id, store_id, position) values
    ('5dd00000-0000-4000-8000-000000000001', '5d0a0000-0000-4000-8000-000000000001', c_store, 0),
    ('5dd00000-0000-4000-8000-000000000001', '5d0a0000-0000-4000-8000-000000000002', c_store, 1),
    ('5dd00000-0000-4000-8000-000000000002', '5d0a0000-0000-4000-8000-000000000001', c_store, 0),
    ('5dd00000-0000-4000-8000-000000000002', '5d0a0000-0000-4000-8000-000000000002', c_store, 1),
    ('5dd00000-0000-4000-8000-000000000004', '5d0a0000-0000-4000-8000-000000000001', c_store, 0),
    ('5dd00000-0000-4000-8000-000000000004', '5d0a0000-0000-4000-8000-000000000002', c_store, 1),
    ('5dd00000-0000-4000-8000-000000000012', '5d0a0000-0000-4000-8000-000000000003', c_store, 0);

  -- ---- 30 days of sales, reproducible ------------------------------------------------------
  perform setseed(0.42);
  select array_agg(p.id) into v_pool
  from public.products p
  cross join lateral generate_series(1, case p.name
      when 'Nasi Goreng' then 9 when 'Es Teh Manis' then 10 when 'Ayam Geprek' then 7
      when 'Mie Goreng' then 6 when 'Teh Hangat' then 5 when 'Es Jeruk' then 5
      when 'Soto Ayam' then 4 when 'Kerupuk' then 6 else 2 end)
  where p.store_id = c_store and p.is_active;

  for v_day in select generate_series(v_today - 29, v_today, interval '1 day')::date loop
    -- Busier on weekends, a little growth over the month.
    v_sales := 16 + floor(random() * 10)::int
               + case when extract(isodow from v_day) >= 6 then 8 else 0 end
               + (v_day - (v_today - 29)) / 5;
    for i in 1 .. v_sales loop
      v_id := gen_random_uuid();
      -- Lunch and dinner peaks between 07:00 and 21:00 Jakarta time.
      v_at := (v_day + make_interval(hours => case when random() < 0.45 then 11 + floor(random() * 3)::int
                                                   when random() < 0.6 then 17 + floor(random() * 4)::int
                                                   else 7 + floor(random() * 14)::int end,
                                     mins => floor(random() * 60)::int))::timestamp
              at time zone 'Asia/Jakarta';
      continue when v_at > now();
      v_cashier := case when random() < 0.55 then c_kasir when random() < 0.8 then c_kasir2 else c_owner end;
      v_total := 0;
      v_lines := 1 + floor(random() * 3)::int;

      insert into public.transactions (id, store_id, cashier_id, code, total, paid_amount, change_amount, created_at, synced_at)
      values (v_id, c_store, v_cashier,
              'TRX-' || to_char(v_at at time zone 'Asia/Jakarta', 'YYYYMMDD') || '-' || upper(left(v_id::text, 6)),
              1, 1, 0, v_at, v_at);

      for j in 1 .. v_lines loop
        -- Pick first: random() inside the WHERE clause would be re-drawn for every row.
        v_pick := v_pool[1 + floor(random() * array_length(v_pool, 1))::int];
        select p.id, p.name, p.price into v_product from public.products p where p.id = v_pick;
        continue when exists (select 1 from public.transaction_items t
                              where t.transaction_id = v_id and t.product_id = v_product.id);
        v_qty := case when random() < 0.7 then 1 when random() < 0.8 then 2 else 3 end;
        insert into public.transaction_items (transaction_id, store_id, product_id, product_name, unit_price, quantity, subtotal)
        values (v_id, c_store, v_product.id, v_product.name, v_product.price, v_qty, v_product.price * v_qty);
        v_total := v_total + v_product.price * v_qty;
      end loop;

      -- Customers pay exact money or with the next 5k/10k/20k/50k/100k note.
      v_round := (array[0, 5000, 10000, 20000, 50000, 100000])[1 + floor(random() * 6)::int];
      v_paid := case when v_round = 0 then v_total else ceil(v_total::numeric / v_round)::int * v_round end;
      update public.transactions
        set total = v_total, paid_amount = v_paid, change_amount = v_paid - v_total
        where id = v_id;
    end loop;
  end loop;
end;
$$;

revoke all on function demo.reset() from public, anon, authenticated;

-- Cheap repair between full resets: a visitor can change a demo password through the Auth API
-- (SECURITY E.12) or, as owner, deactivate the demo cashier. This puts both logins back.
create or replace function demo.restore_logins()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update auth.users
     set encrypted_password = extensions.crypt('demo12345', extensions.gen_salt('bf')),
         banned_until = null,
         updated_at = now()
   where id in ('5d100000-0000-4000-8000-000000000001', '5d200000-0000-4000-8000-000000000001')
     and (banned_until is not null
          -- crypt() raises on a value that is not a bcrypt hash; CASE keeps it from being called then.
          or case when encrypted_password ~ '^\$2[aby]\$'
                  then encrypted_password <> extensions.crypt('demo12345', encrypted_password)
                  else true end);
  update public.profiles
     set is_active = true
   where id = '5d200000-0000-4000-8000-000000000001' and not is_active;
end;
$$;

revoke all on function demo.restore_logins() from public, anon, authenticated;

select demo.reset();

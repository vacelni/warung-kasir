-- Session revocation (Phase 12, INFO-3; SECURITY E.9–E.10).
--
-- Measured on GoTrue v2.197.0 before this migration (tests/functions/session-lifecycle.test.ts):
--   * an owner's password reset deletes the cashier's sessions, but the old access token (a
--     signed JWT, valid up to jwt_expiry) still passed RLS and create_transaction;
--   * deactivation bans the user (no refresh) and RLS denies the inactive profile, but the
--     sessions survive: after reactivation the old refresh AND access tokens worked again.
--
-- Fix: authorization also requires the token's session to exist in auth.sessions, and the
-- admin-cashier Edge Function deletes the cashier's sessions on deactivation and password reset
-- (public.revoke_user_sessions, service_role only). A revoked session then loses data access
-- at once, and stays revoked after reactivation.

-- ---------------------------------------------------------------------------
-- True when the caller's access token names a session that still exists and has not expired.
-- GoTrue puts the session id in every user access token (claim session_id).
-- ---------------------------------------------------------------------------
create function private.session_is_live()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.sessions s
    where s.id = (
        select case
          when (auth.jwt() ->> 'session_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then (auth.jwt() ->> 'session_id')::uuid
        end
      )
      and s.user_id = (select auth.uid())
      and (s.not_after is null or s.not_after > now())
  )
$$;

-- Called only from the SECURITY DEFINER helpers below and from create_transaction.
revoke all on function private.session_is_live() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS helpers (20261008000200): unchanged, plus the live-session condition. Every policy and the
-- report functions read the caller's store and role through these two.
-- ---------------------------------------------------------------------------
create or replace function private.current_store_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.store_id
  from public.profiles p
  where p.id = (select auth.uid())
    and p.is_active
    and (select private.session_is_live())
$$;

create or replace function private.current_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
    and p.is_active
    and (select private.session_is_live())
$$;

-- ---------------------------------------------------------------------------
-- Deletes every session of a user; their refresh tokens go with them (ON DELETE CASCADE).
-- For the admin-cashier Edge Function (service_role) only. Returns the number of sessions ended.
-- ---------------------------------------------------------------------------
create function public.revoke_user_sessions(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- create_transaction, third definition: the second one (20261009120100) plus the live-session
-- check after the active-profile check, raised as WK003 so the client keeps the sale pending.
-- ---------------------------------------------------------------------------
create or replace function public.create_transaction(
  p_id uuid,
  p_code text,
  p_created_at timestamptz,
  p_total bigint,
  p_paid_amount bigint,
  p_change_amount bigint,
  p_items jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  max_amount constant bigint := 2147483647;
  v_cashier_id uuid := (select auth.uid());
  v_store_id uuid;
  v_existing_store_id uuid;
  v_existing_cashier_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_quantity bigint;
  v_unit_price bigint;
  v_subtotal bigint;
  v_total bigint := 0;
  v_inserted_id uuid;
begin
  -- Caller: store_id and cashier_id always come from the caller's active
  -- profile, never from the payload.
  select p.store_id
    into v_store_id
  from public.profiles p
  where p.id = v_cashier_id
    and p.is_active;

  if v_store_id is null then
    raise exception using errcode = 'WK002', message = 'create_transaction: the caller has no active profile';
  end if;

  -- The caller's session must still exist (INFO-3): an access token outlives an ended session
  -- (password reset, deactivation then reactivation) until it expires. Checked after the profile,
  -- so a deactivated cashier still gets WK002 (failed, SECURITY E.10). WK003 = sign in again; the
  -- client keeps the sale pending and sends it after the next login.
  if not private.session_is_live() then
    raise exception using errcode = 'WK003', message = 'create_transaction: the session has ended; sign in again';
  end if;

  if p_id is null then
    raise exception using errcode = 'WK001', message = 'create_transaction: id is required';
  end if;

  -- Idempotency: an id that already exists is never written again. A retry
  -- after a lost response gets 'exists' and the client marks it synced.
  select t.store_id, t.cashier_id
    into v_existing_store_id, v_existing_cashier_id
  from public.transactions t
  where t.id = p_id;

  if found then
    if v_existing_store_id = v_store_id and v_existing_cashier_id = v_cashier_id then
      return 'exists';
    end if;
    -- Another user's id: never report someone else's sale as this caller's.
    raise exception using errcode = 'WK001', message = 'create_transaction: id belongs to another transaction';
  end if;

  -- Items -------------------------------------------------------------------
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = 'WK001', message = 'create_transaction: items must be a non-empty array';
  end if;

  -- SEC-07: bounded payload (DATABASE D.9).
  if jsonb_array_length(p_items) > 200 then
    raise exception using errcode = 'WK001', message = 'create_transaction: at most 200 items per sale';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception using errcode = 'WK001', message = 'create_transaction: each item must be an object';
    end if;

    v_quantity := private.jsonb_positive_integer(v_item -> 'quantity');
    v_unit_price := private.jsonb_positive_integer(v_item -> 'unit_price');
    v_subtotal := private.jsonb_positive_integer(v_item -> 'subtotal');
    if v_quantity is null or v_unit_price is null or v_subtotal is null then
      raise exception using errcode = 'WK001',
        message = 'create_transaction: quantity, unit_price, and subtotal must be whole numbers from 1 to 2147483647';
    end if;

    -- Both factors are at most 2^31, so the bigint product cannot overflow.
    if v_subtotal <> v_unit_price * v_quantity then
      raise exception using errcode = 'WK001', message = 'create_transaction: subtotal does not equal unit_price × quantity';
    end if;

    if jsonb_typeof(v_item -> 'product_name') is distinct from 'string'
       or btrim(v_item ->> 'product_name') = '' then
      raise exception using errcode = 'WK001', message = 'create_transaction: product_name is required';
    end if;

    if char_length(v_item ->> 'product_name') > 120 then
      raise exception using errcode = 'WK001', message = 'create_transaction: product_name is longer than 120 characters';
    end if;

    if jsonb_typeof(v_item -> 'product_id') is distinct from 'string'
       or (v_item ->> 'product_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception using errcode = 'WK001', message = 'create_transaction: product_id must be a UUID';
    end if;
    v_product_id := (v_item ->> 'product_id')::uuid;

    -- Active or inactive, but always the caller's own store. unit_price is NOT
    -- compared with the current product price: offline sales may use a cached
    -- price (accepted risk, SECURITY E.12).
    if not exists (
      select 1 from public.products pr
      where pr.id = v_product_id
        and pr.store_id = v_store_id
    ) then
      raise exception using errcode = 'WK001', message = 'create_transaction: product does not belong to the caller''s store';
    end if;

    v_total := v_total + v_subtotal;
    if v_total > max_amount then
      raise exception using errcode = 'WK001', message = 'create_transaction: total exceeds 2147483647';
    end if;
  end loop;

  -- Header: every client value must equal the server's own calculation ------
  if p_total is distinct from v_total then
    raise exception using errcode = 'WK001', message = 'create_transaction: total does not equal the sum of subtotals';
  end if;

  if p_paid_amount is null or p_paid_amount > max_amount then
    raise exception using errcode = 'WK001', message = 'create_transaction: paid_amount must be at most 2147483647';
  end if;

  if p_paid_amount < v_total then
    raise exception using errcode = 'WK001', message = 'create_transaction: paid_amount is less than total';
  end if;

  if p_change_amount is distinct from p_paid_amount - v_total then
    raise exception using errcode = 'WK001', message = 'create_transaction: change_amount does not equal paid_amount - total';
  end if;

  if p_created_at is null then
    raise exception using errcode = 'WK001', message = 'create_transaction: created_at is required';
  end if;

  -- TRX-<Asia/Jakarta sale date>-<first 6 hex of the id, uppercase> (D.6).
  if p_code is distinct from
       'TRX-' || to_char(p_created_at at time zone 'Asia/Jakarta', 'YYYYMMDD')
       || '-' || upper(left(replace(p_id::text, '-', ''), 6)) then
    raise exception using errcode = 'WK001', message = 'create_transaction: code does not match id and created_at';
  end if;

  -- Write -------------------------------------------------------------------
  -- created_at is the client sale time, kept as sent; synced_at is the
  -- server's receive time (D.6, decision D4).
  insert into public.transactions (
    id, store_id, cashier_id, code, total, paid_amount, change_amount, status, created_at, synced_at
  )
  values (
    p_id, v_store_id, v_cashier_id, p_code, v_total, p_paid_amount, p_change_amount, 'completed', p_created_at, now()
  )
  on conflict (id) do nothing
  returning id into v_inserted_id;

  -- A concurrent call with the same id committed first. The committed row is read again (a new
  -- snapshot sees it): only the caller's own row is their retry; another user's id is rejected,
  -- exactly like the pre-check above, so a sale is never reported synced on the wrong device (SEC-05).
  if v_inserted_id is null then
    select t.store_id, t.cashier_id
      into v_existing_store_id, v_existing_cashier_id
    from public.transactions t
    where t.id = p_id;

    if v_existing_store_id = v_store_id and v_existing_cashier_id = v_cashier_id then
      return 'exists';
    end if;
    raise exception using errcode = 'WK001', message = 'create_transaction: id belongs to another transaction';
  end if;

  insert into public.transaction_items (
    transaction_id, store_id, product_id, product_name, unit_price, quantity, subtotal
  )
  select
    p_id,
    v_store_id,
    (item ->> 'product_id')::uuid,
    item ->> 'product_name',
    (item -> 'unit_price')::numeric::integer,
    (item -> 'quantity')::numeric::integer,
    (item -> 'subtotal')::numeric::integer
  from jsonb_array_elements(p_items) as item;

  return 'created';
end;
$$;

revoke all on function public.create_transaction(uuid, text, timestamptz, bigint, bigint, bigint, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_transaction(uuid, text, timestamptz, bigint, bigint, bigint, jsonb)
  to authenticated;

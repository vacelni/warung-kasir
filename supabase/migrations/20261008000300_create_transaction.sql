-- create_transaction RPC (docs/DATABASE.md D.9): the only transaction write path.
--
-- Clients have no INSERT/UPDATE/DELETE on transactions or transaction_items
-- (previous migration); this SECURITY DEFINER function is the one way in. It
-- runs as a single statement, so the header and every item are written
-- atomically or not at all.
--
-- Rejections use distinguishable SQLSTATEs so the client can mark the outbox
-- entry failed (permanent) instead of pending (transient):
--   WK001  the sale itself is invalid (items, arithmetic, payment, code, limits, product store)
--   WK002  the caller has no active profile (deactivated, or no profile at all)

-- ---------------------------------------------------------------------------
-- Reads a JSON value as a whole number from 1 to 2147483647 (the PostgreSQL
-- integer limit); anything else (missing, string, fraction, 0, negative, too
-- large) gives NULL. Called only from create_transaction.
-- ---------------------------------------------------------------------------
create function private.jsonb_positive_integer(value jsonb)
returns bigint
language plpgsql
immutable
set search_path = ''
as $$
declare
  n numeric;
begin
  if value is null or jsonb_typeof(value) <> 'number' then
    return null;
  end if;
  n := value::numeric;
  if n <> trunc(n) or n < 1 or n > 2147483647 then
    return null;
  end if;
  return n::bigint;
end;
$$;

revoke all on function private.jsonb_positive_integer(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_transaction
--
-- Money parameters are bigint so out-of-range input reaches the validation
-- below (and gets WK001) instead of failing the integer cast in PostgREST.
-- ---------------------------------------------------------------------------
create function public.create_transaction(
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

  -- A concurrent call with the same id committed first.
  if v_inserted_id is null then
    return 'exists';
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

-- Grants (D.9, D.11): only signed-in users may call it; anon never.
revoke all on function public.create_transaction(uuid, text, timestamptz, bigint, bigint, bigint, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_transaction(uuid, text, timestamptz, bigint, bigint, bigint, jsonb)
  to authenticated;

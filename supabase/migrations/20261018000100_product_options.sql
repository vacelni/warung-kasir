-- Product options (post-launch feature; DATABASE D.12).
--
-- A menu item such as "Geprek" can carry choices the cashier taps before it joins the order:
-- with rice or not, spice level, which part of the chicken, extras. Owners define reusable option
-- groups ("Level", "Bagian ayam") with choices that may add to the price, then attach groups to
-- products. A product without groups behaves exactly as before.
--
-- Additive only: three new tables, two new columns with defaults, and a new definition of
-- create_transaction. No existing row is rewritten; every existing sale keeps options = [].
-- A sold line stores a snapshot of what was chosen (group name, choice name, price added) so
-- later edits or removal of options never change history, like product_name and unit_price.

-- ---------------------------------------------------------------------------
-- products: target of the composite foreign key from product_option_groups, so a link can never
-- join a product to a group of another store.
-- ---------------------------------------------------------------------------
alter table public.products
  add constraint products_id_store_id_key unique (id, store_id);

-- ---------------------------------------------------------------------------
-- option_groups: "Level", "Bagian ayam", "Nasi", "Tambahan".
--   allow_multiple false = pick one; true = pick any number (extras).
--   required true = the cashier must choose before adding to the order.
-- ---------------------------------------------------------------------------
create table public.option_groups (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete restrict,
  name text not null,
  allow_multiple boolean not null default false,
  required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint option_groups_name_not_blank check (btrim(name) <> ''),
  constraint option_groups_name_length check (char_length(name) <= 60),
  constraint option_groups_store_id_name_key unique (store_id, name),
  constraint option_groups_id_store_id_key unique (id, store_id)
);

-- ---------------------------------------------------------------------------
-- option_choices: "Level 3", "Dada", "Pakai nasi". price_delta is what the choice adds to the
-- unit price (0 for free choices such as spice level). A group deleted by the owner takes its
-- choices with it; sold lines keep their own snapshot.
-- ---------------------------------------------------------------------------
create table public.option_choices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  group_id uuid not null,
  name text not null,
  price_delta integer not null default 0,
  is_default boolean not null default false,
  is_active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint option_choices_group_fkey
    foreign key (group_id, store_id) references public.option_groups (id, store_id) on delete cascade,
  constraint option_choices_name_not_blank check (btrim(name) <> ''),
  constraint option_choices_name_length check (char_length(name) <= 60),
  constraint option_choices_price_delta_range check (price_delta >= 0),
  constraint option_choices_group_id_name_key unique (group_id, name)
);

create index option_choices_group_id_idx on public.option_choices (group_id);
create index option_choices_store_id_idx on public.option_choices (store_id);

-- ---------------------------------------------------------------------------
-- product_option_groups: which groups a product shows, in which order.
-- ---------------------------------------------------------------------------
create table public.product_option_groups (
  product_id uuid not null,
  group_id uuid not null,
  store_id uuid not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (product_id, group_id),
  constraint product_option_groups_product_fkey
    foreign key (product_id, store_id) references public.products (id, store_id) on delete cascade,
  constraint product_option_groups_group_fkey
    foreign key (group_id, store_id) references public.option_groups (id, store_id) on delete cascade
);

create index product_option_groups_group_id_idx on public.product_option_groups (group_id);
create index product_option_groups_store_id_idx on public.product_option_groups (store_id);

create trigger option_groups_set_updated_at
  before update on public.option_groups
  for each row execute function private.set_updated_at();

create trigger option_choices_set_updated_at
  before update on public.option_choices
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Grants and RLS (DATABASE D.11, SECURITY E.5): every member of the store reads, only the owner
-- writes. Written out explicitly; new tables get nothing by default.
-- ---------------------------------------------------------------------------
revoke all on table public.option_groups, public.option_choices, public.product_option_groups
  from public, anon, authenticated, service_role;

grant select, insert, update, delete on table
  public.option_groups, public.option_choices, public.product_option_groups
to service_role;

grant select, delete on table public.option_groups, public.option_choices, public.product_option_groups
  to authenticated;
grant insert (store_id, name, allow_multiple, required) on table public.option_groups to authenticated;
grant update (name, allow_multiple, required) on table public.option_groups to authenticated;
grant insert (store_id, group_id, name, price_delta, is_default, is_active, position)
  on table public.option_choices to authenticated;
grant update (name, price_delta, is_default, is_active, position) on table public.option_choices to authenticated;
grant insert (store_id, product_id, group_id, position) on table public.product_option_groups to authenticated;
grant update (position) on table public.product_option_groups to authenticated;

alter table public.option_groups enable row level security;
alter table public.option_choices enable row level security;
alter table public.product_option_groups enable row level security;

-- option_groups
create policy "option_groups: members read own store"
  on public.option_groups for select to authenticated
  using (store_id = (select private.current_store_id()));

create policy "option_groups: owner inserts"
  on public.option_groups for insert to authenticated
  with check (store_id = (select private.current_store_id()) and (select private.current_role()) = 'owner');

create policy "option_groups: owner updates"
  on public.option_groups for update to authenticated
  using (store_id = (select private.current_store_id()) and (select private.current_role()) = 'owner')
  with check (store_id = (select private.current_store_id()));

create policy "option_groups: owner deletes"
  on public.option_groups for delete to authenticated
  using (store_id = (select private.current_store_id()) and (select private.current_role()) = 'owner');

-- option_choices
create policy "option_choices: members read own store"
  on public.option_choices for select to authenticated
  using (store_id = (select private.current_store_id()));

create policy "option_choices: owner inserts"
  on public.option_choices for insert to authenticated
  with check (store_id = (select private.current_store_id()) and (select private.current_role()) = 'owner');

create policy "option_choices: owner updates"
  on public.option_choices for update to authenticated
  using (store_id = (select private.current_store_id()) and (select private.current_role()) = 'owner')
  with check (store_id = (select private.current_store_id()));

create policy "option_choices: owner deletes"
  on public.option_choices for delete to authenticated
  using (store_id = (select private.current_store_id()) and (select private.current_role()) = 'owner');

-- product_option_groups
create policy "product_option_groups: members read own store"
  on public.product_option_groups for select to authenticated
  using (store_id = (select private.current_store_id()));

create policy "product_option_groups: owner inserts"
  on public.product_option_groups for insert to authenticated
  with check (store_id = (select private.current_store_id()) and (select private.current_role()) = 'owner');

create policy "product_option_groups: owner updates"
  on public.product_option_groups for update to authenticated
  using (store_id = (select private.current_store_id()) and (select private.current_role()) = 'owner')
  with check (store_id = (select private.current_store_id()));

create policy "product_option_groups: owner deletes"
  on public.product_option_groups for delete to authenticated
  using (store_id = (select private.current_store_id()) and (select private.current_role()) = 'owner');

-- ---------------------------------------------------------------------------
-- transaction_items: what was chosen, and an optional note, frozen at the moment of sale.
--   options  [{"group": "Level", "name": "Level 3", "price": 0}, ...]; unit_price already includes
--            the sum of the prices, so subtotal = unit_price × quantity is unchanged.
--   note     free text from the cashier ("sambal dipisah").
-- The default keeps every existing row valid and means "no options".
-- ---------------------------------------------------------------------------
alter table public.transaction_items
  add column options jsonb not null default '[]'::jsonb,
  add column note text,
  add constraint transaction_items_options_is_array check (jsonb_typeof(options) = 'array'),
  add constraint transaction_items_options_count check (jsonb_array_length(options) <= 20),
  add constraint transaction_items_note_length check (note is null or char_length(note) <= 120);

-- ---------------------------------------------------------------------------
-- create_transaction, fourth definition. Same contract, parameters, security, and error codes as
-- the third (20261009120300_session_revocation.sql, including the WK003 session check), plus
-- validation of each item's
-- options and note (WK001 on any violation):
--   * options is an array of at most 20 objects {group, name, price};
--   * group and name are non-blank strings of at most 60 characters; price is a whole number from
--     0 to 2147483647;
--   * the prices add up to less than unit_price (the product's own price is at least 1);
--   * note is null or at most 120 characters.
-- An item without "options" or "note" (older devices, plain products) stores [] and null.
-- unit_price is still not compared with the current product price (SECURITY E.12), and the chosen
-- options are not compared with the current option definitions, for the same reason: a sale made
-- offline from a cached menu must still sync.
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
  v_option jsonb;
  v_product_id uuid;
  v_quantity bigint;
  v_unit_price bigint;
  v_subtotal bigint;
  v_option_sum bigint;
  v_option_price numeric;
  v_total bigint := 0;
  v_inserted_id uuid;
begin
  select p.store_id
    into v_store_id
  from public.profiles p
  where p.id = v_cashier_id
    and p.is_active;

  if v_store_id is null then
    raise exception using errcode = 'WK002', message = 'create_transaction: the caller has no active profile';
  end if;

  -- The caller's session must still exist (INFO-3), checked after the profile so a deactivated
  -- cashier still gets WK002. WK003 = sign in again; the client keeps the sale pending.
  if not private.session_is_live() then
    raise exception using errcode = 'WK003', message = 'create_transaction: the session has ended; sign in again';
  end if;

  if p_id is null then
    raise exception using errcode = 'WK001', message = 'create_transaction: id is required';
  end if;

  select t.store_id, t.cashier_id
    into v_existing_store_id, v_existing_cashier_id
  from public.transactions t
  where t.id = p_id;

  if found then
    if v_existing_store_id = v_store_id and v_existing_cashier_id = v_cashier_id then
      return 'exists';
    end if;
    raise exception using errcode = 'WK001', message = 'create_transaction: id belongs to another transaction';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = 'WK001', message = 'create_transaction: items must be a non-empty array';
  end if;

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

    if not exists (
      select 1 from public.products pr
      where pr.id = v_product_id
        and pr.store_id = v_store_id
    ) then
      raise exception using errcode = 'WK001', message = 'create_transaction: product does not belong to the caller''s store';
    end if;

    -- Options: a snapshot of the choices, shape-checked only (see the header comment).
    if v_item ? 'options' and jsonb_typeof(v_item -> 'options') <> 'null' then
      if jsonb_typeof(v_item -> 'options') <> 'array' or jsonb_array_length(v_item -> 'options') > 20 then
        raise exception using errcode = 'WK001', message = 'create_transaction: options must be an array of at most 20 entries';
      end if;
      v_option_sum := 0;
      for v_option in select value from jsonb_array_elements(v_item -> 'options') loop
        if jsonb_typeof(v_option) <> 'object'
           or jsonb_typeof(v_option -> 'group') is distinct from 'string'
           or jsonb_typeof(v_option -> 'name') is distinct from 'string'
           or btrim(v_option ->> 'group') = ''
           or btrim(v_option ->> 'name') = ''
           or char_length(v_option ->> 'group') > 60
           or char_length(v_option ->> 'name') > 60 then
          raise exception using errcode = 'WK001', message = 'create_transaction: each option needs a group and a name of at most 60 characters';
        end if;
        if jsonb_typeof(v_option -> 'price') is distinct from 'number' then
          raise exception using errcode = 'WK001', message = 'create_transaction: each option needs a numeric price';
        end if;
        v_option_price := (v_option -> 'price')::text::numeric;
        if v_option_price <> trunc(v_option_price) or v_option_price < 0 or v_option_price > max_amount then
          raise exception using errcode = 'WK001', message = 'create_transaction: option price must be a whole number from 0 to 2147483647';
        end if;
        v_option_sum := v_option_sum + v_option_price::bigint;
      end loop;
      if v_option_sum >= v_unit_price then
        raise exception using errcode = 'WK001', message = 'create_transaction: option prices exceed unit_price';
      end if;
    end if;

    if v_item ? 'note' and jsonb_typeof(v_item -> 'note') not in ('null', 'string') then
      raise exception using errcode = 'WK001', message = 'create_transaction: note must be text';
    end if;
    if char_length(coalesce(v_item ->> 'note', '')) > 120 then
      raise exception using errcode = 'WK001', message = 'create_transaction: note is longer than 120 characters';
    end if;

    v_total := v_total + v_subtotal;
    if v_total > max_amount then
      raise exception using errcode = 'WK001', message = 'create_transaction: total exceeds 2147483647';
    end if;
  end loop;

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

  if p_code is distinct from
       'TRX-' || to_char(p_created_at at time zone 'Asia/Jakarta', 'YYYYMMDD')
       || '-' || upper(left(replace(p_id::text, '-', ''), 6)) then
    raise exception using errcode = 'WK001', message = 'create_transaction: code does not match id and created_at';
  end if;

  insert into public.transactions (
    id, store_id, cashier_id, code, total, paid_amount, change_amount, status, created_at, synced_at
  )
  values (
    p_id, v_store_id, v_cashier_id, p_code, v_total, p_paid_amount, p_change_amount, 'completed', p_created_at, now()
  )
  on conflict (id) do nothing
  returning id into v_inserted_id;

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
    transaction_id, store_id, product_id, product_name, unit_price, quantity, subtotal, options, note
  )
  select
    p_id,
    v_store_id,
    (item ->> 'product_id')::uuid,
    item ->> 'product_name',
    (item -> 'unit_price')::numeric::integer,
    (item -> 'quantity')::numeric::integer,
    (item -> 'subtotal')::numeric::integer,
    case when jsonb_typeof(item -> 'options') = 'array' then item -> 'options' else '[]'::jsonb end,
    nullif(btrim(item ->> 'note'), '')
  from jsonb_array_elements(p_items) as item;

  return 'created';
end;
$$;

revoke all on function public.create_transaction(uuid, text, timestamptz, bigint, bigint, bigint, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_transaction(uuid, text, timestamptz, bigint, bigint, bigint, jsonb)
  to authenticated;

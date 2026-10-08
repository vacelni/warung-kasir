-- WarungKasir schema (docs/DATABASE.md D.1–D.8, D.10).
--
-- Money is integer Rupiah. Timestamps are timestamptz; business dates are
-- derived in Asia/Jakarta by queries, never stored as local dates.
-- Access control (RLS, grants) lives in the next migration.

-- ---------------------------------------------------------------------------
-- private schema: helpers that must never be exposed through the Data API.
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public;

-- ---------------------------------------------------------------------------
-- stores (D.2)
-- ---------------------------------------------------------------------------
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  phone text,
  receipt_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stores_name_not_blank check (btrim(name) <> '')
);

-- ---------------------------------------------------------------------------
-- profiles (D.3)
-- An auth user with a profile cannot be deleted: deactivate instead, so the
-- cashier_id on historical transactions stays valid.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  store_id uuid not null references public.stores (id) on delete restrict,
  name text not null,
  role text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_role_check check (role in ('owner', 'cashier')),
  constraint profiles_name_not_blank check (btrim(name) <> '')
);

-- Exactly one owner per store.
create unique index profiles_one_owner_per_store
  on public.profiles (store_id)
  where role = 'owner';

create index profiles_store_id_role_idx on public.profiles (store_id, role);

-- ---------------------------------------------------------------------------
-- categories (D.4)
-- The unique (store_id, name) index also serves the categories(store_id)
-- lookup required by D.8 (store_id is its leading column).
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_store_id_name_key unique (store_id, name),
  constraint categories_name_not_blank check (btrim(name) <> '')
);

-- ---------------------------------------------------------------------------
-- products (D.5)
-- No hard delete in the MVP: clients get no DELETE grant (next migration).
-- ON DELETE RESTRICT on category_id blocks deleting a category that is still
-- used by any product, active or inactive.
-- ---------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete restrict,
  category_id uuid not null references public.categories (id) on delete restrict,
  name text not null,
  price integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_price_positive check (price > 0),
  constraint products_name_not_blank check (btrim(name) <> '')
);

create index products_store_id_is_active_idx on public.products (store_id, is_active);
create index products_category_id_idx on public.products (category_id);

-- ---------------------------------------------------------------------------
-- transactions (D.6)
-- id is the client-generated UUID (the real identity); code is a display
-- value and intentionally not unique. created_at is the client sale time and
-- has no default; synced_at is set by the server.
-- Arithmetic checks use bigint so out-of-range input fails the check instead
-- of raising an overflow error.
-- ---------------------------------------------------------------------------
create table public.transactions (
  id uuid primary key,
  store_id uuid not null references public.stores (id) on delete restrict,
  cashier_id uuid not null references public.profiles (id) on delete restrict,
  code text not null,
  total integer not null,
  paid_amount integer not null,
  change_amount integer not null,
  status text not null default 'completed',
  created_at timestamptz not null,
  synced_at timestamptz not null default now(),
  constraint transactions_status_check check (status in ('completed', 'cancelled')),
  constraint transactions_total_positive check (total > 0),
  constraint transactions_paid_covers_total check (paid_amount >= total),
  constraint transactions_change_matches
    check (change_amount::bigint = paid_amount::bigint - total::bigint),
  -- Target of the composite foreign key from transaction_items (D.7).
  constraint transactions_id_store_id_key unique (id, store_id)
);

create index transactions_store_id_created_at_idx on public.transactions (store_id, created_at);
create index transactions_cashier_id_created_at_idx on public.transactions (cashier_id, created_at);
create index transactions_store_id_code_idx on public.transactions (store_id, code);

-- ---------------------------------------------------------------------------
-- transaction_items (D.7)
-- product_name and unit_price are the snapshot at the time of sale, so later
-- product edits never change history. The composite foreign key keeps an item
-- in the same store as its transaction.
-- ---------------------------------------------------------------------------
create table public.transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null,
  store_id uuid not null,
  product_id uuid not null references public.products (id) on delete restrict,
  product_name text not null,
  unit_price integer not null,
  quantity integer not null,
  subtotal integer not null,
  constraint transaction_items_transaction_fkey
    foreign key (transaction_id, store_id)
    references public.transactions (id, store_id)
    on delete restrict,
  constraint transaction_items_quantity_positive check (quantity > 0),
  constraint transaction_items_unit_price_positive check (unit_price > 0),
  constraint transaction_items_subtotal_positive check (subtotal > 0),
  constraint transaction_items_subtotal_matches
    check (subtotal::bigint = unit_price::bigint * quantity::bigint),
  constraint transaction_items_product_name_not_blank check (btrim(product_name) <> '')
);

create index transaction_items_transaction_id_idx on public.transaction_items (transaction_id);
create index transaction_items_product_id_idx on public.transaction_items (product_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create trigger stores_set_updated_at
  before update on public.stores
  for each row execute function private.set_updated_at();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function private.set_updated_at();

create trigger products_set_updated_at
  before update on public.products
  for each row execute function private.set_updated_at();

-- WarungKasir access control (docs/SECURITY.md E.4–E.5, docs/DATABASE.md D.11).
--
-- Every grant is written explicitly here; nothing relies on Supabase's default
-- grants. Policies only ever match callers that have an *active* profile,
-- because both helpers return NULL otherwise and NULL never equals anything.

-- ---------------------------------------------------------------------------
-- RLS helpers (E.5). SECURITY DEFINER so they can read profiles without
-- re-entering the profiles policies (no recursion). They live in the private
-- schema, which the Data API does not expose.
-- ---------------------------------------------------------------------------
create function private.current_store_id()
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
$$;

create function private.current_role()
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
$$;

revoke all on function private.current_store_id() from public, anon;
revoke all on function private.current_role() from public, anon;

-- Policies run with the caller's privileges, so authenticated needs these.
grant usage on schema private to authenticated;
grant execute on function private.current_store_id() to authenticated;
grant execute on function private.current_role() to authenticated;

-- ---------------------------------------------------------------------------
-- Grants (D.11): start from nothing, then grant the minimum per table.
-- TRUNCATE is never granted to clients (it would bypass RLS).
-- ---------------------------------------------------------------------------
revoke all on table
  public.stores,
  public.profiles,
  public.categories,
  public.products,
  public.transactions,
  public.transaction_items
from public, anon, authenticated, service_role;

-- New tables in public get no client privileges by default; each migration
-- must grant explicitly (fail closed).
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

-- service_role is used only server-side (Edge Functions); it bypasses RLS.
grant select, insert, update, delete on table
  public.stores,
  public.profiles,
  public.categories,
  public.products,
  public.transactions,
  public.transaction_items
to service_role;

-- anon: no access to any business table (nothing granted).

-- stores: read own store; owner edits the store profile (not id/timestamps).
grant select on table public.stores to authenticated;
grant update (name, address, phone, receipt_note) on table public.stores to authenticated;

-- profiles: owner edits names only. role, store_id, is_active are changed
-- only by the admin-cashier Edge Function (service_role).
grant select on table public.profiles to authenticated;
grant update (name) on table public.profiles to authenticated;

-- categories: owner manages; delete is still blocked by the products FK
-- while any product uses the category.
grant select, delete on table public.categories to authenticated;
grant insert (store_id, name) on table public.categories to authenticated;
grant update (name) on table public.categories to authenticated;

-- products: owner manages; no DELETE (no hard delete in the MVP).
grant select on table public.products to authenticated;
grant insert (store_id, category_id, name, price, is_active) on table public.products to authenticated;
grant update (category_id, name, price, is_active) on table public.products to authenticated;

-- transactions / transaction_items: read only. The only write path is the
-- create_transaction RPC (D.9, added in Phase 6).
grant select on table public.transactions to authenticated;
grant select on table public.transaction_items to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.stores enable row level security;
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_items enable row level security;

-- stores ---------------------------------------------------------------------
create policy "stores: members read own store"
  on public.stores for select to authenticated
  using (id = (select private.current_store_id()));

create policy "stores: owner updates own store"
  on public.stores for update to authenticated
  using (
    id = (select private.current_store_id())
    and (select private.current_role()) = 'owner'
  )
  with check (id = (select private.current_store_id()));

-- profiles -------------------------------------------------------------------
create policy "profiles: read self, owner reads store"
  on public.profiles for select to authenticated
  using (
    store_id = (select private.current_store_id())
    and (
      id = (select auth.uid())
      or (select private.current_role()) = 'owner'
    )
  );

create policy "profiles: owner updates names in own store"
  on public.profiles for update to authenticated
  using (
    store_id = (select private.current_store_id())
    and (select private.current_role()) = 'owner'
  )
  with check (store_id = (select private.current_store_id()));

-- categories -----------------------------------------------------------------
create policy "categories: members read own store"
  on public.categories for select to authenticated
  using (store_id = (select private.current_store_id()));

create policy "categories: owner inserts"
  on public.categories for insert to authenticated
  with check (
    store_id = (select private.current_store_id())
    and (select private.current_role()) = 'owner'
  );

create policy "categories: owner updates"
  on public.categories for update to authenticated
  using (
    store_id = (select private.current_store_id())
    and (select private.current_role()) = 'owner'
  )
  with check (store_id = (select private.current_store_id()));

create policy "categories: owner deletes"
  on public.categories for delete to authenticated
  using (
    store_id = (select private.current_store_id())
    and (select private.current_role()) = 'owner'
  );

-- products -------------------------------------------------------------------
-- category_id must point to a category of the caller's store (D.5).
create policy "products: members read own store"
  on public.products for select to authenticated
  using (store_id = (select private.current_store_id()));

create policy "products: owner inserts"
  on public.products for insert to authenticated
  with check (
    store_id = (select private.current_store_id())
    and (select private.current_role()) = 'owner'
    and exists (
      select 1
      from public.categories c
      where c.id = products.category_id
        and c.store_id = (select private.current_store_id())
    )
  );

create policy "products: owner updates"
  on public.products for update to authenticated
  using (
    store_id = (select private.current_store_id())
    and (select private.current_role()) = 'owner'
  )
  with check (
    store_id = (select private.current_store_id())
    and exists (
      select 1
      from public.categories c
      where c.id = products.category_id
        and c.store_id = (select private.current_store_id())
    )
  );

-- transactions ---------------------------------------------------------------
-- Owner reads the whole store; a cashier reads only their own sales (D1).
create policy "transactions: owner reads store, cashier reads own"
  on public.transactions for select to authenticated
  using (
    store_id = (select private.current_store_id())
    and (
      (select private.current_role()) = 'owner'
      or cashier_id = (select auth.uid())
    )
  );

-- transaction_items ----------------------------------------------------------
-- Visible exactly when the parent transaction is visible to the caller (the
-- subquery is itself filtered by the transactions policy).
create policy "transaction_items: visible with parent transaction"
  on public.transaction_items for select to authenticated
  using (
    exists (
      select 1
      from public.transactions t
      where t.id = transaction_items.transaction_id
        and t.store_id = transaction_items.store_id
    )
  );

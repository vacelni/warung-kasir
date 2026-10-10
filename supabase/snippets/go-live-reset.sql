-- Go-live reset (production, one-time, run by the operator in the Supabase SQL Editor).
--
-- Removes every trial record of the single store — transactions and their items, products,
-- categories, and all profiles (the trial owner and trial cashiers) — and makes the login
-- '<NEW_OWNER_EMAIL>' the owner of that store, shown as '<OWNER_NAME>'. The store profile (name, address, phone, receipt
-- note) is kept. Login accounts are not touched here: create the new owner's login first and delete
-- the old logins afterwards in Dashboard → Authentication → Users.
--
-- Before: take a dump (RUNBOOK §8). Replace <NEW_OWNER_EMAIL> and <OWNER_NAME>. Run once. Every check below aborts
-- the whole script (nothing changes) when an assumption does not hold.

begin;

do $$
declare
  v_new_owner_email constant text := '<NEW_OWNER_EMAIL>';
  v_owner_name constant text := '<OWNER_NAME>';
  v_store_id uuid;
  v_new_owner uuid;
  v_stores int;
begin
  select count(*) into v_stores from public.stores;
  if v_stores <> 1 then
    raise exception 'Expected exactly one store, found %. Nothing changed.', v_stores;
  end if;
  select id into v_store_id from public.stores;

  select id into v_new_owner from auth.users where lower(email) = lower(v_new_owner_email);
  if v_new_owner is null then
    raise exception 'No login % exists. Create it first (Authentication → Users → Add user, Auto Confirm). Nothing changed.', v_new_owner_email;
  end if;

  raise notice 'Removing: % transaction items, % transactions, % products, % categories, % profiles',
    (select count(*) from public.transaction_items where store_id = v_store_id),
    (select count(*) from public.transactions where store_id = v_store_id),
    (select count(*) from public.products where store_id = v_store_id),
    (select count(*) from public.categories where store_id = v_store_id),
    (select count(*) from public.profiles where store_id = v_store_id);

  -- Children before parents (foreign keys are RESTRICT).
  delete from public.transaction_items where store_id = v_store_id;
  delete from public.transactions where store_id = v_store_id;
  delete from public.products where store_id = v_store_id;
  delete from public.categories where store_id = v_store_id;
  delete from public.profiles where store_id = v_store_id;

  -- The new login must not already belong to another store.
  if exists (select 1 from public.profiles where id = v_new_owner) then
    raise exception 'Login % already has a profile in another store. Nothing changed.', v_new_owner_email;
  end if;

  insert into public.profiles (id, store_id, name, role)
  values (v_new_owner, v_store_id, v_owner_name, 'owner');
end $$;

commit;

-- Check (expect: 0 | 0 | 0 | 0 | 1 owner, active):
-- select (select count(*) from public.transactions) as transactions,
--        (select count(*) from public.transaction_items) as items,
--        (select count(*) from public.products) as products,
--        (select count(*) from public.categories) as categories,
--        (select string_agg(role || ' ' || is_active, ', ') from public.profiles) as profiles;

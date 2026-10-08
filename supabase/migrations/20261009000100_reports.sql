-- Owner dashboard report functions (docs/PRD.md §21, docs/UI_SPEC.md A.16, Phase 8).
--
--   sales_summary(p_from, p_to)              omzet, transactions, items sold, average
--   sales_series(p_from, p_to, p_bucket)     sales per Asia/Jakarta hour or day, zero-filled
--   top_products(p_from, p_to, p_limit)      best sellers by units sold
--
-- Security model
--   * SECURITY INVOKER: every read goes through the caller's own RLS, so a function bug can never
--     read more than the caller may read.
--   * On top of RLS each function states its own rule: the caller must be an active OWNER (a cashier's
--     RLS scope is "own sales", which would otherwise return a plausible-looking partial report), and
--     every query filters on the caller's store taken from the profile, never from an argument.
--   * Denial raises SQLSTATE 42501 (insufficient_privilege).
--   * EXECUTE goes to authenticated only; anon and PUBLIC get nothing.
--
-- Report rules
--   * Only status = 'completed' counts; 'cancelled' is excluded everywhere (C29).
--   * Windows are half-open [p_from, p_to) on created_at, the sale time (D4), never synced_at.
--     The client computes the Asia/Jakarta day boundaries; the database buckets in Asia/Jakarta too.
--   * Money stays integer: sums are bigint, the average is rounded half up in numeric (Math.round).
--   * Item names and prices come from the transaction_items snapshot, never from products.

-- ---------------------------------------------------------------------------
-- Shared guard: returns the caller's store id, or raises 42501 unless the caller is an active owner.
-- Lives in private (not exposed through the API); the report functions call it as the caller.
-- ---------------------------------------------------------------------------
create function private.require_owner_store()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_store_id uuid := (select private.current_store_id());
begin
  if v_store_id is null or (select private.current_role()) is distinct from 'owner' then
    raise exception 'Reports are available to the store owner only.' using errcode = '42501';
  end if;
  return v_store_id;
end;
$$;

revoke all on function private.require_owner_store() from public, anon;
grant execute on function private.require_owner_store() to authenticated;

-- A report window must be a real, bounded range: an unbounded one would scan the whole history.
create function private.check_report_window(p_from timestamptz, p_to timestamptz, p_max interval)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'Report range is invalid: p_to must be after p_from.' using errcode = '22023';
  end if;
  if p_to - p_from > p_max then
    raise exception 'Report range is too long (maximum %).', p_max using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.check_report_window(timestamptz, timestamptz, interval) from public, anon;
grant execute on function private.check_report_window(timestamptz, timestamptz, interval) to authenticated;

-- ---------------------------------------------------------------------------
-- sales_summary: always exactly one row, zeros when there are no sales.
-- ---------------------------------------------------------------------------
create function public.sales_summary(p_from timestamptz, p_to timestamptz)
returns table (
  revenue bigint,
  transaction_count bigint,
  item_count bigint,
  average_amount bigint
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_store_id uuid := private.require_owner_store();
  v_revenue bigint;
  v_count bigint;
  v_items bigint;
begin
  perform private.check_report_window(p_from, p_to, interval '366 days');

  select coalesce(sum(t.total), 0)::bigint, count(*)::bigint
    into v_revenue, v_count
  from public.transactions t
  where t.store_id = v_store_id
    and t.status = 'completed'
    and t.created_at >= p_from
    and t.created_at < p_to;

  select coalesce(sum(i.quantity), 0)::bigint
    into v_items
  from public.transactions t
  join public.transaction_items i
    on i.transaction_id = t.id and i.store_id = t.store_id
  where t.store_id = v_store_id
    and t.status = 'completed'
    and t.created_at >= p_from
    and t.created_at < p_to;

  return query
  select
    v_revenue,
    v_count,
    v_items,
    -- Math.round(revenue / count): numeric round() is half away from zero, which is half up for
    -- these non-negative values. Rp0 when there are no transactions.
    case when v_count = 0 then 0::bigint else round(v_revenue::numeric / v_count)::bigint end;
end;
$$;

-- ---------------------------------------------------------------------------
-- sales_series: one row per Asia/Jakarta bucket from the one containing p_from to the one containing
-- the last instant before p_to, including empty buckets (zero-filled), oldest first.
-- p_bucket is 'hour' (windows up to 48 hours) or 'day' (up to 366 days).
-- ---------------------------------------------------------------------------
create function public.sales_series(p_from timestamptz, p_to timestamptz, p_bucket text)
returns table (
  bucket_start timestamptz,
  revenue bigint,
  transaction_count bigint
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_store_id uuid := private.require_owner_store();
begin
  if p_bucket is null or p_bucket not in ('hour', 'day') then
    raise exception 'Bucket must be "hour" or "day".' using errcode = '22023';
  end if;
  perform private.check_report_window(
    p_from, p_to,
    case p_bucket when 'hour' then interval '48 hours' else interval '366 days' end
  );

  return query
  with sold as (
    select
      date_trunc(p_bucket, t.created_at at time zone 'Asia/Jakarta') as bucket,
      sum(t.total)::bigint as revenue,
      count(*)::bigint as transaction_count
    from public.transactions t
    where t.store_id = v_store_id
      and t.status = 'completed'
      and t.created_at >= p_from
      and t.created_at < p_to
    group by 1
  ),
  buckets as (
    -- Asia/Jakarta local timestamps; a whole-hour/whole-day step is exact because the zone has no DST.
    select g.bucket
    from generate_series(
      date_trunc(p_bucket, p_from at time zone 'Asia/Jakarta'),
      date_trunc(p_bucket, (p_to - interval '1 microsecond') at time zone 'Asia/Jakarta'),
      case p_bucket when 'hour' then interval '1 hour' else interval '1 day' end
    ) as g(bucket)
  )
  select
    b.bucket at time zone 'Asia/Jakarta',
    coalesce(s.revenue, 0)::bigint,
    coalesce(s.transaction_count, 0)::bigint
  from buckets b
  left join sold s on s.bucket = b.bucket
  order by b.bucket;
end;
$$;

-- ---------------------------------------------------------------------------
-- top_products: best sellers by units sold, then revenue, then name, then id (deterministic).
-- Grouped by product_id; the name shown is the snapshot from the product's latest sale in the window.
-- ---------------------------------------------------------------------------
create function public.top_products(p_from timestamptz, p_to timestamptz, p_limit integer default 5)
returns table (
  product_id uuid,
  product_name text,
  quantity bigint,
  revenue bigint
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_store_id uuid := private.require_owner_store();
begin
  perform private.check_report_window(p_from, p_to, interval '366 days');
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'Limit must be between 1 and 50.' using errcode = '22023';
  end if;

  return query
  select
    i.product_id,
    (array_agg(i.product_name order by t.created_at desc, t.id desc))[1],
    sum(i.quantity)::bigint as quantity,
    sum(i.subtotal)::bigint as revenue
  from public.transactions t
  join public.transaction_items i
    on i.transaction_id = t.id and i.store_id = t.store_id
  where t.store_id = v_store_id
    and t.status = 'completed'
    and t.created_at >= p_from
    and t.created_at < p_to
  group by i.product_id
  order by sum(i.quantity) desc, sum(i.subtotal) desc, 2 asc, i.product_id asc
  limit p_limit;
end;
$$;

-- Grants: signed-in users only; the owner check inside does the rest.
revoke all on function public.sales_summary(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.sales_series(timestamptz, timestamptz, text) from public, anon, authenticated;
revoke all on function public.top_products(timestamptz, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.sales_summary(timestamptz, timestamptz) to authenticated;
grant execute on function public.sales_series(timestamptz, timestamptz, text) to authenticated;
grant execute on function public.top_products(timestamptz, timestamptz, integer) to authenticated;

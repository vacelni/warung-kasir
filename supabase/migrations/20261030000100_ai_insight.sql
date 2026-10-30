-- AI sales insight (docs/AI_INSIGHT.md). Opt-in: the ai-insight Edge Function only calls the model
-- when ANTHROPIC_API_KEY is set. This migration adds the daily cap, which must hold whatever the
-- client does:
--   * one row per model call, written only through consume_ai_insight() (no table grants);
--   * at most 20 model calls per store per Asia/Jakarta day;
--   * owner only, through the same guard as the reports (private.require_owner_store).

create table public.ai_insight_usage (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores (id) on delete cascade,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index ai_insight_usage_store_day_idx on public.ai_insight_usage (store_id, created_at);

-- No policies and no grants: nothing reads or writes the table except the function below.
alter table public.ai_insight_usage enable row level security;
revoke all on table public.ai_insight_usage from anon, authenticated;

-- Reserves one model call for the caller's store and returns how many are left today, or raises
-- P0001 (hint 'quota') when the day's calls are used up. The advisory lock serializes two owner
-- devices asking at the same moment, so the cap cannot be passed by a race.
create function public.consume_ai_insight()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_daily_limit constant integer := 20;
  v_store_id uuid := private.require_owner_store();
  v_day_start timestamptz := date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta';
  v_used integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('ai_insight:' || v_store_id::text, 0));

  select count(*) into v_used
  from public.ai_insight_usage u
  where u.store_id = v_store_id and u.created_at >= v_day_start;

  if v_used >= c_daily_limit then
    raise exception 'Daily AI insight limit reached.' using errcode = 'P0001', hint = 'quota';
  end if;

  insert into public.ai_insight_usage (store_id, created_by) values (v_store_id, auth.uid());
  return c_daily_limit - v_used - 1;
end;
$$;

revoke all on function public.consume_ai_insight() from public, anon;
grant execute on function public.consume_ai_insight() to authenticated;

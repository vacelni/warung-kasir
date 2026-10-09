-- SEC-08 (Phase 12): fail closed for functions and sequences created by future migrations, as the
-- RLS migration already does for tables (DATABASE D.11).
--
-- Before this migration a new function in `public` was executable by anon twice over: through
-- PostgreSQL's built-in default (EXECUTE to PUBLIC) and through Supabase's per-schema default
-- (EXECUTE to anon, authenticated). New sequences were usable by anon and authenticated. Every
-- existing function revokes explicitly, so nothing is exposed today; this removes the trap.
--
-- Only objects created by `postgres` (the migration role) are affected. Defaults of
-- `supabase_admin` cannot be changed by `postgres` on the hosted platform and cover only objects
-- the platform itself creates. Existing objects keep their explicit grants.

-- The built-in PUBLIC default can only be revoked globally (a per-schema revoke cannot remove a
-- global grant). Applies to functions created by postgres in every schema.
alter default privileges for role postgres
  revoke execute on functions from public;

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

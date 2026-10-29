# Public demo

https://warungkasir-demo.pages.dev runs the same code as production against a **separate** Supabase project
(`warungkasir-demo`, Singapore) that only ever holds fictional data. Production and the demo share
nothing: different project, different keys, different Cloudflare Pages project.

## What a visitor gets

- One-tap login as the owner (Pak Joko) or the cashier (Rina): `NEXT_PUBLIC_DEMO_MODE=1` adds two buttons
  to the login page (`features/auth/demo.ts`). The production build is made without that variable, so it
  never shows them.
- "Warung Makan Sederhana": 17 menu items in 3 categories, option groups (spice level, toppings, hot/iced)
  and about 770 sales over the last 30 days, with lunch/dinner peaks and busier weekends, so reports have
  something to show.

## Keeping it clean

Everything is in `supabase/demo/`:

| File | Purpose |
|---|---|
| `demo.sql` | `demo.reset()` wipes the demo store and rebuilds it: accounts (passwords reset, sessions ended, bans lifted), menu, options and 30 days of sales from a fixed random seed. `demo.restore_logins()` only repairs the two demo logins. Both refuse to run if the database holds any store other than the demo store, so they cannot touch a real warung. Neither is callable by `anon` or `authenticated`. |
| `schedule.sql` | pg_cron: `demo.reset()` every hour, `demo.restore_logins()` every 5 minutes. |

A visitor can change a demo password (the Auth API allows it, SECURITY E.12), deactivate the cashier,
create cashiers, or rename the whole menu. The worst case is a broken demo for at most five minutes (logins)
or one hour (data).

`.github/workflows/demo-keepalive.yml` reads one public row every three days so the free-tier project is
never paused for inactivity.

## Setting it up again

1. Create a Supabase project. Link it from a **separate working directory** holding a copy of
   `supabase/` (`supabase link --workdir <dir>`), so this repository stays linked to production.
2. `supabase db push --workdir <dir>` (migrations only, never the seed).
3. Run `supabase/demo/demo.sql`, then `supabase/demo/schedule.sql`, with psql over the session pooler.
4. Auth: `supabase config push --workdir <dir>` with `site_url` set to the demo origin and
   `[auth.email] max_frequency` back to `60s`; push **auth only**. Sign-ups stay off.
5. `supabase secrets set ALLOWED_ORIGINS=https://warungkasir-demo.pages.dev`, then
   `supabase functions deploy admin-cashier`.
6. Build on Linux with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the demo
   project's publishable key) and `NEXT_PUBLIC_DEMO_MODE=1`, then
   `wrangler pages deploy out --project-name warungkasir-demo`. Create the project once with
   `wrangler pages project create warungkasir-demo --production-branch main --force`: without `--force`,
   wrangler 4.155 tries to create a Worker instead, and a Worker would not apply `out/_headers` (the CSP).

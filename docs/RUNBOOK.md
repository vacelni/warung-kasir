# WarungKasir — Runbook

Operational procedures. Created in Phase 2; completed in Phase 13 (production deployment).

Production commands (`supabase db push`, `supabase functions deploy`, `supabase secrets set`, deploys) always require explicit approval (SECURITY E.13).

---

## 1. Local development

Requirements: Node.js 24, Docker Desktop running.

```bash
npm ci
npx supabase start          # local Postgres, Auth, Data API, Studio (http://127.0.0.1:54323)
npx supabase db reset       # replays supabase/migrations and loads supabase/seed.sql
npx supabase status         # prints the local API URL and publishable key
```

Create `.env.local` (never committed) from `.env.example` with the local values:

```text
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key from `supabase status`>
```

Only the publishable key (`sb_publishable_…`) may go in `NEXT_PUBLIC_*`. `next dev`/`next build` refuse to start with a secret or service_role key.

### Seed accounts (local only)

Password for all: `password123`. Never use these outside local development, and never push the seed to production (`supabase db push` without `--include-seed`).

| Email | Store | Role | Active |
|---|---|---|---|
| owner.a@warungkasir.test | A (Warung Makan Bu Sari) | owner | yes |
| kasir1.a@warungkasir.test | A | cashier | yes |
| kasir2.a@warungkasir.test | A | cashier | yes |
| nonaktif.a@warungkasir.test | A | cashier | no (profile inactive) |
| owner.b@warungkasir.test | B (Warung Soto Pak Budi) | owner | yes |
| kasir1.b@warungkasir.test | B | cashier | yes |
| kasir2.b@warungkasir.test | B | cashier | yes |

### Checks

```bash
npm run lint
npm run typecheck
npm run test          # unit + component tests (no Supabase needed)
npm run build
npm run test:db       # pgTAP: schema, constraints, grants, RLS (needs local Supabase)
npm run test:e2e      # Playwright; auth flows need local Supabase + seed + .env.local
```

CI runs the pgTAP suite with `npx supabase db start` (Postgres only). Locally, if the database was started that way, run `npx supabase stop` before `npx supabase start`, otherwise Auth and the Data API stay down and logins fail with the "connection required" message.

After changing the schema: add a migration in `supabase/migrations/`, run `npx supabase db reset`, then `npm run db:types` to regenerate `lib/database.types.ts`.

---

## 2. Owner bootstrap (production)

Public sign-up is disabled, so the first account (the owner) is created by hand. Cashiers are later created by the owner in the app (admin-cashier Edge Function, Phase 9).

Prerequisites: the production project exists and the migrations are applied (Phase 13, with approval).

1. **Auth settings** (Dashboard → Authentication):
   - "Allow new users to sign up": **off**.
   - Email provider: **enabled** (it is the password login method; disabling it blocks all logins).
2. **Create the owner user** (Dashboard → Authentication → Users → Add user → Create new user): owner email and a strong password, with "Auto Confirm User" checked. Copy the new user's UID.
3. **Create the store and the owner profile** (Dashboard → SQL Editor), replacing the placeholders:

   ```sql
   begin;

   with new_store as (
     insert into public.stores (name, address, phone, receipt_note)
     values ('<Nama Warung>', '<Alamat>', '<Telepon>', '<Catatan struk>')
     returning id
   )
   insert into public.profiles (id, store_id, name, role)
   select '<USER_UID>', id, '<Nama Owner>', 'owner'
   from new_store;

   commit;
   ```

   The database rejects a second owner for the same store.
4. **Verify**: sign in to the app as the owner; the header shows the owner's name.

Never put the service-role/secret key anywhere except Edge Function secrets.

---

## 3. Owner account recovery

There is no email-based password recovery in the MVP (SECURITY E.8). Recovery is done by whoever has access to the Supabase Dashboard.

1. Dashboard → Authentication → Users → find the owner.
2. If the Dashboard offers setting a new password directly, use it. Its "send password recovery" email works only if email delivery is configured for the project, so do not rely on it.
3. Fallback (SQL Editor), with a new strong password:

   ```sql
   update auth.users
   set encrypted_password = extensions.crypt('<new password>', extensions.gen_salt('bf')),
       updated_at = now()
   where email = '<owner email>';
   ```

4. If the old password may be known to someone else, also end existing sessions (Dashboard user actions, or `delete from auth.sessions where user_id = '<USER_UID>';`).
5. Sign in with the new password to confirm.

Cashier passwords are reset by the owner in the app (Phase 9), not here.

### Removing people

Do not delete auth users who have a profile; the database blocks it so historical transactions keep their cashier. Deactivate cashiers in the app instead (this also bans their Auth user).

---

## 4. Free-tier pause and restore

A free-tier Supabase project can be paused after a period of inactivity (for example a long closure of the warung).

While paused:
- Login and sync fail. Sales recorded on a device stay in that device's outbox (from Phase 6) and are not lost.
- Do not clear browser data, uninstall the PWA, or reset the phone while transactions are pending.

To restore:
1. Dashboard → the project → **Restore project**; wait until it is healthy.
2. Open the app on every device used for sales; pending transactions sync automatically (Phase 10).
3. Check Riwayat/Laporan for the expected sales.

The free tier has no automatic backups. The owner's regular CSV export (Backup / Export, Phase 9) is the only data export and is not a full disaster-recovery backup (PRD §27).

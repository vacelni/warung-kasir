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
npm run test:e2e      # Playwright; auth flows need local Supabase + seed + .env.local;
                      # the offline/PWA specs build out/ and serve it on :3000 (tests/e2e/support/static-server.mts)
npm run test:functions  # admin-cashier Edge Function over real HTTP (needs the local stack + Docker)
```

**Full E2E matrix (Phase 11).** `npx playwright test` runs, in order: the read-only specs on the 360/390/412px phones, on 1280px Chromium and Microsoft Edge (`msedge` channel), and on the production build in `out/` (`static`, `static-desktop`); then the data-changing specs on Chromium, Edge and the static build (`mutations`, `mutations-edge`, `static-mutations`); then the offline/service-worker specs (`offline`, `offline-edge`). Notes:

- Run `npx supabase db reset` before a full run and after it: the data-changing specs leave sales, products and one cashier behind. The empty-state specs create and remove their own stores (`tests/e2e/support/global-setup.ts`, through `docker exec` into the local database container).
- The `out/` projects are served by `tests/e2e/support/static-server.mts` (Cloudflare-style clean URLs and `_headers`), not `next dev`.
- `next build` on **Windows** writes Next's prefetch files (`__next.<segments>.txt`) as nested folders, so a Windows-built `out/` makes the browser's prefetch requests 404 (the test server maps them). By reading Next's export code, a Linux build (Cloudflare's) should write the names the browser asks for, but this has **not** been verified with a real Linux/Cloudflare build: check it in Phase 13. Until then, deploy through Cloudflare's Git build, never by uploading a `out/` built on Windows.
- The `out/` server uses port 3000, an origin the admin-cashier function already accepts locally, so `supabase/config.toml` needs no test-only origin. Stop any `next dev` on :3000 before a full run.
- **Sign-in rate limit.** The full matrix signs in far more than the default `[auth.rate_limit] sign_in_sign_ups = 30` (per 5 minutes per IP) allows. For a full run only, edit that one value to `300` in your working copy, `npx supabase stop && npx supabase start -x …`, run the suite, then **put the value back to `30`** (`git checkout supabase/config.toml`) and restart the stack. Never commit the raised value: `supabase config push` would send it to the hosted project (it is a deployment-facing setting). A unit test (`supabase/config.test.ts`) fails while the file holds a loosened value or an extra origin. The Supabase CLI has no `--config` override, so this local edit is the supported route.

### Edge Function (admin-cashier)

`npx supabase start` serves `supabase/functions/` locally at `http://127.0.0.1:54321/functions/v1/` (do not exclude `edge-runtime` with `-x`). The allowed browser origins for local development are set in `supabase/config.toml` (`[edge_runtime.secrets] ALLOWED_ORIGINS`); the function reads the secret key from its own environment, never from `.env.local`.

- On Windows the edge runtime may not notice file changes: after editing a function, run `docker restart supabase_edge_runtime_warung-kasir`.
- Locally the API gateway answers CORS preflights itself with `*`; the function still rejects a POST from an origin that is not in `ALLOWED_ORIGINS`. In production the function's own CORS headers apply.
- Production (Phase 13, with approval): `supabase secrets set ALLOWED_ORIGINS=https://<app domain>` before `supabase functions deploy admin-cashier`. Without it, every browser call is refused (fail closed).

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
   set encrypted_password = extensions.crypt('<new password>', extensions.gen_salt('bf', 10)),
       updated_at = now()
   where email = '<owner email>';
   ```

   Cost 10 matches what GoTrue itself writes (hashes start with `$2a$10$`; checked locally on
   GoTrue v2.197.0). Plain `gen_salt('bf')` gives cost 6, a weaker hash (INFO-6).

4. If the old password may be known to someone else, also end existing sessions (Dashboard user actions, or `select public.revoke_user_sessions('<USER_UID>');`). Since INFO-3 an ended session also loses database access at once.
5. Sign in with the new password to confirm.

Cashier passwords are reset by the owner in the app (Phase 9), not here.

### Removing people

Do not delete auth users who have a profile; the database blocks it so historical transactions keep their cashier. Deactivate cashiers in the app instead (this also bans their Auth user).

---

## 4. Offline, sync, and app updates (Phase 10)

- Sales are saved on the device first (IndexedDB outbox) and sent to Supabase by the sync manager: at app start, when the session is refreshed, when the network returns, when the app comes back to the foreground, after each checkout, and on **Coba lagi**. Temporary failures retry by themselves (10 s, doubling, at most every 5 minutes while the app is open). Lainnya → *Status sinkronisasi* shows what is still on the device.
- **Gagal sinkron** = the server refused the sale (e.g. the cashier was deactivated, WK002). It stays on the device. Fix the cause (reactivate the cashier), then tap *Coba lagi* on that device, signed in as that cashier.
- A device's pending sales are sent only by the cashier who made them, signed in on that same device. Logging out with pending sales shows a warning; *Tetap keluar* keeps them for that cashier's next login.
- Do not clear site data, uninstall the PWA, or reset the phone while Lainnya shows unsynced sales: the outbox is on the device only. The app asks the browser for persistent storage; Chrome may still refuse it (best effort).
- App updates: after a deploy, an open app keeps running the version it started with. The new version downloads in the background and is used from the next launch (close the app completely — all tabs/windows — and open it again). It never switches in the middle of a sale.
- Deploy with `npm run build` (it writes `out/sw.js`); see TECHNICAL_SPEC H.5.

## 5. Free-tier pause and restore

A free-tier Supabase project can be paused after a period of inactivity (for example a long closure of the warung).

While paused:
- Login and sync fail. Sales recorded on a device stay in that device's outbox (from Phase 6) and are not lost.
- Do not clear browser data, uninstall the PWA, or reset the phone while transactions are pending.

To restore:
1. Dashboard → the project → **Restore project**; wait until it is healthy.
2. Open the app on every device used for sales; pending transactions sync automatically (Phase 10).
3. Check Riwayat/Laporan for the expected sales.

The free tier has no automatic backups. The owner's regular CSV export (Backup / Export, Phase 9) is the only data export and is not a full disaster-recovery backup (PRD §27).

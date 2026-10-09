# WarungKasir — Runbook

Operational procedures. Created in Phase 2; release procedure added in Phase 13-prep (sections 6–9). Nothing here has been run against production yet.

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
- Deploy with `npm run build` (it writes `out/sw.js` and the CSP in `out/_headers`); see TECHNICAL_SPEC H.5.
- After the owner resets a cashier's password (or deactivates and reactivates them), that cashier's devices are sent to login at their next contact with the server. Their pending sales stay on the device and sync after they sign in again (INFO-3).
- Shared till devices (INFO-1, SECURITY E.12): use the phone only for the shop, keep the screen lock on, and do not use its browser for anything else. Unsynced sales (and synced ones for 7 days) stay readable on the device for anyone with developer tools; they contain no passwords.
- **Cek waktu** in Riwayat (owner only, SEC-06): the sale time came from a device clock that was ahead of the server by more than 5 minutes, or the sale reached the server more than 24 hours later. Check the device's date/time setting with the cashier. The sale itself is valid and counted in the reports under its sale time.

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

---

## 6. Release candidate verification (local, before any production step)

On the commit to be deployed, with the local stack running (section 1):

```bash
npx supabase db reset            # target is local: supabase/.temp has no project-ref
npm run lint && npm run typecheck && npm run test && npm run build
npm run test:db && npm run test:functions
npx playwright test              # full matrix; raise the sign-in rate limit only for the run (section 1)
npx supabase db reset            # clean up after the data-changing specs
npm audit --omit=dev             # must report 0
npx supabase db advisors --local # must report no issues
```

Record the results in `docs/engineering/PHASE_LOG.md`. CI (GitHub Actions) runs lint, typecheck,
unit, build and pgTAP only; Playwright and the function tests are local gates (they need the full
Supabase stack with the edge runtime, the Edge browser, and a temporarily raised rate limit).

---

## 7. Production deployment (Phase 13) — every step needs explicit approval

Placeholders: `<project-ref>`, `<production-origin>` (e.g. `https://<name>.pages.dev` or the custom
domain), `<owner email>`. Never paste secret values into chat, docs or commits.

**Order:** Supabase project → database → Auth settings → Edge Function → owner → Cloudflare →
header check → smoke test. Do not open the app to staff before the smoke test passes.

### 7.1 Supabase project and database

1. Dashboard: create the project (region close to the warung, e.g. Singapore). Keep the database
   password in a password manager only.
2. `npx supabase link --project-ref <project-ref>` *(approval)*.
3. `npx supabase db push --dry-run` *(approval)*: the list must be exactly the files in
   `supabase/migrations/`. Never add `--include-seed` (the seed has test accounts and passwords).
4. `npx supabase db push` *(approval)*.
5. Read-only checks (SQL Editor):

   ```sql
   -- INFO-3: authorization needs these (expect t, t)
   select has_table_privilege('postgres', 'auth.sessions', 'select'),
          has_table_privilege('postgres', 'auth.sessions', 'delete');
   -- SEC-08: no public function executable by anon (expect 0)
   select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
     and has_function_privilege('anon', p.oid, 'execute');
   -- RLS on every business table (expect 6 rows, all true)
   select relname, relrowsecurity from pg_class
   where relnamespace = 'public'::regnamespace and relkind = 'r';
   ```

6. `npx supabase db advisors --linked` *(read-only)*: resolve every security finding before go-live.

### 7.2 Auth settings (Dashboard → Authentication; do NOT use `supabase config push`)

`supabase/config.toml` holds local-only values (local origins, test settings), so the hosted
project is configured by hand:

- Sign-ups: **off**. Anonymous sign-ins: **off**. Email provider: **on** (it is the login method).
- Secure password change: **on** (SEC-04). Secure email change / double confirm: **on**.
- Minimum password length: **8**. Rate limits: defaults (never the local test value 300).
- JWT expiry: **3600** s. Site URL: `<production-origin>`; no extra redirect URLs (password login only).
- API keys: the app uses the **publishable** key only. If the legacy anon/service_role JWT keys are
  not used, disable them. The Edge Function reads `SUPABASE_SECRET_KEYS` (or the legacy
  `SUPABASE_SERVICE_ROLE_KEY`) provided by the platform; never put it in the app.
- Data API: exposed schemas `public` (and `graphql_public` only if GraphQL is kept). No Storage
  buckets; Realtime not used.

### 7.3 Edge Function

1. `npx supabase secrets set ALLOWED_ORIGINS=<production-origin>` *(approval)*: the production
   origin only; never localhost, never a preview domain.
2. `npx supabase functions deploy admin-cashier` *(approval)*. `verify_jwt = true` (config.toml);
   the function also checks the caller in code.
3. Check (no data change): a POST from a foreign origin answers 403:

   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X POST \
     -H "Origin: https://example.com" -H "Content-Type: application/json" \
     https://<project-ref>.supabase.co/functions/v1/admin-cashier -d "{}"
   ```

### 7.4 Owner

Section 2 (owner bootstrap). Then sign in once on a phone to confirm.

### 7.5 Cloudflare Pages (decided 2026-10-09), Git integration

- Build command `npm run build` (never `npx next build`: it would skip `out/sw.js` and the CSP),
  output directory `out`, Node 24 (`NODE_VERSION=24`).
- Environment variables (Production): `NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>`. Nothing else; never a secret key.
- **Preview deployments: disabled** (decided 2026-10-09; Builds → Branch control → no preview
  branches). Never give a preview the production Supabase variables; previews must never talk to
  production data. Preview origins are not in `ALLOWED_ORIGINS`, so employee
  management fails there by design.
- Build on Cloudflare (Linux); never upload an `out/` built on Windows (section 1 note).
- Custom domain (optional): add `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  to the `/*` rule of `public/_headers` in a commit before switching, and enable "Always Use
  HTTPS". `*.pages.dev` is HSTS-preloaded through `.dev`.

### 7.6 Header check (after the first deploy)

```bash
for p in / /login /kasir /riwayat/detail /tidak-ada /sw.js; do
  echo "== $p"
  curl -sI "<production-origin>$p" | grep -iE "^(HTTP|content-security-policy|x-frame-options|referrer-policy|permissions-policy|cross-origin-opener-policy|x-content-type-options|cache-control)"
done
```

Expect one `Content-Security-Policy` per response whose `connect-src` names
`https://<project-ref>.supabase.co`, plus the other headers; `/sw.js` with `Cache-Control: no-cache`.
Open `/kasir.html` and confirm the redirect to `/kasir` carries the same headers. In Chrome DevTools
→ Console: no "Content Security Policy" messages on Login, Kasir, Riwayat, Laporan, Backup.

### 7.7 Production smoke test (TECHNICAL_SPEC H.6 + Phase 12 checks)

1. Open the URL on Android Chrome; install to the home screen.
2. Owner: login → Karyawan → create a cashier → log out.
3. Cashier: login → add a product → checkout → success → Riwayat → detail → LIHAT STRUK.
4. Owner: Laporan shows the sale; Backup → export the transactions CSV.
5. Offline: airplane mode → sell → close the app → reopen → pending badge → network on → synced.
6. SEC-01: offline for more than an hour (token expired), tap Keluar → login page; back online,
   reopening the app shows the login page.
7. SEC-02: Chrome DevTools → disable JavaScript → open `/login` → the MASUK button is disabled.
8. INFO-3: the owner resets the cashier's password while the cashier's phone is open → that phone
   goes to login at its next server contact; a pending sale syncs after the new login.
9. Foreign-origin Edge Function call answers 403 (7.3).

---

## 8. Rollback

- **App (Cloudflare):** Deployments → previous production deployment → Rollback. Instant; the old
  version's service worker takes over at the next app launch. Pending sales stay in each device's
  outbox.
- **Database:** forward-only. Before each production migration the owner exports CSV (Backup /
  Export) and the operator saves `npx supabase db dump --linked -f backup-<date>.sql` *(approval;
  contains business data: store it privately, never in git)*. A faulty migration is fixed by a new
  migration, never by editing an applied one.
- **Edge Function:** redeploy the previous version from git *(approval)*:
  `git checkout <commit> -- supabase/functions` then `npx supabase functions deploy admin-cashier`.
- **Auth settings:** revert by hand in the Dashboard (record every change with its date).

## 9. Monitoring and incidents (free tier)

- Weekly: Supabase usage (database size, egress, MAU, Edge Function invocations); Cloudflare
  requests. Near a free-tier limit: optimize first; never add paid services automatically (TECH H.8).
- Supabase Dashboard → Logs: Auth (failed logins, rate limits), Edge Functions (`admin-cashier:`
  lines never contain passwords or tokens), Postgres (`WK001`/`WK002`/`WK003`).
- "Gagal sinkron" on a device: section 4 (WK002 = cashier inactive). WK003 after an owner action is
  expected (sessions ended); the sale syncs after the cashier logs in again.
- Suspected account compromise: the owner resets that cashier's password (ends all its sessions at
  once, INFO-3); for the owner account, section 3 and `select public.revoke_user_sessions('<USER_UID>');`.
- Self-service password change (SEC-04 residual): anyone holding a session less than 24 hours old can
  change that account's password through the Auth API (the app has no screen for it, but that is not
  an API restriction). Controls: the owner signs in only on the owner's own phone, never on the shared
  till; screen lock on every device. A cashier who suddenly cannot log in: the owner resets the
  password; Dashboard → Authentication → Logs shows password-update events.
- Supabase project paused: section 5.

C. TECHNICAL SPECIFICATION
C.1 Architecture

Gunakan:

Next.js
React
TypeScript
Tailwind CSS
Supabase
IndexedDB
PWA
Cloudflare
GitHub

Arsitektur:

Android Browser / PWA
          │
          ▼
   Next.js Static App
          │
          ├───────────────┐
          ▼               ▼
   IndexedDB          Supabase
    Offline            Auth
     Data              Postgres
          │               │
          └────── Sync ───┘
C.2 Rendering Strategy

Gunakan Next.js App Router dengan static export.

Target:

output: 'export'

Aplikasi tidak boleh bergantung pada server-side rendering untuk core functionality.

Alasan:

deployment sederhana;
hosting murah/gratis;
tidak membutuhkan dedicated server;
cocok untuk SPA/PWA;
sebagian besar logic adalah client-side.

Cloudflare saat ini menyediakan deployment resmi untuk Next.js static export dengan output out.

C.3 Important Static Export Rule

Jangan menggunakan:

Server Actions;
Route Handlers sebagai backend utama;
server-only database credentials;
middleware yang diperlukan untuk business logic;
service_role key di browser.

Authentication dilakukan menggunakan Supabase browser client.

Privileged operations menggunakan Supabase Edge Functions.

C.4 Supabase

Gunakan:

Supabase Auth
Supabase PostgreSQL
Supabase Edge Functions

Database accessed from frontend hanya menggunakan publishable key.

Supabase menjelaskan bahwa frontend dapat menggunakan publishable key ketika RLS dikonfigurasi dengan benar; service/secret key tidak boleh dikirim ke browser karena bypass RLS.

C.5 Privileged Backend Operation

Untuk:

Create cashier account
Disable account
Owner-only administrative action

gunakan Edge Function jika membutuhkan privileged Auth API.

Contoh:

create-cashier

Flow:

Owner browser
 ↓
Supabase session
 ↓
Edge Function
 ↓
Verify JWT/session
 ↓
Verify owner role
 ↓
Use server-side secret
 ↓
Create auth user
 ↓
Create profile

Secret tidak pernah masuk frontend.

C.6 State Management

Jangan menggunakan Redux kecuali benar-benar dibutuhkan.

Untuk MVP gunakan:

React state;
Context jika diperlukan;
custom hooks;
IndexedDB.

Pisahkan:

UI State
Cart State
Auth State
Persistent Local State
Server Data
C.7 Currency

Gunakan integer Rupiah.

Contoh:

type Money = number

Nilai:

15000
40000
50000

Formatting hanya saat render:

Rp15.000
Rp40.000
Rp50.000

Jangan menyimpan:

"Rp15.000"

sebagai nilai database.

C.8 Transaction ID

Client membuat UUID sebelum transaksi disimpan.

UUID menjadi id transaksi.

Tujuan:

offline support;
retry;
idempotency;
duplicate prevention.
C.9 No Server Request Per Cart Action

Cart:

Add
+
-
Delete

harus berjalan lokal.

Request database baru terjadi saat:

Checkout

atau ketika perlu refresh master data.

C.10 Caching

Cache:

static assets;
application shell;
menu;
kategori;
store information.

Jangan cache sembarangan:

authenticated API response;
password;
session token sebagai custom cache;
sensitive data.

Session tetap dikelola Supabase Auth.

# H. DEPLOYMENT SPECIFICATION

## H.1 Source Control

GitHub repository:

```text
warung-kasir
```

Branches:

```text
main
develop
feature/*
```

For a solo MVP, at minimum:

```text
main
feature/*
```

---

# H.2 Environment

Local:

```text
.env.local
```

Repository:

```text
.env.example
```

`.env.local` must never be committed.

---

# H.3 Required Environment Variables

Frontend:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Server-side Edge Function secrets are managed separately.

Never expose:

```text
SERVICE_ROLE_KEY
SECRET_KEY
DATABASE_PASSWORD
```

---

# H.4 Build

Expected:

```text
npm run lint
npm run typecheck
npm run test
npm run build
```

All must pass before production.

---

# H.5 Production Build

Static output:

```text
out/
```

Deploy output to Cloudflare.

Cloudflare's current Next.js static export guide uses:

```text
Build command:
npx next build

Build directory:
out
```

and provides automatic Git-based deployments/preview deployments.

---

# H.6 Production Smoke Test

After deployment:

```text
Open URL
 ↓
Login
 ↓
Open cashier
 ↓
Add product
 ↓
Checkout
 ↓
Verify transaction
 ↓
Open history
 ↓
Verify dashboard
```

---

# H.7 Production Security Check

Before launch:

```text
✓ No secrets in GitHub
✓ RLS enabled
✓ RLS policies tested
✓ Cashier access restricted
✓ Owner access works
✓ Service role not exposed
✓ Production environment variables configured
✓ Debug logs disabled
```

Supabase menyediakan production checklist dan Security Advisor untuk pemeriksaan keamanan database sebelum masuk production.

---

# H.8 Free-Tier Monitoring

Monitor:

```text
Supabase
- database size
- storage
- egress
- MAU
- Edge Function invocation

Cloudflare
- requests
- worker usage
- deployment usage
```

Do not add paid services automatically.

If free quota is near limit:

```text
first:
optimize

second:
reduce unnecessary requests

third:
archive/clean unused data

only last:
consider paid upgrade

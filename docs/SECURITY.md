E. SECURITY SPECIFICATION
E.1 Authentication

Supabase Auth.

Unauthenticated user:

/access → denied

Hanya halaman login yang public.

E.2 Authorization

Role:

owner
cashier

Permission:

Owner:
full access

Cashier:
transaction access
E.3 Permission Matrix
Resource	Owner	Cashier
Cashier	✅	✅
History	✅	✅
Reports	✅	❌
Products	✅	❌
Categories	✅	❌
Employees	✅	❌
Settings	✅	❌
Backup	✅	❌
Export	✅	❌
E.4 Store Isolation

Setiap data harus terkait:

store_id

RLS memastikan user hanya melihat dan memodifikasi data store miliknya.

Supabase merekomendasikan RLS pada setiap tabel exposed dan policy terpisah untuk operasi SELECT/INSERT/UPDATE/DELETE yang memang dibutuhkan.

E.5 RLS Principles

Rules:

anon
→ no private data

authenticated
→ only own store

owner
→ full permissions within own store

cashier
→ transaction-specific permissions

Jangan menggunakan:

using (true)

untuk private business data tanpa pembatasan store.

E.6 Sensitive Operations

Sensitive actions:

change product price;
delete/deactivate product;
employee management;
store settings;
export;
privileged auth management.

Semua harus diverifikasi server/database.

E.7 Service Role

Service role/secret key:

NEVER IN FRONTEND
NEVER IN PUBLIC REPOSITORY
NEVER IN NEXT_PUBLIC_*

Simpan hanya di:

Supabase Edge Function secret
E.8 Password

Password tidak disimpan di application database.

Supabase Auth yang menangani credential.

E.9 Session

Session persistence:

enabled

Saat session expired:

redirect → login

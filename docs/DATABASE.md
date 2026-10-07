D. DATABASE SPECIFICATION
D.1 Tables

Gunakan:

stores
profiles
categories
products
transactions
transaction_items
D.2 stores
id uuid primary key
name text not null
address text
phone text
logo_url text
receipt_note text
created_at timestamptz
updated_at timestamptz

MVP hanya memiliki satu store.

Namun seluruh tabel tetap memiliki store_id.

D.3 profiles
id uuid primary key references auth.users(id)
store_id uuid not null references stores(id)
name text not null
role text not null
is_active boolean not null default true
created_at timestamptz
updated_at timestamptz

Constraint role:

owner
cashier
D.4 categories
id uuid primary key
store_id uuid not null
name text not null
created_at timestamptz
updated_at timestamptz

Unique:

(store_id, name)
D.5 products
id uuid primary key
store_id uuid not null
category_id uuid not null
name text not null
price integer not null
image_url text
is_active boolean not null default true
created_at timestamptz
updated_at timestamptz

Constraint:

price > 0
D.6 transactions
id uuid primary key
store_id uuid not null
cashier_id uuid not null
total integer not null
paid_amount integer not null
change_amount integer not null
status text not null
created_at timestamptz

Status:

completed
cancelled

MVP tidak menggunakan refund kompleks.

D.7 transaction_items
id uuid primary key
transaction_id uuid not null
product_id uuid not null
product_name text not null
unit_price integer not null
quantity integer not null
subtotal integer not null

Constraint:

quantity > 0
unit_price > 0
subtotal > 0

Product name dan unit price adalah snapshot.

D.8 Indexes

Minimum:

transactions(store_id, created_at)
transactions(cashier_id, created_at)
transaction_items(transaction_id)
products(store_id, is_active)
categories(store_id)
profiles(store_id, role)
D.9 Database Calculation Integrity

Frontend calculates totals for UX.

Database/backend must still validate:

subtotal = unit_price × quantity
total = SUM(items.subtotal)
change = paid_amount - total
paid_amount >= total

Frontend calculation tidak boleh dianggap sebagai security boundary.

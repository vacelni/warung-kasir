-- SEC-07 (Phase 12): bounded text in what the catalog and every sale store (DATABASE D.5, D.7).
-- Product names, and the name snapshot kept on each sale item, are at most 120 characters.
-- create_transaction rejects longer names and more than 200 items with WK001 first
-- (20261009120100); these constraints are the backstop.
--
-- A plain (validated) CHECK: if existing rows were longer, this migration fails loudly instead of
-- silently accepting them. Check before applying to a database with data:
--   select count(*) from public.products where char_length(name) > 120;
--   select count(*) from public.transaction_items where char_length(product_name) > 120;

alter table public.products
  add constraint products_name_length check (char_length(name) <= 120);

alter table public.transaction_items
  add constraint transaction_items_product_name_length check (char_length(product_name) <= 120);

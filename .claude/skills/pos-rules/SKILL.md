---
name: pos-rules
description: WarungKasir POS business rules. Use when implementing or reviewing cart, products, pricing, totals, payment, change calculation, checkout, transaction codes, or transaction persistence.
---

# WarungKasir POS Rules

Authoritative sources: `docs/PRD.md` §13–§21, `docs/TECHNICAL_SPEC.md` C.7–C.11, `docs/DATABASE.md` D.6–D.9. If this skill and the docs disagree, the docs win; report the conflict.

## Money Representation

All monetary values are integer Indonesian Rupiah (`15000`, `40000`, `50000`).

Never use floating-point arithmetic for business calculations.

Display format: `Rp15.000` — no space between `Rp` and the number (do not use an `Intl` currency style that inserts a space).

## Formulas

```text
subtotal = unit_price × quantity
total = sum(all subtotals)
change = paid_amount - total
average transaction = Math.round(revenue / transactionCount)   (Rp0 when count is 0)
```

Payment is valid only when `paid_amount >= total`.

Quick amount buttons (Rp10.000, Rp20.000, Rp50.000, Rp100.000, Rp200.000, Uang Pas) SET the paid amount; they never add to it. Manual input is always possible.

## Cart

Cart operations are local. No network requests for add, remove, increase, or decrease.

## Product Snapshot

Transaction items preserve `product_id`, `product_name`, `unit_price`, `quantity`, `subtotal`.

Changing a product's current price never modifies historical transactions.

Products are never hard-deleted in the MVP; "Hapus" = `is_active = false`.

## Transaction Identity

- `id`: client-generated UUID (`crypto.randomUUID`), the real identity, created once per checkout and stable across retries.
- `code`: `TRX-YYYYMMDD-XXXXXX` — Asia/Jakarta sale date + first 6 hex chars of the UUID, uppercase. Display/search only; not unique.
- `created_at`: client sale time, preserved on sync. `synced_at`: set by the server.
- Server `status`: `completed` | `cancelled` (reserved; no cancel UI). Sync status is client-only (see the `offline-sync` skill).

## Persistence

Checkout writes to the local outbox first (local-first, one path for online and offline), then syncs through the single atomic RPC `create_transaction`. Never insert a header and items in separate requests. Never move this logic into an Edge Function.

## Validation

Never trust values received from the browser. The RPC recomputes and validates arithmetic, payment, product ownership by store, and the code format (DATABASE D.9).

Accepted risk: the RPC does not compare `unit_price` with the current product price, because legitimate offline sales may use cached prices (SECURITY E.12).

## Tests

Every change to money or transaction logic must include tests for:

- exact payment
- overpayment
- underpayment
- zero change
- multiple products
- multiple quantities
- empty cart
- duplicate submission (same UUID → exactly one transaction)
- quick amount sets (not adds)
- average rounding and zero-transaction case
- `formatRupiah` output without a space
- display code format and Asia/Jakarta date
- unit price different from the current product price is accepted by the RPC

---

name: pos-rules
description: WarungKasir POS business rules. Use when implementing or reviewing cart, products, pricing, totals, payment, change calculation, checkout, or transaction persistence.
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

# WarungKasir POS Rules

## Money Representation

All monetary values are integer Indonesian Rupiah.

Example:

15000
40000
50000

Never use floating-point arithmetic for business calculations.

## Formulas

```text
subtotal = unit_price × quantity
total = sum(all subtotals)
change = paid_amount - total
```

Payment is valid only when:

```text
paid_amount >= total
```

## Cart

Cart operations are local.

Do not make network requests for:

* add item
* remove item
* increase quantity
* decrease quantity

## Product Snapshot

When checkout occurs, transaction items must preserve:

* product_id
* product_name
* unit_price
* quantity
* subtotal

Changing a product's current price must never modify historical transaction values.

## Transaction ID

Generate a UUID before synchronization.

The transaction ID must be unique and idempotent.

The same transaction ID must never create duplicate transactions.

## Validation

Never trust values received from the browser.

Validate critical transaction values before persistence.

## Tests

Every change to money or transaction logic must include tests for:

* exact payment
* overpayment
* underpayment
* zero change
* multiple products
* multiple quantities
* empty cart
* duplicate submission

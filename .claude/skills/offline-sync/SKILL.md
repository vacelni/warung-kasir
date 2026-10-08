---
name: offline-sync
description: WarungKasir offline transaction and synchronization architecture. Use when implementing IndexedDB, the local outbox, offline cashier behavior, transaction queues, network recovery, retries, offline auth behavior, the service worker, or sync logic.
---

# WarungKasir Offline Sync

Authoritative sources: `docs/TECHNICAL_SPEC.md` C.9–C.12, `docs/PRD.md` §28, `docs/UI_SPEC.md` A.24, `docs/DATABASE.md` D.9. If this skill and the docs disagree, the docs win; report the conflict.

## Goal

Cashier transactions remain usable during temporary network loss.

## Single Write Path (from Phase 6)

Every checkout — online or offline — writes the transaction to the IndexedDB outbox first, shows success, then syncs. There is no separate online-only save path. Phase 10 hardens this system; it does not introduce it.

## Offline Capabilities

- opening the app shell
- viewing the cached catalog (products, categories, store) stored in IndexedDB
- cart operations and all calculations
- saving the transaction to the outbox

## Local Persistence

Use IndexedDB (`idb`). Pending transactions must survive refresh, browser close, and network failure. Request `navigator.storage.persist()`.

Outbox entry: `id`, `code`, `store_id`, `cashier_id`, `created_at` (sale time, preserved on sync), `items[]` (`product_id`, `product_name`, `unit_price`, `quantity`, `subtotal`), `total`, `paid_amount`, `change_amount`, `sync_status`, `attempts`, `last_error`, `last_attempt_at`.

## Status

Client-only sync status (never stored as the server transaction status):

```text
pending
syncing
synced
failed
```

## Sync

Trigger when:

- the application starts
- an authenticated session becomes available or is refreshed
- the `online` event fires
- the tab becomes visible
- a checkout completes
- the user taps retry

No aggressive polling. Use exponential backoff (cap ≈ 5 minutes). Do not rely on `navigator.onLine` alone.

Use `navigator.locks` so only one tab syncs at a time.

Send only entries whose `cashier_id` matches the logged-in user.

## Duplicate Prevention

The UUID is assigned before the first save and never changes. The RPC is idempotent (`ON CONFLICT (id) DO NOTHING`) and returns `created` or `exists`; both mean `synced`.

## Failure

- Transient (network, timeout, 5xx, session not yet refreshable): stay `pending`, retry with backoff.
- Permanent (RPC validation rejection, inactive account): mark `failed`, keep the entry, preserve the error, show it with a retry action.

Never delete a pending, syncing, or failed transaction automatically. Synced entries may be pruned after server confirmation (retention decided in Phase 10).

## Auth While Offline

- Token refresh fails because the device is offline → keep the user in the app with the cached identity; selling continues; sync waits for a valid session.
- Server explicitly rejects the session, or the user logs out → redirect to login; the outbox stays.
- Logout with pending/failed entries → blocking dialog with the count (Sinkronkan sekarang / Batal / Tetap keluar). Entries remain on the device and sync when the same user logs in again on it.

## Service Worker

Cache only static assets and the exported app shell. Never cache Supabase (`*.supabase.co`) requests. The catalog lives in IndexedDB and is cleared on logout; the outbox is never cleared. Activate a new service worker on the next launch, never mid-transaction.

## Testing

1. create a transaction online;
2. disconnect the network;
3. create a transaction;
4. refresh;
5. close and reopen the browser (persistent context);
6. restore the network;
7. sync;
8. verify exactly one server transaction per UUID, with `created_at` equal to the sale time.

Also test: interrupted sync and retry (G.11), offline token expiry, logout with pending entries, a different user logging in on the same device, two tabs syncing, and a permanent RPC rejection (entry stays `failed`).

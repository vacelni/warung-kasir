---

name: offline-sync
description: WarungKasir offline transaction and synchronization architecture. Use when implementing IndexedDB, offline cashier behavior, transaction queues, network recovery, retries, or sync logic.
-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

# WarungKasir Offline Sync

## Goal

Cashier transaction must remain usable during temporary network loss.

## Offline Capabilities

Offline cashier should support:

* opening cashier
* viewing cached products
* selecting products
* cart operations
* total calculation
* payment calculation
* change calculation
* saving pending transaction

## Local Persistence

Use IndexedDB for persistent offline state.

Pending transactions must survive:

* page refresh
* browser close
* temporary network failure

## Status

Use explicit synchronization states:

```text
pending
syncing
synced
failed
```

## Sync

Trigger synchronization when:

* application starts
* authenticated session becomes available
* network becomes available
* retry is requested

Do not perform aggressive polling.

## Duplicate Prevention

Each transaction receives its UUID before sync.

The server must not create a second transaction for the same UUID.

Sync must be idempotent.

## Failure

When sync fails:

* keep the transaction;
* preserve error state;
* increment retry information;
* retry later.

Never silently delete a failed transaction.

## Testing

Test:

1. create transaction online;
2. disconnect network;
3. create transaction;
4. refresh;
5. reopen application;
6. restore network;
7. sync;
8. verify exactly one server transaction.

Also test interrupted sync and retries.

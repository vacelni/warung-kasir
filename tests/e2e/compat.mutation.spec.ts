import { removeNewerBrowserFeatures } from './support/browser-features';
import { KASIR1, login, outboxEntry, recordRpcCalls, sell, serverTransactions } from './support/offline';
import { expect, test } from './support/test';

// TEST_PLAN G.13: a browser without Web Locks, BroadcastChannel, persistent storage and service
// workers still takes a sale and sends it exactly once (the in-tab queue and the server's UUID
// idempotency replace the cross-tab lock). Saves a real sale for kasir1.a; run
// `npx supabase db reset` afterwards. Runs in the serial "mutations" projects.

test('without the newer browser features a sale is saved, synced once, and visible on the server', async ({ page, context }) => {
  await removeNewerBrowserFeatures(page);
  const rpcIds = recordRpcCalls(context);
  await login(page, KASIR1.email);

  const id = await sell(page, ['Nasi Goreng', 'Es Teh']);
  await expect.poll(async () => (await outboxEntry(page, id))?.sync_status).toBe('synced');

  expect(rpcIds).toEqual([id]);
  expect(await serverTransactions(context, id)).toHaveLength(1);
});

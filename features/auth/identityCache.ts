import { getDb } from '@/lib/idb';
import { isRole } from '@/lib/permissions';
import type { Profile } from './account';

/**
 * The last profile the server confirmed for the signed-in user (decision D5). Read only when the
 * server cannot be reached, so the cashier keeps selling offline. It is identity for the UI, not
 * authorization: every sale is checked again by create_transaction under the real session, and
 * sync sends nothing until that session is valid.
 *
 * At most one record exists: saving replaces any other user's, and every sign-out clears it.
 */
export async function saveIdentity(profile: Profile, now: Date): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('identity', 'readwrite');
  await Promise.all([
    tx.store.clear(),
    tx.store.put({ ...profile, confirmed_at: now.toISOString() }),
    tx.done,
  ]);
}

/**
 * The cached profile. With `userId`, only that user's; without (the session could not even be
 * refreshed, so its user is unknown), the single cached record.
 */
export async function readIdentity(userId: string | null): Promise<Profile | null> {
  const db = await getDb();
  const record = userId ? await db.get('identity', userId) : await singleRecord();
  if (!record || !isRole(record.role)) return null;
  return { id: record.id, storeId: record.storeId, name: record.name, role: record.role };

  async function singleRecord() {
    const all = await db.getAll('identity');
    return all.length === 1 ? all[0] : undefined;
  }
}

export async function clearIdentity(): Promise<void> {
  await (await getDb()).clear('identity');
}

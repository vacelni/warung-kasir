import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { closeDb } from '@/lib/idb';

/** Gives each test an empty in-memory IndexedDB (fake-indexeddb), closing the app's connection first. */
export async function resetIndexedDb(): Promise<void> {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
}

/**
 * App-side FarmStore factory — cloud (Firebase passthrough) vs mist (IndexedDB in browser).
 */

import {
  createFarmStoreAdapter,
  IndexedDbMistStore,
  type FarmStoreAdapter,
  type MistStore,
} from '../../units/mist-freenet/src/index.ts';
import {
  getFarmStoreBackend,
  isMistFarmStoreActive,
  type FarmStoreBackendPreference,
} from './farmStoreBackend.ts';

let browserMistStore: IndexedDbMistStore | null = null;
let browserMistStoreReady: Promise<IndexedDbMistStore> | null = null;

/** Ensure the singleton IndexedDB mist store is open (idempotent). */
export async function ensureBrowserMistStore(): Promise<IndexedDbMistStore> {
  if (browserMistStore) return browserMistStore;
  if (!browserMistStoreReady) {
    browserMistStoreReady = IndexedDbMistStore.open({ backendId: 'indexeddb-browser' }).then(
      (store) => {
        browserMistStore = store;
        return store;
      },
    );
  }
  return browserMistStoreReady;
}

/** Reset mist store singleton and optionally wipe IndexedDB (sign-out). */
export async function resetBrowserMistStore(clearData = true): Promise<void> {
  if (browserMistStore && clearData) {
    await browserMistStore.clearAll();
  }
  browserMistStore = null;
  browserMistStoreReady = null;
}

/**
 * Select FarmStore adapter for the active backend.
 * `cloud` → Firebase/Firestore remains authoritative (mist surface is null).
 * `mist`  → in-browser IndexedDbMistStore (durable across reload).
 */
export async function createAppFarmStore(
  _farmId: string,
  backend?: FarmStoreBackendPreference,
): Promise<FarmStoreAdapter> {
  const pref = backend ?? getFarmStoreBackend();
  if (pref !== 'mist') {
    return createFarmStoreAdapter('cloud');
  }
  const store = await ensureBrowserMistStore();
  return createFarmStoreAdapter('mist', store);
}

/** Shared mist store when mist backend is active (bones workshop). */
export async function getActiveMistStore(): Promise<MistStore | null> {
  if (!isMistFarmStoreActive()) return null;
  return ensureBrowserMistStore();
}

export type { FarmStoreAdapter };

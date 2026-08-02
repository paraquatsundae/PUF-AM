/**
 * App-side FarmStore factory — cloud (Firebase passthrough) vs mist (MemoryMistStore in browser).
 */

import {
  createFarmStoreAdapter,
  MemoryMistStore,
  type FarmStoreAdapter,
} from '../../units/mist-freenet/src/index.ts';
import {
  getFarmStoreBackend,
  isMistFarmStoreActive,
  type FarmStoreBackendPreference,
} from './farmStoreBackend.ts';

let browserMistStore: MemoryMistStore | null = null;

function getBrowserMistStore(): MemoryMistStore {
  if (!browserMistStore) {
    browserMistStore = new MemoryMistStore({ backendId: 'memory-browser' });
  }
  return browserMistStore;
}

/** Reset in-memory mist store (workshop / sign-out). */
export function resetBrowserMistStore(): void {
  browserMistStore = null;
}

/**
 * Select FarmStore adapter for the active backend.
 * `cloud` → Firebase/Firestore remains authoritative (mist surface is null).
 * `mist`  → in-browser MemoryMistStore for phase-4 theory tests.
 */
export function createAppFarmStore(
  _farmId: string,
  backend?: FarmStoreBackendPreference,
): FarmStoreAdapter {
  const pref = backend ?? getFarmStoreBackend();
  if (pref !== 'mist') {
    return createFarmStoreAdapter('cloud');
  }
  return createFarmStoreAdapter('mist', getBrowserMistStore());
}

/** Shared mist store instance when mist backend is active (bones workshop). */
export function getActiveMistStore(): MemoryMistStore | null {
  if (!isMistFarmStoreActive()) return null;
  return getBrowserMistStore();
}

export type { FarmStoreAdapter };

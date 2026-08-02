/**
 * FarmStore adapter boundary — app-facing backend selection (phase 1 sketch).
 *
 * Production PUF-AM uses `cloud` (Firebase/Firestore). The experimental mist
 * fork uses `mist` with a MistStore backend. Feature modules depend on this
 * thin adapter, not on Freenet or Firebase directly.
 */

import type { MistStore } from './mist-store.ts';

export type FarmStoreBackendId = 'cloud' | 'mist';

/** Capabilities exposed to the app for the active backend. */
export type FarmStoreAdapter = {
  backendId: FarmStoreBackendId;
  /** Non-null only when `backendId === 'mist'`. */
  mist: MistStore | null;
};

/** Factory hook — implementations land in the app layer (phase 2+). */
export type FarmStoreFactory = (options: {
  backendId: FarmStoreBackendId;
  farmId: string;
  mistStore?: MistStore;
}) => FarmStoreAdapter;

/** Minimal default factory for spikes and tests. */
export function createFarmStoreAdapter(
  backendId: FarmStoreBackendId,
  mistStore: MistStore | null = null,
): FarmStoreAdapter {
  if (backendId === 'mist' && mistStore === null) {
    throw new Error('FarmStoreAdapter: mist backend requires a MistStore instance');
  }
  return {
    backendId,
    mist: backendId === 'mist' ? mistStore : null,
  };
}

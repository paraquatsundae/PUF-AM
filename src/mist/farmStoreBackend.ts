/**
 * FarmStore backend preference — default remains Firebase (production).
 */

export type FarmStoreBackendPreference = 'firebase' | 'mist';

const STORAGE_KEY = 'pufam.farmStoreBackend';

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** Active storage backend; defaults to `firebase`. */
export function getFarmStoreBackend(): FarmStoreBackendPreference {
  const v = storage()?.getItem(STORAGE_KEY);
  return v === 'mist' ? 'mist' : 'firebase';
}

export function setFarmStoreBackend(backend: FarmStoreBackendPreference): void {
  storage()?.setItem(STORAGE_KEY, backend);
}

/** True when mist experimental UI / paths may be shown. */
export function isMistExperimentalEnabled(): boolean {
  if (import.meta.env.VITE_MIST_EXPERIMENTAL === 'true') return true;
  return getFarmStoreBackend() === 'mist';
}

/** True when the app should use local mist FarmStore instead of Firestore for bones spike. */
export function isMistFarmStoreActive(): boolean {
  return getFarmStoreBackend() === 'mist';
}

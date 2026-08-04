/**
 * FarmStore backend preference — default remains Firebase (production).
 */

import { getDesktopBridge } from '../lib/desktopBridge.ts';

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

/**
 * True when mist experimental UI / paths may be shown.
 *
 * The Vite flag is inlined at build time, so a desktop operator launching with
 * `MIST_FREENET=1` cannot turn it on — the bundle is already compiled. The
 * preload bridge reports that launch flag at runtime, which keeps the workshop
 * UI reachable in the shell that actually owns a Freenet node even if a build
 * shipped without the flag baked in.
 */
export function isMistExperimentalEnabled(): boolean {
  if (import.meta.env.VITE_MIST_EXPERIMENTAL === 'true') return true;
  if (getDesktopBridge()?.mistEnabled === true) return true;
  return getFarmStoreBackend() === 'mist';
}

/** True when the app should use local mist FarmStore instead of Firestore for bones spike. */
export function isMistFarmStoreActive(): boolean {
  return getFarmStoreBackend() === 'mist';
}

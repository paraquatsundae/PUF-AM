/**
 * Local backup for farm settings (incl. farmProfile).
 * Cloud save can lag / workshop mode skips Firestore — keep a device copy.
 */
import type { FarmSettings } from './farmDiary';

const key = (farmId: string) => `pufom.farmSettings.${farmId}`;

export function readLocalFarmSettings(farmId: string): FarmSettings | null {
  if (typeof localStorage === 'undefined' || !farmId) return null;
  try {
    const raw = localStorage.getItem(key(farmId));
    if (!raw) return null;
    return JSON.parse(raw) as FarmSettings;
  } catch {
    return null;
  }
}

export function writeLocalFarmSettings(farmId: string, settings: FarmSettings): void {
  if (typeof localStorage === 'undefined' || !farmId) return;
  try {
    localStorage.setItem(key(farmId), JSON.stringify(settings));
  } catch {
    /* quota / private mode */
  }
}

/** Merge cloud + local so farmProfile is not wiped by an older cloud doc. */
export function mergeFarmSettings(
  cloud: FarmSettings | null | undefined,
  local: FarmSettings | null | undefined,
  memory: FarmSettings | null | undefined
): FarmSettings {
  const base: FarmSettings = {
    irrigationSystemType: 'micro',
    farmName: '',
  };
  const merged = {
    ...base,
    ...memory,
    ...local,
    ...cloud,
  };
  // Prefer the richest farmProfile (cloud if present, else local, else memory)
  merged.farmProfile =
    cloud?.farmProfile ?? local?.farmProfile ?? memory?.farmProfile ?? merged.farmProfile;
  return merged;
}

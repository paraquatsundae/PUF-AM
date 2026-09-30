/**
 * Farm settings fields Firestore accepts on `settings/farm`.
 * A key outside this list makes the whole save fail, so farm type never sticks.
 */
import type { FarmSettings } from './farmDiaryTypes';

export const FARM_SETTINGS_FIRESTORE_KEYS = [
  'irrigationSystemType',
  'waterAllocationMl',
  'farmName',
  'customChemicals',
  'customBiologicals',
  'customCarriers',
  'customAdjuvants',
  'farmProfile',
  'highlightDefaultSeconds',
  'dpirdStationCode',
  'dpirdStationName',
] as const satisfies readonly (keyof FarmSettings)[];

function withoutUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutUndefined);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (nested !== undefined) out[key] = withoutUndefined(nested);
    }
    return out;
  }
  return value;
}

export function farmSettingsForFirestore(settings: FarmSettings): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of FARM_SETTINGS_FIRESTORE_KEYS) {
    const value = settings[key];
    if (value !== undefined) out[key] = withoutUndefined(value);
  }
  return out;
}

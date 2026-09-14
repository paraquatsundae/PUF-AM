/**
 * Farm-pack catalog (not CROP_PACKS).
 *
 * Settings → Plugins → General. Same farm-doc `cropPacks` map as crop packs
 * (already on the Auth listener — no new Firestore path).
 * Plans/FARM_MESSAGING.md · Plans/NAMING.md §1
 */
import type { FarmModuleId } from '../auth/farmModules';
import {
  FARM_FEED_PACK_ID,
  FARM_FEED_PRIMARY_PATH,
  FARM_FEED_SETTINGS_OWNED_KEYS,
  farmFeedManifest,
  farmFeedModules,
} from './farmFeedPackage';
import type { PluginCategoryId } from './pluginCategories';

export {
  FARM_FEED_PACK_ID,
  FARM_FEED_PRIMARY_PATH,
  FARM_FEED_SETTINGS_OWNED_KEYS,
} from './farmFeedPackage';

export const FARM_PACK_IDS = [FARM_FEED_PACK_ID] as const;
export type FarmPackId = (typeof FARM_PACK_IDS)[number];

export type FarmPackDef = {
  id: FarmPackId;
  label: string;
  blurb: string;
  category: PluginCategoryId;
  modules: FarmModuleId[];
  settingsDocId: string | null;
  settingsOwnedKeys?: readonly string[];
  primaryPath?: string;
  canInstall?: never;
};

export const FARM_PACKS: readonly FarmPackDef[] = [
  {
    id: FARM_FEED_PACK_ID,
    label: farmFeedManifest.label,
    blurb: farmFeedManifest.blurb,
    category: farmFeedManifest.category,
    modules: farmFeedModules,
    settingsDocId: farmFeedManifest.settingsDocId,
    settingsOwnedKeys: FARM_FEED_SETTINGS_OWNED_KEYS,
    primaryPath: FARM_FEED_PRIMARY_PATH,
  },
];

export function isFarmPackId(value: unknown): value is FarmPackId {
  return typeof value === 'string' && (FARM_PACK_IDS as readonly string[]).includes(value);
}

export function getFarmPack(id: FarmPackId): FarmPackDef {
  const found = FARM_PACKS.find((p) => p.id === id);
  if (!found) throw new Error(`Unknown farm pack: ${id}`);
  return found;
}

export function listFarmPacks(): readonly FarmPackDef[] {
  return FARM_PACKS;
}

/** Freenet / workshop have no farm-doc `cropPacks` map — default Farm feed on. */
export function farmFeedDefaultsOnWithoutMap(opts: {
  mistSession: boolean;
  workshop: boolean;
}): boolean {
  return opts.mistSession || opts.workshop;
}

/**
 * Farm-pack catalog (not CROP_PACKS).
 *
 * Settings → Plugins → General. Same farm-doc `cropPacks` map as crop packs
 * (already on the Auth listener — no new Firestore path). Kind `farm` is on
 * unless that row is explicitly inactive — crew must not wait for Install.
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

/**
 * Kind `farm` is on unless the farm-doc row is explicitly inactive.
 * Missing entry = on (crew must not wait for admin Install).
 */
export function isFarmKindPackActive(
  packs: { [id: string]: { status?: string } | undefined },
  id: FarmPackId
): boolean {
  return packs[id]?.status !== 'inactive';
}

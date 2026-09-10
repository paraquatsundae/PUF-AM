/**
 * Unified Settings → Plugins catalog (crop packs + system plugins).
 *
 * Crop packs use Install/Activate lifecycle (`cropPacks.ts`).
 * Freenet is a system plugin whose manifest says `kind: network` — a network
 * pack (Plans/NETWORK_PACK_PLUGIN.md): enabled per farm, node per device, and
 * day-to-day controls under Settings → Sync. Not the cropPack lifecycle.
 */

import {
  cropPackCategory,
  listCropPacks,
  type CropPackDef,
  type CropPackId,
} from './cropPacks';
import { FREENET_HOST_PACK_ID, freenetHostManifest } from './freenetHostPackage';
import {
  PLUGIN_CATEGORIES,
  type PluginCategoryId,
} from './pluginCategories';

export { FREENET_HOST_PACK_ID } from './freenetHostPackage';

export type SystemPluginId = typeof FREENET_HOST_PACK_ID;

export type PluginCatalogKind = 'crop_pack' | 'system';

export type SystemPluginDef = {
  kind: 'system';
  id: SystemPluginId;
  label: string;
  blurb: string;
  category: PluginCategoryId;
};

export type CropPackPluginDef = CropPackDef & { kind: 'crop_pack' };

export type PluginCatalogEntry = CropPackPluginDef | SystemPluginDef;

/** Freenet host — always listed under Network & storage. Copy comes from its `plugin.json`. */
export const FREENET_HOST_PLUGIN: SystemPluginDef = {
  kind: 'system',
  id: FREENET_HOST_PACK_ID,
  label: freenetHostManifest.label,
  blurb: freenetHostManifest.blurb,
  category: freenetHostManifest.category,
};

export const SYSTEM_PLUGINS: readonly SystemPluginDef[] = [FREENET_HOST_PLUGIN];

export function listPluginCatalog(): PluginCatalogEntry[] {
  const packs: CropPackPluginDef[] = listCropPacks().map((p) => ({
    ...p,
    kind: 'crop_pack' as const,
    category: cropPackCategory(p),
  }));
  return [...SYSTEM_PLUGINS, ...packs];
}

export type PluginCategoryGroup = {
  category: PluginCategoryId;
  label: string;
  blurb: string;
  entries: PluginCatalogEntry[];
};

/** Groups catalog entries in PLUGIN_CATEGORIES order; skips empty categories. */
export function groupPluginsByCategory(
  entries: readonly PluginCatalogEntry[] = listPluginCatalog()
): PluginCategoryGroup[] {
  return PLUGIN_CATEGORIES.map((cat) => ({
    category: cat.id,
    label: cat.label,
    blurb: cat.blurb,
    entries: entries.filter((e) => e.category === cat.id),
  })).filter((g) => g.entries.length > 0);
}

export function isCropPackPlugin(
  entry: PluginCatalogEntry
): entry is CropPackPluginDef {
  return entry.kind === 'crop_pack';
}

export function isSystemPlugin(entry: PluginCatalogEntry): entry is SystemPluginDef {
  return entry.kind === 'system';
}

export type { CropPackId };

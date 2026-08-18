/**
 * Unified Settings → Plugins catalog (crop packs + system plugins).
 *
 * Crop packs use Install/Activate lifecycle (`cropPacks.ts`).
 * Freenet is a system plugin: chosen at farm create / shown here for status,
 * managed under Settings → Sync — not via cropPack lifecycle.
 */

import {
  cropPackCategory,
  listCropPacks,
  type CropPackDef,
  type CropPackId,
} from './cropPacks';
import {
  PLUGIN_CATEGORIES,
  type PluginCategoryId,
} from './pluginCategories';

export type SystemPluginId = 'freenet_host';

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

/** Freenet host — always listed under Network & storage. */
export const FREENET_HOST_PLUGIN: SystemPluginDef = {
  kind: 'system',
  id: 'freenet_host',
  label: 'Freenet',
  blurb:
    'Offline network storage for this farm (join tickets, encrypted mist). Chosen when the farm is created; day-to-day controls live under Sync.',
  category: 'network',
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

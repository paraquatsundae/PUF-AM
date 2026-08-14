/**
 * Crop-pack catalog + pure lifecycle helpers (Plans/CROP_PACK_PLUGIN.md).
 *
 * Catalog metadata and blight engine defaults live in `plugins/walnut_blight/`.
 * React UI still ships in `src/packs/<id>/`. Farm admin Install / Activate /
 * Deactivate / Delete is driven from these defs + `farms/{id}.cropPacks`.
 *
 * Every pack **must** set `category` (see `pluginCategories.ts`). Use
 * `generic` when no better bucket fits.
 */

import {
  OPTIONAL_MODULES,
  resolveFarmEnabledModules,
  type FarmModuleId,
  withWalnutPackModules,
  withoutWalnutPackModules,
} from '../auth/farmModules';
import { farmHasWalnutPack, type FarmProfile } from './farmTypes';
import {
  resolvePluginCategory,
  type PluginCategoryId,
} from './pluginCategories';
import {
  WALNUT_BLIGHT_PACK_ID,
  WALNUT_BLIGHT_PRIMARY_PATH,
  WALNUT_BLIGHT_SETTINGS_OWNED_KEYS,
  walnutBlightManifest,
  walnutBlightModules,
} from './walnutBlightPackage';

export { WALNUT_BLIGHT_SETTINGS_OWNED_KEYS } from './walnutBlightPackage';

export const CROP_PACK_IDS = [WALNUT_BLIGHT_PACK_ID] as const;
export type CropPackId = (typeof CROP_PACK_IDS)[number];

export type CropPackStatus = 'active' | 'inactive';

export type FarmCropPackEntry = {
  status: CropPackStatus;
  installedAt: string;
  activatedAt?: string;
};

export type FarmCropPacksMap = Partial<Record<CropPackId, FarmCropPackEntry>>;

export type CropPackBlockLike = { species?: string | null };

export type CropPackLifecycleCtx = {
  farmId: string;
  profile?: FarmProfile | unknown;
  blocks?: CropPackBlockLike[];
};

export type CropPackInstallCheck = {
  ok: boolean;
  hint?: string;
  /** When true, Install must stay disabled. */
  hard?: boolean;
};

export type CropPackDef = {
  id: CropPackId;
  label: string;
  blurb: string;
  /**
   * Settings → Plugins grouping. Required for every pack — use `generic` if
   * nothing more specific fits (`shared/farm/pluginCategories.ts`).
   */
  category: PluginCategoryId;
  modules: FarmModuleId[];
  /**
   * Firestore doc id under farms/{id}/settings/.
   * When `settingsOwnedKeys` is set, Delete clears those fields only (merge).
   * When null / empty owned keys and settingsDocId set, Delete removes the whole doc.
   */
  settingsDocId: string | null;
  /** Pack-owned fields inside settingsDocId (legacy shared docs). */
  settingsOwnedKeys?: readonly string[];
  /** Primary operator route, from plugin.json when the pack ships as a zip. */
  primaryPath?: string;
  canInstall?: (ctx: CropPackLifecycleCtx) => CropPackInstallCheck;
};

export const CROP_PACKS: readonly CropPackDef[] = [
  {
    id: WALNUT_BLIGHT_PACK_ID,
    label: walnutBlightManifest.label,
    blurb: walnutBlightManifest.blurb,
    category: walnutBlightManifest.category,
    modules: walnutBlightModules,
    settingsDocId: walnutBlightManifest.settingsDocId,
    settingsOwnedKeys: WALNUT_BLIGHT_SETTINGS_OWNED_KEYS,
    primaryPath: WALNUT_BLIGHT_PRIMARY_PATH,
    canInstall: (ctx) => {
      const eligible = farmHasWalnutPack({
        profile: ctx.profile,
        blocks: ctx.blocks,
      });
      if (eligible) return { ok: true };
      return {
        ok: true,
        hint: 'No walnut areas or walnut orchard default yet — pack will have little orchard data until you add walnuts.',
        hard: false,
      };
    },
  },
];

export function isCropPackId(value: unknown): value is CropPackId {
  return typeof value === 'string' && (CROP_PACK_IDS as readonly string[]).includes(value);
}

export function getCropPack(id: CropPackId): CropPackDef {
  const found = CROP_PACKS.find((p) => p.id === id);
  if (!found) throw new Error(`Unknown crop pack: ${id}`);
  return found;
}

export function listCropPacks(): readonly CropPackDef[] {
  return CROP_PACKS;
}

/** Category for a pack def (never throws — falls back to generic). */
export function cropPackCategory(pack: CropPackDef): PluginCategoryId {
  return resolvePluginCategory(pack.category);
}

export function resolveFarmCropPacks(input: unknown): FarmCropPacksMap {
  if (!input || typeof input !== 'object') return {};
  const raw = input as Record<string, unknown>;
  const out: FarmCropPacksMap = {};
  for (const id of CROP_PACK_IDS) {
    const entry = raw[id];
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const status = e.status === 'inactive' ? 'inactive' : e.status === 'active' ? 'active' : null;
    if (!status) continue;
    const installedAt =
      typeof e.installedAt === 'string' && e.installedAt.trim()
        ? e.installedAt
        : new Date(0).toISOString();
    const activatedAt =
      typeof e.activatedAt === 'string' && e.activatedAt.trim() ? e.activatedAt : undefined;
    out[id] = {
      status,
      installedAt,
      ...(activatedAt ? { activatedAt } : {}),
    };
  }
  return out;
}

export function isPackInstalled(packs: FarmCropPacksMap, id: CropPackId): boolean {
  return Boolean(packs[id]);
}

export function isPackActive(packs: FarmCropPacksMap, id: CropPackId): boolean {
  return packs[id]?.status === 'active';
}

/** Modules owned by any known pack (for stripping when inactive). */
export function allPackModuleIds(): FarmModuleId[] {
  const set = new Set<FarmModuleId>();
  for (const pack of CROP_PACKS) {
    for (const m of pack.modules) set.add(m);
  }
  return [...set];
}

export function modulesForActivePacks(packs: FarmCropPacksMap): FarmModuleId[] {
  const set = new Set<FarmModuleId>();
  for (const pack of CROP_PACKS) {
    if (isPackActive(packs, pack.id)) {
      for (const m of pack.modules) set.add(m);
    }
  }
  return [...set];
}

/** Which catalog pack owns this module (if any). */
export function packOwningModule(moduleId: FarmModuleId): CropPackDef | undefined {
  return CROP_PACKS.find((p) => p.modules.includes(moduleId));
}

/** True when module is not pack-owned, or its pack is active. */
export function isPackModuleOffered(
  moduleId: FarmModuleId,
  packs: FarmCropPacksMap
): boolean {
  const pack = packOwningModule(moduleId);
  if (!pack) return true;
  return isPackActive(packs, pack.id);
}

/**
 * Drop pack-owned modules whose pack is inactive / not installed.
 * Does **not** force-add active pack modules (admin may leave them off).
 */
export function clampModulesToActivePacks(
  modules: FarmModuleId[],
  packs: FarmCropPacksMap
): FarmModuleId[] {
  const packOwned = new Set(allPackModuleIds());
  const activeOwned = new Set(modulesForActivePacks(packs));
  return resolveFarmEnabledModules(modules).filter(
    (m) => !packOwned.has(m) || activeOwned.has(m)
  );
}

/**
 * Align farm module catalog with active packs:
 * - ensure each active pack's modules are present
 * - strip modules that belong only to inactive / not-installed packs
 */
export function syncModulesWithCropPacks(
  modules: FarmModuleId[],
  packs: FarmCropPacksMap
): FarmModuleId[] {
  const kept = clampModulesToActivePacks(modules, packs);
  const withActive = [...kept, ...modulesForActivePacks(packs)];
  return resolveFarmEnabledModules(withActive);
}

/** Optional ops modules that are not owned by any crop pack. */
export function optionalOpsModules(): FarmModuleId[] {
  const packOwned = new Set(allPackModuleIds());
  return OPTIONAL_MODULES.filter((id) => !packOwned.has(id));
}

/** Pack modules to show on Farm Modules — from installed packs only. */
export function installedPackModuleRows(packs: FarmCropPacksMap): Array<{
  moduleId: FarmModuleId;
  pack: CropPackDef;
  active: boolean;
}> {
  const rows: Array<{ moduleId: FarmModuleId; pack: CropPackDef; active: boolean }> = [];
  for (const pack of CROP_PACKS) {
    if (!isPackInstalled(packs, pack.id)) continue;
    const active = isPackActive(packs, pack.id);
    for (const moduleId of pack.modules) {
      rows.push({ moduleId, pack, active });
    }
  }
  return rows;
}

export function withPackModules(
  modules: FarmModuleId[],
  packId: CropPackId
): FarmModuleId[] {
  const pack = getCropPack(packId);
  return resolveFarmEnabledModules([...modules, ...pack.modules]);
}

export function withoutPackModules(
  modules: FarmModuleId[],
  packId: CropPackId
): FarmModuleId[] {
  const ban = new Set(getCropPack(packId).modules);
  return resolveFarmEnabledModules(modules.filter((m) => !ban.has(m)));
}

export type LegacyWalnutMigration = {
  /** True when cropPacks had no walnut_blight entry and we derived one. */
  migrated: boolean;
  cropPacks: FarmCropPacksMap;
  modules: FarmModuleId[];
};

/**
 * One-time legacy bridge: if walnut_blight is missing from cropPacks but the
 * farm looks like a walnut / blight farm, install + activate.
 */
export function migrateLegacyWalnutPack(opts: {
  cropPacks: unknown;
  modules: FarmModuleId[];
  profile?: unknown;
  blocks?: CropPackBlockLike[];
  nowIso?: string;
}): LegacyWalnutMigration {
  const cropPacks = resolveFarmCropPacks(opts.cropPacks);
  const modules = resolveFarmEnabledModules(opts.modules);
  if (cropPacks.walnut_blight) {
    return {
      migrated: false,
      cropPacks,
      modules: syncModulesWithCropPacks(modules, cropPacks),
    };
  }

  const eligible = farmHasWalnutPack({
    profile: opts.profile,
    blocks: opts.blocks,
    blightModuleEnabled: modules.includes('blight'),
  });

  if (!eligible) {
    return {
      migrated: false,
      cropPacks,
      modules: syncModulesWithCropPacks(modules, cropPacks),
    };
  }

  const now = opts.nowIso ?? new Date().toISOString();
  const nextPacks: FarmCropPacksMap = {
    ...cropPacks,
    walnut_blight: {
      status: 'active',
      installedAt: now,
      activatedAt: now,
    },
  };
  return {
    migrated: true,
    cropPacks: nextPacks,
    modules: withWalnutPackModules(modules),
  };
}

/** Pure Install (+ activate by default). */
export function planInstallPack(
  packs: FarmCropPacksMap,
  modules: FarmModuleId[],
  packId: CropPackId,
  nowIso: string,
  activate = true
): { cropPacks: FarmCropPacksMap; modules: FarmModuleId[] } {
  const prev = packs[packId];
  const entry: FarmCropPackEntry = {
    status: activate ? 'active' : 'inactive',
    installedAt: prev?.installedAt ?? nowIso,
    ...(activate ? { activatedAt: nowIso } : prev?.activatedAt ? { activatedAt: prev.activatedAt } : {}),
  };
  const cropPacks = { ...packs, [packId]: entry };
  return {
    cropPacks,
    modules: activate ? withPackModules(modules, packId) : withoutPackModules(modules, packId),
  };
}

export function planActivatePack(
  packs: FarmCropPacksMap,
  modules: FarmModuleId[],
  packId: CropPackId,
  nowIso: string
): { cropPacks: FarmCropPacksMap; modules: FarmModuleId[] } {
  const prev = packs[packId];
  if (!prev) {
    return planInstallPack(packs, modules, packId, nowIso, true);
  }
  const cropPacks: FarmCropPacksMap = {
    ...packs,
    [packId]: { ...prev, status: 'active', activatedAt: nowIso },
  };
  return { cropPacks, modules: withPackModules(modules, packId) };
}

export function planDeactivatePack(
  packs: FarmCropPacksMap,
  modules: FarmModuleId[],
  packId: CropPackId
): { cropPacks: FarmCropPacksMap; modules: FarmModuleId[] } {
  const prev = packs[packId];
  if (!prev) {
    return { cropPacks: packs, modules: resolveFarmEnabledModules(modules) };
  }
  const cropPacks: FarmCropPacksMap = {
    ...packs,
    [packId]: { ...prev, status: 'inactive' },
  };
  return { cropPacks, modules: withoutPackModules(modules, packId) };
}

export function planDeletePack(
  packs: FarmCropPacksMap,
  modules: FarmModuleId[],
  packId: CropPackId
): { cropPacks: FarmCropPacksMap; modules: FarmModuleId[] } {
  const cropPacks = { ...packs };
  delete cropPacks[packId];
  return { cropPacks, modules: withoutPackModules(modules, packId) };
}

/** @deprecated Prefer syncModulesWithCropPacks — kept for walnut-specific call sites. */
export function syncWalnutModulesFromEligibility(
  modules: FarmModuleId[],
  eligible: boolean
): FarmModuleId[] {
  return eligible ? withWalnutPackModules(modules) : withoutWalnutPackModules(modules);
}

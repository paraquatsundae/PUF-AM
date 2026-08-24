/**
 * Crop-pack catalog + pure lifecycle helpers (Plans/CROP_PACK_PLUGIN.md).
 *
 * Catalog metadata and engine defaults live in `plugins/<id>/`.
 * React UI still ships in `src/packs/<id>/`. Farm admin Install / Activate /
 * Deactivate / Delete is driven from these defs + `farms/{id}.cropPacks`.
 *
 * Every pack **must** set `category` (see `pluginCategories.ts`). Use
 * `generic` when no better bucket fits.
 */

import {
  FARM_MODULE_IDS,
  OPTIONAL_MODULES,
  resolveFarmEnabledModules,
  type FarmModuleId,
} from '../auth/farmModules';
import { farmHasWalnutPack, farmShowsChillPortions, type FarmProfile } from './farmTypes';
import {
  resolvePluginCategory,
  type PluginCategoryId,
} from './pluginCategories';
import {
  CHILL_PORTIONS_PACK_ID,
  CHILL_PORTIONS_PRIMARY_PATH,
  CHILL_PORTIONS_SETTINGS_OWNED_KEYS,
  chillPortionsManifest,
  chillPortionsModules,
} from './chillPortionsPackage';
import {
  DRYING_PACK_ID,
  DRYING_PRIMARY_PATH,
  DRYING_SETTINGS_OWNED_KEYS,
  dryingManifest,
  dryingModules,
} from './dryingPackage';
import {
  HARVEST_PACK_ID,
  HARVEST_PRIMARY_PATH,
  HARVEST_SETTINGS_OWNED_KEYS,
  harvestManifest,
  harvestModules,
} from './harvestPackage';
import {
  NUTRITION_PACK_ID,
  NUTRITION_PRIMARY_PATH,
  NUTRITION_SETTINGS_OWNED_KEYS,
  nutritionManifest,
  nutritionModules,
} from './nutritionPackage';
import {
  WATER_PACK_ID,
  WATER_PRIMARY_PATH,
  WATER_SETTINGS_OWNED_KEYS,
  waterManifest,
  waterModules,
} from './waterPackage';
import {
  WALNUT_BLIGHT_PACK_ID,
  WALNUT_BLIGHT_PRIMARY_PATH,
  WALNUT_BLIGHT_SETTINGS_OWNED_KEYS,
  walnutBlightManifest,
  walnutBlightModules,
} from './walnutBlightPackage';

export { WALNUT_BLIGHT_SETTINGS_OWNED_KEYS } from './walnutBlightPackage';
export { CHILL_PORTIONS_SETTINGS_OWNED_KEYS } from './chillPortionsPackage';
export { WATER_SETTINGS_OWNED_KEYS } from './waterPackage';
export { NUTRITION_SETTINGS_OWNED_KEYS } from './nutritionPackage';
export { HARVEST_SETTINGS_OWNED_KEYS } from './harvestPackage';
export { DRYING_SETTINGS_OWNED_KEYS } from './dryingPackage';

/** Used to be core ops modules; one-time Install if the farm already had them on. */
export const CORE_OPS_PACK_IDS = [
  WATER_PACK_ID,
  NUTRITION_PACK_ID,
  HARVEST_PACK_ID,
  DRYING_PACK_ID,
] as const;

export const CROP_PACK_IDS = [
  WALNUT_BLIGHT_PACK_ID,
  CHILL_PORTIONS_PACK_ID,
  ...CORE_OPS_PACK_IDS,
] as const;
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
  {
    id: CHILL_PORTIONS_PACK_ID,
    label: chillPortionsManifest.label,
    blurb: chillPortionsManifest.blurb,
    category: chillPortionsManifest.category,
    modules: chillPortionsModules,
    settingsDocId: chillPortionsManifest.settingsDocId,
    settingsOwnedKeys: CHILL_PORTIONS_SETTINGS_OWNED_KEYS,
    primaryPath: CHILL_PORTIONS_PRIMARY_PATH,
    canInstall: (ctx) => {
      const eligible = farmShowsChillPortions({
        profile: ctx.profile,
        blocks: ctx.blocks,
      });
      if (eligible) return { ok: true };
      return {
        ok: true,
        hint: 'No orchard, fruit, or vineyard areas yet — pack will have little chill data until you add tree crops.',
        hard: false,
      };
    },
  },
  {
    id: WATER_PACK_ID,
    label: waterManifest.label,
    blurb: waterManifest.blurb,
    category: waterManifest.category,
    modules: waterModules,
    settingsDocId: waterManifest.settingsDocId,
    settingsOwnedKeys: WATER_SETTINGS_OWNED_KEYS,
    primaryPath: WATER_PRIMARY_PATH,
  },
  {
    id: NUTRITION_PACK_ID,
    label: nutritionManifest.label,
    blurb: nutritionManifest.blurb,
    category: nutritionManifest.category,
    modules: nutritionModules,
    settingsDocId: nutritionManifest.settingsDocId,
    settingsOwnedKeys: NUTRITION_SETTINGS_OWNED_KEYS,
    primaryPath: NUTRITION_PRIMARY_PATH,
  },
  {
    id: HARVEST_PACK_ID,
    label: harvestManifest.label,
    blurb: harvestManifest.blurb,
    category: harvestManifest.category,
    modules: harvestModules,
    settingsDocId: harvestManifest.settingsDocId,
    settingsOwnedKeys: HARVEST_SETTINGS_OWNED_KEYS,
    primaryPath: HARVEST_PRIMARY_PATH,
  },
  {
    id: DRYING_PACK_ID,
    label: dryingManifest.label,
    blurb: dryingManifest.blurb,
    category: dryingManifest.category,
    modules: dryingModules,
    settingsDocId: dryingManifest.settingsDocId,
    settingsOwnedKeys: DRYING_SETTINGS_OWNED_KEYS,
    primaryPath: DRYING_PRIMARY_PATH,
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

/** Default catalog for a new farm (no crop packs assumed). */
export function defaultModulesWithoutCropPacks(): FarmModuleId[] {
  const packOwned = new Set(allPackModuleIds());
  return FARM_MODULE_IDS.filter((id) => !packOwned.has(id));
}

/**
 * Pack-owned modules to hide from PIN / join presets.
 * `offeredLegacy` overrides catalog activity (walnut/chill migration hooks).
 * If a pack is not yet in `cropPacks` but its module is still on the farm
 * catalog, keep offering it (migration window before ensureLegacyPacksMigrated).
 */
export function packModulesToExclude(
  packs: FarmCropPacksMap,
  offeredLegacy?: Partial<Record<CropPackId, boolean>>,
  farmModules?: FarmModuleId[]
): FarmModuleId[] {
  const farm = farmModules ? new Set(farmModules) : null;
  const out: FarmModuleId[] = [];
  for (const pack of CROP_PACKS) {
    const offered =
      offeredLegacy?.[pack.id] ??
      (isPackActive(packs, pack.id) ||
        (!isPackInstalled(packs, pack.id) &&
          farm != null &&
          pack.modules.some((m) => farm.has(m))));
    if (!offered) out.push(...pack.modules);
  }
  return out;
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

/**
 * Farm catalog plus modules of active packs.
 * Nav uses this so a just-installed pack appears before migrate writes
 * `enabledModules` (blight/chill used to be the only special cases).
 */
export function offeredFarmModules(
  farmEnabled: unknown,
  packs: FarmCropPacksMap,
  extra: readonly FarmModuleId[] = []
): FarmModuleId[] {
  const set = new Set<FarmModuleId>([
    ...resolveFarmEnabledModules(farmEnabled),
    ...modulesForActivePacks(packs),
    ...extra,
  ]);
  return FARM_MODULE_IDS.filter((id) => set.has(id));
}

export function moduleListEquals(
  a: readonly FarmModuleId[],
  b: readonly FarmModuleId[]
): boolean {
  if (a.length !== b.length) return false;
  const other = new Set(b);
  return a.every((id) => other.has(id));
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
    modules: withPackModules(modules, WALNUT_BLIGHT_PACK_ID),
  };
}

export type LegacyChillMigration = {
  migrated: boolean;
  cropPacks: FarmCropPacksMap;
  modules: FarmModuleId[];
};

/**
 * One-time legacy bridge: if chill_portions is missing from cropPacks but the
 * farm already showed chill (tree enterprise, species, or walnut pack),
 * install + activate.
 */
export function migrateLegacyChillPack(opts: {
  cropPacks: unknown;
  modules: FarmModuleId[];
  profile?: unknown;
  blocks?: CropPackBlockLike[];
  nowIso?: string;
}): LegacyChillMigration {
  const cropPacks = resolveFarmCropPacks(opts.cropPacks);
  const modules = resolveFarmEnabledModules(opts.modules);
  if (cropPacks.chill_portions) {
    return {
      migrated: false,
      cropPacks,
      modules: syncModulesWithCropPacks(modules, cropPacks),
    };
  }

  const eligible = farmShowsChillPortions({
    profile: opts.profile,
    blocks: opts.blocks,
    walnutPackActive: isPackActive(cropPacks, WALNUT_BLIGHT_PACK_ID),
  });

  if (!eligible) {
    return {
      migrated: false,
      cropPacks,
      modules: syncModulesWithCropPacks(modules, cropPacks),
    };
  }

  const now = opts.nowIso ?? new Date().toISOString();
  return {
    migrated: true,
    ...planInstallPack(cropPacks, modules, CHILL_PORTIONS_PACK_ID, now, true),
  };
}

/**
 * Combined harvest_drying pack (2026-08-24) split into harvest (records) + drying (crop).
 * Reads the raw map — resolveFarmCropPacks drops unknown ids.
 */
export function migrateLegacyHarvestDryingSplit(opts: {
  cropPacks: unknown;
  modules: FarmModuleId[];
  nowIso?: string;
}): LegacyWalnutMigration {
  const cropPacks = resolveFarmCropPacks(opts.cropPacks);
  const modules = resolveFarmEnabledModules(opts.modules);
  const raw =
    opts.cropPacks && typeof opts.cropPacks === 'object'
      ? (opts.cropPacks as Record<string, unknown>).harvest_drying
      : null;
  if (!raw || typeof raw !== 'object') {
    return { migrated: false, cropPacks, modules };
  }
  if (cropPacks.harvest && cropPacks.drying) {
    return { migrated: false, cropPacks, modules };
  }
  const e = raw as Record<string, unknown>;
  const status = e.status === 'inactive' ? 'inactive' : e.status === 'active' ? 'active' : null;
  if (!status) return { migrated: false, cropPacks, modules };
  const now = opts.nowIso ?? new Date().toISOString();
  const installedAt =
    typeof e.installedAt === 'string' && e.installedAt.trim() ? e.installedAt : now;
  const activatedAt =
    typeof e.activatedAt === 'string' && e.activatedAt.trim() ? e.activatedAt : undefined;
  const entry: FarmCropPackEntry = {
    status,
    installedAt,
    ...(activatedAt ? { activatedAt } : {}),
  };
  const next: FarmCropPacksMap = {
    ...cropPacks,
    harvest: cropPacks.harvest ?? entry,
    drying: cropPacks.drying ?? entry,
  };
  return {
    migrated: true,
    cropPacks: next,
    modules: syncModulesWithCropPacks(modules, next),
  };
}

/**
 * Water / nutrition / harvest / drying used to be core ops modules.
 * If the farm catalog already has the module and the pack is missing, Install+Activate.
 * Drying also installs when the farm still has `harvest` (they were one page).
 * Must run before walnut/chill `syncModulesWithCropPacks` or those modules are stripped.
 */
export function migrateLegacyCoreOpsPacks(opts: {
  cropPacks: unknown;
  modules: FarmModuleId[];
  nowIso?: string;
}): LegacyWalnutMigration {
  let cropPacks = resolveFarmCropPacks(opts.cropPacks);
  let modules = resolveFarmEnabledModules(opts.modules);
  let migrated = false;
  const now = opts.nowIso ?? new Date().toISOString();
  for (const packId of CORE_OPS_PACK_IDS) {
    if (cropPacks[packId]) continue;
    const pack = getCropPack(packId);
    const hadOwnModule = pack.modules.some((m) => modules.includes(m));
    const dryingFromHarvest =
      packId === DRYING_PACK_ID && (modules.includes('harvest') || Boolean(cropPacks.harvest));
    if (!hadOwnModule && !dryingFromHarvest) continue;
    const planned = planInstallPack(cropPacks, modules, packId, now, true);
    cropPacks = planned.cropPacks;
    modules = planned.modules;
    migrated = true;
  }
  return { migrated, cropPacks, modules };
}

/** Split harvest_drying, then ops packs, then walnut, then chill. */
export function migrateLegacyPacks(opts: {
  cropPacks: unknown;
  modules: FarmModuleId[];
  profile?: unknown;
  blocks?: CropPackBlockLike[];
  nowIso?: string;
}): LegacyWalnutMigration {
  const split = migrateLegacyHarvestDryingSplit(opts);
  const ops = migrateLegacyCoreOpsPacks({
    cropPacks: split.cropPacks,
    modules: split.modules,
    nowIso: opts.nowIso,
  });
  const walnut = migrateLegacyWalnutPack({
    ...opts,
    cropPacks: ops.cropPacks,
    modules: ops.modules,
  });
  const chill = migrateLegacyChillPack({
    ...opts,
    cropPacks: walnut.cropPacks,
    modules: walnut.modules,
  });
  return {
    migrated: split.migrated || ops.migrated || walnut.migrated || chill.migrated,
    cropPacks: chill.cropPacks,
    modules: chill.modules,
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
  return eligible
    ? withPackModules(modules, WALNUT_BLIGHT_PACK_ID)
    : withoutPackModules(modules, WALNUT_BLIGHT_PACK_ID);
}

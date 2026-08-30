/**
 * One-time crop-pack migrations. Catalog / plan helpers stay in cropPackCatalog.ts.
 * `harvest_drying` is only allowed in this file (legacy key).
 */
import { resolveFarmEnabledModules, type FarmModuleId } from '../auth/farmModules';
import { farmHasWalnutPack, farmShowsChillPortions } from './farmTypes';
import {
  CHILL_PORTIONS_PACK_ID,
  CORE_OPS_PACK_IDS,
  DRYING_PACK_ID,
  WALNUT_BLIGHT_PACK_ID,
  getCropPack,
  isPackActive,
  planInstallPack,
  resolveFarmCropPacks,
  syncModulesWithCropPacks,
  withPackModules,
  type CropPackBlockLike,
  type FarmCropPackEntry,
  type FarmCropPacksMap,
} from './cropPackCatalog';

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

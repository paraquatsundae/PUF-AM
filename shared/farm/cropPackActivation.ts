/**
 * Which crop packs apply to a farm.
 *
 * A farm that has run Install is answered by its `cropPacks` map alone. Farms
 * that predate the Crop packs card have no entry for the two packs that shipped
 * before it, so those keep a legacy eligibility rule: walnut reads the farm
 * profile, the mapped blocks and the `blight` module, and chill follows walnut.
 *
 * Gathering both rules here is the point. Callers ask for the whole map and pass
 * it on, so nothing outside this file names a pack. When the last unmigrated
 * farm is gone, `LEGACY_ELIGIBILITY` empties and every caller keeps working —
 * `Plans/PLUGIN_AUTHORING.md` calls this "let it die with the last unmigrated farm".
 */
import type { FarmModuleId } from '../auth/farmModules';
import {
  farmHasWalnutPack,
  farmShowsChillPortions,
  type FarmEnterpriseId,
} from './farmTypes';
import {
  CROP_PACKS,
  getCropPack,
  isPackActive,
  isPackInstalled,
  type CropPackId,
  type FarmCropPacksMap,
} from './cropPackCatalog';
import { WALNUT_BLIGHT_PACK_ID } from './walnutBlightPackage';
import { CHILL_PORTIONS_PACK_ID } from './chillPortionsPackage';

/** Wider than `CropPackBlockLike`: walnut reads `species`, chill also `cropKind`. */
export type ActivationBlockLike = {
  species?: string | null;
  cropKind?: FarmEnterpriseId | string | null;
};

export type CropPackActivationCtx = {
  /** The farm's `cropPacks` map. Empty on a farm that never ran Install. */
  packs: FarmCropPacksMap;
  /** Farm-level `enabledModules`. */
  farmModules: readonly FarmModuleId[];
  /** Unresolved `settings.farmProfile`. */
  profile?: unknown;
  blocks?: ActivationBlockLike[];
};

type LegacyRule = (ctx: CropPackActivationCtx) => boolean;

function walnutEligible(ctx: CropPackActivationCtx): boolean {
  return farmHasWalnutPack({
    profile: ctx.profile,
    blocks: ctx.blocks,
    blightModuleEnabled: ctx.farmModules.includes('blight'),
  });
}

/** Legacy chill rode on walnut, so it needs walnut's answer, not just its rule. */
function chillEligible(ctx: CropPackActivationCtx): boolean {
  return farmShowsChillPortions({
    profile: ctx.profile,
    blocks: ctx.blocks,
    walnutPackActive: isCropPackActiveForFarm(WALNUT_BLIGHT_PACK_ID, ctx),
  });
}

const LEGACY_ELIGIBILITY: Partial<Record<CropPackId, LegacyRule>> = {
  [WALNUT_BLIGHT_PACK_ID]: walnutEligible,
  [CHILL_PORTIONS_PACK_ID]: chillEligible,
};

/**
 * Fallback for a pack with no legacy rule: it counts as offered when the farm
 * already has its modules switched on. This is what `packModulesToExclude`
 * worked out for itself before packs could answer for themselves.
 */
function modulesAlreadyOn(packId: CropPackId, ctx: CropPackActivationCtx): boolean {
  return getCropPack(packId).modules.some((m) => ctx.farmModules.includes(m));
}

export function isCropPackActiveForFarm(
  packId: CropPackId,
  ctx: CropPackActivationCtx
): boolean {
  // Install is the authority once the farm has one; a pack cannot claim itself back.
  if (isPackInstalled(ctx.packs, packId)) return isPackActive(ctx.packs, packId);
  const legacy = LEGACY_ELIGIBILITY[packId];
  return legacy ? legacy(ctx) : modulesAlreadyOn(packId, ctx);
}

/** Every pack's answer, keyed by id — hand straight to `packModulesToExclude`. */
export function activeCropPacks(
  ctx: CropPackActivationCtx
): Partial<Record<CropPackId, boolean>> {
  const out: Partial<Record<CropPackId, boolean>> = {};
  for (const pack of CROP_PACKS) {
    out[pack.id] = isCropPackActiveForFarm(pack.id, ctx);
  }
  return out;
}

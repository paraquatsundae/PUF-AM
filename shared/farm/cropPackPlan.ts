/**
 * Pure Install / Activate / Deactivate / Delete plans.
 * Catalog + offer helpers stay in `cropPackCatalog.ts`. Import via `cropPacks.ts`.
 */

import { resolveFarmEnabledModules, type FarmModuleId } from '../auth/farmModules';
import { FARM_FEED_PACK_ID, isFarmKindPackActive, isFarmPackId } from './farmPacks';
import { WALNUT_BLIGHT_PACK_ID } from './walnutBlightPackage';
import {
  withPackModules,
  withoutPackModules,
  type FarmCropPackEntry,
  type FarmCropPacksMap,
  type InstallablePackId,
} from './cropPackCatalog';

/** Pure Install (+ activate by default). */
export function planInstallPack(
  packs: FarmCropPacksMap,
  modules: FarmModuleId[],
  packId: InstallablePackId,
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
  packId: InstallablePackId,
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
  packId: InstallablePackId,
  nowIso = new Date(0).toISOString()
): { cropPacks: FarmCropPacksMap; modules: FarmModuleId[] } {
  const prev = packs[packId];
  if (!prev) {
    if (isFarmPackId(packId)) {
      return {
        cropPacks: {
          ...packs,
          [packId]: { status: 'inactive', installedAt: nowIso },
        },
        modules: withoutPackModules(modules, packId),
      };
    }
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
  packId: InstallablePackId
): { cropPacks: FarmCropPacksMap; modules: FarmModuleId[] } {
  if (isFarmPackId(packId)) {
    const prev = packs[packId];
    return {
      cropPacks: {
        ...packs,
        [packId]: {
          status: 'inactive',
          installedAt: prev?.installedAt ?? new Date(0).toISOString(),
        },
      },
      modules: withoutPackModules(modules, packId),
    };
  }
  const cropPacks = { ...packs };
  delete cropPacks[packId];
  return { cropPacks, modules: withoutPackModules(modules, packId) };
}

/** New hosted / BYO farms mark Farm feed active (Plans/FARM_MESSAGING.md). */
export function planDefaultFarmFeedOnCreate(
  modules: FarmModuleId[],
  nowIso: string
): { cropPacks: FarmCropPacksMap; modules: FarmModuleId[] } {
  return planInstallPack({}, modules, FARM_FEED_PACK_ID, nowIso, true);
}

/**
 * Kind `farm` default-on: missing map row is on. Explicit inactive (admin
 * Deactivate / Delete tombstone) is off. No silent migrateLegacy write.
 */
export function isFarmFeedActive(packs: FarmCropPacksMap): boolean {
  return isFarmKindPackActive(packs, FARM_FEED_PACK_ID);
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

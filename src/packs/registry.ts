/**
 * Aggregate crop-pack UI registrations.
 *
 * To add a pack: `Plans/PLUGIN_AUTHORING.md`
 * Then: adapter + `cropPacks.ts`, `plugins/<id>/src/index.ts` → append here.
 *
 * Packs are mid-migration to `plugins/<id>/src/` (Plans/PLUGIN_PACK_LAYOUT.md
 * Phase 1), so the imports below point at two places. Once they all point at
 * `plugins/`, this list is replaced by an `import.meta.glob` and appending stops
 * being a step at all.
 */
import type { FarmModuleId } from '../../shared/auth/farmModules';
import type { CropPackId } from '../../shared/farm/cropPacks';
import type {
  CropPackUiRegistration,
  PackCultivarOption,
  PackNavGroupId,
  PackNavRegistration,
  PackRouteRegistration,
} from './types';
import { chillPortionsPackUi } from './chill_portions';
import { dryingPackUi } from './drying';
import { harvestPackUi } from '../../plugins/harvest/src';
import { nutritionPackUi } from '../../plugins/nutrition/src';
import { walnutBlightPackUi } from './walnut_blight';
import { waterPackUi } from '../../plugins/water/src';

export const PACK_UI_REGISTRY: readonly CropPackUiRegistration[] = [
  walnutBlightPackUi,
  chillPortionsPackUi,
  waterPackUi,
  nutritionPackUi,
  harvestPackUi,
  dryingPackUi,
];

export function getPackUi(packId: CropPackId): CropPackUiRegistration | undefined {
  return PACK_UI_REGISTRY.find((p) => p.packId === packId);
}

export function allPackRoutes(): PackRouteRegistration[] {
  return PACK_UI_REGISTRY.flatMap((p) => [...p.routes]);
}

export function allPackNavItems(): PackNavRegistration[] {
  return PACK_UI_REGISTRY.flatMap((p) => [...p.navItems]);
}

export function packNavItemsForGroup(groupId: PackNavGroupId): PackNavRegistration[] {
  return allPackNavItems().filter((item) => item.groupId === groupId);
}

/**
 * Every pack's cultivar suggestions, in registry order.
 *
 * Deliberately not filtered by whether the pack is active: the block editor has
 * always offered these, and a farm can be recording a cultivar before it decides
 * to install the pack that cares about one.
 */
export function allPackCultivars(): PackCultivarOption[] {
  return PACK_UI_REGISTRY.flatMap((p) => [...(p.blockCultivars ?? [])]);
}

/** Module ids contributed by any pack route (for tests / docs). */
export function packRouteModuleIds(): FarmModuleId[] {
  return [...new Set(allPackRoutes().map((r) => r.moduleId))];
}

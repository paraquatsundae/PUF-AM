/**
 * Aggregate crop-pack UI registrations.
 *
 * To add a pack: `Plans/PLUGIN_AUTHORING.md`
 * Then: adapter + `cropPacks.ts`, `src/packs/<id>/index.ts` → append here.
 */
import type { FarmModuleId } from '../../shared/auth/farmModules';
import type { CropPackId } from '../../shared/farm/cropPacks';
import type {
  CropPackUiRegistration,
  PackNavGroupId,
  PackNavRegistration,
  PackRouteRegistration,
} from './types';
import { chillPortionsPackUi } from './chill_portions';
import { dryingPackUi } from './drying';
import { harvestPackUi } from './harvest';
import { nutritionPackUi } from './nutrition';
import { walnutBlightPackUi } from './walnut_blight';
import { waterPackUi } from './water';

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

/** Module ids contributed by any pack route (for tests / docs). */
export function packRouteModuleIds(): FarmModuleId[] {
  return [...new Set(allPackRoutes().map((r) => r.moduleId))];
}

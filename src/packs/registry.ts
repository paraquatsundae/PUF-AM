/**
 * Aggregate crop-pack UI registrations.
 *
 * To add a pack: create `src/packs/<id>/index.ts`, append to PACK_UI_REGISTRY,
 * and register the catalog entry in shared/farm/cropPacks.ts.
 */
import type { FarmModuleId } from '../../shared/auth/farmModules';
import type { CropPackId } from '../../shared/farm/cropPacks';
import type {
  CropPackUiRegistration,
  PackNavGroupId,
  PackNavRegistration,
  PackRouteRegistration,
} from './types';
import { walnutBlightPackUi } from './walnut_blight';

export const PACK_UI_REGISTRY: readonly CropPackUiRegistration[] = [walnutBlightPackUi];

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

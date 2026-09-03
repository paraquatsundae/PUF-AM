/**
 * Every crop pack's UI, discovered from the `plugins/` folder at build time.
 *
 * To add a pack: `Plans/PLUGIN_AUTHORING.md`. Drop a folder under `plugins/`
 * with a `plugin.json` and a `src/index.ts` exporting `packUi`, add its catalog
 * adapter, and it appears here — no core file lists the packs, so contributing
 * one is not a core edit.
 *
 * `import.meta.glob` is Vite's build-time directory read, not a runtime loader:
 * it expands to static imports of whatever matched when the bundle was built,
 * so packs are still compiled in and vetted through review. `Plans/
 * PLUGIN_PACK_LAYOUT.md` §3 explains why this app does not load code at runtime.
 *
 * Eager, as the hand-written imports were. App and navConfig need routes and
 * nav on first paint, so a pack's registration must be present — the weight of
 * a pack's actual screens stays behind the `lazyWithRetry` calls inside it.
 */
import type { FarmModuleId } from '../../shared/auth/farmModules';
import { CROP_PACKS, type CropPackId } from '../../shared/farm/cropPacks';
import type {
  CropPackUiRegistration,
  PackCultivarOption,
  PackNavGroupId,
  PackNavRegistration,
  PackRouteRegistration,
} from './types';

const discovered = import.meta.glob<{ packUi?: CropPackUiRegistration }>(
  '../../plugins/*/src/index.ts',
  { eager: true }
);

/**
 * Catalog order, not folder order.
 *
 * The glob hands back paths sorted by filename, which would put chill portions
 * above blight and reshuffle the Crop menu. `CROP_PACKS` is where pack order is
 * already decided, so nav ordering follows it rather than the alphabet.
 *
 * A folder with no catalog entry is skipped rather than thrown on: an
 * unregistered pack should not blank the whole app at import time. The pairing
 * is enforced where it can be fixed — `tests/codebaseHealth.test.ts` compares
 * the two sets, and `audit:codebase` checks every catalog pack has a folder.
 */
const catalogOrder = new Map(CROP_PACKS.map((pack, i) => [pack.id as string, i]));

export const PACK_UI_REGISTRY: readonly CropPackUiRegistration[] = Object.entries(discovered)
  .map(([path, mod]) => ({ id: path.split('/')[3], packUi: mod.packUi }))
  .filter(
    (entry): entry is { id: string; packUi: CropPackUiRegistration } =>
      Boolean(entry.packUi) && catalogOrder.has(entry.id)
  )
  .sort((a, b) => catalogOrder.get(a.id)! - catalogOrder.get(b.id)!)
  .map((entry) => entry.packUi);

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

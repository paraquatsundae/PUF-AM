/**
 * Every pack's UI, discovered from the `plugins/` folder at build time.
 *
 * Crop packs: `Plans/PLUGIN_AUTHORING.md`. The network pack (Freenet):
 * `Plans/NETWORK_PACK_PLUGIN.md`. Either way, drop a folder under `plugins/`
 * with a `plugin.json` and a `src/index.ts` exporting `packUi`, pair it with its
 * catalog row, and it appears here. No file under `src/` names a pack — but the
 * adapter, module id and catalog row in `shared/` are still hand-added, so
 * "adding a pack edits nothing" is only true of the UI wiring.
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
import { SYSTEM_PLUGINS, type SystemPluginId } from '../../shared/farm/pluginsCatalog';
import type {
  PackCultivarOption,
  PackNavGroupId,
  PackNavRegistration,
  PackPublicRouteRegistration,
  PackRouteRegistration,
  PackSurface,
  PackSurfaceComponents,
  PackUiRegistration,
} from './types';

const discovered = import.meta.glob<{ packUi?: PackUiRegistration }>(
  '../../plugins/*/src/index.ts',
  { eager: true }
);

/**
 * Catalog order, not folder order.
 *
 * The glob hands back paths sorted by filename, which would put chill portions
 * above blight and reshuffle the Crop menu. `CROP_PACKS` is where pack order is
 * already decided, so nav ordering follows it rather than the alphabet. Network
 * packs (`SYSTEM_PLUGINS`) sort after every crop pack — they contribute no
 * menu items today, and Settings → Plugins lists them under their own heading.
 *
 * A folder with no catalog entry is skipped rather than thrown on: an
 * unregistered pack should not blank the whole app at import time. The pairing
 * is enforced where it can be fixed — `tests/codebaseHealth.test.ts` compares
 * the two sets, and `audit:codebase` checks every pack folder registers.
 */
const catalogOrder = new Map<string, number>(
  [...CROP_PACKS.map((pack) => pack.id as string), ...SYSTEM_PLUGINS.map((p) => p.id as string)].map(
    (id, i) => [id, i]
  )
);

export const PACK_UI_REGISTRY: readonly PackUiRegistration[] = Object.entries(discovered)
  .map(([path, mod]) => ({ id: path.split('/')[3], packUi: mod.packUi }))
  .filter(
    (entry): entry is { id: string; packUi: PackUiRegistration } =>
      Boolean(entry.packUi) && catalogOrder.has(entry.id)
  )
  .sort((a, b) => catalogOrder.get(a.id)! - catalogOrder.get(b.id)!)
  .map((entry) => entry.packUi);

export function getPackUi(packId: CropPackId | SystemPluginId): PackUiRegistration | undefined {
  return PACK_UI_REGISTRY.find((p) => p.packId === packId);
}

export function allPackRoutes(): PackRouteRegistration[] {
  return PACK_UI_REGISTRY.flatMap((p) => [...p.routes]);
}

/** Routes beside `/login` — the network pack's start / recover screens. */
export function allPackPublicRoutes(): PackPublicRouteRegistration[] {
  return PACK_UI_REGISTRY.flatMap((p) => [...(p.publicRoutes ?? [])]);
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

/**
 * Every registered component for one named surface, in registry order.
 *
 * This is how core mounts a slot without knowing which packs exist: the
 * Settings → Sync card, the login explainer, the session gate. Each entry keeps
 * its `packId` so the caller has a stable React key.
 */
export function packSurfaces(
  key: keyof PackSurfaceComponents
): Array<{ packId: string; Surface: PackSurface }> {
  const out: Array<{ packId: string; Surface: PackSurface }> = [];
  for (const pack of PACK_UI_REGISTRY) {
    const Surface = pack.surfaces[key];
    if (Surface) out.push({ packId: pack.packId, Surface });
  }
  return out;
}

/** Module ids contributed by any pack route (for tests / docs). */
export function packRouteModuleIds(): FarmModuleId[] {
  return [...new Set(allPackRoutes().map((r) => r.moduleId))];
}

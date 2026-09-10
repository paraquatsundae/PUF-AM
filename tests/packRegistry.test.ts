import { describe, expect, it } from 'vitest';
import { CROP_PACK_IDS } from '../shared/farm/cropPacks';
import { SYSTEM_PLUGINS } from '../shared/farm/pluginsCatalog';
import {
  PACK_UI_REGISTRY,
  allPackCultivars,
  allPackNavItems,
  allPackPublicRoutes,
  allPackRoutes,
  getPackUi,
  packRouteModuleIds,
  packSurfaces,
} from '../src/packs/registry';
import { navGroups } from '../src/lib/navConfig';
import { WALNUT_BLIGHT_PRIMARY_PATH } from '../plugins/walnut_blight/src/index';
import { CHILL_PORTIONS_PRIMARY_PATH } from '../plugins/chill_portions/src/index';

describe('pack UI registry (CP-04)', () => {
  it('registers UI for every catalog pack id', () => {
    for (const id of CROP_PACK_IDS) {
      expect(getPackUi(id), `missing UI registration for ${id}`).toBeTruthy();
    }
  });

  /**
   * Registry order is menu order, and it used to be a hand-written array. Now
   * it comes from an `import.meta.glob`, which sorts by path — that alone would
   * put chill portions above blight — so the registry re-sorts by `CROP_PACKS`.
   * This pins the result, because nothing else would notice the menu changing.
   */
  it('follows catalog order, not the alphabetical order the glob returns', () => {
    const catalogOrder = [...CROP_PACK_IDS, ...SYSTEM_PLUGINS.map((p) => p.id)];
    expect(PACK_UI_REGISTRY.map((p) => p.packId)).toEqual(catalogOrder);
    expect(PACK_UI_REGISTRY.map((p) => p.packId)).not.toEqual(
      [...catalogOrder].sort((a, b) => a.localeCompare(b))
    );
  });

  it('lists the network pack after every crop pack and exposes its public routes and surfaces', () => {
    const ids = PACK_UI_REGISTRY.map((p) => p.packId);
    expect(ids[ids.length - 1]).toBe('freenet_host');
    expect(allPackPublicRoutes().map((r) => r.path)).toEqual([
      '/login/mist-new-farm',
      '/login/mist-recover',
    ]);
    // Crop packs register none of the network surfaces, so only Freenet answers.
    expect(packSurfaces('sessionGate').map((s) => s.packId)).toEqual(['freenet_host']);
    expect(packSurfaces('pluginTile').map((s) => s.packId)).toEqual(['freenet_host']);
    // And the network pack adds nothing to the module-gated route table.
    expect(allPackRoutes().some((r) => r.path.startsWith('login'))).toBe(false);
  });

  it('exposes walnut blight route and surfaces', () => {
    const ui = getPackUi('walnut_blight')!;
    expect(ui.routes.map((r) => r.path)).toContain('blight');
    expect(ui.routes[0]?.moduleId).toBe('blight');
    expect(ui.surfaces.productionSettings).toBeTruthy();
    expect(ui.surfaces.researchSettings).toBeTruthy();
    expect(ui.surfaces.science).toBeTruthy();
    expect(ui.surfaces.dashboardCard).toBeTruthy();
    expect(WALNUT_BLIGHT_PRIMARY_PATH).toBe('/blight');
  });

  it('exposes chill portions route and surfaces', () => {
    const ui = getPackUi('chill_portions')!;
    expect(ui.routes.map((r) => r.path)).toContain('weather-events');
    expect(ui.routes[0]?.moduleId).toBe('chill');
    expect(ui.surfaces.productionSettings).toBeTruthy();
    expect(ui.surfaces.science).toBeTruthy();
    expect(ui.surfaces.dashboardCard).toBeTruthy();
    expect(ui.surfaces.blockOperateReadout).toBeTruthy();
    expect(CHILL_PORTIONS_PRIMARY_PATH).toBe('/weather-events');
  });

  it('gets its cultivar list from the chill pack, not the block editor', () => {
    const options = allPackCultivars();

    expect(options.length).toBeGreaterThan(0);
    // The note is what the editor shows in brackets; core does not build it.
    expect(options.every((c) => c.name && c.note?.endsWith(' CP'))).toBe(true);
    expect(getPackUi('chill_portions')!.blockCultivars?.length).toBe(options.length);
  });

  it('merges pack nav into crop group (not hardcoded in base shell list)', () => {
    const crop = navGroups.find((g) => g.id === 'crop');
    expect(crop?.items.some((i) => i.href === '/blight' && i.moduleId === 'blight')).toBe(true);
    expect(allPackNavItems().some((i) => i.href === '/blight')).toBe(true);
    expect(packRouteModuleIds()).toContain('blight');
    expect(packRouteModuleIds()).toContain('chill');
    expect(packRouteModuleIds()).toContain('water');
    expect(packRouteModuleIds()).toContain('nutrition');
    expect(packRouteModuleIds()).toContain('harvest');
    expect(packRouteModuleIds()).toContain('drying');
    expect(allPackNavItems().some((i) => i.href === '/weather-events')).toBe(true);
    expect(allPackNavItems().some((i) => i.href === '/water')).toBe(true);
    expect(allPackNavItems().some((i) => i.href === '/harvest' && i.groupId === 'records')).toBe(
      true
    );
    expect(allPackNavItems().some((i) => i.href === '/drying' && i.groupId === 'crop')).toBe(true);
    expect(allPackRoutes().length).toBe(PACK_UI_REGISTRY.flatMap((p) => p.routes).length);
  });
});

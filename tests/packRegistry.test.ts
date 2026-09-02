import { describe, expect, it } from 'vitest';
import { CROP_PACK_IDS } from '../shared/farm/cropPacks';
import {
  PACK_UI_REGISTRY,
  allPackCultivars,
  allPackNavItems,
  allPackRoutes,
  getPackUi,
  packRouteModuleIds,
} from '../src/packs/registry';
import { navGroups } from '../src/lib/navConfig';
import { WALNUT_BLIGHT_PRIMARY_PATH } from '../src/packs/walnut_blight';
import { CHILL_PORTIONS_PRIMARY_PATH } from '../src/packs/chill_portions';

describe('pack UI registry (CP-04)', () => {
  it('registers UI for every catalog pack id', () => {
    for (const id of CROP_PACK_IDS) {
      expect(getPackUi(id), `missing UI registration for ${id}`).toBeTruthy();
    }
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

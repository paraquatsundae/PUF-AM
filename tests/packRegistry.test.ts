import { describe, expect, it } from 'vitest';
import { CROP_PACK_IDS } from '../shared/farm/cropPacks';
import {
  PACK_UI_REGISTRY,
  allPackNavItems,
  allPackRoutes,
  getPackUi,
  packRouteModuleIds,
} from '../src/packs/registry';
import { navGroups } from '../src/lib/navConfig';
import { WALNUT_BLIGHT_PRIMARY_PATH } from '../src/packs/walnut_blight';

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
    expect(WALNUT_BLIGHT_PRIMARY_PATH).toBe('/blight');
  });

  it('merges pack nav into crop group (not hardcoded in base shell list)', () => {
    const crop = navGroups.find((g) => g.id === 'crop');
    expect(crop?.items.some((i) => i.href === '/blight' && i.moduleId === 'blight')).toBe(true);
    expect(allPackNavItems().some((i) => i.href === '/blight')).toBe(true);
    expect(packRouteModuleIds()).toContain('blight');
    expect(allPackRoutes().length).toBe(PACK_UI_REGISTRY.flatMap((p) => p.routes).length);
  });
});

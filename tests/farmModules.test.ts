import { describe, expect, it } from 'vitest';
import {
  allFarmModules,
  ALWAYS_ON_MODULES,
  clampModulesToFarm,
  defaultModulesWithoutCropPacks,
  effectiveModules,
  sanitizeModules,
  canWriteFarmData,
  hasModuleAccess,
  resolveFarmEnabledModules,
  presetsForFarm,
  withWalnutPackModules,
  withoutWalnutPackModules,
} from '../shared/auth/farmModules';
import { farmHasWalnutPack, farmShowsChillPortions } from '../shared/farm/farmTypes';

describe('farmModules', () => {
  it('sanitizes unknown and duplicate module ids', () => {
    expect(sanitizeModules(['map', 'map', 'nope', 'diary', 1, null])).toEqual(['map', 'diary']);
  });

  it('gives admins every farm-enabled module', () => {
    expect(effectiveModules('admin', ['map'])).toEqual(allFarmModules());
    expect(effectiveModules('admin', ['map'], ['dashboard', 'map', 'farm_management', 'farm_setup', 'settings'])).toEqual(
      resolveFarmEnabledModules(['dashboard', 'map', 'farm_management', 'farm_setup', 'settings'])
    );
  });

  it('defaults empty non-admin modules to dashboard when farm allows it', () => {
    expect(effectiveModules('farmer', [])).toEqual(['dashboard']);
  });

  it('intersects user grants with farm catalog', () => {
    const farm = resolveFarmEnabledModules(['map', 'diary']);
    expect(effectiveModules('farmer', ['map', 'blight', 'diary'], farm)).toEqual(['map', 'diary']);
    expect(hasModuleAccess('farmer', ['map', 'blight'], 'blight', farm)).toBe(false);
    expect(hasModuleAccess('farmer', ['map', 'blight'], 'map', farm)).toBe(true);
  });

  it('resolves missing farm modules as full catalog and forces always-on', () => {
    expect(resolveFarmEnabledModules(undefined)).toEqual(allFarmModules());
    const partial = resolveFarmEnabledModules(['map']);
    for (const id of ALWAYS_ON_MODULES) {
      expect(partial).toContain(id);
    }
    expect(partial).toContain('map');
  });

  it('clamps pin modules to farm catalog', () => {
    expect(clampModulesToFarm(['map', 'blight'], ['map', 'diary', ...ALWAYS_ON_MODULES])).toEqual([
      'map',
    ]);
  });

  it('filters presets when blight is off', () => {
    const farm = resolveFarmEnabledModules(['map', 'diary', 'water']);
    const presets = presetsForFarm(farm);
    const scout = presets.find((p) => p.id === 'crop_scout');
    expect(scout?.modules).not.toContain('blight');
    expect(scout?.modules).toContain('water');
    expect(scout?.blurb).toMatch(/water/i);
  });

  it('excludes walnut pack modules from presets even if still on farm catalog', () => {
    const farm = resolveFarmEnabledModules(['map', 'diary', 'blight', 'water']);
    const presets = presetsForFarm(farm, { excludeModules: ['blight'] });
    const scout = presets.find((p) => p.id === 'crop_scout');
    const full = presets.find((p) => p.id === 'full_farmer');
    expect(scout?.modules).not.toContain('blight');
    expect(full?.modules).not.toContain('blight');
    expect(full?.blurb).toMatch(/ops tools/i);
  });

  it('checks write ceiling', () => {
    expect(canWriteFarmData('viewer')).toBe(false);
    expect(canWriteFarmData('farmer')).toBe(true);
  });

  it('defaults new farms without blight crop pack', () => {
    const mods = defaultModulesWithoutCropPacks();
    expect(mods).not.toContain('blight');
    expect(mods).toContain('map');
    expect(withWalnutPackModules(mods)).toContain('blight');
    expect(withoutWalnutPackModules(withWalnutPackModules(mods))).not.toContain('blight');
  });
});

describe('farmHasWalnutPack', () => {
  it('detects walnut blocks', () => {
    expect(
      farmHasWalnutPack({
        profile: { enterprises: ['broadacre'], livestockEnabled: false, defaultSpeciesId: '' },
        blocks: [{ species: 'walnut' }],
      })
    ).toBe(true);
  });

  it('detects orchard profile defaulting to walnut', () => {
    expect(
      farmHasWalnutPack({
        profile: {
          enterprises: ['orchard_tree'],
          livestockEnabled: false,
          defaultSpeciesId: 'walnut',
        },
      })
    ).toBe(true);
    expect(
      farmHasWalnutPack({
        profile: {
          enterprises: ['orchard_tree'],
          livestockEnabled: false,
          defaultSpeciesId: 'almond',
        },
      })
    ).toBe(false);
  });

  it('treats empty enterprises as non-walnut unless legacy blight module', () => {
    expect(
      farmHasWalnutPack({
        profile: { enterprises: [], livestockEnabled: false, defaultSpeciesId: '' },
        blightModuleEnabled: false,
      })
    ).toBe(false);
    expect(
      farmHasWalnutPack({
        blightModuleEnabled: true,
      })
    ).toBe(true);
  });
});

describe('farmShowsChillPortions', () => {
  it('follows the walnut pack even when geometry/profile are thin', () => {
    expect(
      farmShowsChillPortions({
        profile: { enterprises: [], livestockEnabled: false },
        blocks: [],
        walnutPackActive: true,
      })
    ).toBe(true);
  });

  it('shows chill for legacy species-only blocks (no cropKind yet)', () => {
    expect(
      farmShowsChillPortions({
        profile: { enterprises: [], livestockEnabled: false },
        blocks: [{ species: 'walnut' }],
      })
    ).toBe(true);
  });

  it('shows chill for orchard enterprises and cropKinds', () => {
    expect(
      farmShowsChillPortions({
        profile: { enterprises: ['orchard_tree'], livestockEnabled: false },
        blocks: [],
      })
    ).toBe(true);
    expect(
      farmShowsChillPortions({
        profile: { enterprises: [], livestockEnabled: false },
        blocks: [{ cropKind: 'fruit' }],
      })
    ).toBe(true);
  });

  it('stays off for empty broadacre farms', () => {
    expect(
      farmShowsChillPortions({
        profile: { enterprises: ['broadacre'], livestockEnabled: false },
        blocks: [{ cropKind: 'broadacre' }],
      })
    ).toBe(false);
  });
});

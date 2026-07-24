import { describe, expect, it } from 'vitest';
import {
  allFarmModules,
  ALWAYS_ON_MODULES,
  clampModulesToFarm,
  effectiveModules,
  sanitizeModules,
  canWriteFarmData,
  hasModuleAccess,
  resolveFarmEnabledModules,
  presetsForFarm,
} from '../shared/auth/farmModules';

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
  });

  it('checks write ceiling', () => {
    expect(canWriteFarmData('viewer')).toBe(false);
    expect(canWriteFarmData('farmer')).toBe(true);
  });
});

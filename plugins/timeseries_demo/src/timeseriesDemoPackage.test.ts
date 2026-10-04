import { describe, expect, it } from 'vitest';
import {
  TIMESERIES_DEMO_PACK_ID as id, TIMESERIES_DEMO_PRIMARY_PATH,
  timeseriesDemoManifest, timeseriesDemoModules,
} from '../../../shared/farm/timeseriesDemoPackage';
import {
  defaultModulesWithoutCropPacks, getCropPack, isPackActive, isPackModuleOffered,
  planInstallPack, planDeactivatePack, planActivatePack, planDeletePack,
} from '../../../shared/farm/cropPacks';
import { effectiveModules } from '../../../shared/auth/farmModules';

describe('dendrometer demo pack contract', () => {
  it('owns only its demo module, with no farm settings or engine', () => {
    expect(timeseriesDemoManifest.id).toBe(id);
    expect(timeseriesDemoManifest.kind).toBe('crop_pack');
    expect(timeseriesDemoModules).toEqual([id]);
    expect(TIMESERIES_DEMO_PRIMARY_PATH).toBe('/timeseries-demo');
    expect(getCropPack(id).settingsDocId).toBeNull();
    expect(getCropPack(id).settingsOwnedKeys).toEqual([]);
    expect(defaultModulesWithoutCropPacks()).not.toContain(id);
  });

  it('follows install, deactivate, reactivate and delete without widening existing member grants', () => {
    const installed = planInstallPack({}, defaultModulesWithoutCropPacks(), id, '2026-09-16');
    expect(isPackActive(installed.cropPacks, id)).toBe(true);
    expect(installed.modules).toContain(id);
    expect(effectiveModules('farmer', ['map'], installed.modules)).not.toContain(id);
    expect(effectiveModules('viewer', [id], installed.modules)).toContain(id);
    const off = planDeactivatePack(installed.cropPacks, installed.modules, id);
    expect(isPackModuleOffered(id, off.cropPacks)).toBe(false);
    expect(off.modules).not.toContain(id);
    const on = planActivatePack(off.cropPacks, off.modules, id, '2026-09-16');
    expect(isPackModuleOffered(id, on.cropPacks)).toBe(true);
    const deleted = planDeletePack(on.cropPacks, on.modules, id);
    expect(deleted.cropPacks[id]).toBeUndefined();
    expect(deleted.modules).not.toContain(id);
  });
});

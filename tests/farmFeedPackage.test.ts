import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FARM_FEED_PACK_ID,
  FARM_FEED_PRIMARY_PATH,
  FARM_FEED_SETTINGS_OWNED_KEYS,
  farmFeedManifest,
  farmFeedModules,
} from '../shared/farm/farmFeedPackage';
import {
  getFarmPack,
  isFarmFeedActive,
  isFarmKindPackActive,
  offeredFarmModules,
  planDeactivatePack,
  planDefaultFarmFeedOnCreate,
  planDeletePack,
} from '../shared/farm/cropPacks';
import { defaultModulesWithoutCropPacks } from '../shared/farm/cropPacks';
import { parsePluginPackageManifestJson } from '../shared/farm/pluginPackage';
import { effectiveModules } from '../shared/auth/farmModules';

describe('farm feed on-disk package', () => {
  it('loads plugin.json as kind farm', () => {
    const text = readFileSync(resolve('plugins/farm_feed/plugin.json'), 'utf8');
    const parsed = parsePluginPackageManifestJson(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.manifest.id).toBe(FARM_FEED_PACK_ID);
    expect(parsed.manifest.kind).toBe('farm');
    expect(parsed.manifest.category).toBe('generic');
    expect(farmFeedManifest).toEqual(parsed.manifest);
    expect(farmFeedModules).toEqual(['farm_feed']);
    expect(FARM_FEED_PRIMARY_PATH).toBe('/farm-feed');
    expect(FARM_FEED_SETTINGS_OWNED_KEYS).toEqual([]);
  });

  it('feeds the farm-pack catalog, not CROP_PACKS', () => {
    const pack = getFarmPack('farm_feed');
    expect(pack.label).toBe('Farm feed');
    expect(pack.settingsDocId).toBeNull();
    expect(pack.primaryPath).toBe('/farm-feed');
    expect(pack.modules).toEqual(['farm_feed']);
  });

  it('defaults on for new farms and for members without a map entry', () => {
    const planned = planDefaultFarmFeedOnCreate(defaultModulesWithoutCropPacks(), '2026-09-15T00:00:00.000Z');
    expect(planned.cropPacks.farm_feed?.status).toBe('active');
    expect(planned.modules).toContain('farm_feed');
    expect(defaultModulesWithoutCropPacks()).not.toContain('farm_feed');

    expect(isFarmFeedActive({})).toBe(true);
    expect(isFarmKindPackActive({}, 'farm_feed')).toBe(true);
    expect(
      isFarmFeedActive({
        farm_feed: { status: 'inactive', installedAt: '2026-09-15T00:00:00.000Z' },
      })
    ).toBe(false);
  });

  it('offers farm_feed to crew on an existing farm with no cropPacks write', () => {
    const farmCatalog = defaultModulesWithoutCropPacks();
    expect(farmCatalog).not.toContain('farm_feed');
    const offered = offeredFarmModules(farmCatalog, {});
    expect(offered).toContain('farm_feed');
    expect(effectiveModules('farmer', ['dashboard', 'map', 'diary'], offered)).toContain(
      'farm_feed'
    );
    expect(effectiveModules('viewer', ['dashboard'], offered)).toContain('farm_feed');
    expect(effectiveModules('admin', ['dashboard'], offered)).toContain('farm_feed');
  });

  it('keeps admin Deactivate / Delete off for every member', () => {
    const farmCatalog = defaultModulesWithoutCropPacks();
    const off = planDeactivatePack({}, farmCatalog, 'farm_feed', '2026-09-15T12:00:00.000Z');
    expect(off.cropPacks.farm_feed?.status).toBe('inactive');
    expect(isFarmFeedActive(off.cropPacks)).toBe(false);
    const offeredOff = offeredFarmModules(off.modules, off.cropPacks);
    expect(offeredOff).not.toContain('farm_feed');
    expect(effectiveModules('farmer', ['map', 'diary', 'farm_feed'], offeredOff)).not.toContain(
      'farm_feed'
    );

    const deleted = planDeletePack(
      { farm_feed: { status: 'active', installedAt: '2026-09-15T00:00:00.000Z' } },
      [...farmCatalog, 'farm_feed'],
      'farm_feed'
    );
    expect(deleted.cropPacks.farm_feed?.status).toBe('inactive');
    expect(isFarmFeedActive(deleted.cropPacks)).toBe(false);
  });
});

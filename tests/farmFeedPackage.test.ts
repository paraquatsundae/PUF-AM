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
import { getFarmPack, isFarmFeedActive, planDefaultFarmFeedOnCreate } from '../shared/farm/cropPacks';
import { defaultModulesWithoutCropPacks } from '../shared/farm/cropPacks';
import { parsePluginPackageManifestJson } from '../shared/farm/pluginPackage';

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

  it('defaults on for new farms and Freenet/workshop without a map entry', () => {
    const planned = planDefaultFarmFeedOnCreate(defaultModulesWithoutCropPacks(), '2026-09-15T00:00:00.000Z');
    expect(planned.cropPacks.farm_feed?.status).toBe('active');
    expect(planned.modules).toContain('farm_feed');
    expect(defaultModulesWithoutCropPacks()).not.toContain('farm_feed');

    expect(isFarmFeedActive({}, { mistSession: true, workshop: false })).toBe(true);
    expect(isFarmFeedActive({}, { mistSession: false, workshop: true })).toBe(true);
    expect(isFarmFeedActive({}, { mistSession: false, workshop: false })).toBe(false);
    expect(
      isFarmFeedActive(
        { farm_feed: { status: 'inactive', installedAt: '2026-09-15T00:00:00.000Z' } },
        { mistSession: true, workshop: true }
      )
    ).toBe(false);
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getCropPack } from '../shared/farm/cropPacks';
import { parsePluginPackageManifestJson } from '../shared/farm/pluginPackage';
import {
  WHEAT_YIELD_PACK_ID,
  WHEAT_YIELD_PRIMARY_PATH,
  WHEAT_YIELD_SETTINGS_OWNED_KEYS,
  wheatYieldDefaults,
  wheatYieldManifest,
  wheatYieldModules,
} from '../shared/farm/wheatYieldPackage';
import { DEFAULTS } from '../plugins/wheat_yield/src/estimateYield';

describe('wheat yield package', () => {
  it('loads plugin.json as the catalog source of truth', () => {
    const text = readFileSync(resolve('plugins/wheat_yield/plugin.json'), 'utf8');
    const parsed = parsePluginPackageManifestJson(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.manifest.id).toBe(WHEAT_YIELD_PACK_ID);
    expect(wheatYieldManifest).toEqual(parsed.manifest);
    expect(wheatYieldModules).toEqual(['wheat']);
    expect(WHEAT_YIELD_PRIMARY_PATH).toBe('/wheat-yield');
    expect(WHEAT_YIELD_SETTINGS_OWNED_KEYS).toEqual([]);
    expect(wheatYieldManifest.settingsDocId).toBeNull();
  });

  it('registers the pack and keeps engine defaults aligned with the calculator', () => {
    const pack = getCropPack('wheat_yield');
    expect(pack.label).toBe('Wheat yield');
    expect(pack.modules).toEqual(['wheat']);
    expect(pack.category).toBe('crop');
    expect(pack.primaryPath).toBe('/wheat-yield');
    expect(wheatYieldDefaults).toMatchObject({
      heads: DEFAULTS.heads,
      height: DEFAULTS.height,
      width: DEFAULTS.width,
      hectolitreWeight: DEFAULTS.hectolitreWeight,
      deductionPercent: DEFAULTS.deductionPercent,
    });
  });
});

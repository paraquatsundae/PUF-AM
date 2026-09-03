import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  WALNUT_BLIGHT_PACK_ID,
  WALNUT_BLIGHT_PRIMARY_PATH,
  WALNUT_BLIGHT_SETTINGS_OWNED_KEYS,
  walnutBlightManifest,
  walnutBlightModelDefaults,
  walnutBlightModules,
} from '../shared/farm/walnutBlightPackage';
import { getCropPack } from '../shared/farm/cropPacks';
import { parsePluginPackageManifestJson } from '../shared/farm/pluginPackage';
import { DEFAULT_MODEL_PARAMS } from '../plugins/walnut_blight/src/modelParameters';

describe('walnut blight on-disk package', () => {
  it('loads plugin.json as the catalog source of truth', () => {
    const text = readFileSync(resolve('plugins/walnut_blight/plugin.json'), 'utf8');
    const parsed = parsePluginPackageManifestJson(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.manifest.id).toBe(WALNUT_BLIGHT_PACK_ID);
    expect(walnutBlightManifest).toEqual(parsed.manifest);
    expect(walnutBlightModules).toEqual(['blight']);
    expect(WALNUT_BLIGHT_PRIMARY_PATH).toBe('/blight');
    expect(WALNUT_BLIGHT_SETTINGS_OWNED_KEYS).not.toContain('marketPrice');
  });

  it('feeds crop pack catalog and blight model defaults from the package', () => {
    const pack = getCropPack('walnut_blight');
    expect(pack.label).toBe(walnutBlightManifest.label);
    expect(pack.settingsOwnedKeys).toEqual(WALNUT_BLIGHT_SETTINGS_OWNED_KEYS);
    expect(pack.primaryPath).toBe('/blight');
    expect(DEFAULT_MODEL_PARAMS.blightSensitivity).toBe(
      walnutBlightModelDefaults.blightSensitivity
    );
    expect(DEFAULT_MODEL_PARAMS.orchardInoculumLevel).toBe('medium');
    expect(DEFAULT_MODEL_PARAMS.marketPrice).toBe(3.3);
  });
});

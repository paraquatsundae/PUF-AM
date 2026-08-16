import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHILL_PORTIONS_PACK_ID,
  CHILL_PORTIONS_PRIMARY_PATH,
  CHILL_PORTIONS_SETTINGS_OWNED_KEYS,
  chillCultivars,
  chillModelConstants,
  chillPortionsManifest,
  chillPortionsModules,
} from '../shared/farm/chillPortionsPackage';
import { getCropPack } from '../shared/farm/cropPacks';
import { parsePluginPackageManifestJson } from '../shared/farm/pluginPackage';
import { CULTIVARS } from '../shared/weather/chillPortions';

describe('chill portions on-disk package', () => {
  it('loads plugin.json as the catalog source of truth', () => {
    const text = readFileSync(resolve('plugins/chill_portions/plugin.json'), 'utf8');
    const parsed = parsePluginPackageManifestJson(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.manifest.id).toBe(CHILL_PORTIONS_PACK_ID);
    expect(chillPortionsManifest).toEqual(parsed.manifest);
    expect(chillPortionsModules).toEqual(['chill']);
    expect(CHILL_PORTIONS_PRIMARY_PATH).toBe('/weather-events');
    expect(CHILL_PORTIONS_SETTINGS_OWNED_KEYS).toContain('latitude');
  });

  it('feeds crop pack catalog and engine constants from the package', () => {
    const pack = getCropPack('chill_portions');
    expect(pack.label).toBe(chillPortionsManifest.label);
    expect(pack.settingsOwnedKeys).toEqual(CHILL_PORTIONS_SETTINGS_OWNED_KEYS);
    expect(pack.primaryPath).toBe('/weather-events');
    expect(chillModelConstants.e0).toBe(4153.5);
    expect(chillModelConstants.kelvinOffset).toBe(273.0);
    expect(CULTIVARS.map((c) => c.name)).toEqual(chillCultivars.map((c) => c.name));
    expect(chillCultivars.find((c) => c.id === 'chandler')?.requiredCP).toBe(45);
  });
});

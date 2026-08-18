import { describe, expect, it } from 'vitest';
import {
  PLUGIN_PACKAGE_SCHEMA_VERSION,
  parsePluginPackageManifestJson,
  validatePluginPackageManifest,
} from '../shared/farm/pluginPackage';

const valid = {
  schemaVersion: PLUGIN_PACKAGE_SCHEMA_VERSION,
  kind: 'crop_pack',
  id: 'apple_scab',
  version: '0.1.0',
  label: 'Apple scab',
  blurb: 'Example crop pack metadata.',
  category: 'crop',
  modules: ['scab'],
  settingsDocId: 'apple_scab_params',
  primaryPath: '/scab',
};

describe('pluginPackage manifest', () => {
  it('accepts a valid v1 manifest', () => {
    const result = validatePluginPackageManifest(valid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.id).toBe('apple_scab');
      expect(result.manifest.category).toBe('crop');
    }
  });

  it('requires category (generic is the catch-all)', () => {
    const { category: _c, ...rest } = valid;
    const result = validatePluginPackageManifest(rest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.path === 'category')).toBe(true);
    }
    expect(validatePluginPackageManifest({ ...valid, category: 'generic' }).ok).toBe(true);
  });

  it('keeps settingsOwnedKeys on the parsed manifest', () => {
    const result = validatePluginPackageManifest({
      ...valid,
      settingsOwnedKeys: ['orchardInoculumLevel', 'blightSensitivity'],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.settingsOwnedKeys).toEqual(['orchardInoculumLevel', 'blightSensitivity']);
    }
  });

  it('rejects bad ids and schema versions', () => {
    expect(validatePluginPackageManifest({ ...valid, id: 'Apple-Scab' }).ok).toBe(false);
    expect(validatePluginPackageManifest({ ...valid, schemaVersion: 99 }).ok).toBe(false);
  });

  it('parses JSON text', () => {
    const result = parsePluginPackageManifestJson(JSON.stringify(valid));
    expect(result.ok).toBe(true);
    expect(parsePluginPackageManifestJson('{').ok).toBe(false);
  });
});

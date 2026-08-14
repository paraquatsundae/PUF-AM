import { describe, expect, it } from 'vitest';
import {
  PLUGIN_CATEGORIES,
  PLUGIN_CATEGORY_IDS,
  isPluginCategoryId,
  resolvePluginCategory,
} from '../shared/farm/pluginCategories';
import {
  FREENET_HOST_PLUGIN,
  groupPluginsByCategory,
  listPluginCatalog,
} from '../shared/farm/pluginsCatalog';
import { listCropPacks } from '../shared/farm/cropPacks';

describe('pluginCategories', () => {
  it('includes generic as the author catch-all', () => {
    expect(PLUGIN_CATEGORY_IDS).toContain('generic');
    expect(PLUGIN_CATEGORIES.map((c) => c.id)).toEqual([...PLUGIN_CATEGORY_IDS]);
    expect(isPluginCategoryId('generic')).toBe(true);
    expect(isPluginCategoryId('crop')).toBe(true);
    expect(isPluginCategoryId('nope')).toBe(false);
    expect(resolvePluginCategory(undefined)).toBe('generic');
  });
});

describe('pluginsCatalog', () => {
  it('lists Freenet under network and crop packs under their categories', () => {
    const catalog = listPluginCatalog();
    expect(catalog.some((e) => e.id === FREENET_HOST_PLUGIN.id)).toBe(true);
    expect(FREENET_HOST_PLUGIN.category).toBe('network');

    for (const pack of listCropPacks()) {
      expect(isPluginCategoryId(pack.category)).toBe(true);
    }

    const groups = groupPluginsByCategory(catalog);
    expect(groups.map((g) => g.category)).toContain('crop');
    expect(groups.map((g) => g.category)).toContain('network');
    const crop = groups.find((g) => g.category === 'crop')!;
    expect(crop.entries.some((e) => e.id === 'walnut_blight')).toBe(true);
    const network = groups.find((g) => g.category === 'network')!;
    expect(network.entries.some((e) => e.id === 'freenet_host')).toBe(true);
  });
});

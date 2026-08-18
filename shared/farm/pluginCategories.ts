/**
 * Plugin categories for Settings → Plugins.
 *
 * Every catalog entry (crop pack or system plugin such as Freenet) **must**
 * declare a category. Authors who do not have a better fit use `generic`.
 *
 * UI may say “plugins”; crop packs and Freenet host plugins remain different
 * seams in code — see Plans/NAMING.md and Plans/CROP_PACK_PLUGIN.md.
 */

export const PLUGIN_CATEGORY_IDS = ['crop', 'network', 'generic'] as const;
export type PluginCategoryId = (typeof PLUGIN_CATEGORY_IDS)[number];

export type PluginCategoryDef = {
  id: PluginCategoryId;
  label: string;
  blurb: string;
};

/**
 * Display order on Settings → Plugins.
 * `generic` is last — the catch-all for authors, not a dumping ground for
 * everything that already has a home.
 */
export const PLUGIN_CATEGORIES: readonly PluginCategoryDef[] = [
  {
    id: 'crop',
    label: 'Crop tools',
    blurb: 'Enterprise-specific packs (blight, chill, future apple / citrus tools).',
  },
  {
    id: 'network',
    label: 'Network & storage',
    blurb: 'Offline network and storage hosts — Freenet and related hub tooling.',
  },
  {
    id: 'generic',
    label: 'General',
    blurb:
      'Default when nothing more specific fits. Pack authors must still set a category — pick General if unsure.',
  },
];

export function isPluginCategoryId(value: unknown): value is PluginCategoryId {
  return typeof value === 'string' && (PLUGIN_CATEGORY_IDS as readonly string[]).includes(value);
}

export function getPluginCategory(id: PluginCategoryId): PluginCategoryDef {
  const found = PLUGIN_CATEGORIES.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown plugin category: ${id}`);
  return found;
}

/** Authors / runtime fallback when a def omitted category (should not ship). */
export function resolvePluginCategory(id: unknown): PluginCategoryId {
  return isPluginCategoryId(id) ? id : 'generic';
}

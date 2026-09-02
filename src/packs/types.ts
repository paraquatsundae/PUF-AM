/**
 * UI registration for crop packs (Plans/CROP_PACK_PLUGIN.md CP-04).
 * Catalog/lifecycle stay in shared/farm/cropPacks.ts (no React).
 */
import type { ComponentType, LazyExoticComponent } from 'react';
import type { Icon } from '@tabler/icons-react';
import type { FarmModuleId } from '../../shared/auth/farmModules';
import type { CropPackId } from '../../shared/farm/cropPacks';
import type { OrchardBlock } from '../lib/mapStore';

/** Mirrors navConfig NavGroupId — kept here so packs do not import navConfig. */
export type PackNavGroupId = 'field' | 'crop' | 'records' | 'system';

export type PackRouteRegistration = {
  /** Path segment under Layout, e.g. `blight` → `/blight`. */
  path: string;
  moduleId: FarmModuleId;
  /** Lazy page — App wraps with ModuleRoute. */
  Page: LazyExoticComponent<ComponentType>;
};

export type PackNavRegistration = {
  groupId: PackNavGroupId;
  name: string;
  /** Absolute href, e.g. `/blight`. */
  href: string;
  icon: Icon;
  moduleId: FarmModuleId;
  adminOnly?: boolean;
};

/**
 * A pack surface, lazy or eager. Register these lazily: `registry.ts` is pulled
 * in eagerly by App and navConfig for routes and nav, so a statically imported
 * surface drags its whole component tree into the first paint — and these are
 * settings and science panels that only open from deep in the UI.
 *
 * Whatever renders one needs a Suspense boundary.
 */
export type PackSurface = ComponentType<any> | LazyExoticComponent<ComponentType<any>>;

/**
 * Named pack surfaces (settings / honesty panels).
 * Walnut keeps implementations under `src/components/blight/`; packs re-export.
 */
export type PackSurfaceComponents = {
  productionSettings?: PackSurface;
  researchSettings?: PackSurface;
  science?: PackSurface;
  engineSettings?: PackSurface;
  /**
   * Farm home summary card. Renders in `DashboardPackCards`, which mounts every
   * registered card — so the card gates itself and returns null when its pack is
   * inactive. Build it on `DashboardCard` for consistent chrome.
   */
  dashboardCard?: PackSurface;
  /**
   * A line on the map's block operate card, for a pack with something to say
   * about the selected area. Gets `PackBlockReadoutProps`; gates itself on both
   * its pack and the block, since the operate card opens for every area.
   */
  blockOperateReadout?: PackSurface;
};

/** What `blockOperateReadout` receives. */
export type PackBlockReadoutProps = {
  block: OrchardBlock;
};

/**
 * A cultivar a pack knows about, offered in the block editor.
 *
 * Data rather than a surface: the cultivar field is core — `OrchardBlock.cultivar`
 * is a plain string every enterprise uses — and only the suggestions are a pack's
 * to know. A pack that has a number worth showing beside the name puts it in
 * `note`; core does not interpret it.
 */
export type PackCultivarOption = {
  /** Stable key. */
  id: string;
  /** Stored on the block verbatim. */
  name: string;
  /** Shown in brackets after the name, e.g. `45 CP`. */
  note?: string;
};

export type CropPackUiRegistration = {
  packId: CropPackId;
  routes: readonly PackRouteRegistration[];
  navItems: readonly PackNavRegistration[];
  surfaces: PackSurfaceComponents;
  /** Cultivar suggestions for the block editor. Not gated on the pack being active. */
  blockCultivars?: readonly PackCultivarOption[];
};

/**
 * UI registration for crop packs (Plans/CROP_PACK_PLUGIN.md CP-04).
 * Catalog/lifecycle stay in shared/farm/cropPacks.ts (no React).
 */
import type { ComponentType, LazyExoticComponent } from 'react';
import type { Icon } from '@tabler/icons-react';
import type { FarmModuleId } from '../../shared/auth/farmModules';
import type { CropPackId } from '../../shared/farm/cropPacks';

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
 * Named pack surfaces (settings / honesty panels).
 * Walnut keeps implementations under `src/components/blight/`; packs re-export.
 */
export type PackSurfaceComponents = {
  productionSettings?: ComponentType<any>;
  researchSettings?: ComponentType<any>;
  science?: ComponentType<any>;
  engineSettings?: ComponentType<any>;
};

export type CropPackUiRegistration = {
  packId: CropPackId;
  routes: readonly PackRouteRegistration[];
  navItems: readonly PackNavRegistration[];
  surfaces: PackSurfaceComponents;
};

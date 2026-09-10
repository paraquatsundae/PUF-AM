/**
 * UI registration for packs (Plans/CROP_PACK_PLUGIN.md CP-04 for crop packs;
 * Plans/NETWORK_PACK_PLUGIN.md for the network pack).
 * Catalog/lifecycle stay in shared/farm/ (no React).
 */
import type { ComponentType, LazyExoticComponent } from 'react';
import type { Icon } from '@tabler/icons-react';
import type { FarmModuleId } from '../../shared/auth/farmModules';
import type { CropPackId } from '../../shared/farm/cropPacks';
import type { SystemPluginId } from '../../shared/farm/pluginsCatalog';
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
 * Each pack implements these in its own `plugins/<id>/src/` folder.
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

  // ---- Network-pack surfaces (Plans/NETWORK_PACK_PLUGIN.md § Surfaces) ----
  // Core renders each of these from the registry without naming a pack; a
  // crop pack may leave them all unset.

  /**
   * Headless: renders null. Mounted once inside the signed-in shell, before the
   * session gates, for as long as a farm is open. This is where a network pack
   * reconciles device state (start / stop its node) against the open farm.
   */
  farmSession?: PackSurface;
  /**
   * Wraps the signed-in shell (`{ children }`) and may block it until the pack's
   * precondition is met — the join-ticket gate. Register **eagerly**: a lazy
   * gate would flash the app it is meant to hold back.
   */
  sessionGate?: PackSurface;
  /**
   * The pack's card on Settings → Sync. Core decides whether the farm has that
   * pipe at all (`farmPipes.ts`); the card owns readiness and actions.
   */
  syncCard?: PackSurface;
  /** Bench diagnostics card on Settings → Sync, shown only in workshop sessions. */
  workshopDiagnostics?: PackSurface;
  /**
   * The login "How this works" step. Gets `{ optionState: FreenetOptionState;
   * onBack(): void }` and navigates to its own `publicRoutes` itself.
   */
  loginExplain?: PackSurface;
  /** Dismissible banner on Farm setup (e.g. "send this farm once"). */
  farmSetupNudge?: PackSurface;
  /** Inline "How this works" button; gets `{ className?: string }`. */
  howItWorks?: PackSurface;
  /**
   * The pack's own row on Settings → Plugins. Gets `{ entry: SystemPluginDef;
   * onOpenSync?(): void }`. A network pack is not Install / Activate / Delete,
   * so it draws its own enable control and its "not available here" state.
   */
  pluginTile?: PackSurface;
};

/**
 * A route mounted **outside** the signed-in shell, beside `/login`. Only a
 * network pack needs these: its start-farm and recover screens run before there
 * is a farm session to gate on. `path` is absolute (`/login/mist-new-farm`).
 */
export type PackPublicRouteRegistration = {
  path: string;
  Page: LazyExoticComponent<ComponentType>;
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

/** What every pack registers — the shape `registry.ts` discovers. */
export type PackUiRegistration = {
  packId: CropPackId | SystemPluginId;
  routes: readonly PackRouteRegistration[];
  navItems: readonly PackNavRegistration[];
  surfaces: PackSurfaceComponents;
  /** Cultivar suggestions for the block editor. Not gated on the pack being active. */
  blockCultivars?: readonly PackCultivarOption[];
  /** Routes beside `/login`. Network packs only — see `PackPublicRouteRegistration`. */
  publicRoutes?: readonly PackPublicRouteRegistration[];
};

export type CropPackUiRegistration = PackUiRegistration & { packId: CropPackId };

/**
 * A network pack (Plans/NETWORK_PACK_PLUGIN.md). Same discovery and the same
 * fields; what differs is the catalog it is paired with (`SYSTEM_PLUGINS`, not
 * `CROP_PACKS`) and that it needs a host capability from the shell.
 */
export type NetworkPackUiRegistration = PackUiRegistration & { packId: SystemPluginId };

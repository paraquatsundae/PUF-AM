/**
 * First-party walnut blight package — loads `plugins/walnut_blight/`.
 *
 * Catalog metadata and engine defaults live in that folder (zip-able).
 * React UI and Ji model code stay in the app; this module is the TS adapter.
 */
import pluginJson from '../../plugins/walnut_blight/plugin.json';
import engineJson from '../../plugins/walnut_blight/engine.json';
import { FARM_MODULE_IDS, type FarmModuleId } from '../auth/farmModules';
import type { OrchardInoculumLevel } from '../weather/jiBlightModel';
import {
  parsePluginPackageManifestJson,
  type PluginPackageManifestV1,
} from './pluginPackage';

export const WALNUT_BLIGHT_PACK_ID = 'walnut_blight' as const;

const INOCULUM_LEVELS = ['low', 'medium', 'high'] as const;

const MODEL_DEFAULT_KEYS = [
  'orchardInoculumLevel',
  'blightSensitivity',
  'cropCoefficient',
  'gddBaseTemp',
  'humidityGradientFactor',
  'splashMultiplier',
  'chemRainWashoffRate',
  'bioColonizationEff',
  'bioFavorableGrowthRate',
  'bioEnvDegradationCoef',
  'springStartingInoculum',
  'latencyGDDThreshold',
  'secondarySpreadMultiplier',
  'treeHeight',
  'canopyWidth',
  'rowSpacing',
  'chemEfficacy',
  'bioEfficacy',
] as const;

const SESSION_DEFAULT_KEYS = [
  'cdfBaseWeighting',
  'cdfExponentialEffect',
  'tempOptimumWeight',
  'wdCompoundingRate',
  'chemBaseDecayRate',
  'latencyDays',
] as const;

export type WalnutBlightModelDefaults = {
  orchardInoculumLevel: OrchardInoculumLevel;
  blightSensitivity: number;
  cropCoefficient: number;
  gddBaseTemp: number;
  humidityGradientFactor: number;
  splashMultiplier: number;
  chemRainWashoffRate: number;
  bioColonizationEff: number;
  bioFavorableGrowthRate: number;
  bioEnvDegradationCoef: number;
  springStartingInoculum: number;
  latencyGDDThreshold: number;
  secondarySpreadMultiplier: number;
  treeHeight: number;
  canopyWidth: number;
  rowSpacing: number;
  chemEfficacy: number;
  bioEfficacy: number;
};

export type WalnutBlightSessionDefaults = {
  cdfBaseWeighting: number;
  cdfExponentialEffect: number;
  tempOptimumWeight: number;
  wdCompoundingRate: number;
  chemBaseDecayRate: number;
  latencyDays: number;
};

function fail(message: string): never {
  throw new Error(`[walnut_blight package] ${message}`);
}

function loadManifest(): PluginPackageManifestV1 {
  const parsed = parsePluginPackageManifestJson(JSON.stringify(pluginJson));
  if (!parsed.ok) {
    fail(parsed.issues.map((i) => `${i.path}: ${i.message}`).join('; '));
  }
  if (parsed.manifest.id !== WALNUT_BLIGHT_PACK_ID) {
    fail(`plugin.json id must be ${WALNUT_BLIGHT_PACK_ID}`);
  }
  if (parsed.manifest.kind !== 'crop_pack') fail('plugin.json kind must be crop_pack');
  if (!parsed.manifest.primaryPath) fail('plugin.json primaryPath is required');
  return parsed.manifest;
}

function asFarmModuleIds(modules: string[]): FarmModuleId[] {
  const allowed = new Set<string>(FARM_MODULE_IDS);
  const out: FarmModuleId[] = [];
  for (const id of modules) {
    if (!allowed.has(id)) fail(`unknown module id "${id}"`);
    out.push(id as FarmModuleId);
  }
  return out;
}

function loadEngine(manifest: PluginPackageManifestV1): {
  modelDefaults: WalnutBlightModelDefaults;
  sessionDefaults: WalnutBlightSessionDefaults;
  ownedKeys: readonly string[];
} {
  const raw = engineJson as {
    schemaVersion?: unknown;
    id?: unknown;
    modelDefaults?: Record<string, unknown>;
    sessionDefaults?: Record<string, unknown>;
  };
  if (raw.schemaVersion !== 1) fail('engine.json schemaVersion must be 1');
  if (raw.id !== WALNUT_BLIGHT_PACK_ID) fail('engine.json id must match plugin.json');
  if (!raw.modelDefaults || typeof raw.modelDefaults !== 'object') {
    fail('engine.json modelDefaults required');
  }
  if (!raw.sessionDefaults || typeof raw.sessionDefaults !== 'object') {
    fail('engine.json sessionDefaults required');
  }

  const ownedKeys = manifest.settingsOwnedKeys;
  if (!ownedKeys?.length) fail('plugin.json settingsOwnedKeys required for this pack');
  const ownedSet = new Set(ownedKeys);
  for (const key of MODEL_DEFAULT_KEYS) {
    if (!ownedSet.has(key)) fail(`settingsOwnedKeys missing ${key}`);
  }
  for (const key of ownedKeys) {
    if (!(MODEL_DEFAULT_KEYS as readonly string[]).includes(key)) {
      fail(`settingsOwnedKeys has unknown blight field ${key}`);
    }
  }

  const modelDefaults = {} as WalnutBlightModelDefaults;
  for (const key of MODEL_DEFAULT_KEYS) {
    const value = raw.modelDefaults[key];
    if (key === 'orchardInoculumLevel') {
      if (typeof value !== 'string' || !(INOCULUM_LEVELS as readonly string[]).includes(value)) {
        fail(`engine.json modelDefaults.${key} must be low|medium|high`);
      }
      modelDefaults.orchardInoculumLevel = value as OrchardInoculumLevel;
      continue;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      fail(`engine.json modelDefaults.${key} must be a finite number`);
    }
    (modelDefaults as unknown as Record<string, number>)[key] = value;
  }

  const sessionDefaults = {} as WalnutBlightSessionDefaults;
  for (const key of SESSION_DEFAULT_KEYS) {
    const value = raw.sessionDefaults[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      fail(`engine.json sessionDefaults.${key} must be a finite number`);
    }
    sessionDefaults[key] = value;
  }

  return { modelDefaults, sessionDefaults, ownedKeys };
}

export const walnutBlightManifest = loadManifest();
export const walnutBlightModules = asFarmModuleIds(walnutBlightManifest.modules);

const engine = loadEngine(walnutBlightManifest);

export const WALNUT_BLIGHT_SETTINGS_OWNED_KEYS = engine.ownedKeys;
export const walnutBlightModelDefaults = engine.modelDefaults;
export const walnutBlightSessionDefaults = engine.sessionDefaults;
export const WALNUT_BLIGHT_PRIMARY_PATH = walnutBlightManifest.primaryPath as string;

/**
 * First-party wheat yield package — loads `plugins/wheat_yield/`.
 * The count itself stays in the pack (`src/estimateYield.ts`).
 */
import pluginJson from '../../plugins/wheat_yield/plugin.json';
import engineJson from '../../plugins/wheat_yield/engine.json';
import { loadFirstPartyPackManifest } from './firstPartyPack';

export const WHEAT_YIELD_PACK_ID = 'wheat_yield' as const;

const loaded = loadFirstPartyPackManifest(pluginJson, WHEAT_YIELD_PACK_ID);
export const wheatYieldManifest = loaded.manifest;
export const wheatYieldModules = loaded.modules;
export const WHEAT_YIELD_PRIMARY_PATH = loaded.manifest.primaryPath as string;
export const WHEAT_YIELD_SETTINGS_OWNED_KEYS = loaded.manifest.settingsOwnedKeys ?? [];

export type WheatYieldDefaults = {
  heads: number;
  height: number;
  width: number;
  hectolitreWeight: number;
  deductionPercent: number;
  thousandGrainWeightOverride: number;
};

function fail(message: string): never {
  throw new Error(`[wheat_yield package] ${message}`);
}

function finite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${path} must be a finite number`);
  return value;
}

function loadDefaults(): WheatYieldDefaults {
  const raw = engineJson as { schemaVersion?: unknown; id?: unknown; defaults?: Record<string, unknown> };
  if (raw.schemaVersion !== 1) fail('engine.json schemaVersion must be 1');
  if (raw.id !== WHEAT_YIELD_PACK_ID) fail('engine.json id must match plugin.json');
  const defaults = raw.defaults;
  if (!defaults) fail('engine.json defaults required');
  return {
    heads: finite(defaults.heads, 'defaults.heads'),
    height: finite(defaults.height, 'defaults.height'),
    width: finite(defaults.width, 'defaults.width'),
    hectolitreWeight: finite(defaults.hectolitreWeight, 'defaults.hectolitreWeight'),
    deductionPercent: finite(defaults.deductionPercent, 'defaults.deductionPercent'),
    thousandGrainWeightOverride: finite(defaults.thousandGrainWeightOverride, 'defaults.thousandGrainWeightOverride'),
  };
}

export const wheatYieldDefaults = loadDefaults();

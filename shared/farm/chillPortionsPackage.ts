/**
 * First-party chill portions package — loads `plugins/chill_portions/`.
 *
 * Catalog metadata, Dynamic Model constants, season defaults, and cultivar
 * targets live in that folder (zip-able). React UI and weather fetch stay
 * in the app; this module is the TS adapter.
 */
import pluginJson from '../../plugins/chill_portions/plugin.json';
import engineJson from '../../plugins/chill_portions/engine.json';
import { FARM_MODULE_IDS, type FarmModuleId } from '../auth/farmModules';
import {
  parsePluginPackageManifestJson,
  pluginPackageIssues,
  type PluginPackageManifestV1,
} from './pluginPackage';

export const CHILL_PORTIONS_PACK_ID = 'chill_portions' as const;

export const CHILL_SETTINGS_OWNED_KEY_LIST = [
  'weatherSource',
  'latitude',
  'seasonStartMonth',
  'seasonStartDay',
  'seasonEndMonth',
  'seasonEndDay',
] as const;

export type CultivarSourceKind = 'ucanr' | 'luedeling' | 'estimate';

export type ChillCultivarTarget = {
  id: string;
  name: string;
  requiredCP: number;
  rangeCP?: { min: number; max: number };
  sourceKind: CultivarSourceKind;
  source: string;
};

export type ChillModelConstants = {
  e0: number;
  e1: number;
  a0: number;
  a1: number;
  slp: number;
  tetmlt: number;
  kelvinOffset: number;
};

export type ChillSeasonDefaults = {
  timezone: string;
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
};

const SOURCE_KINDS = ['ucanr', 'luedeling', 'estimate'] as const;

function fail(message: string): never {
  throw new Error(`[chill_portions package] ${message}`);
}

function loadManifest(): PluginPackageManifestV1 {
  const parsed = parsePluginPackageManifestJson(JSON.stringify(pluginJson));
  if (!parsed.ok) {
    fail(pluginPackageIssues(parsed).map((i) => `${i.path}: ${i.message}`).join('; '));
  }
  if (parsed.manifest.id !== CHILL_PORTIONS_PACK_ID) {
    fail(`plugin.json id must be ${CHILL_PORTIONS_PACK_ID}`);
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

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${path} must be a finite number`);
  }
  return value;
}

function loadEngine(manifest: PluginPackageManifestV1): {
  modelConstants: ChillModelConstants;
  seasonDefaults: ChillSeasonDefaults;
  cultivars: ChillCultivarTarget[];
  ownedKeys: readonly string[];
} {
  const raw = engineJson as {
    schemaVersion?: unknown;
    id?: unknown;
    modelConstants?: Record<string, unknown>;
    seasonDefaults?: Record<string, unknown>;
    cultivars?: unknown;
  };
  if (raw.schemaVersion !== 1) fail('engine.json schemaVersion must be 1');
  if (raw.id !== CHILL_PORTIONS_PACK_ID) fail('engine.json id must match plugin.json');
  if (!raw.modelConstants || typeof raw.modelConstants !== 'object') {
    fail('engine.json modelConstants required');
  }
  if (!raw.seasonDefaults || typeof raw.seasonDefaults !== 'object') {
    fail('engine.json seasonDefaults required');
  }
  if (!Array.isArray(raw.cultivars) || raw.cultivars.length === 0) {
    fail('engine.json cultivars required');
  }

  const ownedKeys = manifest.settingsOwnedKeys;
  if (!ownedKeys?.length) fail('plugin.json settingsOwnedKeys required for this pack');
  const ownedSet = new Set(ownedKeys);
  for (const key of CHILL_SETTINGS_OWNED_KEY_LIST) {
    if (!ownedSet.has(key)) fail(`settingsOwnedKeys missing ${key}`);
  }

  const c = raw.modelConstants;
  const modelConstants: ChillModelConstants = {
    e0: finiteNumber(c.e0, 'modelConstants.e0'),
    e1: finiteNumber(c.e1, 'modelConstants.e1'),
    a0: finiteNumber(c.a0, 'modelConstants.a0'),
    a1: finiteNumber(c.a1, 'modelConstants.a1'),
    slp: finiteNumber(c.slp, 'modelConstants.slp'),
    tetmlt: finiteNumber(c.tetmlt, 'modelConstants.tetmlt'),
    kelvinOffset: finiteNumber(c.kelvinOffset, 'modelConstants.kelvinOffset'),
  };

  const s = raw.seasonDefaults;
  if (typeof s.timezone !== 'string' || !s.timezone.trim()) {
    fail('seasonDefaults.timezone required');
  }
  const seasonDefaults: ChillSeasonDefaults = {
    timezone: s.timezone.trim(),
    startMonth: finiteNumber(s.startMonth, 'seasonDefaults.startMonth'),
    startDay: finiteNumber(s.startDay, 'seasonDefaults.startDay'),
    endMonth: finiteNumber(s.endMonth, 'seasonDefaults.endMonth'),
    endDay: finiteNumber(s.endDay, 'seasonDefaults.endDay'),
  };

  const cultivars: ChillCultivarTarget[] = raw.cultivars.map((row, i) => {
    if (!row || typeof row !== 'object') fail(`cultivars[${i}] must be an object`);
    const r = row as Record<string, unknown>;
    if (typeof r.id !== 'string' || !r.id.trim()) fail(`cultivars[${i}].id required`);
    if (typeof r.name !== 'string' || !r.name.trim()) fail(`cultivars[${i}].name required`);
    if (typeof r.sourceKind !== 'string' || !(SOURCE_KINDS as readonly string[]).includes(r.sourceKind)) {
      fail(`cultivars[${i}].sourceKind must be ucanr|luedeling|estimate`);
    }
    if (typeof r.source !== 'string' || !r.source.trim()) fail(`cultivars[${i}].source required`);
    const target: ChillCultivarTarget = {
      id: r.id.trim(),
      name: r.name.trim(),
      requiredCP: finiteNumber(r.requiredCP, `cultivars[${i}].requiredCP`),
      sourceKind: r.sourceKind as CultivarSourceKind,
      source: r.source.trim(),
    };
    if (r.rangeCP && typeof r.rangeCP === 'object') {
      const band = r.rangeCP as Record<string, unknown>;
      target.rangeCP = {
        min: finiteNumber(band.min, `cultivars[${i}].rangeCP.min`),
        max: finiteNumber(band.max, `cultivars[${i}].rangeCP.max`),
      };
    }
    return target;
  });

  return { modelConstants, seasonDefaults, cultivars, ownedKeys };
}

export const chillPortionsManifest = loadManifest();
export const chillPortionsModules = asFarmModuleIds(chillPortionsManifest.modules);

const engine = loadEngine(chillPortionsManifest);

export const CHILL_PORTIONS_SETTINGS_OWNED_KEYS = engine.ownedKeys;
export const chillModelConstants = engine.modelConstants;
export const chillSeasonDefaults = engine.seasonDefaults;
export const chillCultivars = engine.cultivars;
export const CHILL_PORTIONS_PRIMARY_PATH = chillPortionsManifest.primaryPath as string;

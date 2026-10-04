import pluginJson from '../../plugins/timeseries_demo/plugin.json';
import { loadFirstPartyPackManifest } from './firstPartyPack';

export const TIMESERIES_DEMO_PACK_ID = 'timeseries_demo' as const;
const loaded = loadFirstPartyPackManifest(pluginJson, TIMESERIES_DEMO_PACK_ID);
export const timeseriesDemoManifest = loaded.manifest;
export const timeseriesDemoModules = loaded.modules;
export const TIMESERIES_DEMO_PRIMARY_PATH = '/timeseries-demo';
export const TIMESERIES_DEMO_SETTINGS_OWNED_KEYS: readonly string[] = [];

if (
  loaded.modules.length !== 1 || loaded.modules[0] !== TIMESERIES_DEMO_PACK_ID ||
  loaded.manifest.primaryPath !== TIMESERIES_DEMO_PRIMARY_PATH ||
  loaded.manifest.settingsDocId !== null ||
  (loaded.manifest.settingsOwnedKeys?.length ?? 0) !== 0
) {
  throw new Error('[timeseries_demo package] Manifest does not match the demo contract');
}

import pluginJson from '../../plugins/sensors/plugin.json';
import { loadFirstPartyPackManifest } from './firstPartyPack';

export const SENSORS_PACK_ID = 'sensors' as const;

const loaded = loadFirstPartyPackManifest(pluginJson, SENSORS_PACK_ID);
export const sensorsManifest = loaded.manifest;
export const sensorsModules = loaded.modules;
export const SENSORS_PRIMARY_PATH = loaded.manifest.primaryPath as string;
export const SENSORS_SETTINGS_OWNED_KEYS = loaded.manifest.settingsOwnedKeys ?? [];

import pluginJson from '../../plugins/water/plugin.json';
import { loadFirstPartyPackManifest } from './firstPartyPack';

export const WATER_PACK_ID = 'water' as const;

const loaded = loadFirstPartyPackManifest(pluginJson, WATER_PACK_ID);
export const waterManifest = loaded.manifest;
export const waterModules = loaded.modules;
export const WATER_PRIMARY_PATH = loaded.manifest.primaryPath as string;
export const WATER_SETTINGS_OWNED_KEYS = loaded.manifest.settingsOwnedKeys ?? [];

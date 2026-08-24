import pluginJson from '../../plugins/harvest/plugin.json';
import { loadFirstPartyPackManifest } from './firstPartyPack';

export const HARVEST_PACK_ID = 'harvest' as const;

const loaded = loadFirstPartyPackManifest(pluginJson, HARVEST_PACK_ID);
export const harvestManifest = loaded.manifest;
export const harvestModules = loaded.modules;
export const HARVEST_PRIMARY_PATH = loaded.manifest.primaryPath as string;
export const HARVEST_SETTINGS_OWNED_KEYS = loaded.manifest.settingsOwnedKeys ?? [];

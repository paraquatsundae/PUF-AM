import pluginJson from '../../plugins/drying/plugin.json';
import { loadFirstPartyPackManifest } from './firstPartyPack';

export const DRYING_PACK_ID = 'drying' as const;

const loaded = loadFirstPartyPackManifest(pluginJson, DRYING_PACK_ID);
export const dryingManifest = loaded.manifest;
export const dryingModules = loaded.modules;
export const DRYING_PRIMARY_PATH = loaded.manifest.primaryPath as string;
export const DRYING_SETTINGS_OWNED_KEYS = loaded.manifest.settingsOwnedKeys ?? [];

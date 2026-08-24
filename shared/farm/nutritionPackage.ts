import pluginJson from '../../plugins/nutrition/plugin.json';
import { loadFirstPartyPackManifest } from './firstPartyPack';

export const NUTRITION_PACK_ID = 'nutrition' as const;

const loaded = loadFirstPartyPackManifest(pluginJson, NUTRITION_PACK_ID);
export const nutritionManifest = loaded.manifest;
export const nutritionModules = loaded.modules;
export const NUTRITION_PRIMARY_PATH = loaded.manifest.primaryPath as string;
export const NUTRITION_SETTINGS_OWNED_KEYS = loaded.manifest.settingsOwnedKeys ?? [];

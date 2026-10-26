import pluginJson from '../../plugins/field_bins/plugin.json';
import { loadFirstPartyPackManifest } from './firstPartyPack';

export const FIELD_BINS_PACK_ID = 'field_bins' as const;

const loaded = loadFirstPartyPackManifest(pluginJson, FIELD_BINS_PACK_ID);
export const fieldBinsManifest = loaded.manifest;
export const fieldBinsModules = loaded.modules;
export const FIELD_BINS_PRIMARY_PATH = loaded.manifest.primaryPath as string;
export const FIELD_BINS_SETTINGS_OWNED_KEYS = loaded.manifest.settingsOwnedKeys ?? [];

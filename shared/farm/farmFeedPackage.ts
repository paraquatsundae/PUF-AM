/**
 * First-party farm feed package — loads `plugins/farm_feed/`.
 *
 * Farm pack (not a crop pack, not Freenet). Catalog row lives in `farmPacks.ts`.
 * Plans/FARM_MESSAGING.md · Plans/PLUGIN_AUTHORING.md
 */
import pluginJson from '../../plugins/farm_feed/plugin.json';
import { loadFirstPartyPackManifest } from './firstPartyPack';

export const FARM_FEED_PACK_ID = 'farm_feed' as const;

const loaded = loadFirstPartyPackManifest(pluginJson, FARM_FEED_PACK_ID, 'farm');
export const farmFeedManifest = loaded.manifest;
export const farmFeedModules = loaded.modules;
export const FARM_FEED_PRIMARY_PATH = loaded.manifest.primaryPath as string;
export const FARM_FEED_SETTINGS_OWNED_KEYS = loaded.manifest.settingsOwnedKeys ?? [];

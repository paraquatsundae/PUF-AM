/**
 * Adapter for `plugins/freenet_host/plugin.json` — the Freenet network pack.
 *
 * A network pack has no modules and no settings doc, so this is thinner than
 * `loadFirstPartyPackManifest` and checks the two things a network pack must
 * get right instead: `kind: network` and `category: network`.
 * Plan: Plans/NETWORK_PACK_PLUGIN.md § plugin.json.
 */
import pluginJson from '../../plugins/freenet_host/plugin.json';
import {
  parsePluginPackageManifestJson,
  pluginPackageIssues,
  type PluginPackageManifestV1,
} from './pluginPackage';

export const FREENET_HOST_PACK_ID = 'freenet_host' as const;

function loadNetworkPackManifest(input: unknown, expectedId: string): PluginPackageManifestV1 {
  const parsed = parsePluginPackageManifestJson(JSON.stringify(input));
  if (!parsed.ok) {
    throw new Error(
      `[${expectedId} package] ${pluginPackageIssues(parsed).map((i) => `${i.path}: ${i.message}`).join('; ')}`
    );
  }
  const manifest = parsed.manifest;
  if (manifest.id !== expectedId) {
    throw new Error(`[${expectedId} package] plugin.json id must be ${expectedId}`);
  }
  if (manifest.kind !== 'network') {
    throw new Error(`[${expectedId} package] plugin.json kind must be network`);
  }
  if (manifest.category !== 'network') {
    throw new Error(`[${expectedId} package] plugin.json category must be network`);
  }
  if (manifest.modules.length > 0) {
    throw new Error(`[${expectedId} package] a network pack owns no farm modules`);
  }
  return manifest;
}

export const freenetHostManifest = loadNetworkPackManifest(pluginJson, FREENET_HOST_PACK_ID);

/**
 * Load a first-party `plugins/<id>/plugin.json` into catalog fields.
 * Packs with engine.json (blight, chill) keep their own adapters.
 */
import { FARM_MODULE_IDS, type FarmModuleId } from '../auth/farmModules';
import {
  parsePluginPackageManifestJson,
  pluginPackageIssues,
  type PluginPackageManifestV1,
} from './pluginPackage';

export function loadFirstPartyPackManifest(
  pluginJson: unknown,
  expectedId: string
): { manifest: PluginPackageManifestV1; modules: FarmModuleId[] } {
  const parsed = parsePluginPackageManifestJson(JSON.stringify(pluginJson));
  if (!parsed.ok) {
    throw new Error(
      `[${expectedId} package] ${pluginPackageIssues(parsed).map((i) => `${i.path}: ${i.message}`).join('; ')}`
    );
  }
  if (parsed.manifest.id !== expectedId) {
    throw new Error(`[${expectedId} package] plugin.json id must be ${expectedId}`);
  }
  if (parsed.manifest.kind !== 'crop_pack') {
    throw new Error(`[${expectedId} package] plugin.json kind must be crop_pack`);
  }
  if (!parsed.manifest.primaryPath) {
    throw new Error(`[${expectedId} package] plugin.json primaryPath is required`);
  }
  const allowed = new Set<string>(FARM_MODULE_IDS);
  const modules: FarmModuleId[] = [];
  for (const id of parsed.manifest.modules) {
    if (!allowed.has(id)) {
      throw new Error(`[${expectedId} package] unknown module id "${id}"`);
    }
    modules.push(id as FarmModuleId);
  }
  return { manifest: parsed.manifest, modules };
}

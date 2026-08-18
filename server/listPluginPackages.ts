/**
 * List unpacked plugin packages under repo `plugins/` (Node / Express only).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  PLUGIN_MANIFEST_FILENAME,
  PLUGIN_PACKAGES_DIRNAME,
  parsePluginPackageManifestJson,
  type PluginPackageManifestV1,
} from '../shared/farm/pluginPackage.ts';

export type ListedPluginPackage = {
  dirName: string;
  path: string;
  manifest: PluginPackageManifestV1;
};

export function listUnpackedPluginPackages(pluginsRoot: string): ListedPluginPackage[] {
  if (!existsSync(pluginsRoot)) return [];
  const out: ListedPluginPackage[] = [];
  for (const name of readdirSync(pluginsRoot)) {
    if (name.startsWith('.') || name === '_skeleton') continue;
    const abs = join(pluginsRoot, name);
    if (!statSync(abs).isDirectory()) continue;
    const manifestPath = join(abs, PLUGIN_MANIFEST_FILENAME);
    if (!existsSync(manifestPath)) continue;
    const parsed = parsePluginPackageManifestJson(readFileSync(manifestPath, 'utf8'));
    if (!parsed.ok) continue;
    if (parsed.manifest.id !== name) continue;
    out.push({ dirName: name, path: abs, manifest: parsed.manifest });
  }
  return out.sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
}

export function defaultPluginsRoot(repoRoot: string): string {
  return join(repoRoot, PLUGIN_PACKAGES_DIRNAME);
}

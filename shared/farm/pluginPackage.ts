/**
 * On-disk / zip plugin package contract (Plans/CROP_PACK_PLUGIN.md § Packaging).
 *
 * A pack is distributed as `{id}.zip` whose root contains `plugin.json`.
 * Operators drop the zip in the repo/app `plugins/` folder; `npm run plugins:unpack`
 * expands it to `plugins/<id>/`. React UI still ships in-app for v1 — the package
 * carries catalog metadata, optional `engine.json` defaults, and later assets.
 */

import {
  isPluginCategoryId,
  type PluginCategoryId,
} from './pluginCategories.ts';

/** Current on-disk / zip manifest version. Bump when breaking the layout. */
export const PLUGIN_PACKAGE_SCHEMA_VERSION = 1 as const;

/** Filename required at the root of every package (zip or unpacked folder). */
export const PLUGIN_MANIFEST_FILENAME = 'plugin.json';

/** Directory (repo root or desktop userData) where zips and unpacked packs live. */
export const PLUGIN_PACKAGES_DIRNAME = 'plugins';

export const PLUGIN_PACKAGE_KINDS = ['crop_pack', 'system'] as const;
export type PluginPackageKind = (typeof PLUGIN_PACKAGE_KINDS)[number];

/**
 * Stable pack id: snake_case, starts with a letter.
 * Must match `CropPackId` when the pack is also registered in `cropPacks.ts`.
 */
export const PLUGIN_PACKAGE_ID_RE = /^[a-z][a-z0-9_]*$/;

export type PluginPackageManifestV1 = {
  schemaVersion: typeof PLUGIN_PACKAGE_SCHEMA_VERSION;
  kind: PluginPackageKind;
  id: string;
  /** Semver-ish string, e.g. 0.1.0 */
  version: string;
  label: string;
  blurb: string;
  /** Required — Settings → Plugins grouping. Use `generic` if unsure. */
  category: PluginCategoryId;
  /** Module ids this pack owns (must exist in app farmModules when wired). */
  modules: string[];
  settingsDocId: string | null;
  /**
   * Pack-owned fields inside settingsDocId (legacy shared docs).
   * Delete clears these keys only — never economics on `model_params`.
   */
  settingsOwnedKeys?: string[];
  /** Optional primary route path, e.g. `/blight`. */
  primaryPath?: string;
  author?: string;
  license?: string;
  homepage?: string;
};

export type PluginPackageValidationIssue = {
  path: string;
  message: string;
};

export type PluginPackageValidationResult =
  | { ok: true; manifest: PluginPackageManifestV1 }
  | { ok: false; issues: PluginPackageValidationIssue[] };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t ? t : null;
}

/**
 * Validate a parsed `plugin.json` object.
 * Pure — safe for browser, Node, and tests.
 */
export function validatePluginPackageManifest(
  input: unknown
): PluginPackageValidationResult {
  const issues: PluginPackageValidationIssue[] = [];
  if (!isPlainObject(input)) {
    return { ok: false, issues: [{ path: '', message: 'Manifest must be a JSON object' }] };
  }

  if (input.schemaVersion !== PLUGIN_PACKAGE_SCHEMA_VERSION) {
    issues.push({
      path: 'schemaVersion',
      message: `Must be ${PLUGIN_PACKAGE_SCHEMA_VERSION} (got ${String(input.schemaVersion)})`,
    });
  }

  const kind = input.kind;
  if (typeof kind !== 'string' || !(PLUGIN_PACKAGE_KINDS as readonly string[]).includes(kind)) {
    issues.push({
      path: 'kind',
      message: `Must be one of: ${PLUGIN_PACKAGE_KINDS.join(', ')}`,
    });
  }

  const id = asNonEmptyString(input.id);
  if (!id || !PLUGIN_PACKAGE_ID_RE.test(id)) {
    issues.push({
      path: 'id',
      message: 'Must match /^[a-z][a-z0-9_]*$/ (snake_case pack id)',
    });
  }

  const version = asNonEmptyString(input.version);
  if (!version) {
    issues.push({ path: 'version', message: 'Required non-empty string (e.g. 0.1.0)' });
  }

  const label = asNonEmptyString(input.label);
  if (!label) issues.push({ path: 'label', message: 'Required non-empty string' });

  const blurb = asNonEmptyString(input.blurb);
  if (!blurb) issues.push({ path: 'blurb', message: 'Required non-empty string' });

  if (!isPluginCategoryId(input.category)) {
    issues.push({
      path: 'category',
      message: 'Required: crop | network | generic (use generic if unsure)',
    });
  }

  if (!Array.isArray(input.modules) || !input.modules.every((m) => typeof m === 'string' && m.trim())) {
    issues.push({ path: 'modules', message: 'Required array of non-empty module id strings' });
  }

  if (!(input.settingsDocId === null || typeof input.settingsDocId === 'string')) {
    issues.push({
      path: 'settingsDocId',
      message: 'Must be a string doc id or null',
    });
  }

  if (input.settingsOwnedKeys !== undefined) {
    if (
      !Array.isArray(input.settingsOwnedKeys) ||
      !input.settingsOwnedKeys.every((k) => typeof k === 'string' && k.trim())
    ) {
      issues.push({
        path: 'settingsOwnedKeys',
        message: 'When set, must be an array of non-empty field name strings',
      });
    }
  }

  if (input.primaryPath !== undefined) {
    const p = asNonEmptyString(input.primaryPath);
    if (!p || !p.startsWith('/')) {
      issues.push({ path: 'primaryPath', message: 'When set, must be an absolute path like /blight' });
    }
  }

  for (const optional of ['author', 'license', 'homepage'] as const) {
    if (input[optional] !== undefined && typeof input[optional] !== 'string') {
      issues.push({ path: optional, message: 'When set, must be a string' });
    }
  }

  if (issues.length) return { ok: false, issues };

  const modules = (input.modules as string[]).map((m) => m.trim());
  const manifest: PluginPackageManifestV1 = {
    schemaVersion: PLUGIN_PACKAGE_SCHEMA_VERSION,
    kind: kind as PluginPackageKind,
    id: id!,
    version: version!,
    label: label!,
    blurb: blurb!,
    category: input.category as PluginCategoryId,
    modules,
    settingsDocId:
      input.settingsDocId === null || input.settingsDocId === ''
        ? null
        : String(input.settingsDocId).trim(),
  };
  if (Array.isArray(input.settingsOwnedKeys)) {
    manifest.settingsOwnedKeys = (input.settingsOwnedKeys as string[]).map((k) => k.trim());
  }
  if (typeof input.primaryPath === 'string' && input.primaryPath.trim()) {
    manifest.primaryPath = input.primaryPath.trim();
  }
  if (typeof input.author === 'string' && input.author.trim()) manifest.author = input.author.trim();
  if (typeof input.license === 'string' && input.license.trim()) {
    manifest.license = input.license.trim();
  }
  if (typeof input.homepage === 'string' && input.homepage.trim()) {
    manifest.homepage = input.homepage.trim();
  }
  return { ok: true, manifest };
}

export function parsePluginPackageManifestJson(text: string): PluginPackageValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, issues: [{ path: '', message: 'Invalid JSON' }] };
  }
  return validatePluginPackageManifest(parsed);
}

/**
 * Expected zip layout (after normalize):
 *
 * ```
 * plugin.json          # required
 * README.md            # optional
 * assets/              # optional static (icons, …)
 * ```
 *
 * Zips may wrap a single top-level folder `{id}/plugin.json` — unpackers flatten
 * or accept either form. Manifest `id` must equal the unpacked folder name.
 */
export const PLUGIN_PACKAGE_LAYOUT = {
  manifest: PLUGIN_MANIFEST_FILENAME,
  optionalFiles: ['README.md', 'LICENSE', 'LICENSE.md', 'engine.json'] as const,
  optionalDirs: ['assets'] as const,
} as const;

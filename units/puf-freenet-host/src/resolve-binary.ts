/**
 * Locate the `freenet` / `fdev` binaries the host supervises.
 *
 * Resolution order (first hit wins) — see `Plans/DESKTOP_FREENET_PLUGIN.md` §5.3:
 *   1. explicit `binaryPath` option
 *   2. `PUF_FREENET_BIN` / `PUF_FDEV_BIN` env override (workshop)
 *   3. `searchPaths` — Electron passes `${process.resourcesPath}/freenet`
 *   4. `<repoRoot>/vendor/freenet/<os>-<arch>/` (dev; gitignored build input)
 *   5. `PATH`
 *
 * The winning `source` is reported in status so the workshop knows whether it
 * exercised the bundled binary or a stray one on PATH.
 */

import { accessSync, constants } from 'node:fs';
import path from 'node:path';

import { FreenetBinaryNotFoundError } from './errors.ts';
import type { FreenetBinaryInfo, FreenetBinarySource } from './types.ts';

export const FREENET_BINARY = 'freenet';
export const FDEV_BINARY = 'fdev';

/** Workshop env overrides, per binary name. */
export const BINARY_ENV_VARS: Record<string, string> = {
  [FREENET_BINARY]: 'PUF_FREENET_BIN',
  [FDEV_BINARY]: 'PUF_FDEV_BIN',
};

export type ResolveBinaryOptions = {
  binaryPath?: string;
  searchPaths?: string[];
  /** Repo root for the `vendor/freenet/<os>-<arch>` dev lookup. */
  repoRoot?: string;
  env?: Record<string, string | undefined>;
  platform?: string;
  arch?: string;
  /** Injected in tests; defaults to an fs access check. */
  isExecutable?: (candidate: string) => boolean;
};

export type ResolveBinaryResult = {
  binary: Pick<FreenetBinaryInfo, 'path' | 'source'> | null;
  /** Every candidate considered, in order — used for actionable errors. */
  searched: string[];
};

/** electron-builder `${os}` naming so `vendor/` layout matches `extraResources`. */
export function freenetOsTag(platform: string): string {
  if (platform === 'win32') return 'win';
  if (platform === 'darwin') return 'mac';
  return 'linux';
}

export function freenetBinaryFileName(name: string, platform: string): string {
  return platform === 'win32' ? `${name}.exe` : name;
}

function defaultIsExecutable(candidate: string, platform: string): boolean {
  try {
    accessSync(candidate, platform === 'win32' ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Join/resolve with the *target* platform's rules so `platform` overrides are meaningful. */
function pathFor(platform: string): path.PlatformPath {
  return platform === 'win32' ? path.win32 : path.posix;
}

function pathEntries(env: Record<string, string | undefined>, platform: string): string[] {
  const raw = env.PATH ?? env.Path ?? '';
  if (!raw) return [];
  return raw
    .split(platform === 'win32' ? ';' : ':')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** Resolve one binary. Returns `binary: null` (plus the candidate trail) when absent. */
export function resolveFreenetBinary(
  name: string,
  options: ResolveBinaryOptions = {},
): ResolveBinaryResult {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const env = options.env ?? process.env;
  const isExecutable =
    options.isExecutable ?? ((candidate: string) => defaultIsExecutable(candidate, platform));
  const fileName = freenetBinaryFileName(name, platform);
  const p = pathFor(platform);
  const searched: string[] = [];

  const candidates: Array<{ candidate: string; source: FreenetBinarySource }> = [];

  if (options.binaryPath) {
    candidates.push({ candidate: p.resolve(options.binaryPath), source: 'option' });
  }

  const envVar = BINARY_ENV_VARS[name];
  const fromEnv = envVar ? env[envVar]?.trim() : undefined;
  if (fromEnv) {
    candidates.push({ candidate: p.resolve(fromEnv), source: 'env' });
  }

  for (const dir of options.searchPaths ?? []) {
    candidates.push({ candidate: p.join(dir, fileName), source: 'bundled' });
  }

  if (options.repoRoot) {
    candidates.push({
      candidate: p.join(
        options.repoRoot,
        'vendor',
        'freenet',
        `${freenetOsTag(platform)}-${arch}`,
        fileName,
      ),
      source: 'vendor',
    });
  }

  for (const dir of pathEntries(env, platform)) {
    candidates.push({ candidate: p.join(dir, fileName), source: 'path' });
  }

  for (const { candidate, source } of candidates) {
    searched.push(candidate);
    if (isExecutable(candidate)) {
      return { binary: { path: candidate, source }, searched };
    }
  }

  return { binary: null, searched };
}

export function resolveFreenetBinaryOrThrow(
  name: string,
  options: ResolveBinaryOptions = {},
): Pick<FreenetBinaryInfo, 'path' | 'source'> {
  const { binary, searched } = resolveFreenetBinary(name, options);
  if (!binary) throw new FreenetBinaryNotFoundError(name, searched);
  return binary;
}

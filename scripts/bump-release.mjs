/**
 * Bump the workshop bake number: package.json patch + androidVersionCode.
 *
 * Source of truth is repo-root package.json. Android versionName, the
 * AppImage filename, and in-app APP_VERSION all read that field.
 * Run only when shipping a new AppImage+APK pair — not for docs-only.
 *
 * Usage:
 *   npm run release:bump
 *
 * Plan: Plans/NAMING.md §2 (Decision — 2026-09-14).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG_PATH = path.join(REPO_ROOT, 'package.json');
const LOCK_PATH = path.join(REPO_ROOT, 'package-lock.json');

/**
 * @param {string} version
 * @returns {{ major: number, minor: number, patch: number }}
 */
export function parseSemver(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version || '').trim());
  if (!match) {
    throw new Error(`package.json version must be x.y.z, got ${JSON.stringify(version)}`);
  }
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/**
 * @param {string} version
 * @returns {string}
 */
export function nextPatch(version) {
  const { major, minor, patch } = parseSemver(version);
  return `${major}.${minor}.${patch + 1}`;
}

function replaceRootVersion(raw, nextVersion) {
  let count = 0;
  const updated = raw.replace(
    /("name": "walnut-farm-manager",\s*"version": ")([^"]+)(")/g,
    (_all, prefix, _old, suffix) => {
      count += 1;
      return `${prefix}${nextVersion}${suffix}`;
    },
  );
  if (count !== 2) {
    throw new Error(
      `expected 2 walnut-farm-manager version fields in package-lock.json, found ${count}`,
    );
  }
  return updated;
}

function main() {
  const pkgRaw = readFileSync(PKG_PATH, 'utf8');
  const pkg = JSON.parse(pkgRaw);
  const code = Number(pkg.androidVersionCode);
  if (!Number.isInteger(code) || code < 1) {
    throw new Error('package.json androidVersionCode must be a positive integer');
  }

  const nextVersion = nextPatch(pkg.version);
  const nextCode = code + 1;

  let nextPkg = pkgRaw.replace(/"version":\s*"[^"]+"/, `"version": "${nextVersion}"`);
  if (!/"androidVersionCode":\s*\d+/.test(nextPkg)) {
    throw new Error('package.json is missing androidVersionCode');
  }
  nextPkg = nextPkg.replace(/"androidVersionCode":\s*\d+/, `"androidVersionCode": ${nextCode}`);
  writeFileSync(PKG_PATH, nextPkg);

  const lockRaw = readFileSync(LOCK_PATH, 'utf8');
  writeFileSync(LOCK_PATH, replaceRootVersion(lockRaw, nextVersion));

  console.log(
    `[release:bump] ${pkg.version} (code ${code}) → ${nextVersion} (code ${nextCode})\n` +
      '[release:bump] rebuild the AppImage + debug APK pair before handing them out.',
  );
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  try {
    main();
  } catch (err) {
    console.error(`[release:bump] ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

/**
 * Populate `vendor/freenet/<os>-<arch>/` with the pinned Freenet binaries.
 *
 * Build input, not source: `vendor/` is gitignored, this script and
 * `freenet-binaries.json` are what get committed. Every download is checked
 * against a pinned SHA-256 twice — once on the archive, once on the extracted
 * binary — because a silent version drift changes the pack-contract code hash
 * and therefore every mist URI ever published.
 *
 * Usage:
 *   node scripts/fetch-freenet-binaries.mjs                 # host platform
 *   node scripts/fetch-freenet-binaries.mjs --platform win-x64
 *   node scripts/fetch-freenet-binaries.mjs --verify         # no network; check what is there
 *   node scripts/fetch-freenet-binaries.mjs --force          # re-download even if checksums match
 *
 * Offline / mirrored builds: set `PUF_FREENET_ASSET_DIR` to a directory holding
 * the release archives and nothing is fetched.
 *
 * Plan: `Plans/DESKTOP_FREENET_PLUGIN.md` §7.1, §8.4, Phase 2.
 */

import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { unzipSync } from 'fflate';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = path.join(REPO_ROOT, 'scripts', 'freenet-binaries.json');
/** Written into the vendor dir so `--verify` and Phase 3 packaging know what landed. */
const STAMP_FILE = 'VENDOR.json';

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

/** electron-builder `${os}` naming, mirroring `freenetOsTag` in the host unit. */
function osTag(platform) {
  if (platform === 'win32') return 'win';
  if (platform === 'darwin') return 'mac';
  return 'linux';
}

function parseArgs(argv) {
  const args = { platformTag: `${osTag(process.platform)}-${process.arch}`, force: false, verify: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--force') args.force = true;
    else if (arg === '--verify' || arg === '--verify-only') args.verify = true;
    else if (arg === '--platform') args.platformTag = argv[++i];
    else if (arg.startsWith('--platform=')) args.platformTag = arg.slice('--platform='.length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** The manifest carries `//` comment keys; they are noise in the vendor stamp. */
function withoutComments(record) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !key.startsWith('//')));
}

/**
 * Minimal tar reader for the flat, single-file archives upstream publishes.
 * Entry names are matched against the manifest rather than joined onto a path,
 * so a hostile archive cannot write outside the vendor dir.
 */
function readTarEntries(buf) {
  const entries = [];
  for (let offset = 0; offset + 512 <= buf.length; ) {
    const header = buf.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    const sizeField = header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim();
    const size = Number.parseInt(sizeField, 8) || 0;
    const typeFlag = String.fromCharCode(header[156]);
    const dataStart = offset + 512;
    // '0' and NUL both mean "regular file"; anything else (dirs, PAX headers) is skipped.
    if (typeFlag === '0' || typeFlag === '\0') {
      entries.push({ name, data: buf.subarray(dataStart, dataStart + size) });
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  return entries;
}

function extractEntry(assetName, archive, entryName) {
  if (assetName.endsWith('.tar.gz') || assetName.endsWith('.tgz')) {
    const found = readTarEntries(Buffer.from(gunzipSync(archive))).find(
      (entry) => entry.name === entryName,
    );
    if (!found) throw new Error(`${assetName}: no entry named ${entryName}`);
    return Buffer.from(found.data);
  }
  if (assetName.endsWith('.zip')) {
    const files = unzipSync(new Uint8Array(archive));
    const found = files[entryName];
    if (!found) throw new Error(`${assetName}: no entry named ${entryName}`);
    return Buffer.from(found);
  }
  throw new Error(`${assetName}: unsupported archive type`);
}

/** Local mirror first — an air-gapped or CI build should not need GitHub. */
async function readAsset(assetName) {
  const localDir = process.env.PUF_FREENET_ASSET_DIR?.trim();
  if (localDir) {
    const localPath = path.resolve(localDir, assetName);
    if (!existsSync(localPath)) {
      throw new Error(`PUF_FREENET_ASSET_DIR is set but ${localPath} is missing`);
    }
    return { bytes: readFileSync(localPath), from: localPath };
  }

  const url = `${manifest.assetBaseUrl}/${assetName}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} → ${response.status} ${response.statusText}`);
  return { bytes: Buffer.from(await response.arrayBuffer()), from: url };
}

async function readLicense() {
  const localDir = process.env.PUF_FREENET_ASSET_DIR?.trim();
  if (localDir) {
    const localPath = path.resolve(localDir, manifest.license.fileName);
    if (existsSync(localPath)) return { bytes: readFileSync(localPath), from: localPath };
  }
  const response = await fetch(manifest.license.url);
  if (!response.ok) {
    throw new Error(`GET ${manifest.license.url} → ${response.status} ${response.statusText}`);
  }
  return { bytes: Buffer.from(await response.arrayBuffer()), from: manifest.license.url };
}

function assertChecksum(label, bytes, expected) {
  const actual = sha256(bytes);
  if (actual !== expected) {
    throw new Error(`${label}: checksum mismatch\n  expected ${expected}\n  actual   ${actual}`);
  }
  return actual;
}

/** Already-correct file on disk — the common case on a second run. */
function matchesOnDisk(filePath, expectedSha) {
  return existsSync(filePath) && sha256(readFileSync(filePath)) === expectedSha;
}

function vendorDirFor(platformTag) {
  return path.join(REPO_ROOT, manifest.vendorDirTemplate.replace('{platformTag}', platformTag));
}

function verifyOnly(platformTag, platform, vendorDir) {
  let ok = true;
  for (const entry of platform.binaries) {
    const target = path.join(vendorDir, entry.fileName);
    if (matchesOnDisk(target, entry.sha256)) {
      console.log(`  ok      ${entry.fileName}`);
    } else {
      ok = false;
      console.log(`  MISSING ${entry.fileName}  (${existsSync(target) ? 'checksum mismatch' : 'not present'})`);
    }
  }
  const licensePath = path.join(vendorDir, manifest.license.fileName);
  if (matchesOnDisk(licensePath, manifest.license.sha256)) {
    console.log(`  ok      ${manifest.license.fileName}`);
  } else {
    ok = false;
    console.log(`  MISSING ${manifest.license.fileName}`);
  }
  if (!ok) {
    throw new Error(
      `vendor/freenet/${platformTag} is incomplete — run \`npm run desktop:vendor\` (or --platform ${platformTag})`,
    );
  }
  console.log(`\nvendor/freenet/${platformTag} matches Freenet ${manifest.version}.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const platform = manifest.platforms[args.platformTag];
  if (!platform) {
    const known = Object.keys(manifest.platforms).join(', ');
    throw new Error(`No pinned binaries for ${args.platformTag}. Pinned platforms: ${known}`);
  }

  const vendorDir = vendorDirFor(args.platformTag);
  console.log(
    `Freenet ${manifest.version} (${manifest.releaseTag}) → ${path.relative(REPO_ROOT, vendorDir)}`,
  );
  if (platform.status !== 'verified') {
    console.log(`  note: ${args.platformTag} is pinned but marked "${platform.status}" in the manifest.`);
  }

  if (args.verify) return verifyOnly(args.platformTag, platform, vendorDir);

  mkdirSync(vendorDir, { recursive: true });

  for (const entry of platform.binaries) {
    const target = path.join(vendorDir, entry.fileName);
    if (!args.force && matchesOnDisk(target, entry.sha256)) {
      console.log(`  ${entry.fileName}: already pinned, skipping`);
      continue;
    }

    const { bytes, from } = await readAsset(entry.asset);
    assertChecksum(entry.asset, bytes, entry.assetSha256);
    const binary = extractEntry(entry.asset, bytes, entry.archiveEntry);
    assertChecksum(`${entry.asset}!${entry.archiveEntry}`, binary, entry.sha256);

    writeFileSync(target, binary);
    // Upstream tarballs store mode 0644, so an extracted binary is not runnable
    // until we say so. Harmless and ignored on Windows.
    if (args.platformTag.startsWith('linux') || args.platformTag.startsWith('mac')) {
      chmodSync(target, 0o755);
    }
    console.log(`  ${entry.fileName}: ${binary.length} bytes verified  ← ${from}`);
  }

  const licensePath = path.join(vendorDir, manifest.license.fileName);
  if (args.force || !matchesOnDisk(licensePath, manifest.license.sha256)) {
    const { bytes, from } = await readLicense();
    assertChecksum(manifest.license.fileName, bytes, manifest.license.sha256);
    writeFileSync(licensePath, bytes);
    console.log(`  ${manifest.license.fileName}: ${manifest.license.spdx}  ← ${from}`);
  } else {
    console.log(`  ${manifest.license.fileName}: already pinned, skipping`);
  }

  writeFileSync(
    path.join(vendorDir, STAMP_FILE),
    `${JSON.stringify(
      {
        version: manifest.version,
        releaseTag: manifest.releaseTag,
        platformTag: args.platformTag,
        toolVersions: withoutComments(manifest.toolVersions),
        license: manifest.license.spdx,
        fetchedAt: new Date().toISOString(),
        binaries: Object.fromEntries(platform.binaries.map((e) => [e.fileName, e.sha256])),
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    `\nDone. \`npm run desktop:dev\` now resolves these with status source: 'vendor'` +
      ` (bundled resources and PUF_FREENET_BIN still outrank it).`,
  );
}

main().catch((err) => {
  console.error(`\nfetch-freenet-binaries: ${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
});

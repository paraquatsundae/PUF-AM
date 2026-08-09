/**
 * Guards the seam between the committed pin (`scripts/freenet-binaries.json`) and
 * the code that consumes it. Neither side can be typechecked against the other —
 * the manifest is JSON read by a plain-node script, the resolver is TypeScript in
 * a unit that must not import repo scripts — so the agreement is asserted here.
 *
 * Hermetic: reads only committed files. No network, no Freenet node, no `vendor/`.
 * Plan: `Plans/DESKTOP_FREENET_PLUGIN.md` Phase 2.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  FDEV_BINARY,
  FREENET_BINARY,
  freenetBinaryFileName,
  freenetPlatformTag,
  freenetVendorDir,
  resolveFreenetBinary,
} from '../units/puf-freenet-host/src/resolve-binary.ts';
import { PACK_CONTRACT_CODE_HASH_B58 } from '../units/mist-freenet/src/freenet02-pack.ts';
import { SLOT_CONTRACT_CODE_HASH_B58 } from '../units/mist-freenet/src/freenet02-slot.ts';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

type PinnedBinary = {
  name: string;
  fileName: string;
  asset: string;
  assetSha256: string;
  archiveEntry: string;
  sha256: string;
  bytes: number;
};

type Manifest = {
  version: string;
  releaseTag: string;
  assetBaseUrl: string;
  vendorDirTemplate: string;
  toolVersions: Record<string, string>;
  license: { spdx: string; fileName: string; url: string; sha256: string };
  packContract: PinnedContract;
  slotContract: PinnedContract & { sourceDir: string; builtWith: Record<string, string> };
  platforms: Record<string, { status: string; binaries: PinnedBinary[] }>;
};

type PinnedContract = { path: string; sha256: string; codeHashB58: string };

const manifest = JSON.parse(
  readFileSync(path.join(REPO_ROOT, 'scripts', 'freenet-binaries.json'), 'utf8'),
) as Manifest;

/** Platform tags the manifest pins, mapped back to Node's `platform`/`arch`. */
const NODE_PLATFORM: Record<string, { platform: string; arch: string }> = {
  'linux-x64': { platform: 'linux', arch: 'x64' },
  'win-x64': { platform: 'win32', arch: 'x64' },
  'mac-x64': { platform: 'darwin', arch: 'x64' },
  'mac-arm64': { platform: 'darwin', arch: 'arm64' },
};

const platformTags = Object.keys(manifest.platforms);

describe('freenet-binaries.json', () => {
  it('pins linux-x64 as verified and stubs win-x64 (Fedora-first, plan §8.4)', () => {
    expect(manifest.platforms['linux-x64']?.status).toBe('verified');
    expect(manifest.platforms['win-x64']).toBeDefined();
  });

  it('keeps every asset on one release tag — mixed versions change the pack code hash', () => {
    expect(manifest.assetBaseUrl.endsWith(`/${manifest.releaseTag}`)).toBe(true);
    expect(manifest.releaseTag).toBe(`v${manifest.version}`);
    expect(manifest.license.url).toContain(manifest.releaseTag);
  });

  it.each(platformTags)('%s pins both binaries the host needs', (tag) => {
    const names = manifest.platforms[tag]!.binaries.map((entry) => entry.name);
    expect(names).toEqual([FREENET_BINARY, FDEV_BINARY]);
  });

  it.each(platformTags)('%s uses the file names the resolver looks for', (tag) => {
    const { platform } = NODE_PLATFORM[tag]!;
    for (const entry of manifest.platforms[tag]!.binaries) {
      expect(entry.fileName).toBe(freenetBinaryFileName(entry.name, platform));
      expect(entry.archiveEntry).toBe(entry.fileName);
    }
  });

  it.each(platformTags)('%s pins full SHA-256 digests for archive and binary', (tag) => {
    for (const entry of manifest.platforms[tag]!.binaries) {
      expect(entry.assetSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.assetSha256).not.toBe(entry.sha256);
      expect(entry.bytes).toBeGreaterThan(0);
    }
  });

  it('names only platform tags the resolver can produce', () => {
    for (const tag of platformTags) {
      const mapped = NODE_PLATFORM[tag];
      expect(mapped, `unmapped platform tag: ${tag}`).toBeDefined();
      expect(freenetPlatformTag(mapped!.platform, mapped!.arch)).toBe(tag);
    }
  });
});

describe('vendorDirTemplate matches where the host actually searches', () => {
  // The whole point of the vendor step is beating a stray `~/.local/bin/freenet`.
  // If the fetch script writes one directory and the resolver reads another, the
  // symptom is not an error — it is silently testing the wrong binary.
  it.each(platformTags)('%s', (tag) => {
    const { platform, arch } = NODE_PLATFORM[tag]!;
    const fromTemplate = path.posix.join(
      '/repo',
      manifest.vendorDirTemplate.replace('{platformTag}', tag),
    );
    const fromResolver = freenetVendorDir('/repo', platform, arch);

    // Compare with POSIX separators so a win32 target is still comparable.
    expect(fromResolver.split(path.win32.sep).join(path.posix.sep)).toBe(fromTemplate);
  });

  it('is the directory resolveFreenetBinary reports as source: vendor', () => {
    const vendored = path.posix.join(
      '/repo',
      manifest.vendorDirTemplate.replace('{platformTag}', 'linux-x64'),
      'freenet',
    );

    const result = resolveFreenetBinary(FREENET_BINARY, {
      platform: 'linux',
      arch: 'x64',
      repoRoot: '/repo',
      env: { PATH: '/home/op/.local/bin' },
      isExecutable: (candidate) =>
        candidate === vendored || candidate === '/home/op/.local/bin/freenet',
    });

    expect(result.binary).toEqual({ path: vendored, source: 'vendor' });
  });
});

describe('pack contract pin', () => {
  it('agrees with PACK_CONTRACT_CODE_HASH_B58', () => {
    expect(manifest.packContract.codeHashB58).toBe(PACK_CONTRACT_CODE_HASH_B58);
  });

  it('matches the WASM committed in units/mist-freenet/assets', () => {
    const wasm = readFileSync(path.join(REPO_ROOT, manifest.packContract.path));
    const sha256 = createHash('sha256').update(wasm).digest('hex');
    expect(sha256).toBe(manifest.packContract.sha256);
  });
});

/**
 * Same discipline as the pack pin, one artifact further: a slot address is
 * `BLAKE3(code_hash || slot_id || farm_key)`, so a code hash that drifts from the
 * shipped WASM moves every slot and quietly breaks tickets already in the field.
 * Unlike pack, this contract is ours — `npm run mist:build:slot` rebuilds it from
 * `units/mist-freenet/contracts/slot-contract`.
 */
describe('slot contract pin', () => {
  it('agrees with SLOT_CONTRACT_CODE_HASH_B58', () => {
    expect(manifest.slotContract.codeHashB58).toBe(SLOT_CONTRACT_CODE_HASH_B58);
  });

  it('matches the WASM committed in units/mist-freenet/assets', () => {
    const wasm = readFileSync(path.join(REPO_ROOT, manifest.slotContract.path));
    const sha256 = createHash('sha256').update(wasm).digest('hex');
    expect(sha256).toBe(manifest.slotContract.sha256);
  });

  it('is a different contract from pack, or the slot address is content-addressed again', () => {
    expect(manifest.slotContract.codeHashB58).not.toBe(manifest.packContract.codeHashB58);
    expect(manifest.slotContract.path).not.toBe(manifest.packContract.path);
  });

  it('records where to rebuild it and what built the pinned copy', () => {
    expect(existsSync(path.join(REPO_ROOT, manifest.slotContract.sourceDir, 'Cargo.toml'))).toBe(
      true,
    );
    expect(manifest.slotContract.builtWith.rustc).toMatch(/^\d+\.\d+/);
    expect(manifest.slotContract.builtWith.freenetStdlib).toMatch(/^\d+\.\d+/);
  });
});

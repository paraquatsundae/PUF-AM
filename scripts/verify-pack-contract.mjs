/**
 * Verify the bundled pack-contract WASM against its pinned code hash.
 *
 * Every mist URI is `BLAKE3(code_hash || blake3(blob))`. If the shipped WASM and
 * `PACK_CONTRACT_CODE_HASH_B58` ever disagree, publishes keep succeeding but land
 * at addresses nothing will look up — so this runs before packaging, not after a
 * field report.
 *
 * Two checks, deliberately split by what they need:
 *   1. SHA-256 of the WASM against the manifest — always runs, no tools needed.
 *   2. `fdev inspect <wasm> code` against the manifest code hash — needs `fdev`,
 *      skipped with a warning when it is absent unless `--require-fdev`.
 *
 * Usage: node scripts/verify-pack-contract.mjs [--require-fdev]
 * Plan: `Plans/DESKTOP_FREENET_PLUGIN.md` §7.1, Phase 2.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { accessSync, constants, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(
  readFileSync(path.join(REPO_ROOT, 'scripts', 'freenet-binaries.json'), 'utf8'),
);

const requireFdev = process.argv.slice(2).includes('--require-fdev');

function osTag(platform) {
  if (platform === 'win32') return 'win';
  if (platform === 'darwin') return 'mac';
  return 'linux';
}

function isExecutable(candidate) {
  try {
    accessSync(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Same precedence as the host unit's resolver, minus the Electron resources dir:
 * env override → vendor/ → PATH. Kept as a short list rather than importing the
 * TypeScript unit, which plain `node` cannot load.
 */
function resolveFdev() {
  const fileName = process.platform === 'win32' ? 'fdev.exe' : 'fdev';
  const platformTag = `${osTag(process.platform)}-${process.arch}`;
  const candidates = [
    process.env.PUF_FDEV_BIN?.trim(),
    process.env.FDEV_BIN?.trim(),
    path.join(REPO_ROOT, manifest.vendorDirTemplate.replace('{platformTag}', platformTag), fileName),
    ...(process.env.PATH ?? '')
      .split(process.platform === 'win32' ? ';' : ':')
      .filter(Boolean)
      .map((dir) => path.join(dir, fileName)),
  ].filter(Boolean);

  return candidates.find(isExecutable);
}

const wasmPath = path.join(REPO_ROOT, manifest.packContract.path);
const wasm = readFileSync(wasmPath);
const actualSha = createHash('sha256').update(wasm).digest('hex');

console.log(`pack-contract: ${manifest.packContract.path} (${wasm.length} bytes)`);

if (actualSha !== manifest.packContract.sha256) {
  console.error(
    `\nWASM changed without a manifest bump.\n  expected sha256 ${manifest.packContract.sha256}\n  actual   sha256 ${actualSha}\n` +
      `\nIf this is intentional, re-run \`fdev inspect ${manifest.packContract.path} code\`, update both\n` +
      `scripts/freenet-binaries.json and PACK_CONTRACT_CODE_HASH_B58 in units/mist-freenet/src/freenet02-pack.ts,\n` +
      `and note that previously published URIs will not resolve under the new hash.`,
  );
  process.exit(1);
}
console.log(`  sha256    ${actualSha}  (pinned)`);

const fdev = resolveFdev();
if (!fdev) {
  const message =
    'fdev not found — skipped the code-hash check. Run `npm run desktop:vendor` first, or set PUF_FDEV_BIN.';
  if (requireFdev) {
    console.error(`\n${message}`);
    process.exit(1);
  }
  console.log(`  code hash skipped: ${message}`);
  process.exit(0);
}

const output = execFileSync(fdev, ['inspect', wasmPath, 'code'], { encoding: 'utf8' });
const codeHash = /code hash:\s*(\S+)/.exec(output)?.[1];
if (!codeHash) {
  console.error(`\nCould not parse a code hash out of \`fdev inspect\`:\n${output}`);
  process.exit(1);
}

if (codeHash !== manifest.packContract.codeHashB58) {
  console.error(
    `\nCode hash mismatch — this fdev disagrees with the pin.\n  expected ${manifest.packContract.codeHashB58}\n  actual   ${codeHash}\n` +
      `\nThe WASM matched its checksum, so the likely cause is an fdev from a different release than\n` +
      `${manifest.releaseTag}. Check \`${fdev} --version\` against ${manifest.toolVersions.fdev}.`,
  );
  process.exit(1);
}

console.log(`  code hash ${codeHash}  (pinned, via ${path.relative(REPO_ROOT, fdev) || fdev})`);
console.log('\npack-contract verified.');

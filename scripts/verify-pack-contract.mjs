/**
 * Verify the bundled contract WASMs against their pinned code hashes.
 *
 * Both mist contracts derive their network address from a code hash: a pack URI is
 * `BLAKE3(code_hash || blake3(blob))` and a join slot is
 * `BLAKE3(code_hash || slot_id || farm_key)`. If a shipped WASM and its pinned
 * constant ever disagree, publishes keep succeeding but land at addresses nothing
 * will look up — so this runs before packaging, not after a field report.
 *
 * Two checks per contract, deliberately split by what they need:
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

/**
 * The contracts to check, each with the constant a drift would silently break.
 * `pack` is vendored from freenet-git upstream; `slot` is ours and rebuildable
 * from source in this repo, which is the only difference in how a mismatch is fixed.
 */
const CONTRACTS = [
  {
    label: 'pack-contract',
    pin: manifest.packContract,
    constant: 'PACK_CONTRACT_CODE_HASH_B58 in units/mist-freenet/src/freenet02-pack.ts',
    breakage: 'previously published mist URIs will not resolve under the new hash',
  },
  {
    label: 'slot-contract',
    pin: manifest.slotContract,
    constant: 'SLOT_CONTRACT_CODE_HASH_B58 in units/mist-freenet/src/freenet02-slot.ts',
    breakage:
      'every join slot moves, so short tickets already handed out stop resolving over Freenet',
  },
];

const fdev = resolveFdev();
if (!fdev) {
  const message =
    'fdev not found — skipping every code-hash check. Run `npm run desktop:vendor` first, or set PUF_FDEV_BIN.';
  if (requireFdev) {
    console.error(message);
    process.exit(1);
  }
  console.log(`${message}\n`);
}

let failed = false;

for (const { label, pin, constant, breakage } of CONTRACTS) {
  if (!pin?.path) {
    console.error(`${label}: no pin in scripts/freenet-binaries.json`);
    failed = true;
    continue;
  }

  const wasmPath = path.join(REPO_ROOT, pin.path);
  const wasm = readFileSync(wasmPath);
  const actualSha = createHash('sha256').update(wasm).digest('hex');

  console.log(`${label}: ${pin.path} (${wasm.length} bytes)`);

  if (actualSha !== pin.sha256) {
    console.error(
      `\nWASM changed without a manifest bump.\n  expected sha256 ${pin.sha256}\n  actual   sha256 ${actualSha}\n` +
        `\nIf this is intentional, re-run \`fdev inspect ${pin.path} code\`, update both\n` +
        `scripts/freenet-binaries.json and ${constant},\n` +
        `and note that ${breakage}.`,
    );
    failed = true;
    continue;
  }
  console.log(`  sha256    ${actualSha}  (pinned)`);

  if (!fdev) {
    console.log('  code hash skipped: no fdev');
    continue;
  }

  const output = execFileSync(fdev, ['inspect', wasmPath, 'code'], { encoding: 'utf8' });
  const codeHash = /code hash:\s*(\S+)/.exec(output)?.[1];
  if (!codeHash) {
    console.error(`\nCould not parse a code hash out of \`fdev inspect\`:\n${output}`);
    failed = true;
    continue;
  }

  if (codeHash !== pin.codeHashB58) {
    console.error(
      `\nCode hash mismatch — this fdev disagrees with the pin.\n  expected ${pin.codeHashB58}\n  actual   ${codeHash}\n` +
        `\nThe WASM matched its checksum, so the likely cause is an fdev from a different release than\n` +
        `${manifest.releaseTag}. Check \`${fdev} --version\` against ${manifest.toolVersions.fdev}.`,
    );
    failed = true;
    continue;
  }

  console.log(`  code hash ${codeHash}  (pinned, via ${path.relative(REPO_ROOT, fdev) || fdev})`);
}

if (failed) process.exit(1);
console.log(`\n${CONTRACTS.map((c) => c.label).join(' + ')} verified.`);

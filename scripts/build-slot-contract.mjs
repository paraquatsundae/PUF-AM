/**
 * Rebuild the mist join-slot contract WASM from source in this repo.
 *
 * The vendored artifact is the authority, not this script. A slot's address is
 * `BLAKE3(code_hash || slot_id || farm_key)`, so a rebuild that lands a different
 * code hash moves every slot — and short tickets already read out to joiners stop
 * resolving over Freenet. That is a decision, not a build step, so by default this
 * refuses to overwrite `units/mist-freenet/assets/slot-contract.wasm` when the
 * fresh build disagrees with the pin, and prints what re-pinning would take.
 *
 * Usage:
 *   node scripts/build-slot-contract.mjs                    # verify a rebuild matches the pin
 *   node scripts/build-slot-contract.mjs --accept-new-hash   # vendor a new artifact and re-pin
 *
 * Needs: cargo, `rustup target add wasm32-unknown-unknown`, and fdev on PATH
 * (or PUF_FDEV_BIN / FDEV_BIN). See Plans/MIST_TWO_FEDORA_FREENET.md § Freenet slot contract.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = path.join(REPO_ROOT, 'scripts', 'freenet-binaries.json');
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

const pin = manifest.slotContract;
const acceptNewHash = process.argv.slice(2).includes('--accept-new-hash');

const sourceDir = path.join(REPO_ROOT, pin.sourceDir);
const vendoredPath = path.join(REPO_ROOT, pin.path);
/** `fdev build` names the output after the crate, with hyphens folded to underscores. */
const builtPath = path.join(sourceDir, 'build', 'freenet', 'pufam_slot_contract');

const fdevBin = process.env.PUF_FDEV_BIN?.trim() || process.env.FDEV_BIN?.trim() || 'fdev';

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

console.log(`building ${pin.sourceDir} (release, wasm32-unknown-unknown)`);
try {
  // `--features contract` turns on the freenet-stdlib WASM export shims that
  // `#[contract]` expands into. Without it the macro cannot find them and the
  // build fails before it ever reaches the linker.
  execFileSync(fdevBin, ['build', '--features', 'contract'], {
    cwd: sourceDir,
    stdio: 'inherit',
  });
} catch (err) {
  console.error(
    `\nBuild failed. Check that cargo, the wasm32-unknown-unknown target, and ${fdevBin} are all present:\n` +
      '  rustup target add wasm32-unknown-unknown\n' +
      `  ${fdevBin} --version\n`,
  );
  throw err;
}

const builtSha = sha256(builtPath);
const inspect = execFileSync(fdevBin, ['inspect', builtPath, 'code'], { encoding: 'utf8' });
const builtCodeHash = /code hash:\s*(\S+)/.exec(inspect)?.[1];
if (!builtCodeHash) {
  console.error(`\nCould not parse a code hash out of \`fdev inspect\`:\n${inspect}`);
  process.exit(1);
}

console.log(`\nbuilt     sha256 ${builtSha}`);
console.log(`built  code hash ${builtCodeHash}`);
console.log(`pinned    sha256 ${pin.sha256}`);
console.log(`pinned code hash ${pin.codeHashB58}`);

if (builtCodeHash === pin.codeHashB58 && builtSha === pin.sha256) {
  console.log('\nRebuild matches the pin — the vendored WASM is what this source produces.');
  process.exit(0);
}

if (!acceptNewHash) {
  console.error(
    '\nRebuild does not match the pin, so nothing was written.\n\n' +
      'Either the source changed, or this toolchain differs from the one recorded in\n' +
      `scripts/freenet-binaries.json (rustc ${pin.builtWith.rustc}, freenet-stdlib ${pin.builtWith.freenetStdlib}).\n` +
      'Compare `rustc --version` first — a toolchain bump alone is enough to move the hash.\n\n' +
      'Re-pinning moves every slot address: a joiner holding a ticket minted under the old\n' +
      'hash will look in the wrong place and get nothing. If that is understood, run:\n' +
      '  node scripts/build-slot-contract.mjs --accept-new-hash\n' +
      'then update SLOT_CONTRACT_CODE_HASH_B58 in units/mist-freenet/src/freenet02-slot.ts\n' +
      'and re-mint any ticket still in the field.',
  );
  process.exit(1);
}

copyFileSync(builtPath, vendoredPath);
manifest.slotContract = {
  ...pin,
  sha256: builtSha,
  codeHashB58: builtCodeHash,
  builtWith: {
    ...pin.builtWith,
    rustc: execFileSync('rustc', ['--version'], { encoding: 'utf8' }).trim().split(' ')[1],
    fdev: execFileSync(fdevBin, ['--version'], { encoding: 'utf8' }).trim().split(' ').at(-1),
  },
};
writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  `\nVendored ${pin.path} and re-pinned scripts/freenet-binaries.json.\n\n` +
    'Still to do by hand, because it is the thing that decides slot addresses:\n' +
    `  units/mist-freenet/src/freenet02-slot.ts → SLOT_CONTRACT_CODE_HASH_B58 = '${builtCodeHash}'\n` +
    'Then: npm run desktop:verify:pack && npm test -- units/mist-freenet/freenet02-slot.test.ts',
);

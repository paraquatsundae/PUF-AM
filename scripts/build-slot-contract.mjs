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
 * Needs: cargo and `rustup target add wasm32-unknown-unknown`. Nothing else —
 * since Phase 2 of Plans/FREENET_NETWORK_PACK.md this script does what `fdev build`
 * did around cargo: compile with `--features contract`, then prepend the 40-byte
 * contract package header `[u64 LE api version = 0][32-byte BLAKE3 of the module]`
 * that the pinned artifact (and every other packaged contract) carries. The code
 * hash is the BLAKE3 in that header, which is why it can be printed without a CLI.
 * See Plans/reference/MIST_TWO_FEDORA_FREENET.md § Freenet slot contract.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { blake3 } from '@noble/hashes/blake3.js';
import bs58 from 'bs58';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = path.join(REPO_ROOT, 'scripts', 'freenet-binaries.json');
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

const pin = manifest.slotContract;
const acceptNewHash = process.argv.slice(2).includes('--accept-new-hash');

const sourceDir = path.join(REPO_ROOT, pin.sourceDir);
const vendoredPath = path.join(REPO_ROOT, pin.path);
const TARGET = 'wasm32-unknown-unknown';
/** Contract API version written into the package header; 0 is what the pinned artifacts carry. */
const PACKAGE_API_VERSION = 0n;

/**
 * Where cargo actually wrote the module. Asked rather than assumed: `CARGO_TARGET_DIR`
 * or a `.cargo/config.toml` moves it away from `<crate>/target`, and cargo names the
 * cdylib after the crate with hyphens folded to underscores.
 */
function builtWasmPath() {
  const metadata = JSON.parse(
    execFileSync('cargo', ['metadata', '--format-version', '1', '--no-deps'], {
      cwd: sourceDir,
      encoding: 'utf8',
    }),
  );
  return path.join(metadata.target_directory, TARGET, 'release', 'pufam_slot_contract.wasm');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** `[u64 LE version][32-byte BLAKE3][wasm]` — the shape `unpackContractWasm` strips before a PUT. */
function packageContract(wasm) {
  const codeHash = Buffer.from(blake3(wasm));
  const header = Buffer.alloc(40);
  header.writeBigUInt64LE(PACKAGE_API_VERSION, 0);
  codeHash.copy(header, 8);
  return { bytes: Buffer.concat([header, wasm]), codeHashB58: bs58.encode(codeHash) };
}

console.log(`building ${pin.sourceDir} (release, ${TARGET})`);
try {
  // `--features contract` turns on the freenet-stdlib WASM export shims that
  // `#[contract]` expands into. Without it the macro cannot find them and the
  // build fails before it ever reaches the linker.
  execFileSync(
    'cargo',
    ['build', '--release', '--target', TARGET, '--features', 'contract'],
    { cwd: sourceDir, stdio: 'inherit' },
  );
} catch (err) {
  console.error(
    '\nBuild failed. Check that cargo and the wasm32-unknown-unknown target are present:\n' +
      '  rustup target add wasm32-unknown-unknown\n' +
      '  cargo --version\n',
  );
  throw err;
}

const rawWasmPath = builtWasmPath();
const rawWasm = readFileSync(rawWasmPath);
if (!rawWasm.subarray(0, 4).equals(Buffer.from([0x00, 0x61, 0x73, 0x6d]))) {
  console.error(`\n${rawWasmPath} is not a WASM module.`);
  process.exit(1);
}
const built = packageContract(rawWasm);
const builtSha = sha256(built.bytes);
const builtCodeHash = built.codeHashB58;

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

writeFileSync(vendoredPath, built.bytes);
// `fdev` is dropped from builtWith on a re-pin: this packager, not the CLI, wrote the header.
const { fdev: _historicalFdev, ...builtWith } = pin.builtWith;
manifest.slotContract = {
  ...pin,
  sha256: builtSha,
  codeHashB58: builtCodeHash,
  builtWith: {
    ...builtWith,
    rustc: execFileSync('rustc', ['--version'], { encoding: 'utf8' }).trim().split(' ')[1],
    packager: 'scripts/build-slot-contract.mjs',
  },
};
writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  `\nVendored ${pin.path} and re-pinned scripts/freenet-binaries.json.\n\n` +
    'Still to do by hand, because it is the thing that decides slot addresses:\n' +
    `  units/mist-freenet/src/freenet02-slot.ts → SLOT_CONTRACT_CODE_HASH_B58 = '${builtCodeHash}'\n` +
    'Then: npm run desktop:verify:pack && npm test -- units/mist-freenet/freenet02-slot.test.ts',
);

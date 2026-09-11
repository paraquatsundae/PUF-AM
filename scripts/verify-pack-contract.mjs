/**
 * Verify the bundled contract WASMs against their pinned code hashes.
 *
 * Both mist contracts derive their network address from a code hash: a pack URI is
 * `BLAKE3(code_hash || blake3(blob))` and a join slot is
 * `BLAKE3(code_hash || slot_id || farm_key)`. If a shipped WASM and its pinned
 * constant ever disagree, publishes keep succeeding but land at addresses nothing
 * will look up — so this runs before packaging, not after a field report.
 *
 * Two checks per contract, both hermetic:
 *   1. SHA-256 of the packaged file against the manifest.
 *   2. BLAKE3 of the raw WASM (the 40-byte contract package header stripped, the
 *      same way `unpackContractWasm` in units/mist-freenet does before a PUT)
 *      against the manifest code hash. This is exactly what `fdev inspect … code`
 *      used to print; computing it here is what let Phase 2 of
 *      Plans/FREENET_NETWORK_PACK.md drop the `fdev` CLI from the toolset.
 *
 * Usage: node scripts/verify-pack-contract.mjs
 * Plan: `Plans/reference/DESKTOP_FREENET_PLUGIN.md` §7.1, Phase 2.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { blake3 } from '@noble/hashes/blake3.js';
import bs58 from 'bs58';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(
  readFileSync(path.join(REPO_ROOT, 'scripts', 'freenet-binaries.json'), 'utf8'),
);

const WASM_MAGIC = Buffer.from([0x00, 0x61, 0x73, 0x6d]);
/** `[u64 LE api version][32-byte BLAKE3 of wasm]` precedes the module in a packaged contract. */
const PACKAGE_HEADER_BYTES = 40;

/**
 * Code hash of a contract file, packaged or raw. Mirrors `unpackContractWasm`
 * (units/mist-freenet/src/freenet02-pack-id.ts) — kept as plain JS because this
 * script runs under `node`, which cannot load the TypeScript unit.
 */
function contractCodeHashB58(bytes) {
  if (bytes.subarray(0, 4).equals(WASM_MAGIC)) {
    return { codeHash: bs58.encode(blake3(bytes)), packaged: false };
  }
  if (
    bytes.length > PACKAGE_HEADER_BYTES &&
    bytes.subarray(PACKAGE_HEADER_BYTES, PACKAGE_HEADER_BYTES + 4).equals(WASM_MAGIC)
  ) {
    const wasm = bytes.subarray(PACKAGE_HEADER_BYTES);
    const digest = blake3(wasm);
    // The header carries its own copy of the hash; a disagreement means the
    // package was hand-edited or truncated, not merely re-pinned.
    const headerHash = bytes.subarray(8, PACKAGE_HEADER_BYTES);
    if (!Buffer.from(digest).equals(headerHash)) {
      throw new Error('package header hash does not match BLAKE3 of the module it wraps');
    }
    return { codeHash: bs58.encode(digest), packaged: true };
  }
  throw new Error('not a WASM module or a packaged contract');
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
        `\nIf this is intentional, update both scripts/freenet-binaries.json and ${constant}\n` +
        `to the code hash this script prints, and note that ${breakage}.`,
    );
    failed = true;
    continue;
  }
  console.log(`  sha256    ${actualSha}  (pinned)`);

  let codeHash;
  let packaged;
  try {
    ({ codeHash, packaged } = contractCodeHashB58(wasm));
  } catch (err) {
    console.error(`\n${label}: ${err instanceof Error ? err.message : err}`);
    failed = true;
    continue;
  }

  if (codeHash !== pin.codeHashB58) {
    console.error(
      `\nCode hash mismatch — the file's BLAKE3 disagrees with the pin.\n  expected ${pin.codeHashB58}\n  actual   ${codeHash}\n` +
        `\nThe WASM matched its checksum, so the manifest's codeHashB58 (or ${constant}) is what drifted.`,
    );
    failed = true;
    continue;
  }

  console.log(`  code hash ${codeHash}  (pinned, BLAKE3 of the ${packaged ? 'unwrapped' : 'raw'} module)`);
}

if (failed) process.exit(1);
console.log(`\n${CONTRACTS.map((c) => c.label).join(' + ')} verified.`);

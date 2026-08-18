/**
 * Freenet 0.2 pack-contract helpers — Node disk load + addressing re-exports.
 *
 * Addressing lives in `freenet02-pack-id.ts` so a WebView PUT does not pull
 * `node:fs`. This file still loads the bundled WASM from disk.
 *
 * See: https://github.com/freenet/freenet-git/tree/main/crates/pack-contract
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { blake3Bytes, packContractCodeHashBytes } from './freenet02-pack-id.ts';

export {
  PACK_CONTRACT_CODE_HASH_B58,
  FREENET02_MAX_BLOB_BYTES,
  assertBlobSize,
  blake3Bytes,
  packContractCodeHashBytes,
  packContractInstanceId,
  packInstanceIdBase58,
  packParametersFromBlob,
  unpackContractWasm,
} from './freenet02-pack-id.ts';

/** Workshop default — bundled pack-contract.wasm. */
export const DEFAULT_PACK_CONTRACT_WASM = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../assets/pack-contract.wasm',
);

let cachedWasm: Uint8Array | null = null;
let cachedWasmPath: string | null = null;
let cachedWasmCodeHash: Uint8Array | null = null;

/** @deprecated Use packContractCodeHashBytes — kept for tests comparing blob digests. */
export function wasmCodeHash(wasm: Uint8Array): Uint8Array {
  return blake3Bytes(wasm);
}

export function resolvePackContractWasmPath(): string {
  const fromEnv = process.env.FREENET_PACK_WASM?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return DEFAULT_PACK_CONTRACT_WASM;
}

export async function loadPackContractWasm(): Promise<Uint8Array> {
  const wasmPath = resolvePackContractWasmPath();
  if (cachedWasm && cachedWasmPath === wasmPath) return cachedWasm;
  const buf = await readFile(wasmPath);
  cachedWasm = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  cachedWasmPath = wasmPath;
  cachedWasmCodeHash = packContractCodeHashBytes();
  return cachedWasm;
}

/** BLAKE3-32 of pack-contract WASM bytes (ContractCode.codeHash). */
export async function loadPackContractCodeHash(): Promise<Uint8Array> {
  await loadPackContractWasm();
  if (!cachedWasmCodeHash) throw new Error('pack WASM code hash unavailable');
  return cachedWasmCodeHash;
}

/** Reset cached WASM (tests). */
export function resetPackContractWasmCache(): void {
  cachedWasm = null;
  cachedWasmPath = null;
  cachedWasmCodeHash = null;
}

/**
 * Freenet 0.2 pack-contract helpers — immutable content-addressed blobs.
 *
 * Uses the freenet-git pack contract WASM (parameters = BLAKE3-32 of state).
 * See: https://github.com/freenet/freenet-git/tree/main/crates/pack-contract
 */

import { blake3 } from '@noble/hashes/blake3.js';
import bs58 from 'bs58';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** fdev inspect code hash for bundled pack-contract.wasm (not raw BLAKE3(wasm)). */
export const PACK_CONTRACT_CODE_HASH_B58 = '5Piu7V1PjjcPVnTvUbyMdDiyvwoBprBPZ4GFUHfabyzW';

/** Workshop default — bundled pack-contract.wasm. */
export const DEFAULT_PACK_CONTRACT_WASM = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../assets/pack-contract.wasm',
);

/** KiB single-blob limit for mist workshop (no splitfiles). */
export const FREENET02_MAX_BLOB_BYTES = 64 * 1024;

let cachedWasm: Uint8Array | null = null;
let cachedWasmPath: string | null = null;
let cachedWasmCodeHash: Uint8Array | null = null;

export function blake3Bytes(data: Uint8Array): Uint8Array {
  return blake3(data);
}

/** Freenet ContractCode.codeHash bytes for the bundled pack WASM. */
export function packContractCodeHashBytes(): Uint8Array {
  return bs58.decode(PACK_CONTRACT_CODE_HASH_B58);
}

/** @deprecated Use packContractCodeHashBytes — kept for tests comparing blob digests. */
export function wasmCodeHash(wasm: Uint8Array): Uint8Array {
  return blake3Bytes(wasm);
}

/** Freenet contract instance id: BLAKE3(code_hash || blake3(blob)). */
export function packContractInstanceId(codeHash: Uint8Array, blobHash: Uint8Array): Uint8Array {
  if (codeHash.length !== 32 || blobHash.length !== 32) {
    throw new Error('packContractInstanceId: expected 32-byte hashes');
  }
  const combined = new Uint8Array(64);
  combined.set(codeHash, 0);
  combined.set(blobHash, 32);
  return blake3Bytes(combined);
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

export function assertBlobSize(data: Uint8Array): void {
  if (data.byteLength > FREENET02_MAX_BLOB_BYTES) {
    throw new Error(
      `Freenet 0.2 blob exceeds ${FREENET02_MAX_BLOB_BYTES} bytes (${data.byteLength}) — splitfiles not supported`,
    );
  }
}

export function packParametersFromBlob(data: Uint8Array): Uint8Array {
  assertBlobSize(data);
  const hash = blake3Bytes(data);
  if (hash.length !== 32) throw new Error('BLAKE3 digest must be 32 bytes');
  return hash;
}

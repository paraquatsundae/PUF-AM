/**
 * Pack-contract addressing — browser-safe.
 *
 * `freenet02-pack.ts` loads the WASM from disk (Node). PUT from a WebView only
 * needs the instance id and parameters, plus WASM bytes the caller already has.
 */

import { blake3 } from '@noble/hashes/blake3.js';
import bs58 from 'bs58';

/** fdev inspect code hash for bundled pack-contract.wasm (not raw BLAKE3(wasm)). */
export const PACK_CONTRACT_CODE_HASH_B58 = '5Piu7V1PjjcPVnTvUbyMdDiyvwoBprBPZ4GFUHfabyzW';

/** KiB single-blob limit for mist workshop (no splitfiles). */
export const FREENET02_MAX_BLOB_BYTES = 64 * 1024;

export function blake3Bytes(data: Uint8Array): Uint8Array {
  return blake3(data);
}

/** Freenet ContractCode.codeHash bytes for the bundled pack WASM. */
export function packContractCodeHashBytes(): Uint8Array {
  return bs58.decode(PACK_CONTRACT_CODE_HASH_B58);
}

export function packContractInstanceId(codeHash: Uint8Array, blobHash: Uint8Array): Uint8Array {
  if (codeHash.length !== 32 || blobHash.length !== 32) {
    throw new Error('packContractInstanceId: expected 32-byte hashes');
  }
  const combined = new Uint8Array(64);
  combined.set(codeHash, 0);
  combined.set(blobHash, 32);
  return blake3Bytes(combined);
}

export function assertBlobSize(data: Uint8Array): void {
  if (data.byteLength > FREENET02_MAX_BLOB_BYTES) {
    throw new Error(
      `Freenet 0.2 blob exceeds ${FREENET02_MAX_BLOB_BYTES} bytes (${data.byteLength}) — splitfiles not supported`,
    );
  }
}

const WASM_MAGIC = [0x00, 0x61, 0x73, 0x6d] as const;

function hasWasmMagic(bytes: Uint8Array, offset = 0): boolean {
  return (
    bytes.byteLength >= offset + 4 &&
    bytes[offset] === WASM_MAGIC[0] &&
    bytes[offset + 1] === WASM_MAGIC[1] &&
    bytes[offset + 2] === WASM_MAGIC[2] &&
    bytes[offset + 3] === WASM_MAGIC[3]
  );
}

/**
 * Bytes `fdev` actually ships as `ContractCode.data`.
 *
 * `fdev build` wraps WASM as `[u64 version][32-byte code hash][raw wasm]`.
 * Sending that wrapper as code makes the node hand metadata to wasmtime
 * (`compile: input bytes aren't valid utf-8`). Raw `\0asm` is used as-is.
 */
export function unpackContractWasm(bytes: Uint8Array): {
  wasm: Uint8Array;
  codeHash: Uint8Array;
} {
  if (!bytes.byteLength) {
    throw new Error('pack PUT needs the pack-contract WASM bytes');
  }
  if (hasWasmMagic(bytes, 0)) {
    return { wasm: bytes, codeHash: blake3Bytes(bytes) };
  }
  if (bytes.byteLength > 40 && hasWasmMagic(bytes, 40)) {
    const wasm = bytes.subarray(40);
    return { wasm, codeHash: blake3Bytes(wasm) };
  }
  throw new Error('not a WASM module or fdev-packaged contract');
}

/** Pack-contract parameters = BLAKE3-32 of the state blob. */
export function packParametersFromBlob(data: Uint8Array): Uint8Array {
  assertBlobSize(data);
  const hash = blake3Bytes(data);
  if (hash.length !== 32) throw new Error('BLAKE3 digest must be 32 bytes');
  return hash;
}

export function packInstanceIdBase58(data: Uint8Array): string {
  const blobHash = packParametersFromBlob(data);
  const instanceId = packContractInstanceId(packContractCodeHashBytes(), blobHash);
  return bs58.encode(instanceId);
}

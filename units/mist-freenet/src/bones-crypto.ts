/**
 * Bones contract AEAD wrap (mist-v1).
 *
 * Contract key: HKDF(FarmSeed, salt, info = "freenet-bones") → AES-256-GCM.
 * Envelope shape matches hot-crypto (`{ v, alg, iv, ct }`).
 *
 * @see Plans/MIST_NETWORK_STORAGE.md § Invitation
 */

import { bytesToHex, hexToBytes, hkdfSha256, MIST_HKDF_SALT } from './farm-seed.ts';
import { getSubtleCrypto, hasSubtleCrypto } from './subtle-crypto.ts';
import type { HotCiphertextEnvelope } from './hot-crypto.ts';

export const BONES_CONTRACT_HKDF_INFO = 'freenet-bones';

export type BonesCiphertextEnvelope = HotCiphertextEnvelope;

/** Derive 32-byte AES key for the bones contract from FarmSeed. */
export async function deriveBonesContractKey(farmSeed: Uint8Array): Promise<Uint8Array> {
  return hkdfSha256(farmSeed, MIST_HKDF_SALT, BONES_CONTRACT_HKDF_INFO, 32);
}

function isBonesCiphertextEnvelope(value: unknown): value is BonesCiphertextEnvelope {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return o.v === 1 && o.alg === 'aes-256-gcm' && typeof o.iv === 'string' && typeof o.ct === 'string';
}

function isPlainBonesGeometryJson(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    o.v === 1 &&
    o.kind === 'farm-geometry' &&
    typeof o.farmId === 'string' &&
    Array.isArray(o.blocks)
  );
}

/** AES-GCM encrypt bones JSON bytes; returns envelope JSON as UTF-8 bytes. */
export async function encryptBonesBlob(plaintext: Uint8Array, farmSeed: Uint8Array): Promise<Uint8Array> {
  if (!hasSubtleCrypto()) {
    throw new Error('encryptBonesBlob: Web Crypto unavailable — cannot AEAD-wrap bones blob');
  }

  const keyBytes = await deriveBonesContractKey(farmSeed);
  const subtle = getSubtleCrypto();
  const key = await subtle.importKey('raw', keyBytes, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
  ]);

  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

  const envelope: BonesCiphertextEnvelope = {
    v: 1,
    alg: 'aes-256-gcm',
    iv: bytesToHex(iv),
    ct: bytesToHex(new Uint8Array(ct)),
  };

  return new TextEncoder().encode(JSON.stringify(envelope));
}

/**
 * Decrypt AEAD envelope or pass through plaintext bones geometry JSON bytes.
 */
export async function decryptBonesBlob(ciphertext: Uint8Array, farmSeed: Uint8Array): Promise<Uint8Array> {
  const text = new TextDecoder().decode(ciphertext);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('decryptBonesBlob: not valid JSON');
  }

  if (isPlainBonesGeometryJson(parsed)) {
    return ciphertext;
  }

  if (!isBonesCiphertextEnvelope(parsed)) {
    throw new Error('decryptBonesBlob: unknown bones blob format');
  }

  if (!hasSubtleCrypto()) {
    throw new Error('decryptBonesBlob: Web Crypto unavailable — cannot decrypt bones envelope');
  }

  const keyBytes = await deriveBonesContractKey(farmSeed);
  const subtle = getSubtleCrypto();
  const key = await subtle.importKey('raw', keyBytes, { name: 'AES-GCM', length: 256 }, false, [
    'decrypt',
  ]);

  const iv = hexToBytes(parsed.iv);
  const ct = hexToBytes(parsed.ct);
  const plain = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new Uint8Array(plain);
}

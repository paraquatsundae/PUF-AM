/**
 * Hot contract AEAD wrap (mist-v1).
 *
 * Contract key: HKDF(FarmSeed, salt, info = "freenet-hot") → AES-256-GCM.
 * Stored envelope is JSON `{ v, alg, iv, ct }` (hex fields).
 *
 * Plaintext JSON HotState (no envelope) is accepted on decrypt for seal-hot
 * workshop tests and pre-crypto blobs.
 *
 * @see Plans/MIST_NETWORK_STORAGE.md § Invitation
 */

import { bytesToHex, hexToBytes, hkdfSha256, MIST_HKDF_SALT } from './farm-seed.ts';
import { getSubtleCrypto, hasSubtleCrypto } from './subtle-crypto.ts';

export const HOT_CONTRACT_HKDF_INFO = 'freenet-hot';

export type HotCiphertextEnvelope = {
  v: 1;
  alg: 'aes-256-gcm';
  iv: string;
  ct: string;
};

/** Derive 32-byte AES key for the hot contract from FarmSeed. */
export async function deriveHotContractKey(farmSeed: Uint8Array): Promise<Uint8Array> {
  return hkdfSha256(farmSeed, MIST_HKDF_SALT, HOT_CONTRACT_HKDF_INFO, 32);
}

function isHotCiphertextEnvelope(value: unknown): value is HotCiphertextEnvelope {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return o.v === 1 && o.alg === 'aes-256-gcm' && typeof o.iv === 'string' && typeof o.ct === 'string';
}

function isPlainHotStateJson(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return typeof o.farm_id === 'string' && Array.isArray(o.records);
}

/** AES-GCM encrypt HotState JSON bytes; returns envelope JSON as UTF-8 bytes. */
export async function encryptHotBlob(plaintext: Uint8Array, farmSeed: Uint8Array): Promise<Uint8Array> {
  if (!hasSubtleCrypto()) {
    throw new Error('encryptHotBlob: Web Crypto unavailable — cannot AEAD-wrap hot blob');
  }

  const keyBytes = await deriveHotContractKey(farmSeed);
  const subtle = getSubtleCrypto();
  const key = await subtle.importKey('raw', keyBytes, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
  ]);

  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

  const envelope: HotCiphertextEnvelope = {
    v: 1,
    alg: 'aes-256-gcm',
    iv: bytesToHex(iv),
    ct: bytesToHex(new Uint8Array(ct)),
  };

  return new TextEncoder().encode(JSON.stringify(envelope));
}

/**
 * Decrypt AEAD envelope or pass through plaintext HotState JSON bytes.
 */
export async function decryptHotBlob(ciphertext: Uint8Array, farmSeed: Uint8Array): Promise<Uint8Array> {
  const text = new TextDecoder().decode(ciphertext);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('decryptHotBlob: not valid JSON');
  }

  if (isPlainHotStateJson(parsed)) {
    return ciphertext;
  }

  if (!isHotCiphertextEnvelope(parsed)) {
    throw new Error('decryptHotBlob: unknown hot blob format');
  }

  if (!hasSubtleCrypto()) {
    throw new Error('decryptHotBlob: Web Crypto unavailable — cannot decrypt hot envelope');
  }

  const keyBytes = await deriveHotContractKey(farmSeed);
  const subtle = getSubtleCrypto();
  const key = await subtle.importKey('raw', keyBytes, { name: 'AES-GCM', length: 256 }, false, [
    'decrypt',
  ]);

  const iv = hexToBytes(parsed.iv);
  const ct = hexToBytes(parsed.ct);
  const plain = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new Uint8Array(plain);
}

/**
 * Join-slot manifest AEAD wrap (mist-v1).
 *
 * Slot key: `HKDF(FarmSeed, salt, info = "freenet-join-slot-manifest:" + ticket)`
 * → AES-256-GCM. Envelope shape matches hot-crypto (`{ v, alg, iv, ct }`), which
 * is what lets the Express hub's encrypt-before-upload guard recognise a slot
 * payload as sealed without holding any farm secret.
 *
 * The manifest is only a set of addresses — the farm data it points at is sealed
 * separately — but sealing it anyway means the network stores nothing that says
 * which farm a slot belongs to. Per **ticket** rather than per farm so that
 * revoking a ticket does not hand its old readers a key that still opens the
 * next one.
 *
 * @see Plans/MIST_TWO_FEDORA_FREENET.md § Freenet slot contract
 */

import { bytesToHex, hexToBytes, hkdfSha256, MIST_HKDF_SALT } from './farm-seed.ts';
import { getSubtleCrypto, hasSubtleCrypto } from './subtle-crypto.ts';
import type { HotCiphertextEnvelope } from './hot-crypto.ts';

/** The canonical `PUF-XXXX-XXXX` ticket is appended to this. */
export const JOIN_SLOT_MANIFEST_HKDF_INFO_PREFIX = 'freenet-join-slot-manifest:';

export type JoinSlotCiphertextEnvelope = HotCiphertextEnvelope;

export async function deriveJoinSlotManifestKey(
  farmSeed: Uint8Array,
  canonicalTicket: string,
): Promise<Uint8Array> {
  if (!canonicalTicket.trim()) {
    throw new Error('deriveJoinSlotManifestKey: a canonical join ticket is required');
  }
  return hkdfSha256(
    farmSeed,
    MIST_HKDF_SALT,
    `${JOIN_SLOT_MANIFEST_HKDF_INFO_PREFIX}${canonicalTicket}`,
    32,
  );
}

function isJoinSlotEnvelope(value: unknown): value is JoinSlotCiphertextEnvelope {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    o.v === 1 && o.alg === 'aes-256-gcm' && typeof o.iv === 'string' && typeof o.ct === 'string'
  );
}

/** AES-GCM seal manifest JSON bytes; returns envelope JSON as UTF-8 bytes. */
export async function encryptJoinSlotManifest(
  plaintext: Uint8Array,
  farmSeed: Uint8Array,
  canonicalTicket: string,
): Promise<Uint8Array> {
  if (!hasSubtleCrypto()) {
    throw new Error('encryptJoinSlotManifest: Web Crypto unavailable — cannot seal the slot payload');
  }

  const keyBytes = await deriveJoinSlotManifestKey(farmSeed, canonicalTicket);
  const subtle = getSubtleCrypto();
  const key = await subtle.importKey('raw', keyBytes, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
  ]);

  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

  const envelope: JoinSlotCiphertextEnvelope = {
    v: 1,
    alg: 'aes-256-gcm',
    iv: bytesToHex(iv),
    ct: bytesToHex(new Uint8Array(ct)),
  };

  return new TextEncoder().encode(JSON.stringify(envelope));
}

/**
 * Open a slot payload.
 *
 * No plaintext passthrough, unlike hot and bones: those had to keep reading blobs
 * written before mist encrypted anything, whereas a slot has never held plaintext
 * and accepting some would mean accepting a manifest nobody signed for.
 */
export async function decryptJoinSlotManifest(
  ciphertext: Uint8Array,
  farmSeed: Uint8Array,
  canonicalTicket: string,
): Promise<Uint8Array> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(ciphertext));
  } catch {
    throw new Error('decryptJoinSlotManifest: slot payload is not valid JSON');
  }

  if (!isJoinSlotEnvelope(parsed)) {
    throw new Error('decryptJoinSlotManifest: slot payload is not a mist AEAD envelope');
  }

  if (!hasSubtleCrypto()) {
    throw new Error('decryptJoinSlotManifest: Web Crypto unavailable — cannot open the slot payload');
  }

  const keyBytes = await deriveJoinSlotManifestKey(farmSeed, canonicalTicket);
  const subtle = getSubtleCrypto();
  const key = await subtle.importKey('raw', keyBytes, { name: 'AES-GCM', length: 256 }, false, [
    'decrypt',
  ]);

  const plain = await subtle.decrypt(
    { name: 'AES-GCM', iv: hexToBytes(parsed.iv) },
    key,
    hexToBytes(parsed.ct),
  );
  return new Uint8Array(plain);
}

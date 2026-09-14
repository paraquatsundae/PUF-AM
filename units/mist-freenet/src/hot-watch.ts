/**
 * Farm-wide Hot watch ping — a small mutable slot crew can find with HotKey.
 *
 * Pack-contract Hot PUTs mint a new FN02 URI each time. Join tickets point at a
 * snapshot, so a later highlight never arrives unless something stable names the
 * new URI. This slot is that pointer: generation + hashes + current Hot URI
 * (and optional Bones URI after a geometry PUT). Addressed and sealed from
 * HotKey (never FarmSeed) so a crew device can ping it.
 *
 * Freenet 0.2.135 has no usable subscribe on the host plugin; clients poll.
 *
 * @see Plans/FREENET_OPERATOR_FLOW.md §9.2 Decision 2026-09-12 (auto watch)
 */

import { ed25519 } from '@noble/curves/ed25519.js';
import bs58 from './bs58.ts';

import { bytesToHex, hexToBytes, hkdfSha256, MIST_HKDF_SALT } from './farm-seed.ts';
import {
  JOIN_SLOT_ID_BYTES,
  JoinSlotStateError,
  joinSlotInstanceId,
  joinSlotParameters,
  slotContractCodeHashBytes,
  type JoinSlotAddress,
} from './freenet02-slot.ts';
import { encodeFreenet02Uri } from './freenet02-uri.ts';
import type { HotCiphertextEnvelope } from './hot-crypto.ts';
import { getSubtleCrypto, hasSubtleCrypto } from './subtle-crypto.ts';

export const HOT_WATCH_SLOT_HKDF_INFO = 'freenet-hot-watch-slot';
export const HOT_WATCH_SLOT_SIGN_HKDF_INFO = 'freenet-hot-watch-slot-key';
export const HOT_WATCH_ENVELOPE_HKDF_INFO = 'freenet-hot-watch-envelope';

const FARMSEED_KEYS = ['farmSeed', 'farmSeedHex', 'farmCode', 'FarmSeed', 'FarmCode'];

export type HotWatchPing = {
  v: 1;
  kind: 'hot-watch';
  farmId: string;
  generation: number;
  hotUri: string;
  hotContentHash: string;
  updatedAt: string;
  /** Optional — same slot also pings Bones so one poll sees paddock edits. */
  bonesUri?: string;
  bonesContentHash?: string;
  /** Optional — photo index CHK; fetch photos only when this hash changes. */
  photoIndexUri?: string;
  photoIndexHash?: string;
};

export class HotWatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HotWatchError';
  }
}

export function assertNoFarmSeedInHotWatch(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  const o = value as Record<string, unknown>;
  for (const key of FARMSEED_KEYS) {
    if (o[key] != null && o[key] !== '') {
      throw new HotWatchError('Hot watch ping must not carry FarmSeed or a FarmCode');
    }
  }
}

export async function deriveHotWatchSlotId(hotKey: Uint8Array): Promise<Uint8Array> {
  return hkdfSha256(hotKey, MIST_HKDF_SALT, HOT_WATCH_SLOT_HKDF_INFO, JOIN_SLOT_ID_BYTES);
}

export async function deriveHotWatchSigningSeed(hotKey: Uint8Array): Promise<Uint8Array> {
  return hkdfSha256(hotKey, MIST_HKDF_SALT, HOT_WATCH_SLOT_SIGN_HKDF_INFO, 32);
}

export async function deriveHotWatchEnvelopeKey(hotKey: Uint8Array): Promise<Uint8Array> {
  return hkdfSha256(hotKey, MIST_HKDF_SALT, HOT_WATCH_ENVELOPE_HKDF_INFO, 32);
}

export async function deriveHotWatchSlotAddress(
  hotKey: Uint8Array,
  options?: { codeHash?: Uint8Array },
): Promise<JoinSlotAddress> {
  if (hotKey.byteLength !== 32) {
    throw new HotWatchError('Hot watch slot needs a 32-byte HotKey');
  }
  const slotId = await deriveHotWatchSlotId(hotKey);
  const signingSeed = await deriveHotWatchSigningSeed(hotKey);
  const verifyingKey = ed25519.getPublicKey(signingSeed);
  const parameters = joinSlotParameters(slotId, verifyingKey);
  const instanceId = joinSlotInstanceId(options?.codeHash ?? slotContractCodeHashBytes(), parameters);
  const instanceIdBase58 = bs58.encode(instanceId);

  return {
    slotId,
    verifyingKey,
    parameters,
    instanceId,
    instanceIdBase58,
    uri: encodeFreenet02Uri(instanceIdBase58),
  };
}

function isAeadEnvelope(value: unknown): value is HotCiphertextEnvelope {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return o.v === 1 && o.alg === 'aes-256-gcm' && typeof o.iv === 'string' && typeof o.ct === 'string';
}

async function aesGcmSeal(plaintext: Uint8Array, keyBytes: Uint8Array): Promise<Uint8Array> {
  if (!hasSubtleCrypto()) {
    throw new HotWatchError('Web Crypto unavailable — cannot seal the Hot watch ping');
  }
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

async function aesGcmOpen(ciphertext: Uint8Array, keyBytes: Uint8Array): Promise<Uint8Array> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(ciphertext));
  } catch {
    throw new HotWatchError('Hot watch payload is not valid JSON');
  }
  if (!isAeadEnvelope(parsed)) {
    throw new HotWatchError('Hot watch payload is not a mist AEAD envelope');
  }
  if (!hasSubtleCrypto()) {
    throw new HotWatchError('Web Crypto unavailable — cannot open the Hot watch ping');
  }
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

export function parseHotWatchPing(value: unknown): HotWatchPing | null {
  if (!value || typeof value !== 'object') return null;
  try {
    assertNoFarmSeedInHotWatch(value);
  } catch {
    return null;
  }
  const o = value as Record<string, unknown>;
  if (o.v !== 1 || o.kind !== 'hot-watch') return null;
  const farmId = typeof o.farmId === 'string' ? o.farmId.trim() : '';
  const hotUri = typeof o.hotUri === 'string' ? o.hotUri.trim() : '';
  const hotContentHash = typeof o.hotContentHash === 'string' ? o.hotContentHash.trim() : '';
  const updatedAt = typeof o.updatedAt === 'string' ? o.updatedAt.trim() : '';
  const generation = typeof o.generation === 'number' && Number.isFinite(o.generation) ? o.generation : NaN;
  if (!farmId || !hotUri || !hotContentHash || !updatedAt || !Number.isFinite(generation)) return null;
  if (hotContentHash.length !== 64) return null;

  const bonesUri = typeof o.bonesUri === 'string' ? o.bonesUri.trim() : '';
  const bonesContentHash =
    typeof o.bonesContentHash === 'string' ? o.bonesContentHash.trim() : '';
  if (bonesContentHash && bonesContentHash.length !== 64) return null;
  if ((bonesUri && !bonesContentHash) || (bonesContentHash && !bonesUri)) return null;

  const photoIndexUri = typeof o.photoIndexUri === 'string' ? o.photoIndexUri.trim() : '';
  const photoIndexHash = typeof o.photoIndexHash === 'string' ? o.photoIndexHash.trim() : '';
  if (photoIndexHash && photoIndexHash.length !== 64) return null;
  if ((photoIndexUri && !photoIndexHash) || (photoIndexHash && !photoIndexUri)) return null;

  return {
    v: 1,
    kind: 'hot-watch',
    farmId,
    generation,
    hotUri,
    hotContentHash,
    updatedAt,
    ...(bonesUri && bonesContentHash ? { bonesUri, bonesContentHash } : {}),
    ...(photoIndexUri && photoIndexHash ? { photoIndexUri, photoIndexHash } : {}),
  };
}

export type HotWatchChangeCursor = {
  generation: number;
  hotContentHash: string;
  /** Last applied Hot CHK — Send mints a new URI even when the hash is slow to move. */
  hotUri?: string;
  bonesContentHash?: string;
  /** Last applied Bones CHK — pack PUT mints a new URI each time. */
  bonesUri?: string;
  photoIndexHash?: string;
};

export function hotWatchPingChanged(
  local: HotWatchChangeCursor | null,
  remote: Pick<HotWatchPing, 'generation' | 'hotContentHash'> & {
    hotUri?: string;
    bonesUri?: string;
    bonesContentHash?: string;
    photoIndexHash?: string;
  },
): boolean {
  if (!local) return true;
  const hashChanged = remote.hotContentHash !== local.hotContentHash;
  const uriChanged = Boolean(remote.hotUri && local.hotUri && remote.hotUri !== local.hotUri);
  const hotChanged = hashChanged || uriChanged;
  const bonesHashChanged =
    Boolean(remote.bonesContentHash) &&
    remote.bonesContentHash !== (local.bonesContentHash ?? '');
  const bonesUriChanged =
    Boolean(remote.bonesUri && local.bonesUri && remote.bonesUri !== local.bonesUri);
  const bonesChanged = bonesHashChanged || bonesUriChanged;
  const photoChanged =
    Boolean(remote.photoIndexHash) &&
    remote.photoIndexHash !== (local.photoIndexHash ?? '');
  if (!hotChanged && !bonesChanged && !photoChanged) return false;
  return true;
}

export async function wrapHotWatchPing(ping: HotWatchPing, hotKey: Uint8Array): Promise<Uint8Array> {
  assertNoFarmSeedInHotWatch(ping);
  if (parseHotWatchPing(ping) == null) {
    throw new HotWatchError('Hot watch ping is not valid');
  }
  const key = await deriveHotWatchEnvelopeKey(hotKey);
  return aesGcmSeal(new TextEncoder().encode(JSON.stringify(ping)), key);
}

export async function unwrapHotWatchPing(
  ciphertext: Uint8Array,
  hotKey: Uint8Array,
): Promise<HotWatchPing> {
  const key = await deriveHotWatchEnvelopeKey(hotKey);
  const plain = await aesGcmOpen(ciphertext, key);
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(plain));
  } catch {
    throw new HotWatchError('Opened Hot watch ping is not valid JSON');
  }
  assertNoFarmSeedInHotWatch(parsed);
  const ping = parseHotWatchPing(parsed);
  if (!ping) {
    throw new HotWatchError('Opened Hot watch ping is not a hot-watch envelope');
  }
  return ping;
}

export { JoinSlotStateError };

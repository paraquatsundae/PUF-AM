/**
 * Crew join envelope — InviteToken locates a public slot wrapping Hot/Bones only.
 *
 * Slot address and wrap key are derived from the InviteToken, not FarmSeed, so a
 * joiner never needs the paper FarmCode. The envelope must not carry FarmSeed.
 * A short 40-bit `PUF-` ticket is refused: it is too small to be this locator.
 *
 * @see Plans/FREENET_NETWORK_PACK.md Decision — 2026-09-12
 */

import { ed25519 } from '@noble/curves/ed25519.js';
import bs58 from './bs58.ts';

import { inviteTokenBytes, isInviteToken, normalizeInviteToken } from './invite-token.ts';
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
import { getSubtleCrypto, hasSubtleCrypto } from './subtle-crypto.ts';
import type { HotCiphertextEnvelope } from './hot-crypto.ts';

export const CREW_JOIN_SLOT_HKDF_INFO = 'freenet-crew-join-slot';
export const CREW_JOIN_SLOT_SIGN_HKDF_INFO = 'freenet-crew-join-slot-key';
export const CREW_JOIN_ENVELOPE_HKDF_INFO = 'freenet-crew-join-envelope';

const FARMSEED_KEYS = ['farmSeed', 'farmSeedHex', 'farmCode', 'FarmSeed', 'FarmCode'];

type CrewJoinRole = 'owner' | 'admin' | 'farmer' | 'viewer';

export type CrewJoinEnvelope = {
  v: 3;
  kind: 'crew-join';
  farmId: string;
  hotUri: string;
  bonesUri: string;
  hotKeyHex: string;
  bonesKeyHex: string;
  role: CrewJoinRole;
  ticket: string;
  permissions?: Record<string, boolean | number | string>;
  expires?: string;
  hotContentHash?: string;
  bonesContentHash?: string;
  cloudFarmId?: string;
};

export class CrewJoinError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrewJoinError';
  }
}

function requireInviteToken(raw: string): string {
  const canonical = normalizeInviteToken(raw);
  if (!canonical) {
    throw new CrewJoinError(
      'That short ticket cannot open the farm. Ask the owner for a crew invite (PUF- and 26 letters).',
    );
  }
  return canonical;
}

export function assertNoFarmSeedInEnvelope(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  const o = value as Record<string, unknown>;
  for (const key of FARMSEED_KEYS) {
    if (o[key] != null && o[key] !== '') {
      throw new CrewJoinError('Crew join envelope must not carry FarmSeed or a FarmCode');
    }
  }
}

export function inviteTokenCannotUnwrapFarmSeed(_raw: string): true {
  return true;
}

export async function deriveCrewJoinSlotId(canonicalInvite: string): Promise<Uint8Array> {
  const token = requireInviteToken(canonicalInvite);
  return hkdfSha256(inviteTokenBytes(token), MIST_HKDF_SALT, CREW_JOIN_SLOT_HKDF_INFO, JOIN_SLOT_ID_BYTES);
}

export async function deriveCrewJoinSigningSeed(canonicalInvite: string): Promise<Uint8Array> {
  const token = requireInviteToken(canonicalInvite);
  return hkdfSha256(inviteTokenBytes(token), MIST_HKDF_SALT, CREW_JOIN_SLOT_SIGN_HKDF_INFO, 32);
}

export async function deriveCrewJoinEnvelopeKey(canonicalInvite: string): Promise<Uint8Array> {
  const token = requireInviteToken(canonicalInvite);
  return hkdfSha256(inviteTokenBytes(token), MIST_HKDF_SALT, CREW_JOIN_ENVELOPE_HKDF_INFO, 32);
}

export async function deriveCrewJoinSlotAddress(
  canonicalInvite: string,
  options?: { codeHash?: Uint8Array },
): Promise<JoinSlotAddress> {
  const token = requireInviteToken(canonicalInvite);
  const slotId = await deriveCrewJoinSlotId(token);
  const signingSeed = await deriveCrewJoinSigningSeed(token);
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
    throw new CrewJoinError('Web Crypto unavailable — cannot seal the crew invite');
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
    throw new CrewJoinError('Crew invite payload is not valid JSON');
  }
  if (!isAeadEnvelope(parsed)) {
    throw new CrewJoinError('Crew invite payload is not a mist AEAD envelope');
  }
  if (!hasSubtleCrypto()) {
    throw new CrewJoinError('Web Crypto unavailable — cannot open the crew invite');
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

export function parseCrewJoinEnvelope(value: unknown): CrewJoinEnvelope | null {
  if (!value || typeof value !== 'object') return null;
  try {
    assertNoFarmSeedInEnvelope(value);
  } catch {
    return null;
  }
  const o = value as Record<string, unknown>;
  if (o.v !== 3 || o.kind !== 'crew-join') return null;
  const ticket = typeof o.ticket === 'string' ? normalizeInviteToken(o.ticket) : null;
  const farmId = typeof o.farmId === 'string' ? o.farmId.trim() : '';
  const hotUri = typeof o.hotUri === 'string' ? o.hotUri.trim() : '';
  const bonesUri = typeof o.bonesUri === 'string' ? o.bonesUri.trim() : '';
  const hotKeyHex = typeof o.hotKeyHex === 'string' ? o.hotKeyHex.trim() : '';
  const bonesKeyHex = typeof o.bonesKeyHex === 'string' ? o.bonesKeyHex.trim() : '';
  const role = o.role;
  if (!ticket || !farmId || !hotUri || !bonesUri || !hotKeyHex || !bonesKeyHex) return null;
  if (hotKeyHex.length !== 64 || bonesKeyHex.length !== 64) return null;
  if (role !== 'owner' && role !== 'admin' && role !== 'farmer' && role !== 'viewer') return null;
  if (!isInviteToken(ticket)) return null;

  const permissions =
    o.permissions && typeof o.permissions === 'object' && !Array.isArray(o.permissions)
      ? (o.permissions as Record<string, boolean | number | string>)
      : undefined;

  return {
    v: 3,
    kind: 'crew-join',
    farmId,
    hotUri,
    bonesUri,
    hotKeyHex,
    bonesKeyHex,
    role,
    ticket,
    ...(permissions ? { permissions } : {}),
    ...(typeof o.expires === 'string' ? { expires: o.expires } : {}),
    ...(typeof o.hotContentHash === 'string' ? { hotContentHash: o.hotContentHash.trim() } : {}),
    ...(typeof o.bonesContentHash === 'string' ? { bonesContentHash: o.bonesContentHash.trim() } : {}),
    ...(typeof o.cloudFarmId === 'string' && o.cloudFarmId.trim()
      ? { cloudFarmId: o.cloudFarmId.trim().slice(0, 128) }
      : {}),
  };
}

export async function wrapCrewJoinEnvelope(
  envelope: CrewJoinEnvelope,
  canonicalInvite: string,
): Promise<Uint8Array> {
  const token = requireInviteToken(canonicalInvite);
  assertNoFarmSeedInEnvelope(envelope);
  if (envelope.ticket !== token) {
    throw new CrewJoinError('Crew envelope ticket does not match the InviteToken');
  }
  const key = await deriveCrewJoinEnvelopeKey(token);
  return aesGcmSeal(new TextEncoder().encode(JSON.stringify(envelope)), key);
}

export async function unwrapCrewJoinEnvelope(
  ciphertext: Uint8Array,
  rawInvite: string,
): Promise<CrewJoinEnvelope> {
  const token = requireInviteToken(rawInvite);
  const key = await deriveCrewJoinEnvelopeKey(token);
  const plain = await aesGcmOpen(ciphertext, key);
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(plain));
  } catch {
    throw new CrewJoinError('Opened crew invite is not valid JSON');
  }
  assertNoFarmSeedInEnvelope(parsed);
  const envelope = parseCrewJoinEnvelope(parsed);
  if (!envelope) {
    throw new CrewJoinError('Opened crew invite is not a crew-join envelope');
  }
  if (envelope.ticket !== token) {
    throw new CrewJoinError('Crew invite opened, but it is for a different token');
  }
  return envelope;
}

export { JoinSlotStateError };

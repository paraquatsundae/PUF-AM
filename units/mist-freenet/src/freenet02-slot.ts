/**
 * Freenet 0.2 **join slot** addressing — the half of a short ticket that needs no Wi‑Fi.
 *
 * The pack contract sets `parameters = blake3(state)`, which makes its address a
 * function of its content. A joiner holding only `PUF-K7M2-9Q4X` cannot compute
 * that address, because it depends on the manifest bytes it is trying to fetch.
 * The slot contract breaks the circle by taking a **derived slot id** as
 * `parameters` instead, so both machines can compute the same address from things
 * they already hold:
 *
 * ```text
 * slot_id     = HKDF(FarmSeed, "freenet-join-slot:PUF-K7M2-9Q4X")   32 bytes
 * signing key = HKDF(FarmSeed, "freenet-join-slot-key")             32-byte ed25519 seed
 * parameters  = slot_id ‖ ed25519 public key                        64 bytes
 * instance id = BLAKE3(code_hash ‖ parameters)                      32 bytes
 * URI         = FN02@<base58 instance id>
 * ```
 *
 * Two consequences worth being explicit about:
 *
 * - **The ticket alone is not enough.** A slot address needs the FarmSeed too, so
 *   a ticket overheard on its own reveals nothing to look up, and the network
 *   never sees a value derived from the ticket in the clear.
 * - **The signing key is per farm, not per ticket.** It has to be, because it goes
 *   in `parameters` and the joiner must derive the same one. That is why the slot
 *   id is inside the signature (see `encodeJoinSlotState`): without it, a state
 *   signed for one ticket would verify in another ticket's slot.
 *
 * Browser-safe on purpose — the joiner runs this in the page, and the owner signs
 * here too so the FarmSeed never reaches the Express hub. Loading the WASM and
 * talking to `fdev` are Node-only and live in `freenet02-fdev-slot.ts`.
 *
 * @see Plans/MIST_TWO_FEDORA_FREENET.md § Freenet slot contract
 * @see units/mist-freenet/contracts/slot-contract/src/lib.rs — the other half of this format
 */

import { blake3 } from '@noble/hashes/blake3.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import bs58 from 'bs58';

import { hkdfSha256, MIST_HKDF_SALT } from './farm-seed.ts';
import { encodeFreenet02Uri } from './freenet02-uri.ts';

/**
 * `fdev inspect` code hash of the bundled `assets/slot-contract.wasm`.
 *
 * This is load-bearing arithmetic, not metadata: every slot address is
 * `BLAKE3(code_hash ‖ parameters)`. If it drifts from the shipped WASM, publishes
 * still succeed and land where nothing looks. Pinned alongside the artifact's
 * SHA-256 in `scripts/freenet-binaries.json` and checked by
 * `npm run desktop:verify:pack`.
 */
export const SLOT_CONTRACT_CODE_HASH_B58 = 'CVjp8X31NURDpzD5CtbgN7hUKCvNXMaHHtGastgjeieq';

/** HKDF info prefix for the per-ticket slot id. The canonical ticket is appended. */
export const JOIN_SLOT_ID_HKDF_INFO_PREFIX = 'freenet-join-slot:';

/** HKDF info for the farm's ed25519 signing seed. Per farm — see the module note. */
export const JOIN_SLOT_SIGNING_KEY_HKDF_INFO = 'freenet-join-slot-key';

/** `PUFSLOT1` — the state magic, shared with the Rust contract. */
export const JOIN_SLOT_MAGIC = new Uint8Array([0x50, 0x55, 0x46, 0x53, 0x4c, 0x4f, 0x54, 0x31]);

/** Domain separator for the signature, shared with the Rust contract. */
const JOIN_SLOT_SIGNING_DOMAIN = new TextEncoder().encode('pufam-join-slot-v1');

export const JOIN_SLOT_ID_BYTES = 32;
export const JOIN_SLOT_VERIFYING_KEY_BYTES = 32;
export const JOIN_SLOT_PARAMETERS_BYTES = JOIN_SLOT_ID_BYTES + JOIN_SLOT_VERIFYING_KEY_BYTES;
const JOIN_SLOT_SIGNATURE_BYTES = 64;
/** magic(8) + seq(8) + payload_len(4) + signature(64) */
export const JOIN_SLOT_HEADER_BYTES = 8 + 8 + 4 + JOIN_SLOT_SIGNATURE_BYTES;

/** Mirrors `MAX_PAYLOAD_LEN` in the contract — a state past this is refused on the network. */
export const JOIN_SLOT_MAX_PAYLOAD_BYTES = 16 * 1024;

export class JoinSlotStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JoinSlotStateError';
  }
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, part) => n + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** Contract code hash bytes for the bundled slot WASM. */
export function slotContractCodeHashBytes(): Uint8Array {
  return bs58.decode(SLOT_CONTRACT_CODE_HASH_B58);
}

/**
 * `HKDF(FarmSeed, "freenet-join-slot:" + ticket)`.
 *
 * The **canonical** ticket goes into the info string, so `puf k7m2 9q4x` and
 * `PUF-K7M2-9Q4X` derive the same slot. Callers normalize first — this module
 * cannot, without importing the app's ticket format into the unit.
 */
export async function deriveJoinSlotId(
  farmSeed: Uint8Array,
  canonicalTicket: string,
): Promise<Uint8Array> {
  if (!canonicalTicket.trim()) {
    throw new JoinSlotStateError('deriveJoinSlotId: a canonical join ticket is required');
  }
  return hkdfSha256(
    farmSeed,
    MIST_HKDF_SALT,
    `${JOIN_SLOT_ID_HKDF_INFO_PREFIX}${canonicalTicket}`,
    JOIN_SLOT_ID_BYTES,
  );
}

/** 32-byte ed25519 seed for the farm's slot signing key. Never leaves the device. */
export async function deriveJoinSlotSigningSeed(farmSeed: Uint8Array): Promise<Uint8Array> {
  return hkdfSha256(farmSeed, MIST_HKDF_SALT, JOIN_SLOT_SIGNING_KEY_HKDF_INFO, 32);
}

/** The public half, which is what actually goes on the network. */
export async function deriveJoinSlotVerifyingKey(farmSeed: Uint8Array): Promise<Uint8Array> {
  return ed25519.getPublicKey(await deriveJoinSlotSigningSeed(farmSeed));
}

export function joinSlotParameters(slotId: Uint8Array, verifyingKey: Uint8Array): Uint8Array {
  if (slotId.length !== JOIN_SLOT_ID_BYTES) {
    throw new JoinSlotStateError(`joinSlotParameters: slot id must be ${JOIN_SLOT_ID_BYTES} bytes`);
  }
  if (verifyingKey.length !== JOIN_SLOT_VERIFYING_KEY_BYTES) {
    throw new JoinSlotStateError(
      `joinSlotParameters: verifying key must be ${JOIN_SLOT_VERIFYING_KEY_BYTES} bytes`,
    );
  }
  return concatBytes(slotId, verifyingKey);
}

/** `BLAKE3(code_hash ‖ parameters)` — the same arithmetic freenet-stdlib does. */
export function joinSlotInstanceId(codeHash: Uint8Array, parameters: Uint8Array): Uint8Array {
  if (codeHash.length !== 32) {
    throw new JoinSlotStateError('joinSlotInstanceId: code hash must be 32 bytes');
  }
  return blake3(concatBytes(codeHash, parameters));
}

export type JoinSlotAddress = {
  slotId: Uint8Array;
  verifyingKey: Uint8Array;
  /** What `fdev execute put --parameters` is handed. */
  parameters: Uint8Array;
  instanceId: Uint8Array;
  instanceIdBase58: string;
  /** `FN02@…` — the same shape as a pack blob, so existing GET plumbing works. */
  uri: string;
};

/**
 * Everything needed to address one farm's slot for one ticket.
 *
 * Both sides call exactly this: the owner before publishing, the joiner before
 * fetching. If they ever disagree it is a derivation bug, not a network problem,
 * which is the point of having one function rather than two call sites.
 */
export async function deriveJoinSlotAddress(
  farmSeed: Uint8Array,
  canonicalTicket: string,
  options?: { codeHash?: Uint8Array },
): Promise<JoinSlotAddress> {
  const slotId = await deriveJoinSlotId(farmSeed, canonicalTicket);
  const verifyingKey = await deriveJoinSlotVerifyingKey(farmSeed);
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

function signingMessage(slotId: Uint8Array, seq: bigint, payload: Uint8Array): Uint8Array {
  const seqBytes = new Uint8Array(8);
  new DataView(seqBytes.buffer).setBigUint64(0, seq, true);
  return concatBytes(JOIN_SLOT_SIGNING_DOMAIN, slotId, seqBytes, payload);
}

/**
 * A sequence number the contract will accept as newer than the last publish.
 *
 * Wall-clock milliseconds. The contract only compares, so any monotonic source
 * works; the clock is chosen because a re-publish after reinstalling the app has
 * no local counter to read, and a farm that loses its slot to a reset counter is
 * worse than one whose clock is a few seconds out.
 */
export function joinSlotSequence(now: number = Date.now()): bigint {
  return BigInt(Math.max(1, Math.floor(now)));
}

export type EncodeJoinSlotStateInput = {
  slotId: Uint8Array;
  /** 32-byte ed25519 seed from `deriveJoinSlotSigningSeed`. */
  signingSeed: Uint8Array;
  seq: bigint;
  /** AEAD-sealed manifest. Opaque to the contract and to this function. */
  payload: Uint8Array;
};

/** Build the signed slot state the contract validates. Mirrors `slot_state` in its tests. */
export function encodeJoinSlotState(input: EncodeJoinSlotStateInput): Uint8Array {
  const { slotId, signingSeed, seq, payload } = input;
  if (slotId.length !== JOIN_SLOT_ID_BYTES) {
    throw new JoinSlotStateError(`encodeJoinSlotState: slot id must be ${JOIN_SLOT_ID_BYTES} bytes`);
  }
  if (payload.length > JOIN_SLOT_MAX_PAYLOAD_BYTES) {
    throw new JoinSlotStateError(
      `encodeJoinSlotState: payload is ${payload.length} bytes, over the ${JOIN_SLOT_MAX_PAYLOAD_BYTES}-byte slot ceiling`,
    );
  }

  const signature = ed25519.sign(signingMessage(slotId, seq, payload), signingSeed);

  const header = new Uint8Array(JOIN_SLOT_HEADER_BYTES);
  header.set(JOIN_SLOT_MAGIC, 0);
  const view = new DataView(header.buffer);
  view.setBigUint64(8, seq, true);
  view.setUint32(16, payload.length, true);
  header.set(signature, 20);

  return concatBytes(header, payload);
}

export type DecodedJoinSlotState = {
  seq: bigint;
  payload: Uint8Array;
};

/**
 * Parse and verify a slot state read off the network.
 *
 * The contract already refuses to store an unsigned state, but a joiner must not
 * take that on trust: the bytes arrive from whichever peer answered, and a peer
 * that skipped validation is exactly the case this check is for.
 */
export function decodeJoinSlotState(
  state: Uint8Array,
  expect: { slotId: Uint8Array; verifyingKey: Uint8Array },
): DecodedJoinSlotState {
  if (state.length < JOIN_SLOT_HEADER_BYTES) {
    throw new JoinSlotStateError(
      `decodeJoinSlotState: ${state.length} bytes is too short to be a slot state`,
    );
  }
  if (!equalBytes(state.subarray(0, 8), JOIN_SLOT_MAGIC)) {
    throw new JoinSlotStateError('decodeJoinSlotState: not a PUFSLOT1 state');
  }

  const view = new DataView(state.buffer, state.byteOffset, state.byteLength);
  const seq = view.getBigUint64(8, true);
  const payloadLength = view.getUint32(16, true);

  if (payloadLength > JOIN_SLOT_MAX_PAYLOAD_BYTES) {
    throw new JoinSlotStateError(
      `decodeJoinSlotState: declared payload of ${payloadLength} bytes is over the slot ceiling`,
    );
  }
  // Exact, because trailing bytes would be unsigned space.
  if (state.length !== JOIN_SLOT_HEADER_BYTES + payloadLength) {
    throw new JoinSlotStateError(
      `decodeJoinSlotState: declared payload of ${payloadLength} bytes does not match ${state.length} bytes of state`,
    );
  }

  const signature = state.subarray(20, JOIN_SLOT_HEADER_BYTES);
  const payload = state.subarray(JOIN_SLOT_HEADER_BYTES);

  const verified = ed25519.verify(
    signature,
    signingMessage(expect.slotId, seq, payload),
    expect.verifyingKey,
    // The contract verifies strictly (`verify_strict`); accepting anything here
    // that a peer would reject would let a state resolve on the joiner and then
    // vanish from the network.
    { zip215: false },
  );
  if (!verified) {
    throw new JoinSlotStateError(
      'decodeJoinSlotState: signature does not match this farm and ticket',
    );
  }

  return { seq, payload };
}

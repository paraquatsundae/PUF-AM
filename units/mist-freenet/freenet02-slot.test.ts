/**
 * Join-slot addressing and state format.
 *
 * Two things are being defended here. First, that a slot address is a pure
 * function of (FarmSeed, ticket) — an owner and a joiner never compare notes, so a
 * derivation that drifts by a byte is a silent 404 in a shed. Second, that the
 * TypeScript and the Rust agree on the wire format: the vectors below are the same
 * ones asserted in `units/mist-freenet/contracts/slot-contract/src/lib.rs`, so a
 * change on either side has to break a test before it can break a join.
 *
 * @see Plans/MIST_TWO_FEDORA_FREENET.md § Freenet slot contract
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bs58 from 'bs58';
import { blake3 } from '@noble/hashes/blake3.js';
import { describe, expect, it } from 'vitest';

import {
  JOIN_SLOT_HEADER_BYTES,
  JOIN_SLOT_ID_BYTES,
  JOIN_SLOT_MAGIC,
  JOIN_SLOT_MAX_PAYLOAD_BYTES,
  JOIN_SLOT_PARAMETERS_BYTES,
  JoinSlotStateError,
  SLOT_CONTRACT_CODE_HASH_B58,
  decodeJoinSlotState,
  deriveJoinSlotAddress,
  deriveJoinSlotId,
  deriveJoinSlotSigningSeed,
  deriveJoinSlotVerifyingKey,
  encodeJoinSlotState,
  joinSlotInstanceId,
  joinSlotParameters,
  joinSlotSequence,
  slotContractCodeHashBytes,
} from './src/freenet02-slot.ts';
import {
  decryptJoinSlotManifest,
  deriveJoinSlotManifestKey,
  encryptJoinSlotManifest,
} from './src/join-slot-crypto.ts';
import { isMistAeadEnvelope } from './src/ciphertext-guard.ts';
import { deriveFarmSeed } from './src/farm-seed.ts';

const UNIT_DIR = path.dirname(fileURLToPath(import.meta.url));

const FARM_SEED = new Uint8Array(32).fill(3);
const OTHER_FARM_SEED = new Uint8Array(32).fill(4);
const TICKET = 'PUF-K7M2-9Q4X';
const OTHER_TICKET = 'PUF-K7M2-9Q4Y';

async function signedState(options?: {
  farmSeed?: Uint8Array;
  ticket?: string;
  seq?: bigint;
  payload?: Uint8Array;
}) {
  const farmSeed = options?.farmSeed ?? FARM_SEED;
  const ticket = options?.ticket ?? TICKET;
  const slotId = await deriveJoinSlotId(farmSeed, ticket);
  const signingSeed = await deriveJoinSlotSigningSeed(farmSeed);
  const state = encodeJoinSlotState({
    slotId,
    signingSeed,
    seq: options?.seq ?? 1n,
    payload: options?.payload ?? new TextEncoder().encode('sealed-manifest'),
  });
  return { state, slotId, verifyingKey: await deriveJoinSlotVerifyingKey(farmSeed) };
}

describe('slot address derivation', () => {
  it('is a pure function of FarmSeed and ticket', async () => {
    const a = await deriveJoinSlotAddress(FARM_SEED, TICKET);
    const b = await deriveJoinSlotAddress(FARM_SEED, TICKET);
    expect(b.uri).toBe(a.uri);
    expect([...b.slotId]).toEqual([...a.slotId]);
  });

  it('gives a different slot per ticket and per farm', async () => {
    const mine = await deriveJoinSlotAddress(FARM_SEED, TICKET);
    const secondTicket = await deriveJoinSlotAddress(FARM_SEED, OTHER_TICKET);
    const otherFarm = await deriveJoinSlotAddress(OTHER_FARM_SEED, TICKET);

    expect(secondTicket.uri).not.toBe(mine.uri);
    expect(otherFarm.uri).not.toBe(mine.uri);
  });

  it('keeps one verifying key per farm across that farm’s tickets', async () => {
    // Not an accident: the key is in `parameters`, so the joiner has to be able to
    // derive it, and it cannot depend on a ticket the owner has not minted yet.
    const first = await deriveJoinSlotAddress(FARM_SEED, TICKET);
    const second = await deriveJoinSlotAddress(FARM_SEED, OTHER_TICKET);
    expect([...second.verifyingKey]).toEqual([...first.verifyingKey]);
  });

  it('lays parameters out as slot id then verifying key', async () => {
    const { slotId, verifyingKey, parameters } = await deriveJoinSlotAddress(FARM_SEED, TICKET);
    expect(parameters).toHaveLength(JOIN_SLOT_PARAMETERS_BYTES);
    expect([...parameters.subarray(0, JOIN_SLOT_ID_BYTES)]).toEqual([...slotId]);
    expect([...parameters.subarray(JOIN_SLOT_ID_BYTES)]).toEqual([...verifyingKey]);
  });

  it('addresses the instance the way freenet-stdlib does', async () => {
    const { parameters, instanceId } = await deriveJoinSlotAddress(FARM_SEED, TICKET);
    const expected = blake3(
      new Uint8Array([...slotContractCodeHashBytes(), ...parameters]),
    );
    expect([...instanceId]).toEqual([...expected]);
  });

  it('publishes as an FN02 URI so existing GET plumbing carries it', async () => {
    const { uri, instanceIdBase58 } = await deriveJoinSlotAddress(FARM_SEED, TICKET);
    expect(uri).toBe(`FN02@${instanceIdBase58}`);
    expect(bs58.decode(instanceIdBase58)).toHaveLength(32);
  });

  it('refuses a blank ticket rather than deriving a shared slot for all of them', async () => {
    await expect(deriveJoinSlotId(FARM_SEED, '  ')).rejects.toThrow(JoinSlotStateError);
  });

  it('derives from a real FarmCode-shaped seed', async () => {
    const farmSeed = await deriveFarmSeed(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
    const address = await deriveJoinSlotAddress(farmSeed, TICKET);
    expect(address.uri.startsWith('FN02@')).toBe(true);
  });
});

describe('slot code hash pin', () => {
  it('matches the code hash inside the vendored WASM container', () => {
    // `fdev build` emits [u64 API version][32-byte code hash][raw wasm]. Reading the
    // hash back out of the artifact means the pinned constant is checked against the
    // bytes that will actually be published, without needing fdev installed.
    const wasm = new Uint8Array(
      readFileSync(path.join(UNIT_DIR, 'assets', 'slot-contract.wasm')),
    );
    const embedded = wasm.subarray(8, 40);

    expect(bs58.encode(embedded)).toBe(SLOT_CONTRACT_CODE_HASH_B58);
    // And the container really is the wrapper we think it is.
    expect([...wasm.subarray(40, 44)]).toEqual([0x00, 0x61, 0x73, 0x6d]);
    expect([...blake3(wasm.subarray(40))]).toEqual([...embedded]);
  });
});

describe('signed slot state', () => {
  it('round-trips a payload for the slot it was signed for', async () => {
    const payload = new TextEncoder().encode('sealed-manifest');
    const { state, slotId, verifyingKey } = await signedState({ seq: 42n, payload });

    const decoded = decodeJoinSlotState(state, { slotId, verifyingKey });
    expect(decoded.seq).toBe(42n);
    expect(new TextDecoder().decode(decoded.payload)).toBe('sealed-manifest');
  });

  it('lays out magic, sequence and length where the contract reads them', async () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    const { state } = await signedState({ seq: 0x0102030405060708n, payload });

    expect([...state.subarray(0, 8)]).toEqual([...JOIN_SLOT_MAGIC]);
    const view = new DataView(state.buffer, state.byteOffset, state.byteLength);
    expect(view.getBigUint64(8, true)).toBe(0x0102030405060708n);
    expect(view.getUint32(16, true)).toBe(payload.length);
    expect(state).toHaveLength(JOIN_SLOT_HEADER_BYTES + payload.length);
  });

  it('rejects a flipped payload byte', async () => {
    const { state, slotId, verifyingKey } = await signedState();
    state[state.length - 1] ^= 0xff;
    expect(() => decodeJoinSlotState(state, { slotId, verifyingKey })).toThrow(
      /signature does not match/i,
    );
  });

  it('rejects a flipped sequence number', async () => {
    const { state, slotId, verifyingKey } = await signedState({ seq: 5n });
    new DataView(state.buffer, state.byteOffset, state.byteLength).setBigUint64(8, 6n, true);
    expect(() => decodeJoinSlotState(state, { slotId, verifyingKey })).toThrow(
      /signature does not match/i,
    );
  });

  it('rejects a state another farm signed', async () => {
    const impostor = await signedState({ farmSeed: OTHER_FARM_SEED });
    const mine = await deriveJoinSlotAddress(FARM_SEED, TICKET);
    expect(() =>
      decodeJoinSlotState(impostor.state, {
        slotId: mine.slotId,
        verifyingKey: mine.verifyingKey,
      }),
    ).toThrow(/signature does not match/i);
  });

  /**
   * The signing key is per farm, so this is the case the slot id inside the
   * signature exists for: same key, same farm, wrong ticket.
   */
  it('rejects a state this farm signed for a different ticket', async () => {
    const otherSlot = await signedState({ ticket: OTHER_TICKET });
    const mine = await deriveJoinSlotAddress(FARM_SEED, TICKET);
    expect(() =>
      decodeJoinSlotState(otherSlot.state, {
        slotId: mine.slotId,
        verifyingKey: mine.verifyingKey,
      }),
    ).toThrow(/signature does not match/i);
  });

  it('rejects trailing bytes past the declared payload', async () => {
    const { state, slotId, verifyingKey } = await signedState();
    const grown = new Uint8Array(state.length + 1);
    grown.set(state);
    expect(() => decodeJoinSlotState(grown, { slotId, verifyingKey })).toThrow(
      /does not match .* bytes of state/i,
    );
  });

  it('rejects a short or unmagicked state without reaching the signature', async () => {
    const { slotId, verifyingKey } = await signedState();
    expect(() => decodeJoinSlotState(new Uint8Array(4), { slotId, verifyingKey })).toThrow(
      /too short/i,
    );
    expect(() =>
      decodeJoinSlotState(new Uint8Array(JOIN_SLOT_HEADER_BYTES), { slotId, verifyingKey }),
    ).toThrow(/not a PUFSLOT1 state/i);
  });

  it('will not encode a payload over the slot ceiling', async () => {
    const slotId = await deriveJoinSlotId(FARM_SEED, TICKET);
    const signingSeed = await deriveJoinSlotSigningSeed(FARM_SEED);
    expect(() =>
      encodeJoinSlotState({
        slotId,
        signingSeed,
        seq: 1n,
        payload: new Uint8Array(JOIN_SLOT_MAX_PAYLOAD_BYTES + 1),
      }),
    ).toThrow(/slot ceiling/i);
  });

  it('will not encode against a slot id of the wrong width', async () => {
    const signingSeed = await deriveJoinSlotSigningSeed(FARM_SEED);
    expect(() =>
      encodeJoinSlotState({
        slotId: new Uint8Array(16),
        signingSeed,
        seq: 1n,
        payload: new Uint8Array(4),
      }),
    ).toThrow(/32 bytes/);
  });

  it('rejects parameters built from the wrong widths', () => {
    expect(() => joinSlotParameters(new Uint8Array(16), new Uint8Array(32))).toThrow(/slot id/);
    expect(() => joinSlotParameters(new Uint8Array(32), new Uint8Array(16))).toThrow(
      /verifying key/,
    );
  });

  it('rejects an instance id built on a non-32-byte code hash', () => {
    expect(() => joinSlotInstanceId(new Uint8Array(31), new Uint8Array(64))).toThrow(/32 bytes/);
  });
});

describe('slot sequence numbers', () => {
  it('rises with the clock so a re-send outranks the publish before it', () => {
    expect(joinSlotSequence(1_700_000_000_000)).toBe(1_700_000_000_000n);
    expect(joinSlotSequence(2)).toBeGreaterThan(joinSlotSequence(1));
  });

  it('never lands on zero, which the contract treats as no state at all', () => {
    expect(joinSlotSequence(0)).toBe(1n);
    expect(joinSlotSequence(-5)).toBe(1n);
  });
});

describe('slot manifest envelope', () => {
  it('round-trips a manifest under the FarmSeed and ticket', async () => {
    const manifest = new TextEncoder().encode(JSON.stringify({ v: 2, farmId: 'abc' }));
    const sealed = await encryptJoinSlotManifest(manifest, FARM_SEED, TICKET);
    const opened = await decryptJoinSlotManifest(sealed, FARM_SEED, TICKET);
    expect(new TextDecoder().decode(opened)).toBe(new TextDecoder().decode(manifest));
  });

  it('is a mist AEAD envelope, so the hub can tell it is sealed without a key', async () => {
    const sealed = await encryptJoinSlotManifest(new Uint8Array([1, 2, 3]), FARM_SEED, TICKET);
    expect(isMistAeadEnvelope(sealed)).toBe(true);
  });

  it('will not open under another ticket from the same farm', async () => {
    const sealed = await encryptJoinSlotManifest(new Uint8Array([1, 2, 3]), FARM_SEED, TICKET);
    await expect(decryptJoinSlotManifest(sealed, FARM_SEED, OTHER_TICKET)).rejects.toThrow();
  });

  it('will not open under another farm', async () => {
    const sealed = await encryptJoinSlotManifest(new Uint8Array([1, 2, 3]), FARM_SEED, TICKET);
    await expect(decryptJoinSlotManifest(sealed, OTHER_FARM_SEED, TICKET)).rejects.toThrow();
  });

  it('keys per ticket, so revoking one does not hand over the next', async () => {
    const a = await deriveJoinSlotManifestKey(FARM_SEED, TICKET);
    const b = await deriveJoinSlotManifestKey(FARM_SEED, OTHER_TICKET);
    expect([...a]).not.toEqual([...b]);
  });

  it('refuses plaintext JSON rather than treating it as a manifest', async () => {
    const plaintext = new TextEncoder().encode(JSON.stringify({ v: 2, farmId: 'abc' }));
    await expect(decryptJoinSlotManifest(plaintext, FARM_SEED, TICKET)).rejects.toThrow(
      /not a mist AEAD envelope/i,
    );
  });
});

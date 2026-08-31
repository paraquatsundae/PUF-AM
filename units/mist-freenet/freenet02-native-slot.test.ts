/**
 * Hermetic native slot PUT/UPDATE — frames and shape, no node.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import bs58 from 'bs58';
import { describe, expect, it } from 'vitest';

import {
  decodeNativeHostResult,
  encodeNativeContractPut,
  encodeNativeContractUpdate,
  looksLikeAlreadyPublished,
  nativeHostPutErrorMessage,
} from './src/freenet02-native-bincode.ts';
import { BrowserFreenetSlotClient } from './src/freenet02-native-slot.ts';
import {
  JOIN_SLOT_MAGIC,
  JOIN_SLOT_PARAMETERS_BYTES,
  SLOT_CONTRACT_CODE_HASH_B58,
  encodeJoinSlotState,
} from './src/freenet02-slot.ts';
import { unpackContractWasm } from './src/freenet02-pack-id.ts';

const TINY_WASM = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x74, 0x69, 0x6e, 0x79,
]);
const PARAMS = new Uint8Array(64).fill(0x11);
const STATE = new TextEncoder().encode('slot-state');

const SLOT_PUT_HEX =
  '010000000000000000000000000000000c000000000000000061736d0100000074696e798f5d9ef09bb094b80203a92c1a4a62a1965b5c5aca38dc1236310ea75d38542040000000000000001111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111153f6a20d9a1285d23e0d7747a115cf15f26e3c368d5311bc2cf60438dd73b9808f5d9ef09bb094b80203a92c1a4a62a1965b5c5aca38dc1236310ea75d3854200a00000000000000736c6f742d737461746500000000000000000000';
const SLOT_UPDATE_HEX =
  '010000000100000053f6a20d9a1285d23e0d7747a115cf15f26e3c368d5311bc2cf60438dd73b9800000000000000000000000000000000000000000000000000000000000000000000000000a00000000000000736c6f742d7374617465';
const ALREADY_HEX =
  '0100000008000000000000000100000053f6a20d9a1285d23e0d7747a115cf15f26e3c368d5311bc2cf60438dd73b9808f5d9ef09bb094b80203a92c1a4a62a1965b5c5aca38dc1236310ea75d3854201700000000000000636f6e747261637420616c726561647920657869737473';
const OK_UPDATE_HEX =
  '00000000000000000300000053f6a20d9a1285d23e0d7747a115cf15f26e3c368d5311bc2cf60438dd73b9808f5d9ef09bb094b80203a92c1a4a62a1965b5c5aca38dc1236310ea75d3854200000000000000000';

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function signedState(): Uint8Array {
  const slotId = new Uint8Array(32).fill(1);
  const signingSeed = new Uint8Array(32).fill(2);
  return encodeJoinSlotState({
    slotId,
    signingSeed,
    seq: 1n,
    payload: new TextEncoder().encode('sealed'),
  });
}

describe('encodeNativeContractPut (slot parameters)', () => {
  it('matches the fdev / stdlib 0.8.5 fixture', () => {
    const frame = encodeNativeContractPut({ wasm: TINY_WASM, parameters: PARAMS, state: STATE });
    expect(Buffer.from(frame.bytes).toString('hex')).toBe(SLOT_PUT_HEX);
    expect(bs58.encode(frame.instanceId)).toBe('6ekxpYEPAKYZ24cot8FTTP1nRHSZGF85ijdTUabF4HXV');
  });
});

describe('encodeNativeContractUpdate', () => {
  it('matches fdev update --as-state (zero code hash)', () => {
    const instanceId = encodeNativeContractPut({
      wasm: TINY_WASM,
      parameters: PARAMS,
      state: STATE,
    }).instanceId;
    const bytes = encodeNativeContractUpdate({ instanceId, state: STATE });
    expect(Buffer.from(bytes).toString('hex')).toBe(SLOT_UPDATE_HEX);
  });
});

describe('decodeNativeHostResult (slot)', () => {
  it('reads an already-published Put error', () => {
    const decoded = decodeNativeHostResult(fromHex(ALREADY_HEX));
    expect(decoded.ok).toBe(false);
    expect(nativeHostPutErrorMessage(decoded)).toBe('contract already exists');
    expect(looksLikeAlreadyPublished(nativeHostPutErrorMessage(decoded))).toBe(true);
  });

  it('reads an UpdateResponse key', () => {
    const decoded = decodeNativeHostResult(fromHex(OK_UPDATE_HEX));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(bs58.encode(decoded.instanceId)).toBe('6ekxpYEPAKYZ24cot8FTTP1nRHSZGF85ijdTUabF4HXV');
  });
});

describe('BrowserFreenetSlotClient shape checks', () => {
  const client = new BrowserFreenetSlotClient();

  it('refuses parameters that are not slot-id + verifying key', async () => {
    await expect(
      client.putJoinSlot({
        parameters: new Uint8Array(32),
        state: signedState(),
        instanceIdBase58: 'x',
        wasm: TINY_WASM,
      }),
    ).rejects.toThrow(/parameters must be 64 bytes/);
  });

  it('refuses a state that is not PUFSLOT1', async () => {
    const state = new Uint8Array(JOIN_SLOT_MAGIC.length + 80).fill(9);
    await expect(
      client.putJoinSlot({
        parameters: new Uint8Array(JOIN_SLOT_PARAMETERS_BYTES),
        state,
        instanceIdBase58: 'x',
        wasm: TINY_WASM,
      }),
    ).rejects.toThrow(/PUFSLOT1/);
  });

  it('refuses an update without a code hash', async () => {
    await expect(
      client.updateJoinSlot({
        instanceIdBase58: '6ekxpYEPAKYZ24cot8FTTP1nRHSZGF85ijdTUabF4HXV',
        state: signedState(),
      }),
    ).rejects.toThrow(/WASM or code hash/);
  });

  it('refuses when the derived instance id disagrees with the caller', async () => {
    await expect(
      client.putJoinSlot({
        parameters: PARAMS,
        state: signedState(),
        instanceIdBase58: 'not-the-derived-id',
        wasm: TINY_WASM,
      }),
    ).rejects.toThrow(/pinned slot code hash/);
  });
});

describe('unpackContractWasm (bundled slot)', () => {
  it('uses the raw WASM hash inside the bundled slot-contract package', () => {
    const bundled = new Uint8Array(
      readFileSync(
        path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets/slot-contract.wasm'),
      ),
    );
    const unpacked = unpackContractWasm(bundled);
    expect(bs58.encode(unpacked.codeHash)).toBe(SLOT_CONTRACT_CODE_HASH_B58);
    expect([...unpacked.wasm.subarray(0, 4)]).toEqual([0x00, 0x61, 0x73, 0x6d]);
  });
});

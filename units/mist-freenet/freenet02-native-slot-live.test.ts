/**
 * Optional live native slot PUT/UPDATE — the remaining Phase 1 go/no-go.
 *
 *   FREENET_LIVE_WS=1 npm test -- units/mist-freenet/freenet02-native-slot-live.test.ts
 *
 * Same claims as `freenet02-slot-live.test.ts`, without spawning `fdev`.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { BrowserFreenetGetClient } from './src/freenet02-browser-get.ts';
import { DEFAULT_LOCAL_FREENET_WS_URL } from './src/freenet02-browser-get-url.ts';
import { BrowserFreenetSlotClient, FreenetNativeSlotError } from './src/freenet02-native-slot.ts';
import {
  decodeJoinSlotState,
  deriveJoinSlotAddress,
  deriveJoinSlotSigningSeed,
  encodeJoinSlotState,
  joinSlotSequence,
} from './src/freenet02-slot.ts';
import { decryptJoinSlotManifest, encryptJoinSlotManifest } from './src/join-slot-crypto.ts';

const LIVE = process.env.FREENET_LIVE_WS === '1' || process.env.FREENET_LIVE_WS === 'true';
const WS_URL = process.env.FREENET_WS_URL ?? DEFAULT_LOCAL_FREENET_WS_URL;
const WASM_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'assets/slot-contract.wasm',
);

function randomFarmSeed(): Uint8Array {
  const seed = new Uint8Array(32);
  crypto.getRandomValues(seed);
  return seed;
}

function randomTicket(): string {
  const alphabet = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  const pick = (n: number) =>
    Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  return `PUF-${pick(4)}-${pick(4)}`;
}

describe.skipIf(!LIVE)('BrowserFreenetSlotClient (live node)', () => {
  let get: BrowserFreenetGetClient;

  afterEach(async () => {
    if (get) await get.disconnect();
  });

  it('puts a sealed manifest and reads it back from the derived address', async () => {
    const wasm = new Uint8Array(await readFile(WASM_PATH));
    const farmSeed = randomFarmSeed();
    const ticket = randomTicket();
    const address = await deriveJoinSlotAddress(farmSeed, ticket);
    const payload = await encryptJoinSlotManifest(
      new TextEncoder().encode(JSON.stringify({ v: 1, ticket, farmName: 'native-slot' })),
      farmSeed,
      ticket,
    );
    const seq = joinSlotSequence();
    const state = encodeJoinSlotState({
      slotId: address.slotId,
      signingSeed: await deriveJoinSlotSigningSeed(farmSeed),
      seq,
      payload,
    });

    const put = new BrowserFreenetSlotClient({ wsUrl: WS_URL });
    let result;
    try {
      result = await put.putJoinSlot({
        parameters: address.parameters,
        state,
        instanceIdBase58: address.instanceIdBase58,
        wasm,
      });
    } catch (error) {
      if (error instanceof FreenetNativeSlotError && error.hung) {
        throw new Error(
          `SPIKE NO-GO: native slot PUT hung (${error.message}). Tablet Send stays on fdev/hub.`,
        );
      }
      throw error;
    }

    expect(result.mode).toBe('put');
    expect(result.instanceIdBase58).toBe(address.instanceIdBase58);

    get = new BrowserFreenetGetClient({ wsUrl: WS_URL });
    const joiner = await deriveJoinSlotAddress(farmSeed, ticket);
    const fetched = await get.getBlob(joiner.uri, { deadlineMs: 60_000 });
    expect(fetched).not.toBeNull();
    const decoded = decodeJoinSlotState(fetched!, {
      slotId: joiner.slotId,
      verifyingKey: joiner.verifyingKey,
    });
    expect(decoded.seq).toBe(seq);
    const opened = await decryptJoinSlotManifest(decoded.payload, farmSeed, ticket);
    expect(JSON.parse(new TextDecoder().decode(opened)).farmName).toBe('native-slot');
  }, 120_000);

  it('refreshes the same address on re-publish', async () => {
    const wasm = new Uint8Array(await readFile(WASM_PATH));
    const farmSeed = randomFarmSeed();
    const ticket = randomTicket();
    const address = await deriveJoinSlotAddress(farmSeed, ticket);
    const signingSeed = await deriveJoinSlotSigningSeed(farmSeed);
    const put = new BrowserFreenetSlotClient({ wsUrl: WS_URL });

    const publish = async (farmName: string, seq: bigint) => {
      const payload = await encryptJoinSlotManifest(
        new TextEncoder().encode(JSON.stringify({ v: 1, ticket, farmName })),
        farmSeed,
        ticket,
      );
      return put.putJoinSlot({
        parameters: address.parameters,
        state: encodeJoinSlotState({ slotId: address.slotId, signingSeed, seq, payload }),
        instanceIdBase58: address.instanceIdBase58,
        wasm,
      });
    };

    const first = await publish('before', joinSlotSequence());
    expect(first.mode).toBe('put');

    // 0.2.125 accepted a second PUT as an upsert, so the already-published
    // fallback may never run. Drive UPDATE explicitly — that is the frame
    // `fdev execute update --as-state` speaks, and the one a re-send needs
    // when the node does refuse a duplicate put.
    const afterPayload = await encryptJoinSlotManifest(
      new TextEncoder().encode(JSON.stringify({ v: 1, ticket, farmName: 'after' })),
      farmSeed,
      ticket,
    );
    const second = await put.updateJoinSlot({
      instanceIdBase58: address.instanceIdBase58,
      state: encodeJoinSlotState({
        slotId: address.slotId,
        signingSeed,
        seq: joinSlotSequence() + 1_000n,
        payload: afterPayload,
      }),
      wasm,
    });
    expect(second.mode).toBe('update');
    expect(second.instanceIdBase58).toBe(first.instanceIdBase58);

    get = new BrowserFreenetGetClient({ wsUrl: WS_URL });
    const fetched = await get.getBlob(address.uri, { deadlineMs: 60_000 });
    expect(fetched).not.toBeNull();
    const decoded = decodeJoinSlotState(fetched!, {
      slotId: address.slotId,
      verifyingKey: address.verifyingKey,
    });
    const opened = await decryptJoinSlotManifest(decoded.payload, farmSeed, ticket);
    expect(JSON.parse(new TextDecoder().decode(opened)).farmName).toBe('after');
  }, 120_000);
});

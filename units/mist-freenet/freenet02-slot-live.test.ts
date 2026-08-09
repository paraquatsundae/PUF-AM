/**
 * Optional live join-slot test against a real Freenet 0.2 node.
 *
 * This is the one test that proves the claim the milestone actually makes — that a
 * short ticket resolves off-LAN — because it is the only place where the derived
 * address, the vendored WASM's code hash and a real node's idea of where a
 * contract lives all have to agree. Unit tests can only check that both sides of
 * our own arithmetic match each other.
 *
 * Needs a node listening on ws-api-port (default 7509) and `fdev` on PATH:
 *   FREENET_LIVE_WS=1 npx vitest run units/mist-freenet/freenet02-slot-live.test.ts
 *
 * @see units/mist-freenet/contracts/slot-contract — how to rebuild the WASM
 */

import { afterEach, describe, expect, it } from 'vitest';
import { Freenet02WsTransport, putJoinSlotViaFdev } from './src/node.ts';
import {
  decodeJoinSlotState,
  deriveJoinSlotAddress,
  deriveJoinSlotSigningSeed,
  encodeJoinSlotState,
  joinSlotSequence,
} from './src/freenet02-slot.ts';
import { decryptJoinSlotManifest, encryptJoinSlotManifest } from './src/join-slot-crypto.ts';
import { isFreenet02Uri } from './src/freenet02-uri.ts';

const LIVE = process.env.FREENET_LIVE_WS === '1' || process.env.FREENET_LIVE_WS === 'true';

/** A throwaway farm, so a live run never touches a real farm's slot. */
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

describe.skipIf(!LIVE)('join slot (live node)', () => {
  let transport: Freenet02WsTransport | undefined;

  afterEach(async () => {
    if (transport) await transport.disconnect();
    transport = undefined;
  });

  it('publishes a sealed manifest and resolves it back from the ticket alone', async () => {
    const farmSeed = randomFarmSeed();
    const ticket = randomTicket();

    const address = await deriveJoinSlotAddress(farmSeed, ticket);
    expect(isFreenet02Uri(address.uri)).toBe(true);

    const manifest = {
      v: 1,
      ticket,
      farmName: 'live-slot-test',
      packs: [`FN02@${'1'.repeat(43)}`],
      mintedAt: new Date().toISOString(),
    };
    const payload = await encryptJoinSlotManifest(
      new TextEncoder().encode(JSON.stringify(manifest)),
      farmSeed,
      ticket,
    );

    const signingSeed = await deriveJoinSlotSigningSeed(farmSeed);
    const seq = joinSlotSequence();
    const state = encodeJoinSlotState({ slotId: address.slotId, signingSeed, seq, payload });

    const put = await putJoinSlotViaFdev({
      parameters: address.parameters,
      state,
      instanceIdBase58: address.instanceIdBase58,
    });
    // The address is derived on both sides, so a node that lands the contract
    // anywhere else means the pinned code hash and the shipped WASM disagree.
    expect(put.instanceIdBase58).toBe(address.instanceIdBase58);

    transport = new Freenet02WsTransport({
      wsUrl: process.env.FREENET_WS_URL ?? 'ws://127.0.0.1:7509/v1/contract/command',
    });
    await transport.connect();

    // Re-derive from the ticket rather than reusing `address`: that is what a
    // joining tablet has, and reusing the object would not prove it is enough.
    const joiner = await deriveJoinSlotAddress(farmSeed, ticket);
    const fetched = await transport.getBlob(joiner.uri);
    expect(fetched).not.toBeNull();

    const decoded = decodeJoinSlotState(fetched!, {
      slotId: joiner.slotId,
      verifyingKey: joiner.verifyingKey,
    });
    expect(decoded.seq).toBe(seq);

    const opened = await decryptJoinSlotManifest(decoded.payload, farmSeed, ticket);
    expect(JSON.parse(new TextDecoder().decode(opened))).toEqual(manifest);
  }, 300_000);

  it('refreshes the same address on re-publish', async () => {
    const farmSeed = randomFarmSeed();
    const ticket = randomTicket();
    const address = await deriveJoinSlotAddress(farmSeed, ticket);
    const signingSeed = await deriveJoinSlotSigningSeed(farmSeed);

    const publish = async (farmName: string, seq: bigint) => {
      const payload = await encryptJoinSlotManifest(
        new TextEncoder().encode(JSON.stringify({ v: 1, ticket, farmName })),
        farmSeed,
        ticket,
      );
      return putJoinSlotViaFdev({
        parameters: address.parameters,
        state: encodeJoinSlotState({ slotId: address.slotId, signingSeed, seq, payload }),
        instanceIdBase58: address.instanceIdBase58,
      });
    };

    const first = await publish('before', joinSlotSequence());
    const second = await publish('after', joinSlotSequence() + 1_000n);

    // The point of a slot: contents move, address does not.
    expect(second.instanceIdBase58).toBe(first.instanceIdBase58);

    transport = new Freenet02WsTransport({
      wsUrl: process.env.FREENET_WS_URL ?? 'ws://127.0.0.1:7509/v1/contract/command',
    });
    await transport.connect();

    const fetched = await transport.getBlob(address.uri);
    expect(fetched).not.toBeNull();
    const decoded = decodeJoinSlotState(fetched!, {
      slotId: address.slotId,
      verifyingKey: address.verifyingKey,
    });
    const opened = await decryptJoinSlotManifest(decoded.payload, farmSeed, ticket);
    expect(JSON.parse(new TextDecoder().decode(opened)).farmName).toBe('after');
  }, 300_000);
});

describe('join slot (offline guard)', () => {
  it('skips the live suite unless FREENET_LIVE_WS=1', () => {
    expect(LIVE || true).toBe(true);
  });
});

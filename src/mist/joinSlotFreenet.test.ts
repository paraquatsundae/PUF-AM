/**
 * Owner publish → joiner resolve, over the Freenet slot, with no owner's hub in
 * the loop.
 *
 * The stubbed hub here does exactly what Opennet does and nothing more: it keeps
 * bytes under an address and hands them back. Everything that makes the ticket
 * work — deriving the address, sealing the manifest, signing the state, checking
 * all three on the way back — happens in the page, so a round trip through this
 * stub is a real test of the join and not of the stub.
 *
 * @see Plans/MIST_TWO_FEDORA_FREENET.md § Freenet slot contract
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { bytesToHex } from '../../units/mist-freenet/src/farm-seed.ts';
import { deriveJoinSlotAddress } from '../../units/mist-freenet/src/freenet02-slot.ts';
import {
  JoinSlotMismatchError,
  JoinSlotUnavailableError,
  publishJoinTicketToFreenetSlot,
  resolveJoinTicketFromFreenetSlot,
} from './joinSlotFreenet.ts';
import { FreenetSlotJoinTicketResolver, JoinTicketMismatchError } from './joinTicketResolver.ts';

const FARM_ID = 'farm-abc';
const TICKET = 'PUF-K7M2-9Q4X';
const OTHER_TICKET = 'PUF-K7M2-9Q4Y';
const FARM_SEED = new Uint8Array(32).fill(11);
const OTHER_FARM_SEED = new Uint8Array(32).fill(12);

let sessionSeed: Uint8Array | null = FARM_SEED;

vi.mock('./mistDeviceSession.ts', () => ({
  loadMistDeviceSession: async () =>
    sessionSeed
      ? {
          uid: 'mist_farm-abc',
          farmId: FARM_ID,
          farmName: 'Test farm',
          displayName: 'Tester',
          role: 'admin' as const,
          createdAt: new Date().toISOString(),
          farmSeedHex: bytesToHex(sessionSeed),
          hasDevicePin: false,
        }
      : null,
}));

/**
 * Stands in for a Freenet node: a map from contract address to state bytes.
 * `put` and `update` both just overwrite, which is all the joiner side can tell
 * apart anyway.
 */
function stubFreenet() {
  const slots = new Map<string, string>();
  const requests: string[] = [];

  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    requests.push(url);

    if (url.includes('/api/mist/freenet/slot/publish')) {
      const body = JSON.parse(String(init?.body)) as {
        instanceIdBase58: string;
        stateBase64: string;
        parametersBase64: string;
      };
      const mode = slots.has(body.instanceIdBase58) ? 'update' : 'put';
      slots.set(body.instanceIdBase58, body.stateBase64);
      return jsonResponse(200, {
        uri: `FN02@${body.instanceIdBase58}`,
        instanceIdBase58: body.instanceIdBase58,
        mode,
      });
    }

    const id = url.split('/api/mist/freenet/slot/')[1];
    const stateBase64 = id ? slots.get(id) : undefined;
    if (!stateBase64) return jsonResponse(404, { error: 'No join slot at that address yet' });
    return jsonResponse(200, { instanceId: id, stateBase64 });
  });

  vi.stubGlobal('fetch', fetchMock);
  return { slots, requests, fetchMock };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const publishInput = {
  ticket: TICKET,
  farmId: FARM_ID,
  hotUri: 'FN02@hot',
  bonesUri: 'FN02@bones',
  role: 'farmer' as const,
  hotContentHash: 'deadbeef',
  bonesContentHash: 'cafebabe',
};

describe('join slot over Freenet', () => {
  beforeEach(() => {
    sessionSeed = FARM_SEED;
    vi.stubGlobal('window', undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('publishes a manifest a joiner reads back with the same ticket', async () => {
    stubFreenet();

    const published = await publishJoinTicketToFreenetSlot(publishInput);
    expect(published.mode).toBe('put');

    const { manifest } = await resolveJoinTicketFromFreenetSlot(TICKET, FARM_ID);
    expect(manifest.hotUri).toBe('FN02@hot');
    expect(manifest.bonesUri).toBe('FN02@bones');
    expect(manifest.role).toBe('farmer');
    expect(manifest.ticket).toBe(TICKET);
    expect(manifest.hotContentHash).toBe('deadbeef');
  });

  it('publishes to the address both sides derive, and nowhere else', async () => {
    const { slots } = stubFreenet();
    const address = await deriveJoinSlotAddress(FARM_SEED, TICKET);

    const published = await publishJoinTicketToFreenetSlot(publishInput);

    expect(published.instanceIdBase58).toBe(address.instanceIdBase58);
    expect(published.uri).toBe(address.uri);
    expect([...slots.keys()]).toEqual([address.instanceIdBase58]);
  });

  it('never sends the FarmSeed or a readable manifest to the hub', async () => {
    const { fetchMock } = stubFreenet();

    await publishJoinTicketToFreenetSlot(publishInput);

    const body = String((fetchMock.mock.calls[0]?.[1] as RequestInit).body);
    expect(body).not.toContain(bytesToHex(FARM_SEED));
    // The manifest is inside an AEAD envelope, so none of its fields are in the
    // bytes the hub is handed.
    expect(body).not.toContain('FN02@hot');
    expect(body).not.toContain(FARM_ID);
  });

  it('keeps one address across a re-send, so a refresh updates rather than moves', async () => {
    const { slots } = stubFreenet();

    const first = await publishJoinTicketToFreenetSlot(publishInput);
    const second = await publishJoinTicketToFreenetSlot({
      ...publishInput,
      hotUri: 'FN02@hot-v2',
    });

    expect(second.instanceIdBase58).toBe(first.instanceIdBase58);
    expect(second.mode).toBe('update');
    expect(slots.size).toBe(1);

    const { manifest } = await resolveJoinTicketFromFreenetSlot(TICKET, FARM_ID);
    expect(manifest.hotUri).toBe('FN02@hot-v2');
  });

  it('resolves a sloppily typed ticket to the same slot', async () => {
    stubFreenet();
    await publishJoinTicketToFreenetSlot(publishInput);

    const { manifest } = await resolveJoinTicketFromFreenetSlot('  puf k7m2 9q4x ', FARM_ID);
    expect(manifest.ticket).toBe(TICKET);
  });

  it('reports nothing published yet rather than an error the operator cannot act on', async () => {
    stubFreenet();

    await expect(resolveJoinTicketFromFreenetSlot(TICKET, FARM_ID)).rejects.toThrow(
      JoinSlotUnavailableError,
    );
  });

  it('finds nothing under a ticket that was never published', async () => {
    stubFreenet();
    await publishJoinTicketToFreenetSlot(publishInput);

    await expect(resolveJoinTicketFromFreenetSlot(OTHER_TICKET, FARM_ID)).rejects.toThrow(
      JoinSlotUnavailableError,
    );
  });

  it('cannot be opened by a device holding a different FarmCode', async () => {
    stubFreenet();
    await publishJoinTicketToFreenetSlot(publishInput);

    // Same ticket, different farm: this device derives a different slot address, so
    // it does not even find the owner's slot — which is the privacy property.
    sessionSeed = OTHER_FARM_SEED;
    await expect(resolveJoinTicketFromFreenetSlot(TICKET, FARM_ID)).rejects.toThrow(
      JoinSlotUnavailableError,
    );
  });

  it('refuses a manifest naming a farm other than the recovered one', async () => {
    stubFreenet();
    await publishJoinTicketToFreenetSlot({ ...publishInput, farmId: 'someone-elses-farm' });

    await expect(resolveJoinTicketFromFreenetSlot(TICKET, FARM_ID)).rejects.toThrow(
      JoinSlotMismatchError,
    );
  });

  it('refuses an expired ticket, since nothing on the network prunes a slot', async () => {
    stubFreenet();
    await publishJoinTicketToFreenetSlot({
      ...publishInput,
      expires: new Date(Date.now() - 60_000).toISOString(),
    });

    await expect(resolveJoinTicketFromFreenetSlot(TICKET, FARM_ID)).rejects.toThrow(/expired/i);
  });

  it('refuses a tampered slot state instead of trusting what a peer returned', async () => {
    const { slots } = stubFreenet();
    const published = await publishJoinTicketToFreenetSlot(publishInput);

    // Flip a byte in the sealed payload, as a peer that skipped validation could.
    const state = Buffer.from(slots.get(published.instanceIdBase58)!, 'base64');
    state[state.length - 1] ^= 0xff;
    slots.set(published.instanceIdBase58, state.toString('base64'));

    await expect(resolveJoinTicketFromFreenetSlot(TICKET, FARM_ID)).rejects.toThrow(
      /not signed by this farm/i,
    );
  });

  it('refuses a malformed ticket without asking the network', async () => {
    const { fetchMock } = stubFreenet();

    await expect(resolveJoinTicketFromFreenetSlot('nope', FARM_ID)).rejects.toThrow(
      JoinSlotMismatchError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says to unlock the device when there is no session to derive from', async () => {
    stubFreenet();
    sessionSeed = null;

    await expect(resolveJoinTicketFromFreenetSlot(TICKET, FARM_ID)).rejects.toThrow(/unlock/i);
  });
});

describe('FreenetSlotJoinTicketResolver', () => {
  beforeEach(() => {
    sessionSeed = FARM_SEED;
    vi.stubGlobal('window', undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('answers a ticket the owner published, and says which slot did it', async () => {
    stubFreenet();
    const published = await publishJoinTicketToFreenetSlot(publishInput);

    const result = await new FreenetSlotJoinTicketResolver().resolve(TICKET, FARM_ID);

    expect(result.manifest.hotUri).toBe('FN02@hot');
    expect(result.resolvedBy).toContain('freenet-slot');
    expect(result.resolvedBy).toContain(published.instanceIdBase58.slice(0, 8));
  });

  /** A mismatch has to stop the resolver walk, not just this resolver. */
  it('reports a wrong-farm manifest as a walk-stopping mismatch', async () => {
    stubFreenet();
    await publishJoinTicketToFreenetSlot({ ...publishInput, farmId: 'someone-elses-farm' });

    await expect(new FreenetSlotJoinTicketResolver().resolve(TICKET, FARM_ID)).rejects.toThrow(
      JoinTicketMismatchError,
    );
  });
});

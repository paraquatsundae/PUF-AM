/**
 * A join that never asks a laptop anything.
 *
 * `joinSlotFreenet.test.ts` proves the slot round-trips through a hub. This
 * proves the other route: the same derivation, the same signature and seal
 * checks, but the bytes come off a Freenet node sitting on this device's own
 * loopback. That is the whole of what a sideloaded Android node buys — a tablet
 * that resolves a ticket with no hub, no pairing and no shed Wi‑Fi.
 *
 * The fake node here is deliberately dumb, exactly as the stubbed hub is: an
 * address-to-bytes map. Everything that makes the join safe happens in the page.
 *
 * @see Plans/APK_FREENET_PLUGIN.md §3a, §7a
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { bytesToHex } from '../../units/mist-freenet/src/farm-seed.ts';
import { parseFreenet02Uri } from '../../units/mist-freenet/src/freenet02-uri.ts';
import {
  resetLocalFreenetNode,
  setLocalFreenetClientFactory,
} from './freenetLocalNode.ts';
import {
  JoinSlotUnavailableError,
  publishJoinTicketToFreenetSlot,
  resolveJoinTicketFromFreenetSlot,
} from './joinSlotFreenet.ts';

const FARM_ID = 'farm-abc';
const TICKET = 'PUF-K7M2-9Q4X';
const FARM_SEED = new Uint8Array(32).fill(11);
const WS_URL = 'ws://127.0.0.1:7509/v1/contract/command';

/** Lets one test stand on a packaged APK, where "no hub" is a real state. */
const capacitor = vi.hoisted(() => ({ native: false }));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => capacitor.native,
    getPlatform: () => 'android',
  },
}));

vi.mock('./mistDeviceSession.ts', () => ({
  loadMistDeviceSession: async () => ({
    uid: 'mist_farm-abc',
    farmId: FARM_ID,
    farmName: 'Test farm',
    displayName: 'Tester',
    role: 'admin' as const,
    createdAt: new Date().toISOString(),
    farmSeedHex: bytesToHex(FARM_SEED),
    hasDevicePin: false,
  }),
}));

/** The hub, used only to mint a slot the way an owner's laptop would. */
function stubHub() {
  const slots = new Map<string, string>();
  const slotGets: string[] = [];

  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);

    if (url.includes('/api/mist/freenet/slot/publish')) {
      const body = JSON.parse(String(init?.body)) as {
        instanceIdBase58: string;
        stateBase64: string;
      };
      const mode = slots.has(body.instanceIdBase58) ? 'update' : 'put';
      slots.set(body.instanceIdBase58, body.stateBase64);
      return jsonResponse(200, {
        uri: `FN02@${body.instanceIdBase58}`,
        instanceIdBase58: body.instanceIdBase58,
        mode,
      });
    }

    const id = url.split('/api/mist/freenet/slot/')[1] ?? '';
    slotGets.push(id);
    const stateBase64 = slots.get(id);
    if (!stateBase64) return jsonResponse(404, { error: 'No join slot at that address yet' });
    return jsonResponse(200, { instanceId: id, stateBase64 });
  });

  vi.stubGlobal('fetch', fetchMock);
  return { slots, slotGets };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

/** A node on this device that answers whatever the given map holds. */
function stubLocalNode(blobs: Map<string, Uint8Array>) {
  const asked: string[] = [];

  setLocalFreenetClientFactory(async () => ({
    wsUrl: WS_URL,
    isConnected: () => true,
    connect: async () => {},
    disconnect: async () => {},
    getBlob: async (uri: string) => {
      asked.push(uri);
      return blobs.get(parseFreenet02Uri(uri) ?? uri) ?? null;
    },
  }) as never);

  return { asked };
}

/** The probe finds a node — a socket that opens is the whole test of that. */
function stubNodeIsUp() {
  class FakeWebSocket {
    onopen: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;
    constructor(readonly url: string) {
      setTimeout(() => this.onopen?.(), 0);
    }
    close() {}
  }
  vi.stubGlobal('WebSocket', FakeWebSocket);
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

/** Publish through the hub, then hand the resulting bytes to a local node. */
async function ownerPublishes(): Promise<{ instanceIdBase58: string; state: Uint8Array }> {
  const { slots } = stubHub();
  const published = await publishJoinTicketToFreenetSlot(publishInput);
  const state = Buffer.from(slots.get(published.instanceIdBase58)!, 'base64');
  return { instanceIdBase58: published.instanceIdBase58, state: new Uint8Array(state) };
}

describe('join slot read from a Freenet node on this device', () => {
  beforeEach(() => {
    resetLocalFreenetNode();
    vi.stubGlobal('window', undefined);
    vi.stubEnv('VITE_LOCAL_FREENET_WS', WS_URL);
  });

  afterEach(() => {
    capacitor.native = false;
    setLocalFreenetClientFactory(null);
    resetLocalFreenetNode();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('resolves a ticket without asking a hub anything', async () => {
    const { instanceIdBase58, state } = await ownerPublishes();

    stubNodeIsUp();
    const { slotGets } = stubHub();
    const { asked } = stubLocalNode(new Map([[instanceIdBase58, state]]));

    const { manifest } = await resolveJoinTicketFromFreenetSlot(TICKET, FARM_ID);

    expect(manifest.hotUri).toBe('FN02@hot');
    expect(manifest.role).toBe('farmer');
    expect(asked).toEqual([`FN02@${instanceIdBase58}`]);
    expect(slotGets).toEqual([]);
  });

  /**
   * Two nodes see different parts of the network. A tablet's own node not having
   * found the slot yet is ordinary in the minutes after a publish, and is not a
   * reason to ignore a laptop that has.
   */
  it('falls back to the hub when this device has not found the slot yet', async () => {
    const { instanceIdBase58 } = await ownerPublishes();

    stubNodeIsUp();
    const { slotGets } = stubHub();
    // Re-publish into the fresh hub stub so it holds the slot this time.
    await publishJoinTicketToFreenetSlot(publishInput);
    stubLocalNode(new Map());

    const { manifest } = await resolveJoinTicketFromFreenetSlot(TICKET, FARM_ID);

    expect(manifest.hotUri).toBe('FN02@hot');
    expect(slotGets).toEqual([instanceIdBase58]);
  });

  it('still checks the signature on bytes the local node handed over', async () => {
    const { instanceIdBase58, state } = await ownerPublishes();
    state[state.length - 1] ^= 0xff;

    stubNodeIsUp();
    stubHub();
    stubLocalNode(new Map([[instanceIdBase58, state]]));

    await expect(resolveJoinTicketFromFreenetSlot(TICKET, FARM_ID)).rejects.toThrow(
      /not signed by this farm/i,
    );
  });

  it('leaves the hub route alone when there is no node on this device', async () => {
    const { instanceIdBase58 } = await ownerPublishes();

    // No `VITE_LOCAL_FREENET_WS`, no Capacitor: nothing to look for.
    vi.unstubAllEnvs();
    resetLocalFreenetNode();
    const { slotGets } = stubHub();
    await publishJoinTicketToFreenetSlot(publishInput);
    const { asked } = stubLocalNode(new Map());

    const { manifest } = await resolveJoinTicketFromFreenetSlot(TICKET, FARM_ID);

    expect(manifest.hotUri).toBe('FN02@hot');
    expect(asked).toEqual([]);
    expect(slotGets).toEqual([instanceIdBase58]);
  });

  it('says the ticket has not spread yet rather than blaming the node', async () => {
    stubNodeIsUp();
    stubHub();
    stubLocalNode(new Map());

    await expect(resolveJoinTicketFromFreenetSlot(TICKET, FARM_ID)).rejects.toThrow(
      JoinSlotUnavailableError,
    );
    await expect(resolveJoinTicketFromFreenetSlot(TICKET, FARM_ID)).rejects.toThrow(
      /has not found that ticket yet/i,
    );
  });

  /**
   * The tablet this whole path exists for: a node app beside PUF-AM and no
   * laptop anywhere. "This tablet has no hub" was the right thing to say when
   * there was no other route; now it would send an operator looking for a
   * laptop they no longer need.
   */
  it('does not send an operator hunting for a hub they do not need', async () => {
    const { instanceIdBase58, state } = await ownerPublishes();

    capacitor.native = true;
    vi.unstubAllEnvs();
    vi.stubGlobal('window', { location: { protocol: 'https:', hostname: 'localhost' } });
    resetLocalFreenetNode();
    stubNodeIsUp();
    vi.stubGlobal('fetch', vi.fn());
    stubLocalNode(new Map([[instanceIdBase58, state]]));

    const { manifest } = await resolveJoinTicketFromFreenetSlot(TICKET, FARM_ID);
    expect(manifest.hotUri).toBe('FN02@hot');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('names the node rather than the missing hub when the slot is not there', async () => {
    capacitor.native = true;
    vi.unstubAllEnvs();
    vi.stubGlobal('window', { location: { protocol: 'https:', hostname: 'localhost' } });
    resetLocalFreenetNode();
    stubNodeIsUp();
    vi.stubGlobal('fetch', vi.fn());
    stubLocalNode(new Map());

    await expect(resolveJoinTicketFromFreenetSlot(TICKET, FARM_ID)).rejects.toThrow(
      /has not found that ticket yet/i,
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});

/**
 * Optional live test for the browser GET client, against a real 0.2 node.
 *
 * This is the on-a-bench version of what a tablet does beside a Freenet node
 * app. Point it at the node over an `adb forward` and it proves the whole chain
 * the APK depends on: a plain `WebSocket` open, a flatbuffers `GetRequest` on
 * the wire, and a `HostResponse` decoded back — with none of `Freenet02WsTransport`'s
 * Node-only scaffolding.
 *
 *   adb forward tcp:17509 tcp:7509
 *   FREENET_LIVE_WS=1 FREENET_WS_URL=ws://127.0.0.1:17509/v1/contract/command \
 *     npm test -- units/mist-freenet/freenet02-browser-get-live.test.ts
 *
 * Set `FREENET_LIVE_URI` to an `FN02@…` the node can actually find to assert a
 * fetch as well as a miss.
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  BrowserFreenetGetClient,
  DEFAULT_LOCAL_FREENET_WS_URL,
} from './src/freenet02-browser-get.ts';

const LIVE = process.env.FREENET_LIVE_WS === '1' || process.env.FREENET_LIVE_WS === 'true';
const WS_URL = process.env.FREENET_WS_URL ?? DEFAULT_LOCAL_FREENET_WS_URL;

/** A well-formed address nothing was ever published to. */
const ABSENT_URI = 'FN02@GR5hs75vNK8A1peMoJAyVSRJ4Tspn2pgnYQeco8ptUdp';

describe.skipIf(!LIVE)('BrowserFreenetGetClient (live node)', () => {
  let client: BrowserFreenetGetClient;

  afterEach(async () => {
    if (client) await client.disconnect();
  });

  it('opens the WS API with nothing but a browser WebSocket', async () => {
    client = new BrowserFreenetGetClient({ wsUrl: WS_URL });
    await client.connect();
    expect(client.isConnected()).toBe(true);
  }, 30_000);

  /**
   * Freenet *does* say "no", which is worth pinning down because the join UI is
   * built on it. This was written expecting the opposite — a search that runs
   * until the client's budget expires — but 0.2 answers an address nothing was
   * published to with `ContractNotFound` ("Contract not found"), in about 8s on
   * both a desktop 0.2.119 and the tablet's 0.2.123.
   *
   * So the outcome is `null`, not a throw. That distinction is the whole reason
   * the local node can be tried *before* a hub: a miss is an ordinary answer the
   * caller falls through on, while a throw means the node itself is unusable.
   * The "you are probably just early" wording an operator actually reads is the
   * caller's job — see `readJoinSlotState()` in `src/mist/joinSlotFreenet.ts`.
   */
  it('answers a miss with null rather than failing, and does it promptly', async () => {
    client = new BrowserFreenetGetClient({ wsUrl: WS_URL });
    const startedAt = Date.now();

    await expect(client.getBlob(ABSENT_URI, { deadlineMs: 30_000 })).resolves.toBeNull();

    // Well inside the deadline: a miss that only surfaced on timeout would make
    // every join wait out the budget before it could try the hub.
    expect(Date.now() - startedAt).toBeLessThan(30_000);
  }, 60_000);

  it.skipIf(!process.env.FREENET_LIVE_URI)('fetches a blob the node can find', async () => {
    client = new BrowserFreenetGetClient({ wsUrl: WS_URL });
    const bytes = await client.getBlob(process.env.FREENET_LIVE_URI!, { deadlineMs: 120_000 });
    expect(bytes).not.toBeNull();
    expect(bytes!.byteLength).toBeGreaterThan(0);
  }, 150_000);
});

describe('BrowserFreenetGetClient (offline guard)', () => {
  it('refuses anything that is not an FN02 address without opening a socket', async () => {
    const client = new BrowserFreenetGetClient({ wsUrl: 'ws://127.0.0.1:1/v1/contract/command' });
    await expect(client.getBlob('CHK@nope')).rejects.toThrow(/FN02/);
  });
});

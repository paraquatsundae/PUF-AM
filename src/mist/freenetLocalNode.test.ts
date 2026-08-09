/**
 * "Is there a Freenet node on this device?" — and the cost of asking.
 *
 * The answer decides whether a tablet joins a farm by itself or has to find a
 * laptop, so it has to be cheap enough to ask on every join screen and honest
 * enough that a wrong `true` does not strand an operator on a spinner. Hence a
 * bare WebSocket open with a short deadline, cached, rather than a contract GET
 * through the flatbuffers SDK.
 *
 * @see Plans/APK_FREENET_PLUGIN.md §3a
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  localFreenetNodeEligible,
  localFreenetNodeFound,
  localFreenetWsUrl,
  probeLocalFreenetNode,
  resetLocalFreenetNode,
} from './freenetLocalNode.ts';

const WS_URL = 'ws://127.0.0.1:7509/v1/contract/command';

type Outcome = 'open' | 'error' | 'close' | 'silent';

/** Every socket the code under test asked for, and how each one was answered. */
function stubWebSocket(outcome: Outcome) {
  const opened: string[] = [];
  const closed: string[] = [];

  class FakeWebSocket {
    onopen: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;

    constructor(readonly url: string) {
      opened.push(url);
      if (outcome === 'silent') return;
      // A real socket never resolves in the same tick as its constructor, and the
      // probe's handlers are attached after it returns.
      setTimeout(() => {
        if (outcome === 'open') this.onopen?.();
        else if (outcome === 'error') this.onerror?.();
        else this.onclose?.();
      }, 0);
    }

    close() {
      closed.push(this.url);
    }
  }

  vi.stubGlobal('WebSocket', FakeWebSocket);
  return { opened, closed };
}

describe('probeLocalFreenetNode', () => {
  beforeEach(() => {
    resetLocalFreenetNode();
    // Stands in for a Capacitor build. The same flag is the workshop's way to
    // point a desktop browser at a bare `freenet network`.
    vi.stubEnv('VITE_LOCAL_FREENET_WS', WS_URL);
  });

  afterEach(() => {
    resetLocalFreenetNode();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('finds a node that accepts the connection', async () => {
    const { opened } = stubWebSocket('open');

    await expect(probeLocalFreenetNode()).resolves.toBe(true);
    expect(localFreenetNodeFound()).toBe(true);
    // Asked for the encoding a real client asks for, so the node's log does not
    // fill up with clients it could not talk to.
    expect(opened).toEqual([`${WS_URL}?encodingProtocol=flatbuffers`]);
  });

  it('reports nothing there when the port refuses', async () => {
    stubWebSocket('error');

    await expect(probeLocalFreenetNode()).resolves.toBe(false);
    expect(localFreenetNodeFound()).toBe(false);
  });

  it('reports nothing there when the socket opens and is dropped', async () => {
    stubWebSocket('close');

    await expect(probeLocalFreenetNode()).resolves.toBe(false);
  });

  /** Loopback answers at once or not at all — waiting longer only holds a join up. */
  it('gives up on a socket that never answers', async () => {
    vi.useFakeTimers();
    stubWebSocket('silent');

    const probing = probeLocalFreenetNode();
    await vi.advanceTimersByTimeAsync(3000);

    await expect(probing).resolves.toBe(false);
  });

  it('asks once and reuses the answer', async () => {
    const { opened } = stubWebSocket('open');

    await probeLocalFreenetNode();
    await probeLocalFreenetNode();

    expect(opened).toHaveLength(1);
  });

  /** "Start the node app, then come back" has to work without restarting PUF-AM. */
  it('asks again when told to look properly', async () => {
    const { opened } = stubWebSocket('error');
    await expect(probeLocalFreenetNode()).resolves.toBe(false);

    stubWebSocket('open');
    await expect(probeLocalFreenetNode({ force: true })).resolves.toBe(true);
    expect(opened).toHaveLength(1);
  });

  it('closes the socket it opened rather than leaving one on the node', async () => {
    const { closed } = stubWebSocket('open');

    await probeLocalFreenetNode();

    expect(closed).toHaveLength(1);
  });

  it('does not touch the network at all where no local node is expected', async () => {
    vi.unstubAllEnvs();
    const { opened } = stubWebSocket('open');

    expect(localFreenetNodeEligible()).toBe(false);
    await expect(probeLocalFreenetNode()).resolves.toBe(false);
    expect(opened).toEqual([]);
  });
});

describe('localFreenetWsUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to where Freenet 0.2 binds its WS API', () => {
    expect(localFreenetWsUrl()).toBe(WS_URL);
  });

  it('takes a workshop endpoint from the build flag', () => {
    vi.stubEnv('VITE_LOCAL_FREENET_WS', 'ws://127.0.0.1:7600/v1/contract/command');
    expect(localFreenetWsUrl()).toBe('ws://127.0.0.1:7600/v1/contract/command');
  });
});

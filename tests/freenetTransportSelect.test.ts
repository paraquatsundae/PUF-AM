/**
 * @vitest-environment jsdom
 *
 * Plans/FREENET_NETWORK_PACK.md Phase 1 slice B, decision 2: on Electron the
 * pack's Freenet data path is the host over IPC; everywhere else it is the
 * paired hub's Express relay. This pins the selection rule, the host transport's
 * translation of host status and IPC errors, and the hash check it does in the
 * page.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DesktopBridge } from '../src/lib/desktopBridge.ts';
import {
  bridgeHasFreenetDataPath,
  createHostTransport,
  ipcErrorMessage,
  peerStatusFromHost,
  type DesktopFreenetDataBridge,
} from '../src/mist/freenetHostTransport.ts';
import { FreenetTransportError, selectFreenetTransportKind } from '../src/mist/freenetPackTransport.ts';
import { getFreenetPackTransport, setFreenetPackTransportForTests } from '../src/mist/freenetTransportSelect.ts';
import { saveMistHotPublishStatus } from '../src/mist/mistHotPublishMeta.ts';
import { sha256Hex } from '../units/mist-freenet/src/hash.ts';
import { hotKey } from '../units/mist-freenet/src/keys.ts';
import type { FreenetHostStatus } from '../units/puf-freenet-host/src/types.ts';

const INSTANCE_ID = 'B'.repeat(44);

function hostStatus(over: Partial<FreenetHostStatus> = {}): FreenetHostStatus {
  return {
    hostId: 'host-1',
    mode: 'managed',
    reachable: true,
    wsUrl: 'ws://127.0.0.1:7509/v1/contract/command',
    wsHost: '127.0.0.1',
    wsPort: 7509,
    configDir: '/cfg',
    dataDir: '/data',
    logDir: '/log',
    updateRequired: false,
    ...over,
  };
}

function fakeBridge(over: Partial<DesktopFreenetDataBridge> = {}): DesktopFreenetDataBridge {
  return {
    status: vi.fn(async () => hostStatus()),
    start: vi.fn(async () => hostStatus()),
    stop: vi.fn(async () => hostStatus({ mode: 'stopped', reachable: false })),
    onState: () => () => {},
    put: vi.fn(async () => ({ uri: 'FN02@put' })),
    get: vi.fn(async () => null),
    slotPut: vi.fn(async (input: { instanceIdBase58: string }) => ({
      uri: `FN02@${input.instanceIdBase58}`,
      instanceIdBase58: input.instanceIdBase58,
      mode: 'put' as const,
    })),
    slotGet: vi.fn(async () => null),
    ...over,
  } as DesktopFreenetDataBridge;
}

function installDesktop(freenet: Partial<DesktopBridge['freenet']>): void {
  window.pufamDesktop = {
    isDesktop: true,
    cloudApiBase: '',
    freenetApiBase: '',
    mistEnabled: true,
    platform: 'linux',
    freenet: freenet as DesktopBridge['freenet'],
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  delete window.pufamDesktop;
  setFreenetPackTransportForTests(null);
});

describe('selectFreenetTransportKind', () => {
  it('is host only for electron with a data-capable preload', () => {
    expect(selectFreenetTransportKind({ capability: 'electron', bridgeHasDataPath: true })).toBe('host');
  });

  it('falls back to the relay for every other shell', () => {
    expect(selectFreenetTransportKind({ capability: 'electron', bridgeHasDataPath: false })).toBe('relay');
    expect(selectFreenetTransportKind({ capability: 'android', bridgeHasDataPath: false })).toBe('relay');
    expect(selectFreenetTransportKind({ capability: null, bridgeHasDataPath: false })).toBe('relay');
  });
});

describe('bridgeHasFreenetDataPath', () => {
  it('needs all four data members', () => {
    expect(bridgeHasFreenetDataPath(fakeBridge())).toBe(true);
    expect(bridgeHasFreenetDataPath({ ...fakeBridge(), slotGet: undefined })).toBe(false);
    expect(bridgeHasFreenetDataPath(null)).toBe(false);
    expect(bridgeHasFreenetDataPath(undefined)).toBe(false);
  });
});

describe('getFreenetPackTransport', () => {
  it('is the relay on the hosted web', () => {
    expect(getFreenetPackTransport().kind).toBe('relay');
  });

  it('is the relay on an Electron preload without the data channels (slice A)', () => {
    installDesktop({ status: async () => hostStatus(), start: async () => hostStatus(), stop: async () => hostStatus(), onState: () => () => {} });
    expect(getFreenetPackTransport().kind).toBe('relay');
  });

  it('is the host on an Electron preload built for slice B', () => {
    installDesktop(fakeBridge());
    expect(getFreenetPackTransport().kind).toBe('host');
  });

  it('honours a pinned transport for tests', () => {
    const pinned = { kind: 'host' } as ReturnType<typeof getFreenetPackTransport>;
    setFreenetPackTransportForTests(pinned);
    expect(getFreenetPackTransport()).toBe(pinned);
  });
});

describe('peerStatusFromHost', () => {
  it('maps a managed, reachable node to a running, connected peer', () => {
    const peer = peerStatusFromHost(hostStatus({ binary: { path: '/bin/freenet', version: '0.2.1', source: 'bundled' } as FreenetHostStatus['binary'] }));
    expect(peer.running).toBe(true);
    expect(peer.connected).toBe(true);
    expect(peer.freenet).toBe('connected');
    expect(peer.backendId).toBe('puf-freenet-host');
    expect(peer.transportId).toBe('ws02');
    expect(peer.endpoint).toBe('ws://127.0.0.1:7509/v1/contract/command');
    expect(peer.rootDir).toBe('/data');
    expect(peer.nodeVersion).toBe('0.2.1');
  });

  it('is connecting while the host is starting and disconnected when stopped', () => {
    expect(peerStatusFromHost(hostStatus({ mode: 'starting', reachable: false })).freenet).toBe('connecting');
    const stopped = peerStatusFromHost(hostStatus({ mode: 'stopped', reachable: false, lastError: 'exit 1' }));
    expect(stopped.running).toBe(false);
    expect(stopped.freenet).toBe('disconnected');
    expect(stopped.lastError).toBe('exit 1');
  });

  it('describes a missing host without throwing', () => {
    const peer = peerStatusFromHost(null);
    expect(peer.running).toBe(false);
    expect(peer.lastError).toMatch(/not available/);
  });
});

describe('ipcErrorMessage', () => {
  it('strips the Electron remote-method wrapper', () => {
    expect(
      ipcErrorMessage(new Error("Error invoking remote method 'puf-freenet:put': Error: bytes: empty"), 'x'),
    ).toBe('bytes: empty');
    expect(ipcErrorMessage(new Error('plain'), 'x')).toBe('plain');
    expect(ipcErrorMessage(undefined, 'fallback')).toBe('fallback');
  });
});

describe('createHostTransport', () => {
  it('publishes through bridge.put with the storage key and reports not pending', async () => {
    const bridge = fakeBridge();
    const transport = createHostTransport(bridge);
    const ciphertext = new Uint8Array([1, 2, 3]);

    const result = await transport.publishBlob({
      farmId: 'farm-a',
      kind: 'hot',
      storageKey: hotKey('farm-a', 'current'),
      ciphertext,
      contentHash: sha256Hex(ciphertext),
    });

    expect(bridge.put).toHaveBeenCalledWith({ bytes: ciphertext, key: hotKey('farm-a', 'current') });
    expect(result.freenetUri).toBe('FN02@put');
    expect(result.freenetPending).toBe(false);
  });

  it('turns an IPC rejection into a transport error with the handler message', async () => {
    const bridge = fakeBridge({
      put: vi.fn(async () => {
        throw new Error("Error invoking remote method 'puf-freenet:put': Error: hot blob must be AEAD envelope");
      }),
    });
    const transport = createHostTransport(bridge);

    await expect(
      transport.publishBlob({ farmId: 'farm-a', kind: 'hot', storageKey: hotKey('farm-a', 'current'), ciphertext: new Uint8Array([1]), contentHash: 'x' }),
    ).rejects.toMatchObject({ reason: 'rejected', message: 'hot blob must be AEAD envelope' });
  });

  it('pulls by URI, normalising the spelling and verifying the hash in the page', async () => {
    const bytes = new Uint8Array([5, 6, 7]);
    const bridge = fakeBridge({ get: vi.fn(async () => bytes) });
    const transport = createHostTransport(bridge);

    const fetched = await transport.pullByUri({
      farmId: 'farm-a',
      kind: 'bones',
      storageKey: 'mist/v1/farm-a/bones/x',
      freenetUri: INSTANCE_ID,
      contentHash: sha256Hex(bytes),
    });

    expect(bridge.get).toHaveBeenCalledWith(`FN02@${INSTANCE_ID}`);
    expect(fetched.ciphertext).toBe(bytes);
    expect(fetched.freenetUri).toBe(`FN02@${INSTANCE_ID}`);
  });

  it('refuses bytes whose hash does not match the ticket', async () => {
    const bridge = fakeBridge({ get: vi.fn(async () => new Uint8Array([1])) });
    const transport = createHostTransport(bridge);

    await expect(
      transport.pullByUri({ farmId: 'farm-a', kind: 'hot', storageKey: hotKey('farm-a', 'current'), freenetUri: `FN02@${INSTANCE_ID}`, contentHash: 'deadbeef' }),
    ).rejects.toMatchObject({ reason: 'rejected', message: expect.stringMatching(/wrong bytes/) });
  });

  it('reports not-found when the node has nothing at the URI', async () => {
    const transport = createHostTransport(fakeBridge());
    await expect(
      transport.pullByUri({ farmId: 'farm-a', kind: 'hot', storageKey: hotKey('farm-a', 'current'), freenetUri: `FN02@${INSTANCE_ID}` }),
    ).rejects.toBeInstanceOf(FreenetTransportError);
    await expect(transport.slotRead(INSTANCE_ID)).rejects.toMatchObject({ reason: 'not-found' });
  });

  it('reads the Hot record from what this device published, not a hub index', async () => {
    const transport = createHostTransport(fakeBridge());
    expect(await transport.hotRecord('farm-a')).toBeNull();

    saveMistHotPublishStatus({
      farmId: 'farm-a',
      storageKey: hotKey('farm-a', 'current'),
      contentHash: 'abc',
      freenetUri: `FN02@${INSTANCE_ID}`,
      freenetPending: false,
      publishedAt: '2026-09-11T00:00:00.000Z',
      recordCount: 1,
      diaryCount: 1,
      issueCount: 0,
      issueArchiveCount: 0,
      encrypted: true,
    });
    expect(await transport.hotRecord('farm-a')).toMatchObject({ freenetUri: `FN02@${INSTANCE_ID}`, contentHash: 'abc' });
  });

  it('publishes a slot through bridge.slotPut and stamps publishedAt', async () => {
    const bridge = fakeBridge();
    const transport = createHostTransport(bridge);
    const result = await transport.slotPublish({ parameters: new Uint8Array(64), state: new Uint8Array([1]), instanceIdBase58: INSTANCE_ID });
    expect(result.instanceIdBase58).toBe(INSTANCE_ID);
    expect(result.mode).toBe('put');
    expect(result.publishedAt).toMatch(/^\d{4}-/);
    expect(bridge.slotPut).toHaveBeenCalledTimes(1);
  });

  it('starts the node for peerStart and leaves peerStop to the node button', async () => {
    const bridge = fakeBridge();
    const transport = createHostTransport(bridge);
    const started = await transport.peerStart({ contribute: false });
    expect(bridge.start).toHaveBeenCalledTimes(1);
    expect(started.running).toBe(true);
    await transport.peerStop();
    expect(bridge.stop).not.toHaveBeenCalled();
  });
});

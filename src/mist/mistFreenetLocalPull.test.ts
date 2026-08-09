/**
 * Pulling the farm itself off a Freenet node on this device.
 *
 * The slot resolve answers *where* the farm is; this is the part that fetches it.
 * On a hub the work is `POST /hot|bones/pull-by-uri` and the laptop's peer does
 * the GET; on a tablet with its own node the page does the GET and writes the
 * ciphertext straight into IndexedDB. The bytes are AEAD-sealed either way — the
 * node never holds a farm key, which is what makes borrowing someone else's node
 * acceptable at all.
 *
 * @see Plans/APK_FREENET_PLUGIN.md §3a
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { hotKey } from '../../units/mist-freenet/src/keys.ts';
import { sha256Hex } from '../../units/mist-freenet/src/hash.ts';
import { parseFreenet02Uri } from '../../units/mist-freenet/src/freenet02-uri.ts';
import { resetLocalFreenetNode, setLocalFreenetClientFactory } from './freenetLocalNode.ts';
import { pullBonesFromFreenetByUri, pullHotFromFreenetByUri } from './mistFreenetClient.ts';

const FARM_ID = 'farm-abc';
const WS_URL = 'ws://127.0.0.1:7509/v1/contract/command';
const HOT_URI = 'FN02@GR5hs75vNK8A1peMoJAyVSRJ4Tspn2pgnYQeco8ptUdp';
const BONES_URI = 'FN02@GR5hs75vNK8A1peMoJAyVSRJ4Tspn2pgnYQeco8ptUdq';

const HOT_CIPHERTEXT = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const BONES_CIPHERTEXT = new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2]);

type StoredPut = { key: string; ciphertext: Uint8Array; kind: string; contentHash: string };

const stored = vi.hoisted(() => ({ puts: [] as StoredPut[] }));
const savedUris = vi.hoisted(() => ({ hot: [] as unknown[], bones: [] as unknown[] }));

vi.mock('./mistHotBridge.ts', () => ({
  getMistStoreForHotBridge: async () => ({
    put: async (
      key: string,
      ciphertext: Uint8Array,
      meta: { kind: string; content_hash: string },
    ) => {
      stored.puts.push({ key, ciphertext, kind: meta.kind, contentHash: meta.content_hash });
      return { key, contentHash: meta.content_hash, size: ciphertext.byteLength, ts: 0 };
    },
    get: async () => null,
  }),
  publishLocalFarmToMistHot: async () => ({}),
}));

vi.mock('./mistBonesBridge.ts', () => ({
  publishLocalGeometryToMistBones: async () => ({}),
  readLocalBonesCiphertext: async () => null,
}));

vi.mock('./mistHotPublishMeta.ts', () => ({
  saveFreenetHotUri: (_farmId: string, record: unknown) => savedUris.hot.push(record),
  saveFreenetBonesUri: (_farmId: string, record: unknown) => savedUris.bones.push(record),
  saveJoinTicketForFarm: () => {},
}));

/** A node on this device holding whatever the map says. */
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

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function nodeless(uri: string, ciphertext: Uint8Array) {
  return new Map([[parseFreenet02Uri(uri)!, ciphertext]]);
}

describe('pulling a farm from a Freenet node on this device', () => {
  beforeEach(() => {
    stored.puts = [];
    savedUris.hot = [];
    savedUris.bones = [];
    resetLocalFreenetNode();
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('btoa', (s: string) => Buffer.from(s, 'binary').toString('base64'));
    vi.stubGlobal('atob', (s: string) => Buffer.from(s, 'base64').toString('binary'));
    vi.stubEnv('VITE_LOCAL_FREENET_WS', WS_URL);
  });

  afterEach(() => {
    setLocalFreenetClientFactory(null);
    resetLocalFreenetNode();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('writes Hot into IndexedDB without a hub in the loop', async () => {
    stubNodeIsUp();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { asked } = stubLocalNode(nodeless(HOT_URI, HOT_CIPHERTEXT));

    const result = await pullHotFromFreenetByUri(FARM_ID, HOT_URI, sha256Hex(HOT_CIPHERTEXT));

    expect(result.mergedToLocal).toBe(true);
    expect(result.freenetUri).toBe(HOT_URI);
    expect(asked).toEqual([HOT_URI]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stored.puts).toEqual([
      {
        key: hotKey(FARM_ID, 'current'),
        ciphertext: HOT_CIPHERTEXT,
        kind: 'hot',
        contentHash: sha256Hex(HOT_CIPHERTEXT),
      },
    ]);
    expect(savedUris.hot).toHaveLength(1);
  });

  it('does the same for the farm geometry', async () => {
    stubNodeIsUp();
    vi.stubGlobal('fetch', vi.fn());
    stubLocalNode(nodeless(BONES_URI, BONES_CIPHERTEXT));

    const result = await pullBonesFromFreenetByUri(FARM_ID, BONES_URI);

    expect(result.mergedToLocal).toBe(true);
    expect(stored.puts[0]?.kind).toBe('bones');
    expect(stored.puts[0]?.ciphertext).toEqual(BONES_CIPHERTEXT);
    expect(savedUris.bones).toHaveLength(1);
  });

  /**
   * The manifest the owner signed carries the hash, so the page can tell a blob
   * some peer substituted from the one that was published. The hub route cannot:
   * it labels whatever it fetched with the hash it was told to expect.
   */
  it('refuses bytes that are not the ones the ticket named', async () => {
    stubNodeIsUp();
    vi.stubGlobal('fetch', vi.fn());
    stubLocalNode(nodeless(HOT_URI, HOT_CIPHERTEXT));

    await expect(
      pullHotFromFreenetByUri(FARM_ID, HOT_URI, sha256Hex(BONES_CIPHERTEXT)),
    ).rejects.toThrow(/wrong bytes/i);
    expect(stored.puts).toEqual([]);
  });

  it('falls back to the hub when this device has not found the blob', async () => {
    stubNodeIsUp();
    const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({
        storageKey: hotKey(FARM_ID, 'current'),
        ciphertextBase64: bytesToBase64(HOT_CIPHERTEXT),
        contentHash: sha256Hex(HOT_CIPHERTEXT),
        freenetUri: HOT_URI,
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    stubLocalNode(new Map());

    const result = await pullHotFromFreenetByUri(FARM_ID, HOT_URI);

    expect(result.mergedToLocal).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/hot/pull-by-uri/');
    expect(stored.puts[0]?.ciphertext).toEqual(HOT_CIPHERTEXT);
  });
});

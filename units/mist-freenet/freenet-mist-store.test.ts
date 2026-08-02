import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  archiveKey,
  bonesKey,
  hotKey,
  kindPrefix,
  manifestKey,
  sealHotPeriod,
  type HotState,
} from './src/index.ts';
import {
  FreenetMistStore,
  MockFreenetTransport,
} from './src/node.ts';

const FARM = 'farm-freenet-test';

describe('FcpProtocol', () => {
  it('round-trips ClientHello and EndMessage frames', async () => {
    const { encodeClientHello, parseFcpStream } = await import('./src/fcp-protocol.ts');
    const hello = encodeClientHello('test-client');
    const chunk = new TextEncoder().encode(hello);
    const { messages, state } = parseFcpStream({ buffer: new Uint8Array(0) }, chunk);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.name).toBe('ClientHello');
    expect(messages[0]?.fields.Name).toBe('test-client');
    expect(state.buffer.byteLength).toBe(0);
  });
});

describe('FreenetMistStore (mock transport)', () => {
  let rootDir: string;
  let transport: MockFreenetTransport;

  afterEach(async () => {
    if (rootDir) await rm(rootDir, { recursive: true, force: true });
  });

  async function openStore(options: { contribute?: boolean; failConnect?: boolean } = {}) {
    rootDir = await mkdtemp(path.join(os.tmpdir(), 'mist-freenet-'));
    transport = new MockFreenetTransport({
      startDisconnected: true,
      failConnect: options.failConnect,
    });
    const store = new FreenetMistStore({
      rootDir,
      transport,
      contribute: options.contribute ?? false,
    });
    await store.init();
    return store;
  }

  it('put → get via disk cache and Freenet insert', async () => {
    const store = await openStore();
    const key = bonesKey(FARM, 'boundaries');
    const ciphertext = new TextEncoder().encode('sealed-bones-freenet');

    const put = await store.put(key, ciphertext, { kind: 'bones', version: 1 });
    expect(put.contentHash).toMatch(/^[a-f0-9]{64}$/);

    const record = store.getFreenetRecord(key);
    expect(record?.pending).toBe(false);
    expect(record?.uri).toBeTruthy();
    expect(transport.hasUri(record!.uri)).toBe(true);

    const got = await store.get(key);
    expect(new TextDecoder().decode(got!.ciphertext)).toBe('sealed-bones-freenet');
    expect(transport.getPutCount()).toBe(1);
  });

  it('list by prefix after reopen', async () => {
    const store1 = await openStore();
    await store1.put(bonesKey(FARM, 'tiles'), new Uint8Array([1]), { kind: 'bones' });
    await store1.put(hotKey(FARM), new Uint8Array([2]), { kind: 'hot' });
    await store1.put(bonesKey(FARM, 'infra'), new Uint8Array([3]), { kind: 'bones' });

    const store2 = new FreenetMistStore({
      rootDir,
      transport: new MockFreenetTransport(),
    });
    await store2.init();
    const bones = await store2.list(kindPrefix(FARM, 'bones'));
    expect(bones).toHaveLength(2);
  });

  it('queues outbox when transport disconnected', async () => {
    const store = await openStore({ failConnect: true });
    const key = hotKey(FARM);
    await store.put(key, new Uint8Array([9]), { kind: 'hot' });

    const health = await store.health();
    expect(health.freenet).toBe('disconnected');
    expect(health.ok).toBe(true);

    const stats = await store.stats();
    expect(stats.freenetPendingInserts).toBe(1);

    const got = await store.get(key);
    expect(got?.meta.kind).toBe('hot');
    expect(transport.getPutCount()).toBe(0);

    const transportUp = new MockFreenetTransport();
    const store2 = new FreenetMistStore({ rootDir, transport: transportUp });
    await store2.init();
    const flushed = await store2.flushOutbox();
    expect(flushed).toBe(1);
    expect(store2.getFreenetRecord(key)?.pending).toBe(false);
    expect((await store2.stats()).freenetPendingInserts).toBe(0);
  });

  it('health reports connected after transport connect', async () => {
    const store = await openStore();
    await transport.connect();
    const key = bonesKey(FARM, 'a');
    await store.put(key, new Uint8Array([1]), { kind: 'bones' });

    const health = await store.health();
    expect(health.freenet).toBe('connected');
    expect(health.backendId).toBe('freenet-mist');
  });

  it('contribute=false still inserts own data with minimal replication flag', async () => {
    const store = await openStore({ contribute: false });
    expect(store.getContribute()).toBe(false);

    const key = manifestKey(FARM);
    await store.put(key, new Uint8Array([5]), { kind: 'manifest' });
    expect(store.getFreenetRecord(key)?.pending).toBe(false);

    const stats = await store.stats();
    expect(stats.contribute).toBe(false);
  });

  it('watch notifies on local put', async () => {
    const store = await openStore();
    const key = hotKey(FARM);
    const cb = vi.fn();
    store.watch(key, cb);
    await new Promise<void>((r) => setTimeout(r, 10));
    expect(cb).toHaveBeenCalledWith(null);

    await store.put(key, new Uint8Array([7]), { kind: 'hot' });
    expect(cb).toHaveBeenLastCalledWith(expect.objectContaining({ key }));
  });

  it('re-fetches from transport when disk blob missing but index has URI', async () => {
    const store = await openStore();
    const key = bonesKey(FARM, 'remote');
    const data = new TextEncoder().encode('remote-blob');
    await store.put(key, data, { kind: 'bones' });
    const uri = store.getFreenetRecord(key)!.uri;

    const { rm: rmFile } = await import('node:fs/promises');
    const blobRel = key.split('/').join(path.sep);
    await rmFile(path.join(rootDir, 'blobs', blobRel, 'data.bin'));

    const got = await store.get(key);
    expect(got).not.toBeNull();
    expect(new TextDecoder().decode(got!.ciphertext)).toBe('remote-blob');
    expect(transport.hasUri(uri)).toBe(true);
    expect(transport.getGetCount()).toBeGreaterThan(0);
  });
});

function sampleHotState(records: HotState['records']): Uint8Array {
  const state: HotState = {
    farm_id: FARM,
    window_start: '2025-06-01T00:00:00.000Z',
    records,
    tombstones: [],
    last_sealed: null,
  };
  return new TextEncoder().encode(JSON.stringify(state));
}

describe('sealHotPeriod on FreenetMistStore', () => {
  it('seals hot → archive + manifest', async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), 'mist-freenet-seal-'));
    try {
      const transport = new MockFreenetTransport();
      const store = new FreenetMistStore({ rootDir, transport });
      await store.init();

      await store.put(
        hotKey(FARM),
        sampleHotState([
          {
            id: 'r1',
            type: 'diary',
            ts: '2025-03-15T10:00:00.000Z',
            author: 'dev-1',
            payload: { note: 'spring' },
          },
        ]),
        { kind: 'hot' },
      );

      const result = await sealHotPeriod(store, {
        farmId: FARM,
        period: '2025',
        sealedBy: 'test-admin',
        now: Date.parse('2026-01-02T04:12:00.000Z'),
      });

      expect(result.recordCount).toBe(1);
      expect(await store.get(archiveKey(FARM, '2025'))).not.toBeNull();
      expect((await store.get(manifestKey(FARM)))?.meta.version).toBe(1);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});

describe.skipIf(!process.env.FREENET_FCP_HOST)('FcpFreenetTransport (live node)', () => {
  it('puts and gets a small blob against a running Hyphanet node', async () => {
    const { FcpFreenetTransport } = await import('./src/fcp-freenet-transport.ts');
    const transport = new FcpFreenetTransport();
    await transport.connect();

    const data = new TextEncoder().encode(`pufam-mist-live-${Date.now()}`);
    const { uri } = await transport.putBlob(data, { identifier: 'live-test-put' });
    expect(uri.startsWith('CHK@')).toBe(true);

    const fetched = await transport.getBlob(uri);
    expect(new TextDecoder().decode(fetched!)).toBe(new TextDecoder().decode(data));

    await transport.disconnect();
  }, 180_000);
});

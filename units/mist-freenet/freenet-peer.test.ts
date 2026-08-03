import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { encryptHotBlob, hotKey, type HotState } from './src/index.ts';
import { createFreenetPeer } from './src/freenet-peer.ts';
import { MockFreenetTransport } from './src/node.ts';

const FARM = 'peer-sync-farm';
const FARM_SEED = new Uint8Array(32).fill(9);

describe('FreenetPeer lifecycle', () => {
  let rootDir: string;

  afterEach(async () => {
    if (rootDir) await rm(rootDir, { recursive: true, force: true });
  });

  it('start → status → stop with mock transport', async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), 'mist-freenet-peer-'));
    const transport = new MockFreenetTransport();
    const peer = createFreenetPeer({
      rootDir,
      transport,
      allowPlaintextForTests: true,
    });

    let status = await peer.status();
    expect(status.running).toBe(false);

    status = await peer.start();
    expect(status.running).toBe(true);
    expect(status.freenet).toBe('connected');

    status = await peer.stop();
    expect(status.running).toBe(false);
    expect(status.connected).toBe(false);
  });
});

describe('FreenetPeer Hot sync (mock transport)', () => {
  let rootDirA: string;
  let rootDirB: string;

  afterEach(async () => {
    for (const dir of [rootDirA, rootDirB]) {
      if (dir) await rm(dir, { recursive: true, force: true });
    }
  });

  it('shared mock transport fetches CHK inserted by peer A', async () => {
    rootDirA = await mkdtemp(path.join(os.tmpdir(), 'mist-freenet-a-'));
    rootDirB = await mkdtemp(path.join(os.tmpdir(), 'mist-freenet-b-'));

    const sharedTransport = new MockFreenetTransport();
    const peerA = createFreenetPeer({
      rootDir: rootDirA,
      transport: sharedTransport,
    });
    const peerB = createFreenetPeer({
      rootDir: rootDirB,
      transport: sharedTransport,
    });

    await peerA.start();
    await peerB.start();

    const hotState: HotState = {
      farm_id: FARM,
      window_start: '2026-06-01T00:00:00.000Z',
      records: [{ id: 'r1', type: 'diary', ts: '2026-06-02T10:00:00.000Z', author: 'a', payload: {} }],
      tombstones: [],
      last_sealed: null,
    };
    const plain = new TextEncoder().encode(JSON.stringify(hotState));
    const ciphertext = await encryptHotBlob(plain, FARM_SEED);
    const key = hotKey(FARM, 'current');

    await peerA.getStore().put(key, ciphertext, { kind: 'hot' });

    const record = peerA.getStore().getFreenetRecord(key);
    expect(record?.pending).toBe(false);
    expect(record?.uri).toBeTruthy();

    const fromNetwork = await sharedTransport.getBlob(record!.uri);
    expect(fromNetwork).not.toBeNull();
    expect(fromNetwork!.byteLength).toBe(ciphertext.byteLength);

    await peerB.getStore().put(key, fromNetwork!, {
      kind: 'hot',
      content_hash: record!.content_hash,
    });
    const localB = await peerB.getStore().get(key);
    expect(localB?.ciphertext.byteLength).toBe(ciphertext.byteLength);
  });
});

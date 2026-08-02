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
  MemoryMistStore,
  MistStorageFullError,
  sealHotPeriod,
  type HotState,
} from './src/index.ts';
import { DiskMistStore } from './src/node.ts';

const FARM = 'farm-disk-test';

describe('DiskMistStore', () => {
  let rootDir: string;

  afterEach(async () => {
    if (rootDir) {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  async function openStore(options: { contribute?: boolean; maxBytes?: number } = {}) {
    rootDir = await mkdtemp(path.join(os.tmpdir(), 'mist-disk-'));
    const store = new DiskMistStore({ rootDir, ...options });
    await store.init();
    return store;
  }

  it('put bones → close → reopen → get', async () => {
    const key = bonesKey(FARM, 'boundaries');
    const ciphertext = new TextEncoder().encode('sealed-bones-v1');

    const store1 = await openStore();
    const put = await store1.put(key, ciphertext, { kind: 'bones', version: 1 });
    expect(put.contentHash).toMatch(/^[a-f0-9]{64}$/);

    const store2 = new DiskMistStore({ rootDir });
    await store2.init();
    const got = await store2.get(key);
    expect(got?.meta.kind).toBe('bones');
    expect(got?.meta.version).toBe(1);
    expect(new TextDecoder().decode(got!.ciphertext)).toBe('sealed-bones-v1');
  });

  it('list by prefix after reopen', async () => {
    const store1 = await openStore();
    await store1.put(bonesKey(FARM, 'tiles'), new Uint8Array([1]), { kind: 'bones' });
    await store1.put(hotKey(FARM), new Uint8Array([2]), { kind: 'hot' });
    await store1.put(bonesKey(FARM, 'infra'), new Uint8Array([3]), { kind: 'bones' });

    const store2 = new DiskMistStore({ rootDir });
    await store2.init();
    const bones = await store2.list(kindPrefix(FARM, 'bones'));
    expect(bones).toHaveLength(2);
    expect(bones.map((e) => e.key).sort()).toEqual(
      [bonesKey(FARM, 'infra'), bonesKey(FARM, 'tiles')].sort(),
    );
  });

  it('persists contribute flag across reopen', async () => {
    const store1 = await openStore({ contribute: false });
    expect(store1.getContribute()).toBe(false);
    store1.setContribute(true);

    const store2 = new DiskMistStore({ rootDir });
    await store2.init();
    expect(store2.getContribute()).toBe(true);
    const health = await store2.health();
    expect(health.contribute).toBe(true);
    const stats = await store2.stats();
    expect(stats.backendId).toBe('local-fake-freenet');
    expect(stats.contribute).toBe(true);
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

  it('rejects put when maxBytes would be exceeded', async () => {
    const store = await openStore({ maxBytes: 10 });
    await store.put(bonesKey(FARM, 'a'), new Uint8Array(6), { kind: 'bones' });

    await expect(
      store.put(bonesKey(FARM, 'b'), new Uint8Array(6), { kind: 'bones' }),
    ).rejects.toBeInstanceOf(MistStorageFullError);

    const err = await store
      .put(bonesKey(FARM, 'b'), new Uint8Array(6), { kind: 'bones' })
      .catch((e) => e);
    expect(err).toMatchObject({ code: 'MIST_STORAGE_FULL', maxBytes: 10 });
  });

  it('allows overwrite within maxBytes budget', async () => {
    const store = await openStore({ maxBytes: 10 });
    const key = bonesKey(FARM, 'a');
    await store.put(key, new Uint8Array(8), { kind: 'bones' });
    await store.put(key, new Uint8Array(4), { kind: 'bones' });
    const stats = await store.stats();
    expect(stats.diskUsedBytes).toBe(4);
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

describe('sealHotPeriod', () => {
  const now = Date.parse('2026-01-02T04:12:00.000Z');

  it('seals hot → archive + manifest on MemoryMistStore', async () => {
    const store = new MemoryMistStore();
    const hotBlob = sampleHotState([
      {
        id: 'r1',
        type: 'diary',
        ts: '2025-03-15T10:00:00.000Z',
        author: 'dev-1',
        payload: { note: 'spring' },
      },
      {
        id: 'r2',
        type: 'spray',
        ts: '2026-02-01T08:00:00.000Z',
        author: 'dev-1',
        payload: { product: 'x' },
      },
    ]);
    await store.put(hotKey(FARM), hotBlob, { kind: 'hot' });

    const result = await sealHotPeriod(store, {
      farmId: FARM,
      period: '2025',
      sealedBy: 'test-admin',
      now,
    });

    expect(result.recordCount).toBe(1);
    expect(result.manifestVersion).toBe(1);
    expect(result.hotRecordsRemaining).toBe(1);

    const archive = await store.get(archiveKey(FARM, '2025'));
    expect(archive?.meta.period).toBe('2025');
    expect(archive?.meta.content_hash).toBe(result.contentHash);

    const manifest = await store.get(manifestKey(FARM));
    expect(manifest?.meta.version).toBe(1);
    const manifestJson = JSON.parse(new TextDecoder().decode(manifest!.ciphertext));
    expect(manifestJson.archives).toHaveLength(1);
    expect(manifestJson.archives[0].record_count).toBe(1);

    const hotAfter = JSON.parse(
      new TextDecoder().decode((await store.get(hotKey(FARM)))!.ciphertext),
    );
    expect(hotAfter.records).toHaveLength(1);
    expect(hotAfter.records[0].id).toBe('r2');
    expect(hotAfter.last_sealed).toBe('2026-01-02T04:12:00.000Z');
  });

  it('seals hot → archive + manifest on DiskMistStore (survives reopen)', async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), 'mist-seal-'));
    try {
      const store1 = new DiskMistStore({ rootDir });
      await store1.init();
      await store1.put(
        hotKey(FARM),
        sampleHotState([
          {
            id: 'a',
            type: 'observation',
            ts: '2025-11-01T12:00:00.000Z',
            author: 'pin-1',
            payload: {},
          },
        ]),
        { kind: 'hot' },
      );

      await sealHotPeriod(store1, { farmId: FARM, period: '2025', now });

      const store2 = new DiskMistStore({ rootDir });
      await store2.init();
      const archive = await store2.get(archiveKey(FARM, '2025'));
      expect(archive).not.toBeNull();
      const manifest = await store2.get(manifestKey(FARM));
      expect(manifest?.meta.version).toBe(1);
      const hot = await store2.get(hotKey(FARM));
      const hotJson = JSON.parse(new TextDecoder().decode(hot!.ciphertext));
      expect(hotJson.records).toHaveLength(0);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});

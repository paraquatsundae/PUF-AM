import { describe, expect, it, vi } from 'vitest';
import {
  archiveKey,
  bonesKey,
  createFarmStoreAdapter,
  hotKey,
  kindPrefix,
  manifestKey,
  MemoryMistStore,
  parseMistKey,
} from './src/index.ts';

const FARM = 'farm-abc123';

describe('mist key helpers', () => {
  it('builds farm-scoped keys for each contract kind', () => {
    expect(bonesKey(FARM, 'boundaries')).toBe('mist/v1/farm/farm-abc123/bones/boundaries');
    expect(hotKey(FARM)).toBe('mist/v1/farm/farm-abc123/hot/current');
    expect(archiveKey(FARM, '2026')).toBe('mist/v1/farm/farm-abc123/archive/2026');
    expect(manifestKey(FARM)).toBe('mist/v1/farm/farm-abc123/manifest');
    expect(kindPrefix(FARM, 'bones')).toBe('mist/v1/farm/farm-abc123/bones');
  });

  it('round-trips parseMistKey', () => {
    const key = bonesKey(FARM, 'tiles-pack-1');
    expect(parseMistKey(key)).toEqual({
      farmId: FARM,
      kind: 'bones',
      segments: ['tiles-pack-1'],
    });
  });
});

describe('MemoryMistStore', () => {
  it('put/get/list and computes content_hash', async () => {
    const store = new MemoryMistStore();
    const key = hotKey(FARM);
    const ciphertext = new TextEncoder().encode('sealed-hot-bytes');

    const put = await store.put(key, ciphertext, { kind: 'hot' });
    expect(put.key).toBe(key);
    expect(put.size).toBe(ciphertext.byteLength);
    expect(put.contentHash).toMatch(/^[a-f0-9]{64}$/);

    const got = await store.get(key);
    expect(got?.meta.kind).toBe('hot');
    expect(got?.meta.content_hash).toBe(put.contentHash);

    const listed = await store.list(kindPrefix(FARM, 'hot'));
    expect(listed).toHaveLength(1);
    expect(listed[0]?.key).toBe(key);
  });

  it('defaults contribute off and reports stats', async () => {
    const store = new MemoryMistStore({ backendId: 'memory-test' });
    expect(store.getContribute()).toBe(false);

    await store.put(manifestKey(FARM), new Uint8Array([1, 2, 3]), { kind: 'manifest' });
    const stats = await store.stats();
    expect(stats.backendId).toBe('memory-test');
    expect(stats.contribute).toBe(false);
    expect(stats.entryCount).toBe(1);
    expect(stats.diskUsedBytes).toBe(3);

    store.setContribute(true);
    const health = await store.health();
    expect(health.contribute).toBe(true);
    expect(health.ok).toBe(true);
  });

  it('watch notifies on put', async () => {
    const store = new MemoryMistStore();
    const key = archiveKey(FARM, '2025');
    const cb = vi.fn();
    const unsub = store.watch(key, cb);

    await new Promise<void>((r) => queueMicrotask(r));
    expect(cb).toHaveBeenCalledWith(null);

    await store.put(key, new Uint8Array([9]), { kind: 'archive', period: '2025' });
    expect(cb).toHaveBeenLastCalledWith(
      expect.objectContaining({ key, meta: expect.objectContaining({ kind: 'archive', period: '2025' }) }),
    );

    unsub();
  });
});

describe('FarmStoreAdapter', () => {
  it('wires mist backend to MistStore', () => {
    const mist = new MemoryMistStore();
    const adapter = createFarmStoreAdapter('mist', mist);
    expect(adapter.backendId).toBe('mist');
    expect(adapter.mist).toBe(mist);
  });

  it('cloud backend has no mist surface', () => {
    const adapter = createFarmStoreAdapter('cloud');
    expect(adapter.mist).toBeNull();
  });
});

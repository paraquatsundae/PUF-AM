import 'fake-indexeddb/auto';
import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  archiveKey,
  bonesKey,
  hotKey,
  IndexedDbMistStore,
  manifestKey,
} from './src/index.ts';

const FARM = 'farm-abc123';

describe('IndexedDbMistStore', () => {
  afterEach(async () => {
    const store = await IndexedDbMistStore.open({ backendId: 'test-idb' });
    await store.clearAll();
  });

  it('put/get/list survives re-open (reload simulation)', async () => {
    const key = bonesKey(FARM, 'boundaries');
    const ciphertext = new TextEncoder().encode('sealed-bones-bytes');

    const store1 = await IndexedDbMistStore.open({ backendId: 'test-idb-1' });
    const put = await store1.put(key, ciphertext, { kind: 'bones', version: 1 });
    expect(put.contentHash).toMatch(/^[a-f0-9]{64}$/);

    const store2 = await IndexedDbMistStore.open({ backendId: 'test-idb-2' });
    const got = await store2.get(key);
    expect(got?.meta.kind).toBe('bones');
    expect(got?.meta.content_hash).toBe(put.contentHash);
    expect(new TextDecoder().decode(got!.ciphertext)).toBe('sealed-bones-bytes');

    const listed = await store2.list(`mist/v1/farm/${FARM}/bones`);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.key).toBe(key);
  });

  it('clearAll removes all entries', async () => {
    const store = await IndexedDbMistStore.open({ backendId: 'test-clear' });
    await store.put(hotKey(FARM), new Uint8Array([1]), { kind: 'hot' });
    await store.put(manifestKey(FARM), new Uint8Array([2]), { kind: 'manifest' });
    expect((await store.stats()).entryCount).toBe(2);

    await store.clearAll();
    expect((await store.stats()).entryCount).toBe(0);
    expect(await store.get(hotKey(FARM))).toBeNull();
  });

  it('watch notifies on put', async () => {
    const store = await IndexedDbMistStore.open({ backendId: 'test-watch' });
    const key = archiveKey(FARM, '2026');
    const cb = vi.fn();
    const unsub = store.watch(key, cb);

    await new Promise<void>((r) => setTimeout(r, 10));
    expect(cb).toHaveBeenCalledWith(null);

    await store.put(key, new Uint8Array([9]), { kind: 'archive', period: '2026' });
    await new Promise<void>((r) => setTimeout(r, 10));
    expect(cb).toHaveBeenLastCalledWith(
      expect.objectContaining({
        key,
        meta: expect.objectContaining({ kind: 'archive', period: '2026' }),
      }),
    );

    unsub();
  });

  it('defaults contribute off', async () => {
    const store = await IndexedDbMistStore.open({ backendId: 'test-contrib' });
    expect(store.getContribute()).toBe(false);
    store.setContribute(true);

    const reopened = await IndexedDbMistStore.open({ backendId: 'test-contrib-reopen' });
    expect(reopened.getContribute()).toBe(true);
  });
});

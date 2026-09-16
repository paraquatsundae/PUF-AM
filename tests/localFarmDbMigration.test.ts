import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange, IDBObjectStore } from 'fake-indexeddb';
import { ENTITY_STORE, openLocalFarmDb } from '../src/lib/localFarmDb';
import {
  listLocalEntities, listOutbox, upsertLocalEntity, type OutboxOp,
} from '../src/lib/localFarmRepo';

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function openVersion(version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('pufom_farm_local', version);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('entities', { keyPath: 'key' });
      db.createObjectStore('outbox', { keyPath: 'id' }).createIndex('byFarm', 'farmId');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
const queued: OutboxOp = {
  id: 'existing-op', farmId: 'farm', kind: 'diary', op: 'delete', entityId: 'gone',
  updatedAt: '2026-09-01', createdAt: '2026-09-01', attempts: 3, sequence: 12,
};
const legacyQueued: OutboxOp = {
  id: 'legacy-op', farmId: 'other-farm', kind: 'diary', op: 'upsert', entityId: 'pending',
  payload: { id: 'pending', type: 'work', date: '2026-09-01', notes: 'Unsynced work' },
  updatedAt: '2026-09-01', createdAt: '2026-09-01',
};
async function seedV1(): Promise<IDBDatabase> {
  const db = await openVersion(1);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['entities', 'outbox'], 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    for (const farmId of ['farm', 'other-farm']) {
      for (const kind of ['diary', 'issues', 'issues_archive', 'map_highlights']) {
        tx.objectStore('entities').put({
          key: `${farmId}:${kind}`, farmId, kind, updatedAt: '2026-09-01',
          items: [{ id: 'same-id', date: '2026-09-01', type: 'work', title: `${farmId}/${kind}` }],
        });
      }
    }
    tx.objectStore('outbox').put(queued);
    tx.objectStore('outbox').put(legacyQueued);
  });
  return db;
}

describe('local farm v1 → v2 migration', () => {
  it('preserves every farm/kind, entity payload and pending delivery', async () => {
    (await seedV1()).close();
    const db = await openLocalFarmDb();
    expect(db.version).toBe(2);
    expect(db.objectStoreNames.contains('entities')).toBe(false);
    const tx = db.transaction(ENTITY_STORE, 'readonly');
    const store = tx.objectStore(ENTITY_STORE);
    expect(store.keyPath).toEqual(['farmId', 'kind', 'entityId']);
    db.close();
    for (const farmId of ['farm', 'other-farm']) {
      for (const kind of ['diary', 'issues', 'issues_archive', 'map_highlights'] as const) {
        expect(await listLocalEntities(farmId, kind)).toEqual([
          { id: 'same-id', date: '2026-09-01', type: 'work', title: `${farmId}/${kind}` },
        ]);
      }
    }
    expect(await listOutbox()).toEqual([queued, legacyQueued]);
    await upsertLocalEntity('farm', 'diary', { id: 'new', type: 'work', date: '2026-09-15' });
    expect((await listOutbox()).find(op => op.entityId === 'new')?.sequence).toBe(13);
  });

  it('rolls back schema and copies when migration fails partway through', async () => {
    (await seedV1()).close();
    const original = IDBObjectStore.prototype.put;
    let copied = 0;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (...args) {
      if (this.name === ENTITY_STORE && ++copied === 2) throw new Error('Disk full');
      return original.apply(this, args);
    });
    await expect(openLocalFarmDb()).rejects.toThrow();
    spy.mockRestore();
    const old = await openVersion(1);
    expect(old.objectStoreNames.contains('entities')).toBe(true);
    expect(old.objectStoreNames.contains(ENTITY_STORE)).toBe(false);
    old.close();
    // Retrying migrates all original records; none were lost by the aborted copy.
    expect(await listLocalEntities('other-farm', 'map_highlights')).toHaveLength(1);
    expect(await listOutbox()).toEqual([queued, legacyQueued]);
  });

  it('reports a blocked old tab and can retry after it closes', async () => {
    const old = await seedV1();
    await expect(openLocalFarmDb()).rejects.toThrow('Close other PUF-AM tabs');
    old.close();
    const db = await openLocalFarmDb();
    expect(db.version).toBe(2);
    db.close();
    expect(await listOutbox()).toEqual([queued, legacyQueued]);
  });

  it('closes current connections on versionchange', async () => {
    const db = await openLocalFarmDb();
    await new Promise<void>((resolve, reject) => {
      const upgrade = indexedDB.open('pufom_farm_local', 3);
      upgrade.onsuccess = () => { upgrade.result.close(); resolve(); };
      upgrade.onerror = () => reject(upgrade.error);
      upgrade.onblocked = () => reject(new Error('Connection did not close'));
    });
    expect(() => db.transaction(ENTITY_STORE)).toThrow();
  });
});

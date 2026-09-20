import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { ENTITY_STORE, openLocalFarmDb } from '../src/lib/localFarmDb';
import { listLocalEntities, listOutbox, upsertLocalEntity } from '../src/lib/localFarmRepo';

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('local farm database initialization', () => {
  it('creates the per-entity schema and starts an empty outbox', async () => {
    const db = await openLocalFarmDb();
    expect(db.version).toBe(2);
    expect([...db.objectStoreNames]).toEqual(['entities_v2', 'metadata', 'outbox']);
    expect(db.transaction(ENTITY_STORE).objectStore(ENTITY_STORE).keyPath)
      .toEqual(['farmId', 'kind', 'entityId']);
    db.close();
    expect(await listOutbox()).toEqual([]);
    await upsertLocalEntity('farm', 'diary', { id: 'one', type: 'work', date: '2026-09-18' });
    expect((await listOutbox())[0].sequence).toBe(1);
  });

  it('reopens an existing current-schema database without resetting data or sequence', async () => {
    await upsertLocalEntity('farm', 'diary', { id: 'one', type: 'work', date: '2026-09-18' });
    const db = await openLocalFarmDb();
    db.close();
    await upsertLocalEntity('farm', 'diary', { id: 'two', type: 'work', date: '2026-09-18' });
    expect(await listLocalEntities('farm', 'diary')).toHaveLength(2);
    expect((await listOutbox()).map(op => op.sequence).sort()).toEqual([1, 2]);
  });

  it('requires an explicit reset for an old database instead of migrating or deleting it', async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('pufom_farm_local', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('entities');
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
    await expect(openLocalFarmDb()).rejects.toThrow('Local database reset required');
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('pufom_farm_local', 1);
      request.onsuccess = () => {
        expect([...request.result.objectStoreNames]).toEqual(['entities']);
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
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

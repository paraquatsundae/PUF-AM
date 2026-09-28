import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange, IDBObjectStore } from 'fake-indexeddb';
import {
  countLocalFarmEntities, deleteLocalEntity, listLocalEntities, listOutbox,
  pendingOutboxCount, replaceLocalEntities, upsertLocalEntity, wipeLocalFarmEntitiesForFarm,
} from '../src/lib/localFarmRepo';
import type { DiaryEvent } from '../src/lib/farmDiaryTypes';

const entry = (id: string): DiaryEvent => ({ id, date: '2026-09-15', type: 'work', title: id });

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
});

describe('per-entity storage', () => {
  it('retains concurrent inserts through independent connections', async () => {
    await Promise.all(Array.from({ length: 100 }, (_, i) =>
      upsertLocalEntity('farm', 'diary', entry(String(i)))));
    expect(await listLocalEntities('farm', 'diary')).toHaveLength(100);
    const ops = await listOutbox('farm');
    expect(ops).toHaveLength(100);
    expect(new Set(ops.map(op => op.sequence)).size).toBe(100);
  });

  it('does not lose a different entity during concurrent update and deletion', async () => {
    await upsertLocalEntity('farm', 'diary', entry('remove'));
    await upsertLocalEntity('farm', 'diary', entry('keep'));
    await Promise.all([
      deleteLocalEntity('farm', 'diary', 'remove'),
      upsertLocalEntity('farm', 'diary', { ...entry('keep'), title: 'changed' }),
      upsertLocalEntity('farm', 'diary', entry('new')),
    ]);
    const items = await listLocalEntities<DiaryEvent>('farm', 'diary');
    expect(items.map(item => item.id).sort()).toEqual(['keep', 'new']);
    expect(items.find(item => item.id === 'keep')?.title).toBe('changed');
  });

  it('isolates identical ids by farm and entity kind', async () => {
    await upsertLocalEntity('farm', 'diary', entry('same'));
    await upsertLocalEntity('other', 'diary', entry('same'));
    await upsertLocalEntity('farm', 'issues', entry('same'));
    await deleteLocalEntity('farm', 'diary', 'same');
    expect(await listLocalEntities('farm', 'diary')).toEqual([]);
    expect(await listLocalEntities('other', 'diary')).toHaveLength(1);
    expect(await listLocalEntities('farm', 'issues')).toHaveLength(1);
  });

  it('saves an entity without reading the surrounding collection or outbox', async () => {
    await upsertLocalEntity('farm', 'diary', entry('existing'));
    const readAll = vi.spyOn(IDBObjectStore.prototype, 'getAll');
    await upsertLocalEntity('farm', 'diary', entry('new'));
    expect(readAll).not.toHaveBeenCalled();
  });

  it('replaces only the requested snapshot and counts without materializing entities', async () => {
    await upsertLocalEntity('farm', 'diary', entry('old'), { queueCloud: false });
    await upsertLocalEntity('other', 'diary', entry('other'));
    await replaceLocalEntities('farm', 'diary', [entry('new')]);
    expect(await listLocalEntities('farm', 'diary')).toEqual([entry('new')]);
    expect(await listLocalEntities('other', 'diary')).toHaveLength(1);
    const readAll = vi.spyOn(IDBObjectStore.prototype, 'getAll');
    expect(await countLocalFarmEntities('farm')).toEqual({
      diary: 1, issues: 0, issuesArchive: 0, highlights: 0, outbox: 0,
    });
    expect(await pendingOutboxCount('other')).toBe(1);
    expect(readAll).not.toHaveBeenCalled();
  });

  it('atomically wipes only the requested farm and its queue', async () => {
    await upsertLocalEntity('farm', 'diary', entry('one'));
    await upsertLocalEntity('other', 'diary', entry('two'));
    expect(await wipeLocalFarmEntitiesForFarm('farm')).toMatchObject({ diary: 1, outbox: 1 });
    expect(await listLocalEntities('farm', 'diary')).toEqual([]);
    expect(await listOutbox('farm')).toEqual([]);
    expect(await listLocalEntities('other', 'diary')).toHaveLength(1);
    expect(await listOutbox('other')).toHaveLength(1);
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('atomic local save', () => {
  it('commits the record and its delivery intent before resolving', async () => {
    await upsertLocalEntity('farm', 'diary', entry('one'));
    expect(await listLocalEntities('farm', 'diary')).toMatchObject([{ id: 'one' }]);
    expect(await listOutbox('farm')).toMatchObject([{ entityId: 'one', op: 'upsert' }]);
  });

  it('rolls back the record if adding its outbox operation fails', async () => {
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    await expect(upsertLocalEntity('farm', 'diary', entry('one'))).rejects.toThrow();
    expect(await listLocalEntities('farm', 'diary')).toEqual([]);
    expect(await listOutbox('farm')).toEqual([]);
  });

  it('rolls back a deletion if its delivery intent cannot be stored', async () => {
    await upsertLocalEntity('farm', 'diary', entry('one'), { queueCloud: false });
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    await expect(deleteLocalEntity('farm', 'diary', 'one')).rejects.toThrow();
    expect(await listLocalEntities('farm', 'diary')).toMatchObject([{ id: 'one' }]);
  });

  it('allows local-only writes and deletes without a cloud operation', async () => {
    await upsertLocalEntity('farm', 'diary', entry('one'), { queueCloud: false });
    await deleteLocalEntity('farm', 'diary', 'one', { queueCloud: false });
    expect(await listLocalEntities('farm', 'diary')).toEqual([]);
    expect(await listOutbox('farm')).toEqual([]);
  });
});

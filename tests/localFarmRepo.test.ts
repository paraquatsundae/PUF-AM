import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange, IDBObjectStore } from 'fake-indexeddb';
import {
  deleteLocalEntity, listLocalEntities, listOutbox, upsertLocalEntity,
} from '../src/lib/localFarmRepo';
import type { DiaryEvent } from '../src/lib/farmDiaryTypes';

const entry = (id: string): DiaryEvent => ({ id, date: '2026-09-15', type: 'work', title: id });

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
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

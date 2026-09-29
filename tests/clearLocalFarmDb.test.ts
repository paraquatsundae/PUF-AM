import { describe, expect, it, vi } from 'vitest';
import { LOCAL_FARM_DB_NAME } from '../src/lib/localFarmDb';
import { deleteLocalFarmDatabase } from '../src/lib/clearLocalFarmDb';

describe('deleteLocalFarmDatabase', () => {
  it('deletes pufom_farm_local and resolves when the browser finishes', async () => {
    const request = {} as IDBOpenDBRequest;
    const deleteDatabase = vi.fn(() => request);
    const pending = deleteLocalFarmDatabase({ deleteDatabase });
    expect(deleteDatabase).toHaveBeenCalledWith(LOCAL_FARM_DB_NAME);
    request.onsuccess?.({} as IDBVersionChangeEvent);
    await expect(pending).resolves.toBeUndefined();
  });

  it('rejects when another tab still has the database open', async () => {
    const request = {} as IDBOpenDBRequest;
    const pending = deleteLocalFarmDatabase({ deleteDatabase: () => request });
    request.onblocked?.({} as IDBVersionChangeEvent);
    await expect(pending).rejects.toThrow(/Close other PUF-AM tabs/);
  });
});

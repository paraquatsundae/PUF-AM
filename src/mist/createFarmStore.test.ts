import 'fake-indexeddb/auto';
import { describe, expect, it, afterEach, vi } from 'vitest';
import {
  getFarmStoreBackend,
  setFarmStoreBackend,
} from './farmStoreBackend.ts';
import {
  createAppFarmStore,
  resetBrowserMistStore,
} from './createFarmStore.ts';

const mockStorage = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem: (k: string) => mockStorage.get(k) ?? null,
  setItem: (k: string, v: string) => {
    mockStorage.set(k, v);
  },
  removeItem: (k: string) => {
    mockStorage.delete(k);
  },
  clear: () => mockStorage.clear(),
  key: () => null,
  length: 0,
});

describe('app FarmStore factory', () => {
  afterEach(async () => {
    mockStorage.clear();
    setFarmStoreBackend('firebase');
    await resetBrowserMistStore(true);
  });

  it('defaults to cloud / Firebase passthrough', async () => {
    setFarmStoreBackend('firebase');
    const adapter = await createAppFarmStore('farm_test');
    expect(adapter.backendId).toBe('cloud');
    expect(adapter.mist).toBeNull();
  });

  it('wires mist backend to IndexedDbMistStore when selected', async () => {
    setFarmStoreBackend('mist');
    const adapter = await createAppFarmStore('abc123', 'mist');
    expect(adapter.backendId).toBe('mist');
    expect(adapter.mist).not.toBeNull();
    expect(getFarmStoreBackend()).toBe('mist');
  });
});

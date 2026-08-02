import { describe, expect, it, afterEach } from 'vitest';
import {
  getFarmStoreBackend,
  setFarmStoreBackend,
} from './farmStoreBackend.ts';
import { createAppFarmStore, resetBrowserMistStore } from './createFarmStore.ts';

describe('app FarmStore factory', () => {
  afterEach(() => {
    setFarmStoreBackend('firebase');
    resetBrowserMistStore();
  });

  it('defaults to cloud / Firebase passthrough', () => {
    setFarmStoreBackend('firebase');
    const adapter = createAppFarmStore('farm_test');
    expect(adapter.backendId).toBe('cloud');
    expect(adapter.mist).toBeNull();
  });

  it('wires mist backend to MemoryMistStore when selected', () => {
    setFarmStoreBackend('mist');
    const adapter = createAppFarmStore('abc123', 'mist');
    expect(adapter.backendId).toBe('mist');
    expect(adapter.mist).not.toBeNull();
  });
});

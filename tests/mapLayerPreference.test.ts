const memoryLs = new Map<string, string>();
if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => memoryLs.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memoryLs.set(key, value);
      },
      removeItem: (key: string) => {
        memoryLs.delete(key);
      },
    },
  });
}

import { afterEach, describe, expect, it } from 'vitest';
import {
  applyIncomingMapLayer,
  mergeMapLayerPreference,
  readMapLayerPreference,
  subscribeMapLayerPreference,
  writeMapLayerPreference,
} from '../src/lib/mapLayerPreference';

const FARM_ID = 'map-layer-farm-0001';

afterEach(() => {
  try {
    localStorage.removeItem(`pufam.mapLayer.v1.${FARM_ID}`);
  } catch {
    /* node without localStorage */
  }
});

describe('mapLayerPreference', () => {
  it('keeps local satellite when incoming omits a layer', () => {
    const local = { layer: 'satellite' as const, updatedAt: '2026-09-14T02:00:00.000Z' };
    expect(mergeMapLayerPreference(local, {})).toEqual(local);
    expect(mergeMapLayerPreference(local, { layer: 'vector' })).toEqual(local);
  });

  it('takes an explicit newer incoming layer', () => {
    const local = { layer: 'satellite' as const, updatedAt: '2026-09-14T02:00:00.000Z' };
    const merged = mergeMapLayerPreference(local, {
      layer: 'vector',
      updatedAt: '2026-09-14T04:00:00.000Z',
    });
    expect(merged).toEqual({
      layer: 'vector',
      updatedAt: '2026-09-14T04:00:00.000Z',
    });
  });

  it('applyIncomingMapLayer does not reset satellite from a Bones snapshot without a layer', () => {
    writeMapLayerPreference(FARM_ID, 'satellite', '2026-09-14T02:00:00.000Z');
    applyIncomingMapLayer(FARM_ID, { viewport: { lat: -33.9, lng: 115.0, zoom: 10 } });
    expect(readMapLayerPreference(FARM_ID)?.layer).toBe('satellite');
  });

  it('keeps satellite across a Hot/Bones-shaped apply that omits mapLayer', () => {
    writeMapLayerPreference(FARM_ID, 'satellite', '2026-09-14T02:00:00.000Z');
    applyIncomingMapLayer(FARM_ID, {
      blocks: [],
      viewport: { lat: -33.9, lng: 115.0, zoom: 10 },
    });
    applyIncomingMapLayer(FARM_ID, { mapLayerUpdatedAt: '2026-09-14T09:00:00.000Z' });
    expect(readMapLayerPreference(FARM_ID)?.layer).toBe('satellite');
  });

  it('notifies the live map chrome when a merge writes the preference', () => {
    writeMapLayerPreference(FARM_ID, 'satellite', '2026-09-14T02:00:00.000Z');
    const seen: string[] = [];
    const stop = subscribeMapLayerPreference(FARM_ID, (layer) => {
      seen.push(layer);
    });
    applyIncomingMapLayer(FARM_ID, {
      mapLayer: 'vector',
      mapLayerUpdatedAt: '2026-09-14T05:00:00.000Z',
    });
    stop();
    expect(seen).toEqual(['vector']);
    expect(readMapLayerPreference(FARM_ID)?.layer).toBe('vector');
  });
});

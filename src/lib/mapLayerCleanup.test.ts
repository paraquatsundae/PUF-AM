import { describe, expect, it } from 'vitest';
import { removeMappedLeafletLayer } from './mapLayerCleanup';

describe('removeMappedLeafletLayer', () => {
  it('removes the matching layer and mapping, leaves others', () => {
    const keep = { _leaflet_id: 2 };
    const drop = { _leaflet_id: 1 };
    const layers: { _leaflet_id?: number }[] = [drop, keep];
    const featureGroup = {
      getLayers: () => layers,
      removeLayer: (layer: { _leaflet_id?: number }) => {
        const i = layers.indexOf(layer);
        if (i >= 0) layers.splice(i, 1);
      },
    };
    const layerMap = {
      1: { type: 'block' as const, id: 'b1' },
      2: { type: 'block' as const, id: 'b2' },
    };

    removeMappedLeafletLayer(featureGroup, layerMap, 'block', 'b1');

    expect(layers).toEqual([keep]);
    expect(layerMap[1]).toBeUndefined();
    expect(layerMap[2]).toEqual({ type: 'block', id: 'b2' });
  });

  it('no-ops when the group is missing', () => {
    const layerMap = { 1: { type: 'pin' as const, id: 'p1' } };
    removeMappedLeafletLayer(null, layerMap, 'pin', 'p1');
    expect(layerMap[1]).toEqual({ type: 'pin', id: 'p1' });
  });
});

import { describe, expect, it } from 'vitest';
import { blockCentersFromGeojson, findBlockIdAtPoint } from './farmMapHit';

const square: GeoJSON.Feature = {
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 0],
        [0, 0],
      ],
    ],
  },
};

const blocks = [
  { id: 'inside', geojson: square },
  { id: 'empty' },
];

describe('findBlockIdAtPoint', () => {
  it('returns the paddock that contains the point', () => {
    expect(findBlockIdAtPoint(blocks, 0.5, 0.5)).toBe('inside');
  });

  it('returns undefined when the point is outside every paddock', () => {
    expect(findBlockIdAtPoint(blocks, 2, 2)).toBeUndefined();
  });
});

describe('blockCentersFromGeojson', () => {
  it('returns lat/lng of the polygon centroid', () => {
    const centers = blockCentersFromGeojson(blocks);
    expect(centers.inside?.[0]).toBeCloseTo(0.5);
    expect(centers.inside?.[1]).toBeCloseTo(0.5);
    expect(centers.empty).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { blocksToLeafletBounds } from '../src/lib/farmBounds';
import type { OrchardBlock } from '../src/lib/mapStore';

function squareBlock(id: string, west: number, south: number, east: number, north: number): OrchardBlock {
  return {
    id,
    name: id,
    cultivar: 'Chandler',
    density: '',
    irrigation: '',
    geojson: {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [west, south],
            [east, south],
            [east, north],
            [west, north],
            [west, south],
          ],
        ],
      },
    },
  };
}

describe('blocksToLeafletBounds', () => {
  it('returns null for empty blocks', () => {
    expect(blocksToLeafletBounds([])).toBeNull();
  });

  it('encompasses all blocks', () => {
    const bounds = blocksToLeafletBounds([
      squareBlock('a', 115.0, -34.0, 115.01, -33.99),
      squareBlock('b', 115.02, -34.02, 115.03, -34.01),
    ]);
    expect(bounds).not.toBeNull();
    const [[south, west], [north, east]] = bounds!;
    expect(west).toBeLessThanOrEqual(115.0);
    expect(south).toBeLessThanOrEqual(-34.02);
    expect(east).toBeGreaterThanOrEqual(115.03);
    expect(north).toBeGreaterThanOrEqual(-33.99);
  });
});

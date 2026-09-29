import { describe, expect, it } from 'vitest';
import { clipCultivarPart, cultivarColor, varietyAreaRows } from './cultivarParts';

function square(x: number, y: number, size: number) {
  return {
    type: 'Polygon' as const,
    coordinates: [[
      [x, y],
      [x + size, y],
      [x + size, y + size],
      [x, y + size],
      [x, y],
    ]],
  };
}

describe('cultivar parts', () => {
  const block = square(116, -34, 0.02);

  it('keeps a stable colour for a variety name', () => {
    expect(cultivarColor('Howard')).toBe(cultivarColor(' howard '));
    expect(cultivarColor('Howard')).not.toBe(cultivarColor('Tulare'));
  });

  it('clips a sketch to the paddock and records hectares', () => {
    const clipped = clipCultivarPart(square(116.005, -33.995, 0.01), block, []);
    expect(clipped.ok).toBe(true);
    if (clipped.ok) expect(clipped.areaHa).toBeGreaterThan(0);
  });

  it('refuses a sketch that misses the paddock', () => {
    const clipped = clipCultivarPart(square(120, -10, 0.01), block, []);
    expect('reason' in clipped && clipped.reason).toContain('inside the paddock');
  });

  it('does not count area already given to another variety', () => {
    const first = clipCultivarPart(square(116, -34, 0.02), block, []);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = clipCultivarPart(square(116, -34, 0.02), block, [first]);
    expect('reason' in second).toBe(true);
  });

  it('lists each variety and the rest of the paddock', () => {
    const rows = varietyAreaRows({
      cultivar: 'Howard',
      areaHa: 4,
      cultivarParts: [
        { id: 'a', cultivar: 'Tulare', areaHa: 1.5, geojson: { type: 'Feature', properties: {}, geometry: block } },
      ],
    });
    expect(rows.map((row) => [row.cultivar, row.areaHa, row.rest])).toEqual([
      ['Tulare', 1.5, false],
      ['Howard', 2.5, true],
    ]);
  });
});

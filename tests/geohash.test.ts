import { describe, expect, it } from 'vitest';
import { encodeGeohash, geohashNeighbors, haversineKm } from '../shared/geo/geohash';

describe('geohash', () => {
  it('encodes a stable cell for Clare Downs–ish coords', () => {
    const h = encodeGeohash(-31.5, 116.0, 5);
    expect(h).toHaveLength(5);
    expect(encodeGeohash(-31.5, 116.0, 5)).toBe(h);
  });

  it('returns 9 neighbor cells including self', () => {
    const h = encodeGeohash(-31.5, 116.0, 5);
    const n = geohashNeighbors(h);
    expect(n).toHaveLength(9);
    expect(n).toContain(h);
  });

  it('computes short haversine distances', () => {
    const d = haversineKm(-31.5, 116.0, -31.51, 116.01);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(5);
  });
});

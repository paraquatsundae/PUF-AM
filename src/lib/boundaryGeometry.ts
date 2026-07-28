/**
 * GeoJSON ring helpers for paddock boundary edit / import.
 *
 * Note (D-05b): writers/readers use a single exterior ring. Usable area net of
 * dams / impassable infra is computed in paddockExclusions.ts — do not punch
 * holes into stored block.geojson until hole-preserving vertex edit exists.
 */
import * as turf from '@turf/turf';

export type LonLat = [number, number];

/** Exterior ring as [lon, lat][], closed (first === last). */
export function ringFromGeojson(geojson: unknown): LonLat[] | null {
  if (!geojson || typeof geojson !== 'object') return null;
  const g = geojson as {
    type?: string;
    geometry?: { type?: string; coordinates?: unknown };
    coordinates?: unknown;
  };
  let coords: unknown = g.coordinates;
  if (g.type === 'Feature' && g.geometry) {
    coords = g.geometry.coordinates;
    if (g.geometry.type !== 'Polygon') return null;
  } else if (g.type === 'Polygon') {
    coords = g.coordinates;
  } else if (g.type === 'FeatureCollection') {
    return null;
  }
  if (!Array.isArray(coords) || !Array.isArray(coords[0])) return null;
  const ring = coords[0] as unknown[];
  const out: LonLat[] = [];
  for (const pt of ring) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const lon = Number(pt[0]);
    const lat = Number(pt[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    out.push([lon, lat]);
  }
  if (out.length < 3) return null;
  return closeRing(out);
}

/** Drop closing duplicate for editors. */
export function openRing(ring: LonLat[]): LonLat[] {
  if (ring.length < 2) return [...ring];
  const [fLon, fLat] = ring[0];
  const [lLon, lLat] = ring[ring.length - 1];
  if (fLon === lLon && fLat === lLat) return ring.slice(0, -1);
  return [...ring];
}

export function closeRing(ring: LonLat[]): LonLat[] {
  const open = openRing(ring);
  if (open.length < 3) return open;
  const [fLon, fLat] = open[0];
  return [...open, [fLon, fLat]];
}

export function polygonFeatureFromRing(ring: LonLat[]): GeoJSON.Feature<GeoJSON.Polygon> {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [closeRing(ring)],
    },
  };
}

export function areaHaFromRing(ring: LonLat[]): number {
  try {
    const areaSqM = turf.area(polygonFeatureFromRing(ring));
    return Number((areaSqM / 10000).toFixed(2));
  } catch {
    return 0;
  }
}

export function simplifyRingForStorage(ring: LonLat[], maxPoints = 800): LonLat[] {
  const open = openRing(ring);
  if (open.length <= maxPoints) return closeRing(open);
  try {
    const simplified = turf.simplify(polygonFeatureFromRing(open), {
      tolerance: 0.00002,
      highQuality: true,
    });
    const next = ringFromGeojson(simplified);
    if (next && openRing(next).length >= 3) {
      if (openRing(next).length > maxPoints) {
        // Coarser pass
        const again = turf.simplify(polygonFeatureFromRing(next), {
          tolerance: 0.00008,
          highQuality: false,
        });
        return ringFromGeojson(again) || closeRing(open.slice(0, maxPoints));
      }
      return next;
    }
  } catch {
    /* fall through */
  }
  return closeRing(open.slice(0, maxPoints));
}

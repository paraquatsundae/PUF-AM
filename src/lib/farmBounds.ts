import * as turf from '@turf/turf';
import type { OrchardBlock } from './mapStore';
import type { LatLngBoundsLiteral } from './basemapPack';

/** Leaflet [[south, west], [north, east]] from all block polygons. */
export function blocksToLeafletBounds(
  blocks: OrchardBlock[]
): [[number, number], [number, number]] | null {
  const features = blocks
    .map((b) => b.geojson)
    .filter(Boolean)
    .map((g) => {
      if (g.type === 'Feature') return g;
      if (g.type === 'FeatureCollection') return null;
      return turf.feature(g);
    })
    .filter(Boolean) as GeoJSON.Feature[];

  if (features.length === 0) return null;

  try {
    const fc = turf.featureCollection(features);
    const [minLng, minLat, maxLng, maxLat] = turf.bbox(fc);
    if (![minLng, minLat, maxLng, maxLat].every((n) => Number.isFinite(n))) return null;
    if (minLat === maxLat && minLng === maxLng) {
      // Degenerate: pad ~150 m
      const d = 0.0015;
      return [
        [minLat - d, minLng - d],
        [maxLat + d, maxLng + d],
      ];
    }
    return [
      [minLat, minLng],
      [maxLat, maxLng],
    ];
  } catch {
    return null;
  }
}

export function blocksToBboxLiteral(blocks: OrchardBlock[]): LatLngBoundsLiteral | null {
  const b = blocksToLeafletBounds(blocks);
  if (!b) return null;
  return {
    south: b[0][0],
    west: b[0][1],
    north: b[1][0],
    east: b[1][1],
  };
}

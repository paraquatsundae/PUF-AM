/**
 * Geometry hit-tests for the farm map. No Leaflet — safe for unit tests.
 */
import * as turf from '@turf/turf';

export function findBlockIdAtPoint(
  blocks: Array<{ id: string; geojson?: GeoJSON.Feature | GeoJSON.Geometry | null }>,
  lat: number,
  lng: number
): string | undefined {
  const pt = turf.point([lng, lat]);
  for (const block of blocks) {
    if (!block.geojson) continue;
    try {
      if (turf.booleanPointInPolygon(pt, block.geojson as any)) return block.id;
    } catch {
      /* skip bad geometry */
    }
  }
  return undefined;
}

export function blockCentersFromGeojson(
  blocks: Array<{ id: string; geojson?: GeoJSON.Feature | GeoJSON.Geometry | null }>
): Record<string, [number, number]> {
  const centers: Record<string, [number, number]> = {};
  for (const block of blocks) {
    if (!block.geojson) continue;
    try {
      const center = turf.centerOfMass(block.geojson as any);
      centers[block.id] = [center.geometry.coordinates[1], center.geometry.coordinates[0]];
    } catch {
      /* skip bad geometry */
    }
  }
  return centers;
}

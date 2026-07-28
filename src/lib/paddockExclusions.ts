/**
 * Paddock usable-area math: exterior boundary minus overlapping
 * area-subtracting infrastructure (dams, impassable internal zones).
 *
 * Preferred approach (D-05b): keep stored paddock geojson as a single exterior ring
 * for vertex edit; exclusions live only on infrastructure pins. areaHa is net of
 * intersections. Display shows exclusion polygons on top (patterns) rather than
 * punching holes into stored block.geojson.
 */
import * as turf from '@turf/turf';
import { infraSubtractsFromPaddock } from '../../shared/farm/infraTypes';
import type { InfrastructurePin, OrchardBlock } from './mapStore';

export type PolygonLike = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | GeoJSON.Polygon | GeoJSON.MultiPolygon;

function asFeature(
  geo: unknown
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null {
  if (!geo || typeof geo !== 'object') return null;
  const g = geo as {
    type?: string;
    geometry?: { type?: string; coordinates?: unknown };
    coordinates?: unknown;
  };

  if (g.type === 'Feature' && g.geometry) {
    const gt = g.geometry.type;
    if (gt !== 'Polygon' && gt !== 'MultiPolygon') return null;
    return geo as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  }
  if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
    return {
      type: 'Feature',
      properties: {},
      geometry: geo as GeoJSON.Polygon | GeoJSON.MultiPolygon,
    };
  }
  if (g.type === 'FeatureCollection') return null;
  return null;
}

/** Collect polygon geometries from subtracting infra pins. */
export function subtractingExclusionPolygons(pins: InfrastructurePin[]): PolygonLike[] {
  const out: PolygonLike[] = [];
  for (const pin of pins) {
    if (!infraSubtractsFromPaddock(pin.type) || !pin.geojson) continue;
    let geo: unknown = pin.geojson;
    if (typeof geo === 'string') {
      try {
        geo = JSON.parse(geo);
      } catch {
        continue;
      }
    }
    const feature = asFeature(geo);
    if (feature) out.push(feature);
  }
  return out;
}

/**
 * Usable paddock area in hectares: turf.area(exterior) minus overlap with
 * exclusion polygons. Overlapping exclusions are not double-counted (union via
 * successive difference). Stored block.geojson is not mutated.
 */
export function effectivePaddockAreaHa(
  blockGeo: unknown,
  exclusionPolys: PolygonLike[]
): number {
  const block = asFeature(blockGeo);
  if (!block) return 0;

  try {
    let remaining: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null = block;

    for (const raw of exclusionPolys) {
      if (!remaining) break;
      const excl = asFeature(raw);
      if (!excl) continue;
      try {
        // Turf v7: difference(FeatureCollection of two polygons)
        const diff = turf.difference(turf.featureCollection([remaining, excl]));
        // null → exclusion fully covers remaining geometry
        remaining = diff as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null;
      } catch {
        // Non-overlapping / invalid pair — skip
      }
    }

    if (!remaining) return 0;
    const areaSqM = turf.area(remaining);
    return Number((areaSqM / 10000).toFixed(2));
  } catch {
    try {
      return Number((turf.area(block) / 10000).toFixed(2));
    } catch {
      return 0;
    }
  }
}

/**
 * Optional display helper: difference geometry for a block fill layer.
 * Not used for storage / vertex edit — exterior ring stays intact.
 */
export function applyExclusionsToBlockGeojson(
  blockGeo: unknown,
  exclusions: PolygonLike[]
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null {
  const block = asFeature(blockGeo);
  if (!block) return null;
  if (exclusions.length === 0) return block;

  let remaining: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null = block;
  for (const raw of exclusions) {
    if (!remaining) break;
    const excl = asFeature(raw);
    if (!excl) continue;
    try {
      const diff = turf.difference(turf.featureCollection([remaining, excl]));
      remaining = diff as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null;
    } catch {
      /* skip */
    }
  }
  return remaining;
}

/** Recompute areaHa for every block from current pins; returns only changed rows. */
export function recomputeBlockAreasForFarm(
  blocks: OrchardBlock[],
  pins: InfrastructurePin[]
): { id: string; areaHa: number }[] {
  const exclusions = subtractingExclusionPolygons(pins);
  const updates: { id: string; areaHa: number }[] = [];
  for (const block of blocks) {
    const areaHa = effectivePaddockAreaHa(block.geojson, exclusions);
    if (areaHa !== (block.areaHa ?? 0)) {
      updates.push({ id: block.id, areaHa });
    }
  }
  return updates;
}

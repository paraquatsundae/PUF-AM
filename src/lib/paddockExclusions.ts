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

/** Parse stringified GeoJSON (Firestore / IDB) and unwrap one nesting level. */
export function parsePossiblyStringifiedGeojson(raw: unknown): unknown {
  let geo: unknown = raw;
  for (let i = 0; i < 2; i++) {
    if (typeof geo !== 'string') break;
    const s = geo.trim();
    if (!s) return null;
    try {
      geo = JSON.parse(s);
    } catch {
      return null;
    }
  }
  return geo;
}

/**
 * Normalize block/pin geometry to a Polygon or MultiPolygon Feature.
 * Handles stringified JSON, bare geometry, Feature, FeatureCollection (first poly),
 * and rewinds rings so Turf overlap checks work on imported ISOXML/KML shapes.
 */
export function asFeature(
  geo: unknown
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null {
  const parsed = parsePossiblyStringifiedGeojson(geo);
  if (!parsed || typeof parsed !== 'object') return null;
  const g = parsed as {
    type?: string;
    geometry?: { type?: string; coordinates?: unknown };
    coordinates?: unknown;
    features?: unknown[];
  };

  let feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null = null;

  if (g.type === 'Feature' && g.geometry) {
    const gt = g.geometry.type;
    if (gt !== 'Polygon' && gt !== 'MultiPolygon') return null;
    feature = parsed as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  } else if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
    feature = {
      type: 'Feature',
      properties: {},
      geometry: parsed as GeoJSON.Polygon | GeoJSON.MultiPolygon,
    };
  } else if (g.type === 'FeatureCollection' && Array.isArray(g.features)) {
    for (const f of g.features) {
      const inner = asFeature(f);
      if (inner) {
        feature = inner;
        break;
      }
    }
  }

  if (!feature) return null;

  try {
    // Imported rings are often clockwise; Turf intersect is happier with RFC 7946 winding.
    return turf.rewind(feature, { mutate: false }) as GeoJSON.Feature<
      GeoJSON.Polygon | GeoJSON.MultiPolygon
    >;
  } catch {
    return feature;
  }
}

/** Collect polygon geometries from subtracting infra pins. */
export function subtractingExclusionPolygons(pins: InfrastructurePin[]): PolygonLike[] {
  const out: PolygonLike[] = [];
  for (const pin of pins) {
    if (!infraSubtractsFromPaddock(pin.type) || !pin.geojson) continue;
    const feature = asFeature(pin.geojson);
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

/** Passable pad or impassable hazard zone drawn inside a paddock. */
export function isInternalBoundaryType(type: string | undefined | null): boolean {
  return type === 'internal_passable' || type === 'internal_impassable';
}

/**
 * Fraction of `polyGeo` area that intersects `blockGeo` (0–1).
 * Returns 0 when either geometry is missing/invalid; 1 when poly is fully inside.
 */
export function polygonOverlapRatioWithBlock(polyGeo: unknown, blockGeo: unknown): number {
  const poly = asFeature(polyGeo);
  const block = asFeature(blockGeo);
  if (!poly || !block) return 0;
  try {
    const polyArea = turf.area(poly);
    if (!(polyArea > 0)) return 0;
    const inter = turf.intersect(turf.featureCollection([poly, block]));
    if (!inter) return 0;
    return Math.min(1, turf.area(inter) / polyArea);
  } catch (err) {
    console.warn('[paddockExclusions] overlap check failed', err);
    return 0;
  }
}

/** True when less than half of the drawn polygon lies inside the block (v1 warn threshold). */
export function polygonMostlyOutsideBlock(polyGeo: unknown, blockGeo: unknown): boolean {
  return polygonOverlapRatioWithBlock(polyGeo, blockGeo) < 0.5;
}

function pinAsPolygonFeature(
  pin: InfrastructurePin
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null {
  if (!pin.geojson) return null;
  return asFeature(pin.geojson);
}

/**
 * Internal boundary pins (passable / impassable) that intersect a paddock polygon.
 * Used in block detail UI — does not include dams (those are water bodies, not "internal boundaries").
 */
export function internalBoundariesIntersectingBlock(
  block: OrchardBlock,
  pins: InfrastructurePin[]
): InfrastructurePin[] {
  const blockFeat = asFeature(block.geojson);
  if (!blockFeat) return [];

  const out: InfrastructurePin[] = [];
  for (const pin of pins) {
    if (!isInternalBoundaryType(pin.type)) continue;
    const pinFeat = pinAsPolygonFeature(pin);
    if (!pinFeat) continue;
    try {
      const inter = turf.intersect(turf.featureCollection([blockFeat, pinFeat]));
      if (inter && turf.area(inter) > 0) out.push(pin);
    } catch {
      /* skip invalid pairs */
    }
  }
  return out;
}

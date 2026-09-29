/**
 * Variety splits drawn inside one paddock.
 *
 * The paddock polygon stays the outer boundary. Each variety is a polygon
 * clipped to that boundary and to varieties already drawn, so areas add up
 * to the paddock instead of stacking.
 */
import * as turf from '@turf/turf';
import { asFeature } from './paddockExclusions';

export type CultivarPart = {
  id: string;
  cultivar: string;
  geojson: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  areaHa: number;
};

export type VarietyAreaRow = {
  cultivar: string;
  areaHa: number;
  color: string;
  /** Area of the paddock not covered by a drawn variety. */
  rest: boolean;
};

const PALETTE = [
  '#4f46e5',
  '#15803d',
  '#c2410c',
  '#7c3aed',
  '#0e7490',
  '#b45309',
  '#be123c',
  '#1d4ed8',
  '#4d7c0f',
  '#a16207',
];

const MIN_HA = 0.01;

/** Same variety name keeps the same colour on every paddock. */
export function cultivarColor(name: string): string {
  const key = name.trim().toLowerCase();
  if (!key) return PALETTE[0]!;
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length]!;
}

function hectares(feature: GeoJSON.Feature): number {
  return Number((turf.area(feature) / 10000).toFixed(2));
}

/**
 * Keep the drawn ring that sits inside the paddock and outside varieties
 * already saved. A scribble that misses the paddock, or only covers an
 * existing variety, is refused.
 */
export function clipCultivarPart(
  drawn: unknown,
  blockGeo: unknown,
  existing: readonly { geojson: unknown }[]
):
  | { ok: true; geojson: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>; areaHa: number }
  | { ok: false; reason: string } {
  const block = asFeature(blockGeo);
  const sketch = asFeature(drawn);
  if (!block || !sketch) {
    return { ok: false, reason: 'That shape could not be read. Draw at least three points inside the paddock.' };
  }

  let remaining: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null;
  try {
    remaining = turf.intersect(turf.featureCollection([sketch, block])) as typeof remaining;
  } catch {
    remaining = null;
  }
  if (!remaining) {
    return { ok: false, reason: 'Draw the variety inside the paddock boundary.' };
  }

  for (const part of existing) {
    const prior = asFeature(part.geojson);
    if (!prior || !remaining) continue;
    try {
      const diff = turf.difference(turf.featureCollection([remaining, prior]));
      remaining = diff as typeof remaining;
    } catch {
      /* invalid overlap — keep what we have */
    }
  }

  if (!remaining) {
    return { ok: false, reason: 'That area is already another variety. Draw the uncovered part of the paddock.' };
  }
  const areaHa = hectares(remaining);
  if (areaHa < MIN_HA) {
    return { ok: false, reason: 'That piece is too small. Draw a larger area inside the paddock.' };
  }
  return { ok: true, geojson: remaining, areaHa };
}

/** Drawn varieties plus the uncovered rest of the paddock, in hectares. */
export function varietyAreaRows(block: {
  cultivar?: string;
  areaHa?: number;
  cultivarParts?: readonly CultivarPart[] | null;
}): VarietyAreaRow[] {
  const parts = block.cultivarParts || [];
  if (parts.length === 0) return [];
  const rows: VarietyAreaRow[] = parts.map((part) => ({
    cultivar: part.cultivar,
    areaHa: part.areaHa,
    color: cultivarColor(part.cultivar),
    rest: false,
  }));
  const used = rows.reduce((sum, row) => sum + row.areaHa, 0);
  const total = typeof block.areaHa === 'number' ? block.areaHa : used;
  const rest = Number((total - used).toFixed(2));
  if (rest >= MIN_HA) {
    const name = block.cultivar?.trim() || 'Rest of paddock';
    rows.push({
      cultivar: name,
      areaHa: rest,
      color: cultivarColor(block.cultivar || ''),
      rest: true,
    });
  }
  return rows;
}

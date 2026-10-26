/**
 * Coverage circle for a weather / soil / irrigation pin (Plans/FARM_TYPES.md).
 * Metres, clamped. Paddock match is equirectangular around the pin — fine at
 * farm scale, not a survey.
 */
export const SENSOR_RADIUS_MIN_M = 1;
/** Tens of kilometres. */
export const SENSOR_RADIUS_MAX_M = 50_000;

/** Map circle defaults until a sensor has its own radius. */
export const DEFAULT_SENSOR_RADIUS_M = {
  weather: 500,
  soil: 50,
  irrigation: 150,
} as const;

export function clampSensorRadiusM(value: number): number {
  if (!Number.isFinite(value)) return SENSOR_RADIUS_MIN_M;
  return Math.min(SENSOR_RADIUS_MAX_M, Math.max(SENSOR_RADIUS_MIN_M, value));
}

export function defaultSensorRadiusM(type: string | null | undefined): number {
  if (type === 'weather' || type === 'soil' || type === 'irrigation') {
    return DEFAULT_SENSOR_RADIUS_M[type];
  }
  return DEFAULT_SENSOR_RADIUS_M.irrigation;
}

export function effectiveSensorRadiusM(
  type: string | null | undefined,
  radiusM: number | undefined
): number {
  if (typeof radiusM === 'number' && Number.isFinite(radiusM)) return clampSensorRadiusM(radiusM);
  return defaultSensorRadiusM(type);
}

export function formatSensorRadius(radiusM: number): string {
  const metres = clampSensorRadiusM(radiusM);
  if (metres >= 1000) {
    const km = metres / 1000;
    const digits = km >= 10 ? 0 : km >= 1 ? 1 : 2;
    const text = (Math.round(km * 10 ** digits) / 10 ** digits).toString();
    return `${text} km`;
  }
  return `${Math.round(metres)} m`;
}

type Xy = [number, number];
type Ring = Xy[];

const M_PER_DEG_LAT = 111_320;

function toLocal(lat: number, lng: number, originLat: number, originLng: number): Xy {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((originLat * Math.PI) / 180);
  return [(lng - originLng) * mPerDegLng, (lat - originLat) * M_PER_DEG_LAT];
}

function asNumberPair(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lng = Number(value[0]);
  const lat = Number(value[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return [lng, lat];
}

/** Polygon coordinate arrays: each polygon is a list of [lng, lat] rings. */
function polygonsOf(geojson: unknown): [number, number][][][] {
  if (!geojson || typeof geojson !== 'object') return [];
  const node = geojson as {
    type?: string;
    geometry?: { type?: string; coordinates?: unknown };
    coordinates?: unknown;
  };
  const geometry =
    node.type === 'Feature' && node.geometry
      ? node.geometry
      : { type: node.type, coordinates: node.coordinates };
  if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
    return [readRings(geometry.coordinates)];
  }
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates
      .filter((poly) => Array.isArray(poly))
      .map((poly) => readRings(poly as unknown[]));
  }
  return [];
}

function readRings(rings: unknown[]): [number, number][][] {
  const out: [number, number][][] = [];
  for (const ring of rings) {
    if (!Array.isArray(ring)) continue;
    const pts: [number, number][] = [];
    for (const pt of ring) {
      const pair = asNumberPair(pt);
      if (pair) pts.push(pair);
    }
    if (pts.length >= 3) out.push(pts);
  }
  return out;
}

function pointInRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function minDistanceToRing(x: number, y: number, ring: Ring): number {
  let min = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j];
    const [bx, by] = ring[i];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / len2));
    const dist = Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
    if (dist < min) min = dist;
  }
  return min;
}

function circleHitsPolygon(rings: Ring[], radiusM: number): boolean {
  const [outer, ...holes] = rings;
  if (!outer) return false;
  const hitsOuter = pointInRing(0, 0, outer) || minDistanceToRing(0, 0, outer) <= radiusM;
  if (!hitsOuter) return false;
  for (const hole of holes) {
    if (pointInRing(0, 0, hole) && minDistanceToRing(0, 0, hole) > radiusM) return false;
  }
  return true;
}

export function blockIdsInCoverage(
  lat: number,
  lng: number,
  radiusM: number,
  blocks: readonly { id: string; geojson?: unknown }[]
): string[] {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  const radius = clampSensorRadiusM(radiusM);
  const ids: string[] = [];
  for (const block of blocks) {
    if (!block.id) continue;
    const polygons = polygonsOf(block.geojson);
    const hit = polygons.some((rings) =>
      circleHitsPolygon(
        rings.map((ring) => ring.map(([ringLng, ringLat]) => toLocal(ringLat, ringLng, lat, lng))),
        radius
      )
    );
    if (hit) ids.push(block.id);
  }
  return ids;
}

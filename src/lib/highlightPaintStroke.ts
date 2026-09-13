/**
 * Paint-stroke geometry for “check this” map highlights.
 * No Leaflet / React — pointer capture lives in HighlightPaintLayer.
 *
 * Modes (`highlightDrawMode`): `points` = tap vertices (leaflet-draw);
 * `paint` = finger/mouse stroke → corridor or freehand polygon.
 * Session-only; not on the wire. Plans/NAMING.md §10.
 */

import * as turf from '@turf/turf';

export type HighlightLatLng = { lat: number; lng: number };
export type HighlightDrawMode = 'points' | 'paint';
export type HighlightPaintSession = { strokes: HighlightLatLng[][] };

export const HIGHLIGHT_DRAW_MODE_POINTS = 'points' as const;
export const HIGHLIGHT_DRAW_MODE_PAINT = 'paint' as const;
/** sessionStorage — remembers Click points vs Paint for this tab. */
export const HIGHLIGHT_DRAW_MODE_STORAGE_KEY = 'pufam.highlightDrawMode';

export const HIGHLIGHT_PAINT_MIN_POINTS = 2;
export const HIGHLIGHT_PAINT_MIN_LENGTH_M = 4;
/** Screen travel — a tap at farm zoom is tens of metres but only a few pixels. */
export const HIGHLIGHT_PAINT_MIN_LENGTH_PX = 32;
/** Keep a vertex when the finger has moved this far in container pixels. */
export const HIGHLIGHT_PAINT_SAMPLE_MIN_PX = 3;
export const HIGHLIGHT_PAINT_DEFAULT_WIDTH_M = 12;
export const HIGHLIGHT_PAINT_SIMPLIFY_M = 1.5;

export type HighlightScreenPt = { x: number; y: number };

export function isHighlightDrawMode(value: unknown): value is HighlightDrawMode {
  return value === HIGHLIGHT_DRAW_MODE_POINTS || value === HIGHLIGHT_DRAW_MODE_PAINT;
}

export function defaultHighlightDrawMode(coarsePointer: boolean): HighlightDrawMode {
  return coarsePointer ? HIGHLIGHT_DRAW_MODE_PAINT : HIGHLIGHT_DRAW_MODE_POINTS;
}

export function readStoredHighlightDrawMode(
  storage?: Pick<Storage, 'getItem'> | null
): HighlightDrawMode | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(HIGHLIGHT_DRAW_MODE_STORAGE_KEY);
    return isHighlightDrawMode(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeStoredHighlightDrawMode(
  mode: HighlightDrawMode,
  storage?: Pick<Storage, 'setItem'> | null
): void {
  if (!storage) return;
  try {
    storage.setItem(HIGHLIGHT_DRAW_MODE_STORAGE_KEY, mode);
  } catch {
    /* private mode / quota */
  }
}

export function emptyHighlightPaintSession(): HighlightPaintSession {
  return { strokes: [] };
}

export function toLngLat(point: HighlightLatLng): [number, number] {
  return [point.lng, point.lat];
}

export function highlightDistanceMeters(a: HighlightLatLng, b: HighlightLatLng): number {
  return turf.distance(toLngLat(a), toLngLat(b), { units: 'metres' });
}

export function strokeLengthMeters(stroke: HighlightLatLng[]): number {
  if (stroke.length < 2) return 0;
  let metres = 0;
  for (let i = 1; i < stroke.length; i += 1) {
    metres += highlightDistanceMeters(stroke[i - 1], stroke[i]);
  }
  return metres;
}

export function screenDistancePx(a: HighlightScreenPt, b: HighlightScreenPt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function paintStrokeScreenLengthPx(points: HighlightScreenPt[]): number {
  if (points.length < 2) return 0;
  let px = 0;
  for (let i = 1; i < points.length; i += 1) {
    px += screenDistancePx(points[i - 1], points[i]);
  }
  return px;
}

/** True when this sample is far enough from the last kept vertex (map-space metres lie). */
export function shouldAppendPaintSample(
  last: HighlightScreenPt | undefined,
  next: HighlightScreenPt,
  minPx: number = HIGHLIGHT_PAINT_SAMPLE_MIN_PX
): boolean {
  if (!last) return true;
  return screenDistancePx(last, next) >= minPx;
}

export function downsamplePaintStroke<T extends HighlightScreenPt>(
  points: T[],
  minPx: number = HIGHLIGHT_PAINT_SAMPLE_MIN_PX
): T[] {
  if (points.length === 0) return [];
  const out: T[] = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    if (shouldAppendPaintSample(out[out.length - 1], points[i], minPx)) {
      out.push(points[i]);
    }
  }
  const last = points[points.length - 1];
  const prev = out[out.length - 1];
  if (prev.x !== last.x || prev.y !== last.y) out.push(last);
  return out;
}

/** A real finger stroke — not a tap. Screen length wins when we have it. */
export function isRealPaintStroke(
  stroke: HighlightLatLng[],
  screenPts?: HighlightScreenPt[]
): boolean {
  if (stroke.length < HIGHLIGHT_PAINT_MIN_POINTS) return false;
  if (strokeLengthMeters(stroke) < HIGHLIGHT_PAINT_MIN_LENGTH_M) return false;
  if (screenPts && screenPts.length >= 2) {
    return paintStrokeScreenLengthPx(screenPts) >= HIGHLIGHT_PAINT_MIN_LENGTH_PX;
  }
  return true;
}

export function simplifyStroke(
  stroke: HighlightLatLng[],
  minStepM: number = HIGHLIGHT_PAINT_SIMPLIFY_M
): HighlightLatLng[] {
  if (stroke.length <= 2) return stroke.slice();
  const step = Math.max(0.4, minStepM);
  const out: HighlightLatLng[] = [stroke[0]];
  for (let i = 1; i < stroke.length - 1; i += 1) {
    if (highlightDistanceMeters(out[out.length - 1], stroke[i]) >= step) {
      out.push(stroke[i]);
    }
  }
  const last = stroke[stroke.length - 1];
  const prev = out[out.length - 1];
  if (prev.lat !== last.lat || prev.lng !== last.lng) out.push(last);
  return out;
}

export function isClosedLoopStroke(
  stroke: HighlightLatLng[],
  widthM: number = HIGHLIGHT_PAINT_DEFAULT_WIDTH_M
): boolean {
  if (stroke.length < 4) return false;
  const length = strokeLengthMeters(stroke);
  const width = Math.max(1, widthM);
  if (length < width * 3) return false;
  const close = highlightDistanceMeters(stroke[0], stroke[stroke.length - 1]);
  return close <= Math.max(width, length * 0.2);
}

function asPolygonFeature(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> {
  return { type: 'Feature', properties: {}, geometry };
}

function rewindPolygon(
  feature: GeoJSON.Feature<GeoJSON.Polygon>
): GeoJSON.Feature<GeoJSON.Polygon> | null {
  const rewound = turf.rewind(feature);
  if (!rewound || Array.isArray((rewound as GeoJSON.FeatureCollection).features)) return null;
  if ((rewound as GeoJSON.Feature).type !== 'Feature') return null;
  const geom = (rewound as GeoJSON.Feature).geometry;
  if (geom?.type !== 'Polygon') return null;
  return { type: 'Feature', properties: {}, geometry: geom };
}

function corridorFromStroke(
  stroke: HighlightLatLng[],
  widthM: number
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null {
  if (stroke.length < HIGHLIGHT_PAINT_MIN_POINTS) return null;
  const radius = Math.max(2, widthM / 2);
  try {
    if (stroke.length === 1) {
      const circle = turf.circle(toLngLat(stroke[0]), radius, {
        units: 'metres',
        steps: 16,
      });
      return circle as GeoJSON.Feature<GeoJSON.Polygon>;
    }
    const line = turf.lineString(stroke.map(toLngLat));
    const buffered = turf.buffer(line, radius, { units: 'metres', steps: 8 });
    if (!buffered?.geometry) return null;
    if (buffered.geometry.type === 'Polygon' || buffered.geometry.type === 'MultiPolygon') {
      return asPolygonFeature(buffered.geometry);
    }
    return null;
  } catch {
    return null;
  }
}

function freehandFromStroke(
  stroke: HighlightLatLng[]
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null {
  if (stroke.length < 4) return null;
  const ring = stroke.map(toLngLat);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
  if (ring.length < 4) return null;
  try {
    return rewindPolygon(turf.polygon([ring]));
  } catch {
    return null;
  }
}

function unionPolygons(
  features: Array<GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>>
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null {
  if (features.length === 0) return null;
  if (features.length === 1) return features[0];
  try {
    const merged = turf.union(turf.featureCollection(features));
    if (!merged?.geometry) return features[0];
    if (merged.geometry.type === 'Polygon' || merged.geometry.type === 'MultiPolygon') {
      return asPolygonFeature(merged.geometry);
    }
    return features[0];
  } catch {
    return features[0];
  }
}

/** Corridor along the stroke; a closed loop also fills the interior. */
export function strokeToPolygon(
  stroke: HighlightLatLng[],
  widthM: number = HIGHLIGHT_PAINT_DEFAULT_WIDTH_M
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null {
  const simplified = simplifyStroke(stroke);
  if (!isRealPaintStroke(simplified)) return null;

  const corridor = corridorFromStroke(simplified, widthM);
  if (!isClosedLoopStroke(simplified, widthM)) return corridor;

  const fill = freehandFromStroke(simplified);
  if (!fill) return corridor;
  if (!corridor) return fill;
  return unionPolygons([fill, corridor]) || fill;
}

/** Same GeoJSON contract as leaflet-draw Finish on a vertex polygon. */
export function polygonFromClickPoints(
  points: HighlightLatLng[]
): GeoJSON.Feature<GeoJSON.Polygon> | null {
  if (points.length < 3) return null;
  const ring = points.map(toLngLat);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
  try {
    return rewindPolygon(turf.polygon([ring]));
  } catch {
    return null;
  }
}

export function paintSessionDraft(
  session: HighlightPaintSession,
  widthM: number = HIGHLIGHT_PAINT_DEFAULT_WIDTH_M
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null {
  const polys: Array<GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>> = [];
  for (const stroke of session.strokes) {
    const poly = strokeToPolygon(stroke, widthM);
    if (poly) polys.push(poly);
  }
  return unionPolygons(polys);
}

export function appendPaintStroke(
  session: HighlightPaintSession,
  stroke: HighlightLatLng[],
  widthM: number = HIGHLIGHT_PAINT_DEFAULT_WIDTH_M
): {
  session: HighlightPaintSession;
  draft: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null;
  accepted: boolean;
} {
  const poly = strokeToPolygon(stroke, widthM);
  if (!poly) {
    return { session, draft: paintSessionDraft(session, widthM), accepted: false };
  }
  const next: HighlightPaintSession = { strokes: [...session.strokes, stroke] };
  return { session: next, draft: paintSessionDraft(next, widthM), accepted: true };
}

export function undoLastPaintStroke(
  session: HighlightPaintSession,
  widthM: number = HIGHLIGHT_PAINT_DEFAULT_WIDTH_M
): {
  session: HighlightPaintSession;
  draft: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null;
} {
  if (session.strokes.length === 0) {
    return { session, draft: null };
  }
  const next: HighlightPaintSession = { strokes: session.strokes.slice(0, -1) };
  return { session: next, draft: paintSessionDraft(next, widthM) };
}

/** Abort the paint session — no draft, nothing to save. */
export function cancelPaintSession(): {
  session: HighlightPaintSession;
  draft: null;
} {
  return { session: emptyHighlightPaintSession(), draft: null };
}

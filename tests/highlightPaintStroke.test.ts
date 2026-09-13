import { describe, expect, it } from 'vitest';
import * as turf from '@turf/turf';
import {
  HIGHLIGHT_DRAW_MODE_PAINT,
  HIGHLIGHT_DRAW_MODE_POINTS,
  HIGHLIGHT_DRAW_MODE_STORAGE_KEY,
  HIGHLIGHT_PAINT_MIN_LENGTH_PX,
  appendPaintStroke,
  cancelPaintSession,
  defaultHighlightDrawMode,
  downsamplePaintStroke,
  emptyHighlightPaintSession,
  isClosedLoopStroke,
  isRealPaintStroke,
  paintSessionDraft,
  polygonFromClickPoints,
  readStoredHighlightDrawMode,
  shouldAppendPaintSample,
  strokeToPolygon,
  undoLastPaintStroke,
  writeStoredHighlightDrawMode,
} from '../src/lib/highlightPaintStroke';

/** ~11 m east of origin at this latitude. */
function offset(lat: number, lng: number, dLat: number, dLng: number) {
  return { lat: lat + dLat, lng: lng + dLng };
}

const ORIGIN = { lat: -31.9, lng: 116.0 };

describe('highlightPaintStroke', () => {
  it('defaults Paint on coarse pointers and Click points otherwise', () => {
    expect(defaultHighlightDrawMode(true)).toBe(HIGHLIGHT_DRAW_MODE_PAINT);
    expect(defaultHighlightDrawMode(false)).toBe(HIGHLIGHT_DRAW_MODE_POINTS);
  });

  it('reads and writes session mode under pufam.highlightDrawMode', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    };
    expect(readStoredHighlightDrawMode(storage)).toBeNull();
    writeStoredHighlightDrawMode(HIGHLIGHT_DRAW_MODE_PAINT, storage);
    expect(store.get(HIGHLIGHT_DRAW_MODE_STORAGE_KEY)).toBe('paint');
    expect(readStoredHighlightDrawMode(storage)).toBe('paint');
  });

  it('paints a corridor polygon along an open stroke', () => {
    const stroke = [ORIGIN, offset(ORIGIN.lat, ORIGIN.lng, 0, 0.0006)];
    const poly = strokeToPolygon(stroke, 12);
    expect(poly).not.toBeNull();
    expect(poly?.geometry.type === 'Polygon' || poly?.geometry.type === 'MultiPolygon').toBe(
      true
    );
    expect(turf.area(poly!)).toBeGreaterThan(80);
    const mid = turf.midpoint([ORIGIN.lng, ORIGIN.lat], [stroke[1].lng, stroke[1].lat]);
    expect(turf.booleanPointInPolygon(mid, poly!)).toBe(true);
  });

  it('fills a freehand polygon when the stroke closes a loop', () => {
    const square = [
      ORIGIN,
      offset(ORIGIN.lat, ORIGIN.lng, 0, 0.0009),
      offset(ORIGIN.lat, ORIGIN.lng, -0.0008, 0.0009),
      offset(ORIGIN.lat, ORIGIN.lng, -0.0008, 0),
      ORIGIN,
    ];
    expect(isClosedLoopStroke(square, 12)).toBe(true);
    const poly = strokeToPolygon(square, 12);
    expect(poly).not.toBeNull();
    const inside = offset(ORIGIN.lat, ORIGIN.lng, -0.0004, 0.00045);
    expect(turf.booleanPointInPolygon([inside.lng, inside.lat], poly!)).toBe(true);
  });

  it('rejects a tap that is not a stroke', () => {
    expect(strokeToPolygon([ORIGIN], 12)).toBeNull();
    const tiny = [ORIGIN, offset(ORIGIN.lat, ORIGIN.lng, 0, 0.00001)];
    expect(strokeToPolygon(tiny, 12)).toBeNull();
  });

  it('undo removes the last stroke and keeps earlier ones', () => {
    const first = [ORIGIN, offset(ORIGIN.lat, ORIGIN.lng, 0, 0.0006)];
    const second = [
      offset(ORIGIN.lat, ORIGIN.lng, -0.0005, 0),
      offset(ORIGIN.lat, ORIGIN.lng, -0.0005, 0.0006),
    ];
    const a = appendPaintStroke(emptyHighlightPaintSession(), first, 12);
    expect(a.accepted).toBe(true);
    const b = appendPaintStroke(a.session, second, 12);
    expect(b.session.strokes).toHaveLength(2);
    expect(b.draft).not.toBeNull();

    const undone = undoLastPaintStroke(b.session, 12);
    expect(undone.session.strokes).toHaveLength(1);
    expect(undone.draft).not.toBeNull();
    expect(turf.area(undone.draft!)).toBeCloseTo(turf.area(a.draft!), 0);

    const empty = undoLastPaintStroke(undone.session, 12);
    expect(empty.session.strokes).toHaveLength(0);
    expect(empty.draft).toBeNull();
  });

  it('cancel writes nothing — empty session, no draft', () => {
    const stroke = [ORIGIN, offset(ORIGIN.lat, ORIGIN.lng, 0, 0.0006)];
    const painted = appendPaintStroke(emptyHighlightPaintSession(), stroke, 12);
    expect(painted.draft).not.toBeNull();
    const cancelled = cancelPaintSession();
    expect(cancelled.session.strokes).toHaveLength(0);
    expect(cancelled.draft).toBeNull();
    expect(paintSessionDraft(cancelled.session, 12)).toBeNull();
  });

  it('click-point path still builds a polygon from vertices', () => {
    const tooFew = polygonFromClickPoints([
      ORIGIN,
      offset(ORIGIN.lat, ORIGIN.lng, 0, 0.0005),
    ]);
    expect(tooFew).toBeNull();

    const verts = [
      ORIGIN,
      offset(ORIGIN.lat, ORIGIN.lng, 0, 0.0005),
      offset(ORIGIN.lat, ORIGIN.lng, -0.0004, 0.00025),
    ];
    const draft = polygonFromClickPoints(verts);
    expect(draft?.geometry.type).toBe('Polygon');
    expect(turf.area(draft!)).toBeGreaterThan(0);
    const inside = offset(ORIGIN.lat, ORIGIN.lng, -0.00015, 0.00025);
    expect(turf.booleanPointInPolygon([inside.lng, inside.lat], draft!)).toBe(true);

    const paint = appendPaintStroke(emptyHighlightPaintSession(), verts, 12);
    const afterCancel = cancelPaintSession();
    expect(afterCancel.draft).toBeNull();
    expect(polygonFromClickPoints(verts)?.geometry.type).toBe('Polygon');
    expect(paint.accepted).toBe(true);
  });

  it('samples a 10+ point stroke into a corridor polygon with area, not a point', () => {
    const stroke = Array.from({ length: 14 }, (_, i) =>
      offset(ORIGIN.lat, ORIGIN.lng, Math.sin(i / 3) * 0.00018, i * 0.00014)
    );
    expect(stroke.length).toBeGreaterThanOrEqual(10);
    const poly = strokeToPolygon(stroke, 12);
    expect(poly).not.toBeNull();
    expect(poly?.geometry.type === 'Polygon' || poly?.geometry.type === 'MultiPolygon').toBe(
      true
    );
    expect(poly?.geometry.type).not.toBe('Point');
    expect(turf.area(poly!)).toBeGreaterThan(400);
    const onPath = stroke[7];
    expect(turf.booleanPointInPolygon([onPath.lng, onPath.lat], poly!)).toBe(true);
  });

  it('unions two strokes into one zone', () => {
    const first = [ORIGIN, offset(ORIGIN.lat, ORIGIN.lng, 0, 0.0007)];
    const second = [
      offset(ORIGIN.lat, ORIGIN.lng, -0.0008, 0),
      offset(ORIGIN.lat, ORIGIN.lng, -0.0008, 0.0007),
    ];
    const a = appendPaintStroke(emptyHighlightPaintSession(), first, 12);
    const b = appendPaintStroke(a.session, second, 12);
    expect(b.accepted).toBe(true);
    expect(b.session.strokes).toHaveLength(2);
    expect(b.draft).not.toBeNull();
    expect(turf.area(b.draft!)).toBeGreaterThan(turf.area(a.draft!));
    const midA = turf.midpoint([first[0].lng, first[0].lat], [first[1].lng, first[1].lat]);
    const midB = turf.midpoint([second[0].lng, second[0].lat], [second[1].lng, second[1].lat]);
    expect(turf.booleanPointInPolygon(midA, b.draft!)).toBe(true);
    expect(turf.booleanPointInPolygon(midB, b.draft!)).toBe(true);
  });

  it('does not save a tap without movement', () => {
    expect(isRealPaintStroke([ORIGIN])).toBe(false);
    expect(isRealPaintStroke([ORIGIN, ORIGIN], [{ x: 10, y: 10 }, { x: 11, y: 10 }])).toBe(
      false
    );
    const jitter = [ORIGIN, offset(ORIGIN.lat, ORIGIN.lng, 0, 0.0008)];
    expect(
      isRealPaintStroke(jitter, [
        { x: 40, y: 40 },
        { x: 40 + HIGHLIGHT_PAINT_MIN_LENGTH_PX - 8, y: 42 },
      ])
    ).toBe(false);
    expect(appendPaintStroke(emptyHighlightPaintSession(), [ORIGIN], 12).accepted).toBe(false);
    expect(strokeToPolygon([ORIGIN], 12)).toBeNull();
  });

  it('keeps vertices every few screen pixels and always the last point', () => {
    expect(shouldAppendPaintSample(undefined, { x: 0, y: 0 })).toBe(true);
    expect(shouldAppendPaintSample({ x: 0, y: 0 }, { x: 2, y: 0 })).toBe(false);
    expect(shouldAppendPaintSample({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(true);
    const dense = Array.from({ length: 20 }, (_, i) => ({ x: i, y: 0, i }));
    const kept = downsamplePaintStroke(dense);
    expect(kept[0].i).toBe(0);
    expect(kept[kept.length - 1].i).toBe(19);
    expect(kept.length).toBeGreaterThan(5);
    expect(kept.length).toBeLessThan(dense.length);
  });
});

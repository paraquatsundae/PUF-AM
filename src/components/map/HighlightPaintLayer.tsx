/**
 * Pointer capture for highlight Paint mode. Stroke owns the map; leave Paint
 * (Click points) to pan. Does not use leaflet-draw — keeps mapDrawClickGate intact.
 *
 * Android WebView often starves `pointermove`; we also sample `touchmove`
 * (non-passive) in container pixels so the ribbon is the finger path.
 */
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from '../../lib/leaflet-setup';
import { pointHitsDrawUi } from '../../lib/mapDrawHelpers';
import {
  isRealPaintStroke,
  shouldAppendPaintSample,
  type HighlightLatLng,
  type HighlightScreenPt,
} from '../../lib/highlightPaintStroke';

const LIVE_STYLE = { color: '#0f766e', weight: 4, opacity: 0.85 };
const DRAFT_STYLE = {
  color: '#0f766e',
  weight: 2,
  fillColor: '#0f766e',
  fillOpacity: 0.22,
};
const LISTEN: AddEventListenerOptions = { capture: true, passive: false };

type Props = {
  painting: boolean;
  draftGeo: GeoJSON.Feature | GeoJSON.Geometry | null;
  onStrokeEnd: (stroke: HighlightLatLng[], widthM: number) => void;
};

function latLngFromClient(map: L.Map, clientX: number, clientY: number): HighlightLatLng | null {
  try {
    const ll = map.mouseEventToLatLng({ clientX, clientY } as MouseEvent);
    if (!ll || !Number.isFinite(ll.lat) || !Number.isFinite(ll.lng)) return null;
    return { lat: ll.lat, lng: ll.lng };
  } catch {
    return null;
  }
}

function fingerWidthMeters(map: L.Map): number {
  const a = map.containerPointToLatLng(L.point(0, 0));
  const b = map.containerPointToLatLng(L.point(28, 0));
  const metres = map.distance(a, b);
  return Math.max(6, Math.min(48, metres || 12));
}

function disableMapGestures(map: L.Map): () => void {
  const draggingWas = map.dragging.enabled();
  const dblWas = map.doubleClickZoom.enabled();
  const boxWas = map.boxZoom?.enabled?.() ?? false;
  map.dragging.disable();
  map.doubleClickZoom.disable();
  map.boxZoom?.disable?.();
  return () => {
    if (draggingWas) map.dragging.enable();
    if (dblWas) map.doubleClickZoom.enable();
    if (boxWas) map.boxZoom?.enable?.();
  };
}

export function HighlightPaintLayer({ painting, draftGeo, onStrokeEnd }: Props) {
  const map = useMap();
  const strokeRef = useRef<HighlightLatLng[]>([]);
  const screenRef = useRef<HighlightScreenPt[]>([]);
  const lineRef = useRef<L.Polyline | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const extraPointersRef = useRef(0);
  const rafRef = useRef(0);
  const onStrokeEndRef = useRef(onStrokeEnd);
  onStrokeEndRef.current = onStrokeEnd;

  useEffect(() => {
    if (!draftGeo) return;
    const layer = L.geoJSON(draftGeo as GeoJSON.GeoJsonObject, { style: DRAFT_STYLE });
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, draftGeo]);

  useEffect(() => {
    const container = map.getContainer();
    if (!painting) {
      container.classList.remove('pufam-highlight-paint');
      return;
    }

    container.classList.add('pufam-highlight-paint');
    const restoreGestures = disableMapGestures(map);

    const paintLine = () => {
      rafRef.current = 0;
      const pts = strokeRef.current;
      lineRef.current?.setLatLngs(pts.map((p) => [p.lat, p.lng] as [number, number]));
    };

    const clearLive = () => {
      strokeRef.current = [];
      screenRef.current = [];
      pointerIdRef.current = null;
      extraPointersRef.current = 0;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      if (lineRef.current) {
        map.removeLayer(lineRef.current);
        lineRef.current = null;
      }
    };

    const addSample = (clientX: number, clientY: number) => {
      const screen = { x: clientX, y: clientY };
      const screens = screenRef.current;
      if (!shouldAppendPaintSample(screens[screens.length - 1], screen)) return;
      const next = latLngFromClient(map, clientX, clientY);
      if (!next) return;
      strokeRef.current.push(next);
      screens.push(screen);
      if (!rafRef.current) rafRef.current = requestAnimationFrame(paintLine);
    };

    const beginStroke = (clientX: number, clientY: number, pointerId: number, ev: Event) => {
      if (pointerIdRef.current != null) return false;
      if (pointHitsDrawUi(clientX, clientY)) return false;
      const start = latLngFromClient(map, clientX, clientY);
      if (!start) return false;
      ev.preventDefault();
      ev.stopPropagation();
      pointerIdRef.current = pointerId;
      extraPointersRef.current = 0;
      strokeRef.current = [start];
      screenRef.current = [{ x: clientX, y: clientY }];
      if (lineRef.current) map.removeLayer(lineRef.current);
      lineRef.current = L.polyline([[start.lat, start.lng]], LIVE_STYLE).addTo(map);
      return true;
    };

    const finishStroke = (clientX?: number, clientY?: number) => {
      if (pointerIdRef.current == null && strokeRef.current.length === 0) return;
      if (clientX != null && clientY != null) addSample(clientX, clientY);
      const stroke = strokeRef.current.slice();
      const screens = screenRef.current.slice();
      const pinched = extraPointersRef.current > 0;
      const width = fingerWidthMeters(map);
      clearLive();
      if (pinched || !isRealPaintStroke(stroke, screens)) return;
      onStrokeEndRef.current(stroke, width);
    };

    const onPointerDown = (ev: PointerEvent) => {
      if (ev.isPrimary === false) {
        extraPointersRef.current += 1;
        clearLive();
        return;
      }
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      if (!beginStroke(ev.clientX, ev.clientY, ev.pointerId, ev)) return;
      try {
        container.setPointerCapture(ev.pointerId);
      } catch {
        /* capture is best-effort */
      }
    };

    const onPointerMove = (ev: PointerEvent) => {
      if (pointerIdRef.current !== ev.pointerId) return;
      if (extraPointersRef.current > 0) return;
      ev.preventDefault();
      addSample(ev.clientX, ev.clientY);
    };

    const onPointerUp = (ev: PointerEvent) => {
      if (pointerIdRef.current !== ev.pointerId) return;
      try {
        if (container.hasPointerCapture(ev.pointerId)) {
          container.releasePointerCapture(ev.pointerId);
        }
      } catch {
        /* ignore */
      }
      finishStroke(ev.clientX, ev.clientY);
    };

    const onTouchStart = (ev: TouchEvent) => {
      if ((ev.touches?.length ?? 0) > 1) {
        extraPointersRef.current += 1;
        clearLive();
        ev.preventDefault();
        return;
      }
      if (pointerIdRef.current != null) {
        ev.preventDefault();
        return;
      }
      const t = ev.changedTouches?.[0] || ev.touches?.[0];
      if (!t) return;
      beginStroke(t.clientX, t.clientY, t.identifier, ev);
    };

    const onTouchMove = (ev: TouchEvent) => {
      if (pointerIdRef.current == null) return;
      ev.preventDefault();
      if (extraPointersRef.current > 0) return;
      const t = ev.touches?.[0] || ev.changedTouches?.[0];
      if (!t) return;
      addSample(t.clientX, t.clientY);
    };

    const onTouchEnd = (ev: TouchEvent) => {
      if (pointerIdRef.current == null) return;
      ev.preventDefault();
      const t = ev.changedTouches?.[0];
      finishStroke(t?.clientX, t?.clientY);
    };

    container.addEventListener('pointerdown', onPointerDown, LISTEN);
    container.addEventListener('touchstart', onTouchStart, LISTEN);
    window.addEventListener('pointermove', onPointerMove, LISTEN);
    window.addEventListener('pointerup', onPointerUp, LISTEN);
    window.addEventListener('pointercancel', onPointerUp, LISTEN);
    document.addEventListener('touchmove', onTouchMove, LISTEN);
    document.addEventListener('touchend', onTouchEnd, LISTEN);
    document.addEventListener('touchcancel', onTouchEnd, LISTEN);

    return () => {
      container.removeEventListener('pointerdown', onPointerDown, LISTEN);
      container.removeEventListener('touchstart', onTouchStart, LISTEN);
      window.removeEventListener('pointermove', onPointerMove, LISTEN);
      window.removeEventListener('pointerup', onPointerUp, LISTEN);
      window.removeEventListener('pointercancel', onPointerUp, LISTEN);
      document.removeEventListener('touchmove', onTouchMove, LISTEN);
      document.removeEventListener('touchend', onTouchEnd, LISTEN);
      document.removeEventListener('touchcancel', onTouchEnd, LISTEN);
      container.classList.remove('pufam-highlight-paint');
      clearLive();
      restoreGestures();
    };
  }, [map, painting]);

  return null;
}

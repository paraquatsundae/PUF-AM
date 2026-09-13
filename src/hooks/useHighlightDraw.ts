/**
 * Operate-mode “check this” draw: Click points (leaflet-draw) or Paint stroke.
 * One job — placement session. Paint keeps placing after each stroke so further
 * strokes union into one zone; Click points is pan (or vertices when empty).
 */
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import L from '../lib/leaflet-setup';
import {
  cancelActiveDrawer,
  startActiveDrawer,
  type LeafletDrawHandler,
} from '../lib/mapDrawHelpers';
import type { MapMode } from '../components/map/editMapTypes';
import {
  HIGHLIGHT_PAINT_DEFAULT_WIDTH_M,
  appendPaintStroke,
  cancelPaintSession,
  defaultHighlightDrawMode,
  emptyHighlightPaintSession,
  readStoredHighlightDrawMode,
  undoLastPaintStroke,
  writeStoredHighlightDrawMode,
  type HighlightDrawMode,
  type HighlightLatLng,
  type HighlightPaintSession,
} from '../lib/highlightPaintStroke';

const HIGHLIGHT_POLY_STYLE = {
  color: '#0f766e',
  fillColor: '#0f766e',
  fillOpacity: 0.25,
  weight: 2,
};

function coarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

function sessionStorageOrNull(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function useHighlightDraw({
  mapInstance,
  mapMode,
  activeDrawerRef,
  setPlacingFlag,
  setReportDraft,
}: {
  mapInstance: LeafletMap | null;
  mapMode: MapMode;
  activeDrawerRef: MutableRefObject<LeafletDrawHandler | null>;
  setPlacingFlag: (placing: boolean) => void;
  setReportDraft: (draft: { lat: number; lng: number; blockId?: string } | null) => void;
}) {
  const [placingHighlight, setPlacingHighlight] = useState(false);
  const [highlightDraftGeo, setHighlightDraftGeo] = useState<
    GeoJSON.Feature | GeoJSON.Geometry | null
  >(null);
  const [highlightDrawMode, setHighlightDrawModeState] = useState<HighlightDrawMode>(() => {
    return (
      readStoredHighlightDrawMode(sessionStorageOrNull()) ??
      defaultHighlightDrawMode(coarsePointer())
    );
  });
  const [paintSession, setPaintSession] = useState<HighlightPaintSession>(
    emptyHighlightPaintSession
  );
  const [paintWidthM, setPaintWidthM] = useState(HIGHLIGHT_PAINT_DEFAULT_WIDTH_M);

  const placingHighlightRef = useRef(false);
  placingHighlightRef.current = placingHighlight;
  const modeRef = useRef(highlightDrawMode);
  modeRef.current = highlightDrawMode;
  const paintSessionRef = useRef(paintSession);
  paintSessionRef.current = paintSession;

  const startPointsDrawer = useCallback(() => {
    if (!mapInstance) return false;
    if (!(L as { Draw?: unknown }).Draw) {
      console.error('Leaflet Draw not initialized');
      return false;
    }
    try {
      startActiveDrawer(
        activeDrawerRef,
        new (L as any).Draw.Polygon(mapInstance, {
          shapeOptions: HIGHLIGHT_POLY_STYLE,
        })
      );
      return true;
    } catch (err) {
      console.error('Failed to start highlight draw', err);
      cancelActiveDrawer(activeDrawerRef);
      return false;
    }
  }, [mapInstance, activeDrawerRef]);

  const beginPlacement = useCallback(
    (mode: HighlightDrawMode) => {
      setPaintSession(emptyHighlightPaintSession());
      setHighlightDraftGeo(null);
      if (mode === 'points') {
        if (!startPointsDrawer()) {
          setPlacingHighlight(false);
          return;
        }
      } else {
        cancelActiveDrawer(activeDrawerRef);
      }
      setPlacingHighlight(true);
    },
    [activeDrawerRef, startPointsDrawer]
  );

  const startHighlightPaint = useCallback(() => {
    if (!mapInstance || mapMode !== 'operate') return;
    setPlacingFlag(false);
    setReportDraft(null);
    beginPlacement(modeRef.current);
  }, [mapInstance, mapMode, setPlacingFlag, setReportDraft, beginPlacement]);

  const cancelHighlightPaint = useCallback(() => {
    const cleared = cancelPaintSession();
    setPaintSession(cleared.session);
    setHighlightDraftGeo(cleared.draft);
    setPlacingHighlight(false);
    cancelActiveDrawer(activeDrawerRef);
  }, [activeDrawerRef]);

  const setHighlightDrawMode = useCallback(
    (mode: HighlightDrawMode) => {
      setHighlightDrawModeState(mode);
      writeStoredHighlightDrawMode(mode, sessionStorageOrNull());
      if (!placingHighlightRef.current) return;
      // Keep painted strokes when switching to Click points — that mode is
      // pan (and vertex-draw only when the zone is still empty).
      if (mode === 'paint') {
        cancelActiveDrawer(activeDrawerRef);
        return;
      }
      if (paintSessionRef.current.strokes.length > 0) {
        cancelActiveDrawer(activeDrawerRef);
        return;
      }
      if (!startPointsDrawer()) setPlacingHighlight(false);
    },
    [activeDrawerRef, startPointsDrawer]
  );

  const acceptPaintStroke = useCallback((stroke: HighlightLatLng[], widthM: number) => {
    if (!placingHighlightRef.current || modeRef.current !== 'paint') return false;
    const width = widthM > 0 ? widthM : HIGHLIGHT_PAINT_DEFAULT_WIDTH_M;
    const next = appendPaintStroke(paintSessionRef.current, stroke, width);
    setPaintWidthM(width);
    if (!next.accepted) return false;
    setPaintSession(next.session);
    setHighlightDraftGeo(next.draft);
    return true;
  }, []);

  const undoHighlightPaint = useCallback(() => {
    const next = undoLastPaintStroke(paintSessionRef.current, paintWidthM);
    setPaintSession(next.session);
    setHighlightDraftGeo(next.draft);
    if (next.session.strokes.length === 0) {
      setPlacingHighlight(true);
      if (modeRef.current === 'points') startPointsDrawer();
      else cancelActiveDrawer(activeDrawerRef);
    }
  }, [activeDrawerRef, paintWidthM, startPointsDrawer]);

  useEffect(() => {
    if (!mapInstance) return;
    const DrawEvent = (L as unknown as { Draw?: { Event?: Record<string, string> } }).Draw?.Event;
    const CREATED = DrawEvent?.CREATED || 'draw:created';
    const onCreated = (e: {
      layerType?: string;
      layer: L.Layer & { toGeoJSON?: () => GeoJSON.Feature; remove?: () => void };
    }) => {
      if (!placingHighlightRef.current) return;
      if (modeRef.current !== 'points') return;
      if (e.layerType && e.layerType !== 'polygon') return;
      try {
        const geojson = e.layer.toGeoJSON?.();
        if (geojson) setHighlightDraftGeo(geojson);
      } catch (err) {
        console.warn('[OrchardMap] highlight geojson failed', err);
      }
      try {
        e.layer.remove?.();
        mapInstance.removeLayer(e.layer);
      } catch {
        /* ignore */
      }
      cancelActiveDrawer(activeDrawerRef);
      setPlacingHighlight(false);
    };
    mapInstance.on(CREATED, onCreated as L.LeafletEventHandlerFn);
    return () => {
      mapInstance.off(CREATED, onCreated as L.LeafletEventHandlerFn);
    };
  }, [mapInstance, activeDrawerRef]);

  useEffect(() => {
    if (mapMode !== 'operate' && (placingHighlight || highlightDraftGeo)) {
      cancelHighlightPaint();
    }
  }, [mapMode, placingHighlight, highlightDraftGeo, cancelHighlightPaint]);

  return {
    placingHighlight,
    placingHighlightRef,
    highlightDraftGeo,
    setHighlightDraftGeo,
    highlightDrawMode,
    setHighlightDrawMode,
    startHighlightPaint,
    cancelHighlightPaint,
    acceptPaintStroke,
    undoHighlightPaint,
    canUndoHighlightPaint: paintSession.strokes.length > 0,
    clearHighlightDraft: () => {
      setHighlightDraftGeo(null);
      setPaintSession(emptyHighlightPaintSession());
      setPlacingHighlight(false);
    },
  };
}

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import L from '../lib/leaflet-setup';
import { findBlockIdAtPoint } from '../lib/farmMapHit';
import {
  cancelActiveDrawer,
  getCurrentDrawHandler,
  startActiveDrawer,
  type LeafletDrawHandler,
} from '../lib/mapDrawHelpers';
import type { OrchardBlock } from '../lib/mapStore';
import type { LayerMapEntry } from '../lib/orchardMapDrawCreated';
import type { MapMode, MapSubTab } from '../components/map/editMapTypes';
import type { FieldIssue } from '../lib/fieldStore';

export function useOrchardMapClicks({
  mapInstance,
  isLoaded,
  mapMode,
  activeTab,
  blocks,
  featureGroupRef,
  layerMapRef,
  activeDrawerRef,
  boundaryEditRef,
  internalBoundaryDrawRef,
  activeTabRef,
  highlightedBlockId,
  highlightedBlockIdRef,
  highlightedTrackIdRef,
  setHighlightedBlockId,
  setHighlightedTrackId,
  setActiveTab,
  setShowSidebar,
  setEditingTrackId,
  setEditingPinId,
  placingFlag,
  setPlacingFlag,
  setReportDraft,
  setIssuesPanelBlockId,
  setSelectedIssue,
}: {
  mapInstance: LeafletMap | null;
  isLoaded: boolean;
  mapMode: MapMode;
  activeTab: MapSubTab;
  blocks: OrchardBlock[];
  featureGroupRef: { current: any };
  layerMapRef: MutableRefObject<Record<number, LayerMapEntry>>;
  activeDrawerRef: MutableRefObject<LeafletDrawHandler | null>;
  boundaryEditRef: MutableRefObject<unknown>;
  internalBoundaryDrawRef: MutableRefObject<unknown>;
  activeTabRef: MutableRefObject<MapSubTab>;
  highlightedBlockId: string | null;
  highlightedBlockIdRef: MutableRefObject<string | null>;
  highlightedTrackIdRef: MutableRefObject<string | null>;
  setHighlightedBlockId: (id: string | null) => void;
  setHighlightedTrackId: (id: string | null) => void;
  setActiveTab: (tab: MapSubTab) => void;
  setShowSidebar: (open: boolean) => void;
  setEditingTrackId: (id: string | null) => void;
  setEditingPinId: (id: string | null) => void;
  placingFlag: boolean;
  setPlacingFlag: (placing: boolean) => void;
  setReportDraft: (draft: { lat: number; lng: number; blockId?: string } | null) => void;
  setIssuesPanelBlockId: (id: string | null) => void;
  setSelectedIssue: (issue: FieldIssue | null) => void;
}) {
  const [placingHighlight, setPlacingHighlight] = useState(false);
  const [highlightDraftGeo, setHighlightDraftGeo] = useState<
    GeoJSON.Feature | GeoJSON.Geometry | null
  >(null);
  const placingHighlightRef = useRef(false);
  placingHighlightRef.current = placingHighlight;

  const startHighlightPaint = useCallback(() => {
    if (!mapInstance || mapMode !== 'operate') return;
    setPlacingFlag(false);
    setReportDraft(null);
    setHighlightDraftGeo(null);
    setPlacingHighlight(true);
    if (!(L as { Draw?: unknown }).Draw) {
      console.error('Leaflet Draw not initialized');
      setPlacingHighlight(false);
      return;
    }
    try {
      startActiveDrawer(
        activeDrawerRef,
        new (L as any).Draw.Polygon(mapInstance, {
          shapeOptions: {
            color: '#0f766e',
            fillColor: '#0f766e',
            fillOpacity: 0.25,
            weight: 2,
          },
        })
      );
    } catch (err) {
      console.error('Failed to start highlight draw', err);
      cancelActiveDrawer(activeDrawerRef);
      setPlacingHighlight(false);
    }
  }, [mapInstance, mapMode, activeDrawerRef, setPlacingFlag, setReportDraft]);

  const cancelHighlightPaint = useCallback(() => {
    setPlacingHighlight(false);
    setHighlightDraftGeo(null);
    cancelActiveDrawer(activeDrawerRef);
  }, [activeDrawerRef]);

  useEffect(() => {
    if (!mapInstance) return;
    const handleMapClick = (e: any) => {
      if (e.originalEvent?._stopped) return;
      if (placingHighlightRef.current) return;
      if (getCurrentDrawHandler()?._enabled) return;
      if (internalBoundaryDrawRef.current) return;
      if (boundaryEditRef.current) return;
      if (placingFlag && mapMode === 'operate') {
        const lat = e.latlng.lat as number;
        const lng = e.latlng.lng as number;
        const blockId =
          findBlockIdAtPoint(blocks, lat, lng) || highlightedBlockIdRef.current || undefined;
        setReportDraft({ lat, lng, blockId });
        setPlacingFlag(false);
        setIssuesPanelBlockId(null);
        setSelectedIssue(null);
        return;
      }
      setHighlightedBlockId(null);
      setIssuesPanelBlockId(null);
      setSelectedIssue(null);
    };
    mapInstance.on('click', handleMapClick);
    return () => {
      mapInstance.off('click', handleMapClick);
    };
  }, [
    mapInstance,
    placingFlag,
    mapMode,
    blocks,
    highlightedBlockIdRef,
    internalBoundaryDrawRef,
    boundaryEditRef,
    setReportDraft,
    setPlacingFlag,
    setIssuesPanelBlockId,
    setSelectedIssue,
    setHighlightedBlockId,
  ]);

  useEffect(() => {
    if (!mapInstance) return;
    const DrawEvent = (L as unknown as { Draw?: { Event?: Record<string, string> } }).Draw?.Event;
    const CREATED = DrawEvent?.CREATED || 'draw:created';
    const onCreated = (e: {
      layerType?: string;
      layer: L.Layer & { toGeoJSON?: () => GeoJSON.Feature; remove?: () => void };
    }) => {
      if (!placingHighlightRef.current) return;
      if (e.layerType && e.layerType !== 'polygon') return;
      try {
        const geojson = e.layer.toGeoJSON?.();
        if (geojson) {
          setHighlightDraftGeo(geojson);
        }
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

  useEffect(() => {
    if (!mapInstance || !featureGroupRef.current) return;

    const fg = featureGroupRef.current;
    const handleLayerClick = (e: any) => {
      if (
        getCurrentDrawHandler()?._enabled ||
        boundaryEditRef.current ||
        internalBoundaryDrawRef.current
      ) {
        if (e.originalEvent) e.originalEvent._stopped = true;
        return;
      }

      const mapping = layerMapRef.current[e.layer._leaflet_id];
      if (mapping && mapping.type === 'block') {
        if (placingFlag && mapMode === 'operate') {
          if (e.originalEvent) {
            e.originalEvent._stopped = true;
          }
          const latlng = e.latlng || e.layer?.getBounds?.().getCenter?.();
          if (latlng) {
            setReportDraft({
              lat: latlng.lat,
              lng: latlng.lng,
              blockId: mapping.id,
            });
            setPlacingFlag(false);
            setIssuesPanelBlockId(null);
            setSelectedIssue(null);
            setHighlightedBlockId(mapping.id);
          }
          return;
        }

        if (
          mapMode === 'edit' &&
          activeTabRef.current !== 'blocks' &&
          activeTabRef.current !== 'analytics'
        ) {
          return;
        }

        if (e.originalEvent) {
          e.originalEvent._stopped = true;
        }

        const next = highlightedBlockIdRef.current === mapping.id ? null : mapping.id;
        setHighlightedBlockId(next);
        if (next && mapMode === 'edit') {
          setActiveTab('blocks');
          setShowSidebar(true);
        } else if (mapMode !== 'edit') {
          setShowSidebar(false);
        }
      } else if (mapping && mapping.type === 'track') {
        if (mapMode === 'edit' && activeTabRef.current !== 'tracks') {
          return;
        }
        if (e.originalEvent) {
          e.originalEvent._stopped = true;
        }
        const next = highlightedTrackIdRef.current === mapping.id ? null : mapping.id;
        setHighlightedTrackId(next);
        if (next && mapMode === 'edit') {
          setActiveTab('tracks');
          setShowSidebar(true);
          setEditingTrackId(next);
        }
      } else if (mapping && mapping.type === 'pin') {
        if (mapMode !== 'edit' || activeTabRef.current !== 'infrastructure') return;
        if (e.originalEvent) {
          e.originalEvent._stopped = true;
        }
        setEditingPinId(mapping.id);
        setShowSidebar(true);
      }
    };

    fg.on('click', handleLayerClick);
    return () => {
      fg.off('click', handleLayerClick);
    };
  }, [
    mapInstance,
    isLoaded,
    mapMode,
    placingFlag,
    featureGroupRef,
    layerMapRef,
    boundaryEditRef,
    internalBoundaryDrawRef,
    highlightedBlockIdRef,
    highlightedTrackIdRef,
    setHighlightedBlockId,
    setHighlightedTrackId,
    setActiveTab,
    setShowSidebar,
    setEditingTrackId,
    setEditingPinId,
    setReportDraft,
    setPlacingFlag,
    setIssuesPanelBlockId,
    setSelectedIssue,
  ]);

  useEffect(() => {
    if (highlightedBlockId) {
      const prefix = activeTab === 'analytics' ? 'analytics-' : '';
      const element = document.getElementById(`${prefix}block-item-${highlightedBlockId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [highlightedBlockId, activeTab]);

  return {
    placingHighlight,
    highlightDraftGeo,
    setHighlightDraftGeo,
    startHighlightPaint,
    cancelHighlightPaint,
  };
}

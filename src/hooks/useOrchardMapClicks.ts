import { useEffect, type MutableRefObject } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import { findBlockIdAtPoint } from '../lib/farmMapHit';
import { getCurrentDrawHandler } from '../lib/mapDrawHelpers';
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
  placingHighlightRef,
}: {
  mapInstance: LeafletMap | null;
  isLoaded: boolean;
  mapMode: MapMode;
  activeTab: MapSubTab;
  blocks: OrchardBlock[];
  featureGroupRef: { current: any };
  layerMapRef: MutableRefObject<Record<number, LayerMapEntry>>;
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
  placingHighlightRef: MutableRefObject<boolean>;
}) {
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
    if (!mapInstance || !featureGroupRef.current) return;

    const fg = featureGroupRef.current;
    const handleLayerClick = (e: any) => {
      if (
        placingHighlightRef.current ||
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

}

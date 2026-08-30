/**
 * Leaflet FeatureGroup membership + style refresh for OrchardMap.
 */
import { useEffect, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import type { MapMode, MapSubTab } from '../components/map/editMapTypes';
import type { BlockAnalyticsRow } from '../lib/mapBlockAnalytics';
import { ensureInfraFillPatterns } from '../lib/infraMapStyles';
import {
  applyDrawPassThrough,
  refreshBlockHeatStyles,
  refreshPinAndTrackStyles,
} from '../lib/orchardMapLayerPaint';
import { syncOrchardMapLayers } from '../lib/orchardMapLayerSync';
import type { LayerMapEntry } from '../lib/orchardMapDrawCreated';
import type { FarmTrack, InfrastructurePin, OrchardBlock } from '../lib/mapStore';

export function useOrchardMapLayers({
  mapInstance,
  isLoaded,
  mapMode,
  activeTab,
  blocks,
  pins,
  tracks,
  featureGroupRef,
  layerMapRef,
  highlightedTrackId,
  highlightedTrackIdRef,
  highlightedBlockId,
  internalBoundaryDrawing,
  analyticsView,
  blockAnalytics,
}: {
  mapInstance: LeafletMap | null;
  isLoaded: boolean;
  mapMode: MapMode;
  activeTab: MapSubTab;
  blocks: OrchardBlock[];
  pins: InfrastructurePin[];
  tracks: FarmTrack[];
  featureGroupRef: { current: any };
  layerMapRef: { current: Record<number, LayerMapEntry> };
  highlightedTrackId: string | null;
  highlightedTrackIdRef: { current: string | null };
  highlightedBlockId: string | null;
  internalBoundaryDrawing: unknown;
  analyticsView: 'risk' | 'yield';
  blockAnalytics: Record<string, BlockAnalyticsRow>;
}) {
  const [forceRender, setForceRender] = useState(0);

  // Pattern defs must outlive React commits (see ensureInfraFillPatterns).
  useEffect(() => {
    ensureInfraFillPatterns();
  }, []);

  // Keep Leaflet layers in sync with store (re-runs when EditControl mounts/clears the group)
  useEffect(() => {
    if (!isLoaded || !mapInstance) return;
    ensureInfraFillPatterns();

    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      const membershipChanged = syncOrchardMapLayers({
        featureGroupRef,
        layerMapRef,
        blocks,
        pins,
        tracks,
        highlightedTrackIdRef,
      });
      if (membershipChanged) setForceRender((prev) => prev + 1);
    };
    run();
    // EditControl mount can clear FeatureGroup after first paint — one rAF + one short retry
    const raf = window.requestAnimationFrame(run);
    const t1 = window.setTimeout(run, 100);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t1);
    };
  }, [isLoaded, blocks, pins, tracks, mapInstance, mapMode, activeTab, featureGroupRef, layerMapRef, highlightedTrackIdRef]);

  // Let draw tools receive taps over paddocks when placing infra / tracks
  // (and when drawing an internal hazard/pad from Blocks — same tab would
  // otherwise keep paddock polygons interactive and steal tap-to-vertex).
  // CSS class survives highlight setStyle; JS walk covers nested GeoJSON groups.
  useEffect(() => {
    const fg = featureGroupRef.current;
    if (!fg) return;
    return applyDrawPassThrough({
      featureGroup: fg,
      layerMap: layerMapRef.current,
      mapInstance,
      mapMode,
      activeTab,
      internalBoundaryDrawing,
    });
  }, [
    mapMode,
    activeTab,
    forceRender,
    blocks,
    tracks,
    isLoaded,
    internalBoundaryDrawing,
    mapInstance,
    highlightedBlockId,
    featureGroupRef,
    layerMapRef,
  ]);

  useEffect(() => {
    if (!featureGroupRef.current) return;
    refreshPinAndTrackStyles({
      featureGroup: featureGroupRef.current,
      layerMap: layerMapRef.current,
      pins,
      tracks,
      highlightedTrackId,
    });
  }, [pins, blocks, tracks, forceRender, highlightedTrackId, featureGroupRef, layerMapRef]);

  useEffect(() => {
    if (!featureGroupRef.current) return;
    refreshBlockHeatStyles({
      featureGroup: featureGroupRef.current,
      layerMap: layerMapRef.current,
      blocks,
      highlightedBlockId,
      mapMode,
      activeTab,
      analyticsView,
      blockAnalytics,
    });
  }, [mapMode, activeTab, analyticsView, blocks, blockAnalytics, forceRender, highlightedBlockId, featureGroupRef, layerMapRef]);
}

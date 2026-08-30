/**
 * Edit-mode draw start / cancel / boundary vertex session.
 * Created / edited / deleted live in orchardMapDrawCreated.ts.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import L from '../lib/leaflet-setup';
import {
  cancelActiveDrawer,
  clearDrawUiIgnoreWindow,
  reviveActiveDrawer,
  startActiveDrawer,
  type LeafletDrawHandler,
} from '../lib/mapDrawHelpers';
import {
  cancelBoundaryEdit,
  commitBoundaryEdit,
  startBoundaryEdit,
  type BoundaryEditSession,
} from '../lib/boundaryEditSession';
import {
  effectivePaddockAreaHa,
  recomputeBlockAreasForFarm,
  subtractingExclusionPolygons,
} from '../lib/paddockExclusions';
import { infraPolygonPathStyle } from '../lib/infraMapStyles';
import { TRACK_COLOR_DRAW } from '../lib/trackMapStyles';
import { infraDrawMode, type InfraTypeId } from '../../shared/farm/infraTypes';
import type { MapMode, MapSubTab } from '../components/map/editMapTypes';
import type { InternalBoundaryKind } from '../components/map/BoundaryEditActionBar';
import type { InfrastructurePin, OrchardBlock } from '../lib/mapStore';
import type { LayerMapEntry } from '../lib/orchardMapDrawCreated';

export function useOrchardMapDraw({
  mapInstance,
  canEdit,
  mapMode,
  activeTab,
  infraDrawKind,
  farmId,
  isLoaded,
  blocks,
  pins,
  featureGroupRef,
  layerMapRef,
  updateBlock,
  setEditingBlockId,
  setIsConfirmingDeleteBlock,
  setHighlightedBlockId,
  setActiveTab,
  setShowSidebar,
  setEditingPinId,
}: {
  mapInstance: LeafletMap | null;
  canEdit: boolean;
  mapMode: MapMode;
  activeTab: MapSubTab;
  infraDrawKind: Exclude<InfraTypeId, ''>;
  farmId: string | undefined;
  isLoaded: boolean;
  blocks: OrchardBlock[];
  pins: InfrastructurePin[];
  featureGroupRef: { current: any };
  layerMapRef: { current: Record<number, LayerMapEntry> };
  updateBlock: (id: string, updates: Partial<OrchardBlock>) => void;
  setEditingBlockId: (id: string | null) => void;
  setIsConfirmingDeleteBlock: (v: boolean) => void;
  setHighlightedBlockId: (id: string | null) => void;
  setActiveTab: (tab: MapSubTab) => void;
  setShowSidebar: (open: boolean) => void;
  setEditingPinId: (id: string | null) => void;
}) {
  const activeDrawerRef = useRef<LeafletDrawHandler | null>(null);
  const boundaryEditRef = useRef<BoundaryEditSession | null>(null);
  const [boundaryEditBlockId, setBoundaryEditBlockId] = useState<string | null>(null);
  const [boundaryEditTick, setBoundaryEditTick] = useState(0);
  const internalBoundaryDrawRef = useRef<{
    kind: InternalBoundaryKind;
    blockId: string;
  } | null>(null);
  const skipInternalDrawClearRef = useRef(false);
  const [internalBoundaryDrawing, setInternalBoundaryDrawing] = useState<{
    kind: InternalBoundaryKind;
    blockId: string;
  } | null>(null);

  const clearInternalBoundaryDraw = useCallback(() => {
    internalBoundaryDrawRef.current = null;
    setInternalBoundaryDrawing(null);
  }, []);

  // Cancel Quick Add drawers when leaving edit mode, switching tabs, or changing infra draw kind
  const drawContextRef = useRef({ activeTab, mapMode, infraDrawKind });
  useEffect(() => {
    const prev = drawContextRef.current;
    const changed =
      prev.activeTab !== activeTab ||
      prev.mapMode !== mapMode ||
      prev.infraDrawKind !== infraDrawKind;
    drawContextRef.current = { activeTab, mapMode, infraDrawKind };
    if (!changed) return;

    // Internal-boundary draw from block edit stays on Blocks — don't kill it when
    // infraDrawKind / unrelated context flaps. Leaving Blocks or Edit cancels it.
    if (internalBoundaryDrawRef.current) {
      if (activeTab !== 'blocks' || mapMode !== 'edit') {
        clearInternalBoundaryDraw();
        cancelActiveDrawer(activeDrawerRef);
        if (boundaryEditRef.current) {
          cancelBoundaryEdit(boundaryEditRef.current);
          boundaryEditRef.current = null;
          setBoundaryEditBlockId(null);
        }
      }
      return;
    }

    cancelActiveDrawer(activeDrawerRef);
    if (boundaryEditRef.current) {
      cancelBoundaryEdit(boundaryEditRef.current);
      boundaryEditRef.current = null;
      setBoundaryEditBlockId(null);
    }
  }, [activeTab, mapMode, infraDrawKind, clearInternalBoundaryDraw]);

  useEffect(() => {
    return () => {
      cancelActiveDrawer(activeDrawerRef);
      if (boundaryEditRef.current) {
        cancelBoundaryEdit(boundaryEditRef.current);
        boundaryEditRef.current = null;
      }
    };
  }, []);

  const beginBoundaryEdit = useCallback(
    (blockId: string) => {
      if (!mapInstance || !canEdit || mapMode !== 'edit' || !featureGroupRef.current) return;
      clearInternalBoundaryDraw();
      cancelActiveDrawer(activeDrawerRef);
      if (boundaryEditRef.current) {
        cancelBoundaryEdit(boundaryEditRef.current);
        boundaryEditRef.current = null;
      }

      const layers = featureGroupRef.current.getLayers() as L.Layer[];
      const layer = layers.find((l) => {
        const id = (l as unknown as { _leaflet_id?: number })._leaflet_id;
        if (id == null) return false;
        const mapping = layerMapRef.current[id];
        return mapping?.type === 'block' && mapping.id === blockId;
      }) as L.Polygon | undefined;

      if (!layer || typeof (layer as L.Polygon).getLatLngs !== 'function') {
        console.warn('[OrchardMap] No polygon layer for block', blockId);
        return;
      }

      setEditingBlockId(null);
      setIsConfirmingDeleteBlock(false);
      setHighlightedBlockId(blockId);
      setActiveTab('blocks');
      setShowSidebar(true);

      boundaryEditRef.current = startBoundaryEdit({
        map: mapInstance,
        polygon: layer,
        blockId,
        onChange: () => setBoundaryEditTick((t) => t + 1),
      });
      setBoundaryEditBlockId(blockId);
      setBoundaryEditTick((t) => t + 1);
    },
    [mapInstance, canEdit, mapMode, clearInternalBoundaryDraw]
  );

  const saveBoundaryEdit = useCallback(() => {
    const session = boundaryEditRef.current;
    if (!session) return;
    const { geojson } = commitBoundaryEdit(session);
    const areaHa = effectivePaddockAreaHa(geojson, subtractingExclusionPolygons(pins));
    boundaryEditRef.current = null;
    setBoundaryEditBlockId(null);
    void updateBlock(session.blockId, { geojson, areaHa });
  }, [updateBlock, pins]);

  // Keep paddock areaHa net of dams / impassable internal polygons (exterior stored intact).
  useEffect(() => {
    if (!isLoaded || !canEdit || !farmId) return;
    const updates = recomputeBlockAreasForFarm(blocks, pins);
    for (const u of updates) {
      void updateBlock(u.id, { areaHa: u.areaHa });
    }
  }, [isLoaded, canEdit, farmId, blocks, pins, updateBlock]);

  const cancelBoundaryEditUi = useCallback(() => {
    if (boundaryEditRef.current) {
      cancelBoundaryEdit(boundaryEditRef.current);
      boundaryEditRef.current = null;
    }
    setBoundaryEditBlockId(null);
  }, []);

  /**
   * From block edit: stay on Blocks tab, cancel vertex edit, start polygon draw
   * for passable pad or impassable hazard (creates InfrastructurePin on Finish).
   */
  const beginInternalBoundaryDraw = useCallback(
    (kind: InternalBoundaryKind, blockId: string) => {
      if (!mapInstance || !canEdit || mapMode !== 'edit') return;
      if (!(L as any).Draw) {
        console.error('Leaflet Draw not initialized');
        return;
      }

      // Avoid DRAWSTOP from this cancel clearing the pending draw we are about to arm.
      skipInternalDrawClearRef.current = true;
      cancelActiveDrawer(activeDrawerRef);
      if (boundaryEditRef.current) {
        cancelBoundaryEdit(boundaryEditRef.current);
        boundaryEditRef.current = null;
        setBoundaryEditBlockId(null);
      }

      setEditingBlockId(null);
      setIsConfirmingDeleteBlock(false);
      setEditingPinId(null);
      setActiveTab('blocks');
      setHighlightedBlockId(blockId);
      // Do not setInfraDrawKind — that effect cancels the active drawer.

      internalBoundaryDrawRef.current = { kind, blockId };
      setInternalBoundaryDrawing({ kind, blockId });

      const polyStyle = infraPolygonPathStyle(kind);
      try {
        startActiveDrawer(
          activeDrawerRef,
          new (L as any).Draw.Polygon(mapInstance, {
            shapeOptions: {
              color: polyStyle.color,
              fillColor: polyStyle.fillColor,
              fillOpacity: polyStyle.fillOpacity,
              weight: polyStyle.weight,
              className: polyStyle.className,
              dashArray: polyStyle.dashArray,
            },
          })
        );
        window.setTimeout(() => {
          skipInternalDrawClearRef.current = false;
        }, 0);
        if (typeof window !== 'undefined' && window.innerWidth < 1024) {
          setShowSidebar(false);
        }
      } catch (err) {
        console.error('Failed to start internal boundary draw', err);
        skipInternalDrawClearRef.current = false;
        clearInternalBoundaryDraw();
        cancelActiveDrawer(activeDrawerRef);
      }
    },
    [mapInstance, canEdit, mapMode, clearInternalBoundaryDraw]
  );

  // Workflow: Add hazard → zoom → place point. Zoom/pinch must not leave the drawer
  // ignoring taps. Revive the same handler (keeps vertices); only recreate if missing.
  useEffect(() => {
    if (!mapInstance || !internalBoundaryDrawing || mapMode !== 'edit' || !canEdit) return;

    const revive = () => {
      if (!internalBoundaryDrawRef.current) return;
      clearDrawUiIgnoreWindow();
      if (reviveActiveDrawer(activeDrawerRef)) return;
      if (!(L as any).Draw) return;
      const { kind } = internalBoundaryDrawRef.current;
      const polyStyle = infraPolygonPathStyle(kind);
      try {
        startActiveDrawer(
          activeDrawerRef,
          new (L as any).Draw.Polygon(mapInstance, {
            shapeOptions: {
              color: polyStyle.color,
              fillColor: polyStyle.fillColor,
              fillOpacity: polyStyle.fillOpacity,
              weight: polyStyle.weight,
              className: polyStyle.className,
              dashArray: polyStyle.dashArray,
            },
          })
        );
      } catch (err) {
        console.warn('[OrchardMap] Failed to restore internal boundary draw after zoom', err);
      }
    };

    // Only on zoom — dragend keeps a short ignore window so pan doesn't drop a ghost point.
    mapInstance.on('zoomend', revive);
    const onZoomEndDelayed = () => {
      window.setTimeout(revive, 50);
      window.setTimeout(revive, 250);
    };
    mapInstance.on('zoomend', onZoomEndDelayed);

    return () => {
      mapInstance.off('zoomend', revive);
      mapInstance.off('zoomend', onZoomEndDelayed);
    };
  }, [mapInstance, internalBoundaryDrawing, mapMode, canEdit]);

  // Phase 5.1: Quick Add Tool Trigger
  const handleQuickAdd = useCallback(() => {
    if (!mapInstance || !canEdit || mapMode !== 'edit') return;
    if (boundaryEditRef.current) {
      cancelBoundaryEdit(boundaryEditRef.current);
      boundaryEditRef.current = null;
      setBoundaryEditBlockId(null);
    }
    // Plus draws a paddock / track / infra asset — not an internal-boundary shortcut.
    clearInternalBoundaryDraw();

    if (!(L as any).Draw) {
      console.error("Leaflet Draw not initialized");
      return;
    }

    try {
      if (activeTab === 'blocks') {
        startActiveDrawer(
          activeDrawerRef,
          new (L as any).Draw.Polygon(mapInstance, {
            shapeOptions: {
              color: '#4f46e5',
              fillOpacity: 0.4,
              weight: 3,
            },
          })
        );
      } else if (activeTab === 'tracks') {
        startActiveDrawer(
          activeDrawerRef,
          new (L as any).Draw.Polyline(mapInstance, {
            shapeOptions: {
              color: TRACK_COLOR_DRAW,
              weight: 5,
              opacity: 1,
              className: 'pufam-track-line',
            },
          })
        );
      } else if (activeTab === 'infrastructure') {
        const mode = infraDrawMode(infraDrawKind);
        const polyStyle = infraPolygonPathStyle(infraDrawKind);
        const color = polyStyle.color;
        if (mode === 'polygon') {
          startActiveDrawer(
            activeDrawerRef,
            new (L as any).Draw.Polygon(mapInstance, {
              shapeOptions: {
                color: polyStyle.color,
                fillColor: polyStyle.fillColor,
                fillOpacity: polyStyle.fillOpacity,
                weight: polyStyle.weight,
                className: polyStyle.className,
                dashArray: polyStyle.dashArray,
              },
            })
          );
        } else if (mode === 'line') {
          startActiveDrawer(
            activeDrawerRef,
            new (L as any).Draw.Polyline(mapInstance, {
              shapeOptions: { color, weight: 4 },
            })
          );
        } else {
          startActiveDrawer(activeDrawerRef, new (L as any).Draw.Marker(mapInstance));
        }
      } else {
        return;
      }
      // Mobile overlay sidebar covers the map — tuck it away so taps can place
      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        setShowSidebar(false);
      }
    } catch (err) {
      console.error("Failed to enable draw handler", err);
      cancelActiveDrawer(activeDrawerRef);
    }
  }, [mapInstance, activeTab, canEdit, mapMode, infraDrawKind, clearInternalBoundaryDraw]);

  return {
    activeDrawerRef,
    boundaryEditRef,
    boundaryEditBlockId,
    boundaryEditTick,
    setBoundaryEditTick,
    internalBoundaryDrawRef,
    internalBoundaryDrawing,
    setInternalBoundaryDrawing,
    clearInternalBoundaryDraw,
    beginBoundaryEdit,
    saveBoundaryEdit,
    cancelBoundaryEditUi,
    beginInternalBoundaryDraw,
    handleQuickAdd,
  };
}

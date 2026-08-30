/**
 * Leaflet draw:created / edited / deleted for OrchardMap.
 * Kept out of the page (Plans/CODEBASE_HEALTH.md). No map redesign.
 */
import * as turf from '@turf/turf';
import L from './leaflet-setup';
import {
  areaWordForCropKind,
  defaultGeometryKind,
  isTreeCropKind,
  mapUiCopy,
  primaryEnterprise,
  resolveFarmProfile,
} from '../../shared/farm/farmTypes';
import { defaultInfraName, infraDrawMode, type InfraTypeId } from '../../shared/farm/infraTypes';
type MapSubTab = 'blocks' | 'infrastructure' | 'tracks' | 'analytics';
type InternalBoundaryKind = 'internal_passable' | 'internal_impassable';
import {
  applyInfraPolygonPattern,
  ensureInfraFillPatterns,
} from './infraMapStyles';
import { cancelActiveDrawer, type LeafletDrawHandler } from './mapDrawHelpers';
import type { FarmTrack, InfrastructurePin, OrchardBlock } from './mapStore';
import {
  asFeature,
  effectivePaddockAreaHa,
  isInternalBoundaryType,
  polygonMostlyOutsideBlock,
  subtractingExclusionPolygons,
} from './paddockExclusions';

export type LayerMapEntry = { type: 'block' | 'pin' | 'track'; id: string };

export type OrchardMapDrawLayerCtx = {
  farmId: string | undefined;
  canEdit: boolean;
  viewport: { lat: number; lng: number };
  farmProfile: unknown;
  blocks: OrchardBlock[];
  pins: InfrastructurePin[];
  tracks: FarmTrack[];
  featureGroupRef: { current: any };
  layerMapRef: { current: Record<number, LayerMapEntry> };
  activeDrawerRef: { current: LeafletDrawHandler | null };
  internalBoundaryDrawRef: { current: { kind: InternalBoundaryKind; blockId: string } | null };
  activeTabRef: { current: MapSubTab };
  infraDrawKindRef: { current: Exclude<InfraTypeId, ''> };
  pinsRef: { current: InfrastructurePin[] };
  addBlock: (block: OrchardBlock) => void;
  addPin: (pin: InfrastructurePin) => void;
  addTrack: (track: FarmTrack) => void;
  updateBlock: (id: string, updates: Partial<OrchardBlock>) => void;
  updatePin: (id: string, updates: Partial<InfrastructurePin>) => void;
  updateTrack: (id: string, updates: Partial<FarmTrack>) => void;
  removeBlock: (id: string) => void;
  removePin: (id: string) => void;
  removeTrack: (id: string) => void;
  setEditingPinId: (id: string | null) => void;
  setEditingTrackId: (id: string | null) => void;
  setHighlightedBlockId: (id: string | null) => void;
  setHighlightedTrackId: (id: string | null) => void;
  setActiveTab: (tab: MapSubTab) => void;
  setShowSidebar: (open: boolean) => void;
  setNamingBlock: (block: OrchardBlock | null) => void;
  setInternalBoundaryDrawing: (
    next: { kind: InternalBoundaryKind; blockId: string } | null
  ) => void;
};

export function handleOrchardMapDrawCreated(ctx: OrchardMapDrawLayerCtx, e: any): void {
  const {
    farmId,
    canEdit,
    viewport,
    farmProfile: farmProfileInput,
    blocks,
    pins,
    tracks,
    featureGroupRef,
    layerMapRef,
    activeDrawerRef,
    internalBoundaryDrawRef,
    activeTabRef,
    infraDrawKindRef,
    pinsRef,
    addBlock,
    addPin,
    addTrack,
    setEditingPinId,
    setEditingTrackId,
    setHighlightedBlockId,
    setHighlightedTrackId,
    setActiveTab,
    setShowSidebar,
    setNamingBlock,
    setInternalBoundaryDrawing,
  } = ctx;
                  // Capture before cancelActiveDrawer / DRAWSTOP can race-clear the ref.
                  const pendingInternal = internalBoundaryDrawRef.current;
                  cancelActiveDrawer(activeDrawerRef);
                  const layer = e.layer;
                  const tab = activeTabRef.current;
                  const kind = infraDrawKindRef.current;
                  const id =
                    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                      ? crypto.randomUUID()
                      : `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

                  const rejectLayer = (message: string) => {
                    alert(message);
                    try {
                      featureGroupRef.current?.removeLayer(layer);
                    } catch {
                      /* ignore */
                    }
                  };

                  if (e.layerType === 'polygon') {
                    const geojson = layer.toGeoJSON();

                    const saveInfraPolygon = (
                      pinKind: Exclude<InfraTypeId, ''>,
                      opts?: { relatedBlockId?: string; stayOnBlocksTab?: boolean }
                    ): boolean => {
                      if (!farmId) {
                        rejectLayer('Sign in to a farm before saving infrastructure.');
                        return false;
                      }
                      if (!canEdit) {
                        rejectLayer('Your role is view-only — ask a farm admin to grant edit access.');
                        return false;
                      }
                      if (infraDrawMode(pinKind) !== 'polygon') {
                        rejectLayer(
                          'Select Dam, Pad (passable), or Hazard zone / impassable before drawing an area.'
                        );
                        return false;
                      }

                      if (opts?.relatedBlockId && isInternalBoundaryType(pinKind)) {
                        try {
                          const related = blocks.find((b) => b.id === opts.relatedBlockId);
                          const blockGeo = related?.geojson
                            ? asFeature(related.geojson) || related.geojson
                            : null;
                          if (blockGeo && polygonMostlyOutsideBlock(geojson, blockGeo)) {
                            const ok = window.confirm(
                              'This shape is mostly outside the selected paddock. Save it anyway?'
                            );
                            if (!ok) {
                              rejectLayer('Internal boundary not saved.');
                              return false;
                            }
                          }
                        } catch (overlapErr) {
                          // Never abort create because imported geometry failed Turf checks.
                          console.warn(
                            '[OrchardMap] Internal-boundary outside-check failed; saving anyway',
                            overlapErr
                          );
                        }
                      }

                      layerMapRef.current[layer._leaflet_id] = { type: 'pin', id };
                      if (layer instanceof L.Polygon) {
                        ensureInfraFillPatterns();
                        applyInfraPolygonPattern(layer, pinKind);
                        // Re-paint after React commit so sibling hazard/pad fills stay bound
                        // to stable pattern defs (not destroyed by a re-render).
                        window.requestAnimationFrame(() => {
                          ensureInfraFillPatterns();
                          const fg = featureGroupRef.current;
                          if (!fg) return;
                          for (const ly of fg.getLayers() as L.Layer[]) {
                            const mapping = layerMapRef.current[(ly as any)._leaflet_id];
                            if (!mapping || mapping.type !== 'pin') continue;
                            if (!(ly instanceof L.Polygon)) continue;
                            const p = pinsRef.current.find((x) => x.id === mapping.id);
                            if (p && infraDrawMode(p.type) === 'polygon') {
                              applyInfraPolygonPattern(ly, p.type);
                            }
                          }
                        });
                      }
                      let lat = viewport.lat;
                      let lng = viewport.lng;
                      try {
                        const c = turf.centroid(geojson as GeoJSON.Feature);
                        lng = c.geometry.coordinates[0];
                        lat = c.geometry.coordinates[1];
                      } catch {
                        /* keep viewport */
                      }
                      const newPin: InfrastructurePin = {
                        id,
                        name: defaultInfraName(pinKind, pins.length + 1),
                        type: pinKind,
                        status: 'active',
                        lat,
                        lng,
                        geojson,
                      };
                      addPin(newPin);
                      setEditingPinId(id);
                      if (opts?.stayOnBlocksTab) {
                        setActiveTab('blocks');
                        if (opts.relatedBlockId) {
                          setHighlightedBlockId(opts.relatedBlockId);
                        }
                      } else {
                        setActiveTab('infrastructure');
                      }
                      setShowSidebar(true);
                      return true;
                    };

                    // Block-edit shortcut: pad / hazard — must win over paddock create.
                    if (pendingInternal) {
                      try {
                        const saved = saveInfraPolygon(pendingInternal.kind, {
                          relatedBlockId: pendingInternal.blockId,
                          stayOnBlocksTab: true,
                        });
                        if (saved) {
                          internalBoundaryDrawRef.current = null;
                          setInternalBoundaryDrawing(null);
                        }
                      } catch (err) {
                        console.error('Failed to save internal boundary after draw', err);
                        alert(
                          'Could not save that pad/hazard. Try Add hazard/pad again, then Finish with at least 3 points.'
                        );
                      }
                      return;
                    }

                    try {
                      // Infrastructure tab: polygon create uses selected area type (dam / internal).
                      if (tab === 'infrastructure') {
                        saveInfraPolygon(kind);
                        return;
                      }

                      // Blocks tab only — create paddock / orchard block (Plus entry point).
                      if (tab !== 'blocks') {
                        rejectLayer('Switch to Blocks to draw paddock boundaries.');
                        return;
                      }

                      // Usable area = exterior minus overlapping dams / impassable zones
                      const areaHa = effectivePaddockAreaHa(
                        geojson,
                        subtractingExclusionPolygons(pins)
                      );

                      layerMapRef.current[layer._leaflet_id] = { type: 'block', id };

                      const farmProfile = resolveFarmProfile(farmProfileInput);
                      const cropKind = primaryEnterprise(farmProfile);
                      // Mixed farms stay neutral ("Area N"); single-enterprise uses Block/Paddock.
                      const copy = mapUiCopy(farmProfile);
                      const word =
                        copy.blockWord === 'area'
                          ? 'Area'
                          : areaWordForCropKind(cropKind);
                      const defaultName = `${word} ${blocks.length + 1}`;
                      const tree = isTreeCropKind(cropKind);
                      const newBlock: OrchardBlock = {
                        id,
                        name: defaultName,
                        cultivar: '',
                        // Species only after naming sheet confirms a tree enterprise.
                        species: tree ? farmProfile.defaultSpeciesId || '' : '',
                        cropKind,
                        geometryKind: defaultGeometryKind(cropKind),
                        density: '',
                        irrigation: '',
                        areaHa,
                        geojson,
                      };
                      if (!farmId) {
                        rejectLayer('Sign in to a farm before saving paddocks.');
                        return;
                      }
                      if (!canEdit) {
                        rejectLayer('Your role is view-only — ask a farm admin to grant edit access.');
                        return;
                      }
                      addBlock(newBlock);
                      setHighlightedBlockId(id);
                      setActiveTab('blocks');
                      // Naming sheet after paint — avoids Finish tap dismissing the new backdrop (Android).
                      window.setTimeout(() => setNamingBlock(newBlock), 50);
                    } catch (err) {
                      console.error('Failed to save paddock after draw', err);
                      alert('Could not save that paddock. Try Finish again with at least 3 points.');
                    }
                  } else if (e.layerType === 'marker') {
                    if (tab !== 'infrastructure') {
                      rejectLayer('Switch to Infrastructure to place pins.');
                      return;
                    }
                    if (!farmId) {
                      rejectLayer('Sign in to a farm before saving infrastructure.');
                      return;
                    }
                    if (!canEdit) {
                      rejectLayer('Your role is view-only — ask a farm admin to grant edit access.');
                      return;
                    }
                    const latlng = layer.getLatLng();
                    layerMapRef.current[layer._leaflet_id] = { type: 'pin', id };

                    const newPin: InfrastructurePin = {
                      id,
                      name: defaultInfraName(kind, pins.length + 1),
                      type: kind,
                      status: 'active',
                      lat: latlng.lat,
                      lng: latlng.lng,
                    };
                    addPin(newPin);
                    setEditingPinId(id);
                    setActiveTab('infrastructure');
                    setShowSidebar(true);
                  } else if (e.layerType === 'polyline') {
                    const geojson = layer.toGeoJSON();
                    if (tab === 'infrastructure') {
                      if (!farmId) {
                        rejectLayer('Sign in to a farm before saving infrastructure.');
                        return;
                      }
                      if (!canEdit) {
                        rejectLayer('Your role is view-only — ask a farm admin to grant edit access.');
                        return;
                      }
                      layerMapRef.current[layer._leaflet_id] = { type: 'pin', id };
                      let lat = viewport.lat;
                      let lng = viewport.lng;
                      try {
                        const c = turf.centroid(geojson as GeoJSON.Feature);
                        lng = c.geometry.coordinates[0];
                        lat = c.geometry.coordinates[1];
                      } catch {
                        /* keep */
                      }
                      if (infraDrawMode(kind) !== 'line') {
                        rejectLayer('Select Pipeline (or another line type) before drawing a line.');
                        return;
                      }
                      const newPin: InfrastructurePin = {
                        id,
                        name: defaultInfraName(kind, pins.length + 1),
                        type: kind,
                        status: 'active',
                        lat,
                        lng,
                        geojson,
                      };
                      addPin(newPin);
                      setEditingPinId(id);
                      setActiveTab('infrastructure');
                      setShowSidebar(true);
                    } else if (tab === 'tracks') {
                      if (!farmId) {
                        rejectLayer('Sign in to a farm before saving tracks.');
                        return;
                      }
                      if (!canEdit) {
                        rejectLayer('Your role is view-only — ask a farm admin to grant edit access.');
                        return;
                      }
                      layerMapRef.current[layer._leaflet_id] = { type: 'track', id };

                      const newTrack: FarmTrack = {
                        id,
                        name: `Track ${tracks.length + 1}`,
                        category: 'primary',
                        geojson,
                        createdAt: new Date().toISOString(),
                      };
                      addTrack(newTrack);
                      setEditingTrackId(id);
                      setHighlightedTrackId(id);
                      setActiveTab('tracks');
                      setShowSidebar(true);
                    } else {
                      rejectLayer('Switch to Tracks or Infrastructure to draw lines.');
                    }
                  }
}

export function handleOrchardMapDrawEdited(ctx: OrchardMapDrawLayerCtx, e: any): void {
  const { layerMapRef, pins, viewport, updateBlock, updatePin, updateTrack } = ctx;
  const layers = e.layers;
                  layers.eachLayer((layer: any) => {
                    const mapping = layerMapRef.current[layer._leaflet_id];
                    if (!mapping) return;

                    if (mapping.type === 'block') {
                      const geojson = layer.toGeoJSON();
                      const areaHa = effectivePaddockAreaHa(
                        geojson,
                        subtractingExclusionPolygons(pins)
                      );
                      updateBlock(mapping.id, { geojson, areaHa });
                    } else if (mapping.type === 'pin') {
                      if (layer instanceof L.Marker) {
                        const latlng = layer.getLatLng();
                        updatePin(mapping.id, { lat: latlng.lat, lng: latlng.lng });
                      } else {
                        const geojson = layer.toGeoJSON();
                        let lat = viewport.lat;
                        let lng = viewport.lng;
                        try {
                          const c = turf.centroid(geojson as GeoJSON.Feature);
                          lng = c.geometry.coordinates[0];
                          lat = c.geometry.coordinates[1];
                        } catch {
                          /* keep */
                        }
                        updatePin(mapping.id, { geojson, lat, lng });
                      }
                    } else if (mapping.type === 'track') {
                      const geojson = layer.toGeoJSON();
                      updateTrack(mapping.id, { geojson });
                    }
                  });
}

export function handleOrchardMapDrawDeleted(ctx: OrchardMapDrawLayerCtx, e: any): void {
  const { activeTabRef, layerMapRef, removeBlock, removePin, removeTrack } = ctx;
  const tab = activeTabRef.current;
                  const layers = e.layers;
                  layers.eachLayer((layer: any) => {
                    const mapping = layerMapRef.current[layer._leaflet_id];
                    if (!mapping) return;

                    // Only delete the asset class for the active tab (sync will restore others)
                    if (mapping.type === 'block' && tab === 'blocks') {
                      removeBlock(mapping.id);
                      delete layerMapRef.current[layer._leaflet_id];
                    } else if (mapping.type === 'pin' && tab === 'infrastructure') {
                      removePin(mapping.id);
                      delete layerMapRef.current[layer._leaflet_id];
                    } else if (mapping.type === 'track' && tab === 'tracks') {
                      removeTrack(mapping.id);
                      delete layerMapRef.current[layer._leaflet_id];
                    }
                  });
}

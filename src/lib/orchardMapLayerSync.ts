/**
 * Keep the FeatureGroup in sync with the map store (blocks / pins / tracks).
 * Kept out of OrchardMap.tsx (Plans/CODEBASE_HEALTH.md).
 */
import L from './leaflet-setup';
import { getInfraType, infraDrawMode } from '../../shared/farm/infraTypes';
import {
  applyInfraPolygonPattern,
  ensureInfraFillPatterns,
  infraPolygonPathStyle,
} from './infraMapStyles';
import { getPinDivIcon } from './mapPinIcons';
import { getPinTooltipHtml } from './mapPinTooltip';
import type { FarmTrack, InfrastructurePin, OrchardBlock } from './mapStore';
import type { LayerMapEntry } from './orchardMapDrawCreated';
import { asFeature, parsePossiblyStringifiedGeojson } from './paddockExclusions';
import { trackPathStyle } from './trackMapStyles';

export function syncOrchardMapLayers({
  featureGroupRef,
  layerMapRef,
  blocks,
  pins,
  tracks,
  highlightedTrackIdRef,
}: {
  featureGroupRef: { current: any };
  layerMapRef: { current: Record<number, LayerMapEntry> };
  blocks: OrchardBlock[];
  pins: InfrastructurePin[];
  tracks: FarmTrack[];
  highlightedTrackIdRef: { current: string | null };
}): boolean {
    const normalizeGeojson = (raw: unknown): any | null => {
      const parsed = parsePossiblyStringifiedGeojson(raw);
      if (!parsed) return null;
      // Prefer a Turf-normalized Polygon/MultiPolygon Feature (imported FC / string OK).
      return asFeature(parsed) || parsed;
    };

    const syncLayers = () => {
      const fg = featureGroupRef.current;
      if (!fg) return false;
      let membershipChanged = false;
      ensureInfraFillPatterns();

      // Drop stale leaflet-id mappings after EditControl clears the group
      const liveIds = new Set(
        (fg.getLayers() as L.Layer[]).map((layer) => (layer as any)._leaflet_id as number)
      );
      for (const idStr of Object.keys(layerMapRef.current)) {
        const id = Number(idStr);
        if (!liveIds.has(id)) delete layerMapRef.current[id];
      }

      const existing = new Map<string, L.Layer>();
      for (const layer of fg.getLayers() as L.Layer[]) {
        const mapping = layerMapRef.current[(layer as any)._leaflet_id];
        if (mapping) existing.set(`${mapping.type}:${mapping.id}`, layer);
      }

      const wanted = new Set<string>();

      for (const block of blocks) {
        const key = `block:${block.id}`;
        wanted.add(key);
        if (existing.has(key)) continue;
        const geo = normalizeGeojson(block.geojson);
        if (!geo) continue;
        try {
          const layer = L.geoJSON(geo).getLayers()[0] as L.Layer | undefined;
          if (!layer) continue;
          fg.addLayer(layer);
          layerMapRef.current[(layer as any)._leaflet_id] = { type: 'block', id: block.id };
          membershipChanged = true;
        } catch (err) {
          console.warn('[OrchardMap] Failed to add block layer', block.id, err);
        }
      }

      for (const pin of pins) {
        const key = `pin:${pin.id}`;
        wanted.add(key);
        const draw = infraDrawMode(pin.type);
        const def = getInfraType(pin.type);
        const wantsGeo = !!(pin.geojson && (draw === 'polygon' || draw === 'line'));
        const existingLayer = existing.get(key);
        if (existingLayer) {
          const isMarker = existingLayer instanceof L.Marker;
          const onMap = typeof fg.hasLayer === 'function' ? fg.hasLayer(existingLayer) : true;
          // Recreate when missing from FG, or draw mode / geojson no longer matches layer kind.
          if (!onMap || wantsGeo === isMarker) {
            if (onMap) {
              fg.removeLayer(existingLayer);
              delete layerMapRef.current[(existingLayer as any)._leaflet_id];
            }
            existing.delete(key);
            membershipChanged = true;
          } else {
            // Keep membership; refresh polygon fill so hazards/pads/dams stay painted
            // after draw finish / pattern-def lifecycle (do not wait for a tab switch).
            if (wantsGeo && draw === 'polygon' && existingLayer instanceof L.Polygon) {
              applyInfraPolygonPattern(existingLayer, pin.type);
            }
            continue;
          }
        }
        let layer: L.Layer | undefined;
        if (wantsGeo) {
          try {
            const geo = typeof pin.geojson === 'string' ? JSON.parse(pin.geojson as string) : pin.geojson;
            const polyStyle =
              draw === 'polygon'
                ? infraPolygonPathStyle(pin.type)
                : {
                    color: def?.color || '#0284c7',
                    weight: 4,
                    fillColor: def?.color || '#0284c7',
                    fillOpacity: 0,
                  };
            layer = L.geoJSON(geo as GeoJSON.GeoJsonObject, {
              style: polyStyle,
            }).getLayers()[0] as L.Layer | undefined;
            if (layer && draw === 'polygon' && layer instanceof L.Polygon) {
              applyInfraPolygonPattern(layer, pin.type);
            }
          } catch (err) {
            console.warn('[OrchardMap] Failed to add infra geometry', pin.id, err);
          }
        }
        if (!layer) {
          const marker = L.marker([pin.lat, pin.lng]);
          marker.setIcon(getPinDivIcon(pin));
          layer = marker;
        }
        layer.bindTooltip(getPinTooltipHtml(pin), {
          direction: 'top',
          offset: [0, -32],
          className: 'custom-tooltip',
        });
        fg.addLayer(layer);
        layerMapRef.current[(layer as any)._leaflet_id] = { type: 'pin', id: pin.id };
        membershipChanged = true;
      }

      for (const track of tracks) {
        const key = `track:${track.id}`;
        wanted.add(key);
        const geo = normalizeGeojson(track.geojson);
        if (!geo) continue;
        const existingLayer = existing.get(key);
        if (existingLayer) {
          // Keep layer identity; refresh geometry when the store track moves
          try {
            if (
              existingLayer instanceof L.Polyline &&
              !(existingLayer instanceof L.Polygon)
            ) {
              const fresh = L.geoJSON(geo).getLayers()[0] as L.Polyline | undefined;
              if (fresh && typeof fresh.getLatLngs === 'function') {
                existingLayer.setLatLngs(fresh.getLatLngs() as L.LatLng[]);
              }
            }
          } catch (err) {
            console.warn('[OrchardMap] Failed to update track layer', track.id, err);
          }
          continue;
        }
        try {
          const style = trackPathStyle(track.category, {
            highlighted: track.id === highlightedTrackIdRef.current,
          });
          const layer = L.geoJSON(geo, {
            style: {
              color: style.color,
              weight: style.weight,
              opacity: style.opacity,
              dashArray: style.dashArray,
              className: style.className,
            },
          }).getLayers()[0] as L.Layer | undefined;
          if (!layer) continue;
          fg.addLayer(layer);
          layerMapRef.current[(layer as any)._leaflet_id] = { type: 'track', id: track.id };
          membershipChanged = true;
        } catch (err) {
          console.warn('[OrchardMap] Failed to add track layer', track.id, err);
        }
      }

      for (const [key, layer] of existing) {
        if (wanted.has(key)) continue;
        fg.removeLayer(layer);
        delete layerMapRef.current[(layer as any)._leaflet_id];
        membershipChanged = true;
      }

      return membershipChanged;
    };

  return syncLayers();
}

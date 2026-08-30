/**
 * Pointer-events pass-through + pin/track/block style refresh after store changes.
 */
import L from './leaflet-setup';
import { getInfraType } from '../../shared/farm/infraTypes';
import { blockPolygonPathStyle, type BlockAnalyticsRow } from './mapBlockAnalytics';

type MapMode = 'operate' | 'edit';
type MapSubTab = 'blocks' | 'infrastructure' | 'tracks' | 'analytics';
import { applyInfraPolygonPattern } from './infraMapStyles';
import { getPinDivIcon } from './mapPinIcons';
import { getPinTooltipHtml } from './mapPinTooltip';
import type { FarmTrack, InfrastructurePin, OrchardBlock } from './mapStore';
import type { LayerMapEntry } from './orchardMapDrawCreated';
import { trackPathStyle } from './trackMapStyles';

export function applyDrawPassThrough({
  featureGroup,
  layerMap,
  mapInstance,
  mapMode,
  activeTab,
  internalBoundaryDrawing,
}: {
  featureGroup: any;
  layerMap: Record<number, LayerMapEntry>;
  mapInstance: L.Map | null;
  mapMode: MapMode;
  activeTab: MapSubTab;
  internalBoundaryDrawing: unknown;
}): () => void {
  const passBlocksThrough =
    mapMode === 'edit' &&
    ((activeTab !== 'blocks' && activeTab !== 'analytics') ||
      Boolean(internalBoundaryDrawing));
  const passTracksThrough =
    mapMode === 'edit' && activeTab !== 'tracks';

  if (mapInstance) {
    mapInstance.getContainer().classList.toggle('pufom-draw-over-paddocks', passBlocksThrough);
  }

  const applyPassThrough = (layer: L.Layer, passThrough: boolean) => {
    if ('options' in layer && layer.options) {
      (layer.options as { interactive?: boolean }).interactive = !passThrough;
    }
    const el = (layer as L.Path).getElement?.() as HTMLElement | undefined;
    if (el?.style) {
      el.style.pointerEvents = passThrough ? 'none' : '';
    }
    const group = layer as L.LayerGroup;
    if (typeof group.eachLayer === 'function') {
      group.eachLayer((child) => applyPassThrough(child, passThrough));
    }
  };

  for (const layer of featureGroup.getLayers() as L.Layer[]) {
    const mapping = layerMap[(layer as any)._leaflet_id];
    if (!mapping) continue;
    let passThrough = false;
    if (mapping.type === 'block') passThrough = passBlocksThrough;
    else if (mapping.type === 'track') passThrough = passTracksThrough;
    else continue;
    applyPassThrough(layer, passThrough);
  }

  return () => {
    mapInstance?.getContainer().classList.remove('pufom-draw-over-paddocks');
  };
}

export function refreshPinAndTrackStyles({
  featureGroup,
  layerMap,
  pins,
  tracks,
  highlightedTrackId,
}: {
  featureGroup: any;
  layerMap: Record<number, LayerMapEntry>;
  pins: InfrastructurePin[];
  tracks: FarmTrack[];
  highlightedTrackId: string | null;
}): void {
  const layers = featureGroup.getLayers();
  layers.forEach((layer: any) => {
    // Markers only — polygon/line infra pins have no setIcon.
    if (layer instanceof L.Marker && typeof layer.setIcon === 'function') {
      const mapping = layerMap[(layer as any)._leaflet_id];
      if (!mapping || mapping.type !== 'pin') return;
      const pin = pins.find((p) => p.id === mapping.id);

      if (pin) {
        layer.setIcon(getPinDivIcon(pin));
        layer.bindTooltip(getPinTooltipHtml(pin), { direction: 'top', offset: [0, -32], className: 'custom-tooltip' });
      }
    } else if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
      const mapping = layerMap[(layer as any)._leaflet_id];
      if (!mapping) return;
      if (mapping.type === 'pin') {
        const pin = pins.find((p) => p.id === mapping.id);
        if (!pin) return;
        const def = getInfraType(pin.type);
        layer.setStyle({
          color: def?.color || '#0e7490',
          weight: 4,
        });
        layer.bindTooltip(getPinTooltipHtml(pin), {
          direction: 'top',
          offset: [0, -8],
          className: 'custom-tooltip',
        });
        return;
      }
      if (mapping.type !== 'track') return;
      const track = tracks.find((t) => t.id === mapping.id);

      if (track) {
        const isHighlighted = track.id === highlightedTrackId;
        const style = trackPathStyle(track.category, { highlighted: isHighlighted });
        layer.setStyle({
          color: style.color,
          weight: style.weight,
          opacity: style.opacity,
          dashArray: style.dashArray,
        });
        const el = layer.getElement?.() as SVGElement | undefined;
        if (el) {
          el.classList.remove('pufam-track-line', 'pufam-track-line--highlight');
          for (const c of style.className.split(/\s+/)) {
            if (c) el.classList.add(c);
          }
        }
      }
    } else if (layer instanceof L.Polygon) {
      const mapping = layerMap[(layer as any)._leaflet_id];
      if (!mapping || mapping.type !== 'pin') return;
      const pin = pins.find((p) => p.id === mapping.id);
      if (!pin) return;
      applyInfraPolygonPattern(layer, pin.type);
      layer.bindTooltip(getPinTooltipHtml(pin), {
        direction: 'top',
        offset: [0, -8],
        className: 'custom-tooltip',
      });
    }
  });
}

export function refreshBlockHeatStyles({
  featureGroup,
  layerMap,
  blocks,
  highlightedBlockId,
  mapMode,
  activeTab,
  analyticsView,
  blockAnalytics,
}: {
  featureGroup: any;
  layerMap: Record<number, LayerMapEntry>;
  blocks: OrchardBlock[];
  highlightedBlockId: string | null;
  mapMode: MapMode;
  activeTab: MapSubTab;
  analyticsView: 'risk' | 'yield';
  blockAnalytics: Record<string, BlockAnalyticsRow>;
}): void {
  const layers = featureGroup.getLayers();
  layers.forEach((layer: any) => {
    if (layer instanceof L.Polygon) {
      const mapping = layerMap[(layer as any)._leaflet_id];
      if (!mapping || mapping.type !== 'block') return;
      const block = blocks.find((b) => b.id === mapping.id);

      if (block) {
        const isHighlighted = block.id === highlightedBlockId;
        // Risk/yield heatmaps only in Edit → Analytics (operate map stays neutral)
        const showRiskHeat = mapMode === 'edit' && activeTab === 'analytics';
        const data = blockAnalytics[block.id];
        if (showRiskHeat && !data) return;
        layer.setStyle(
          blockPolygonPathStyle({
            isHighlighted,
            showRiskHeat,
            analyticsView,
            data,
          })
        );
        layer.unbindTooltip();
      }
    }
  });
}

/**
 * Read-only paddock preview for the diary composer.
 * The composer mounts this only while "Show paddock map" is open, so the
 * Leaflet chunk, tiles, and polygons stay unloaded until then.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, useMap, ZoomControl } from 'react-leaflet';
import { getBasemapPack, type BasemapPack } from '../../lib/basemapPack';
import { blocksToLeafletBounds } from '../../lib/farmBounds';
import L from '../../lib/leaflet-setup';
import { blockPolygonPathStyle } from '../../lib/mapBlockAnalytics';
import type { OrchardBlock } from '../../lib/mapStore';
import { asFeature } from '../../lib/paddockExclusions';
import { OrchardMapBasemapLayers } from './OrchardMapBasemapLayers';
import { PaddockNameLayer } from './PaddockNameLayer';

type Props = {
  blocks: OrchardBlock[];
  selectedBlockIds: string[];
  onToggleBlock: (blockId: string) => void;
  farmId?: string;
};

function polygonStyle(isHighlighted: boolean) {
  return blockPolygonPathStyle({
    isHighlighted,
    showRiskHeat: false,
    analyticsView: 'risk',
  });
}

function DiaryPaddockShapes({
  blocks,
  selectedBlockIds,
  onToggleBlock,
}: {
  blocks: OrchardBlock[];
  selectedBlockIds: string[];
  onToggleBlock: (blockId: string) => void;
}) {
  const map = useMap();
  const onToggleRef = useRef(onToggleBlock);
  onToggleRef.current = onToggleBlock;
  const selectedRef = useRef(selectedBlockIds);
  selectedRef.current = selectedBlockIds;
  const layersRef = useRef<Map<string, L.GeoJSON>>(new Map());

  useEffect(() => {
    const group = L.featureGroup().addTo(map);
    const layers = new Map<string, L.GeoJSON>();
    const selected = new Set(selectedRef.current);
    for (const block of blocks) {
      const feature = asFeature(block.geojson);
      if (!feature) continue;
      const layer = L.geoJSON(feature, {
        style: polygonStyle(selected.has(block.id)),
        onEachFeature: (_feature, leafletLayer) => {
          leafletLayer.on('click', () => onToggleRef.current(block.id));
        },
      });
      layer.addTo(group);
      layers.set(block.id, layer);
    }
    layersRef.current = layers;
    return () => {
      map.removeLayer(group);
      layersRef.current = new Map();
    };
  }, [map, blocks]);

  useEffect(() => {
    const selected = new Set(selectedBlockIds);
    for (const [id, layer] of layersRef.current) {
      const isHighlighted = selected.has(id);
      layer.setStyle(polygonStyle(isHighlighted));
      if (isHighlighted) layer.bringToFront();
    }
  }, [selectedBlockIds, blocks]);

  useEffect(() => {
    const selected = new Set(selectedBlockIds);
    const chosen = blocks.filter((block) => selected.has(block.id));
    const bounds = blocksToLeafletBounds(chosen.length > 0 ? chosen : blocks);
    if (!bounds) return;
    map.invalidateSize();
    map.fitBounds(bounds, { padding: [20, 20], animate: false });
  }, [map, blocks, selectedBlockIds]);

  return null;
}

function DiaryPaddockMiniMapCanvas({
  blocks,
  selectedBlockIds,
  onToggleBlock,
  farmId,
}: Props & { blocks: OrchardBlock[] }) {
  const [basemapPack, setBasemapPack] = useState<BasemapPack | null>(null);
  const [packReady, setPackReady] = useState(!farmId);
  const [isOnline, setIsOnline] = useState(true);
  const center = useMemo(() => {
    const bounds = blocksToLeafletBounds(blocks);
    if (!bounds) return [-34.24, 116.14] as [number, number];
    return [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2] as [number, number];
  }, [blocks]);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    let removeCap: (() => void) | undefined;
    void (async () => {
      try {
        const { Network } = await import('@capacitor/network');
        const status = await Network.getStatus();
        setIsOnline(Boolean(status.connected));
        const handle = await Network.addListener('networkStatusChange', (statusChange) => {
          setIsOnline(Boolean(statusChange.connected));
        });
        removeCap = () => {
          void handle.remove();
        };
      } catch {
        /* Browser builds have no Capacitor network plugin. */
      }
    })();
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      removeCap?.();
    };
  }, []);

  useEffect(() => {
    if (!farmId) {
      setBasemapPack(null);
      setPackReady(true);
      return;
    }
    let cancelled = false;
    setPackReady(false);
    getBasemapPack(farmId).then(
      (pack) => {
        if (cancelled) return;
        setBasemapPack(pack);
        setPackReady(true);
      },
      () => {
        if (cancelled) return;
        setBasemapPack(null);
        setPackReady(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [farmId]);

  return (
    <div className="diary-paddock-minimap relative h-56 overflow-hidden rounded-xl border border-slate-200">
      <style>{`
        .diary-paddock-minimap .pufom-paddock-name {
          background: transparent !important;
          border: none !important;
        }
        .diary-paddock-minimap .pufom-paddock-name__label {
          font: 800 12px/1.15 system-ui, sans-serif;
          color: #f8fafc;
          text-align: center;
          white-space: nowrap;
          letter-spacing: 0.01em;
          text-shadow:
            0 0 4px rgba(0,0,0,.85),
            0 1px 2px rgba(0,0,0,.9);
          pointer-events: none;
        }
        .diary-paddock-minimap .leaflet-interactive { cursor: pointer; }
      `}</style>
      <MapContainer
        center={center}
        zoom={14}
        maxZoom={20}
        zoomControl={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        className="h-full w-full"
      >
        {packReady && (
          <OrchardMapBasemapLayers
            farmId={farmId || ''}
            mapLayer="satellite"
            basemapPack={basemapPack}
            isOnline={isOnline}
          />
        )}
        <ZoomControl position="topright" />
        <DiaryPaddockShapes
          blocks={blocks}
          selectedBlockIds={selectedBlockIds}
          onToggleBlock={onToggleBlock}
        />
        <PaddockNameLayer blocks={blocks} />
      </MapContainer>
    </div>
  );
}

export function DiaryPaddockMiniMap({ blocks, selectedBlockIds, onToggleBlock, farmId }: Props) {
  const outlined = useMemo(() => {
    const out: OrchardBlock[] = [];
    for (const block of blocks) {
      const feature = asFeature(block.geojson);
      if (!feature) continue;
      out.push({ ...block, geojson: feature });
    }
    return out;
  }, [blocks]);

  if (outlined.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No paddock outlines to show. Choose paddocks from the list.
      </p>
    );
  }

  return (
    <DiaryPaddockMiniMapCanvas
      blocks={outlined}
      selectedBlockIds={selectedBlockIds}
      onToggleBlock={onToggleBlock}
      farmId={farmId}
    />
  );
}

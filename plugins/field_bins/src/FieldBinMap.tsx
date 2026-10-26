import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, useMap, useMapEvents, ZoomControl } from 'react-leaflet';
import { getBasemapPack, type BasemapPack } from '../../../src/lib/basemapPack';
import { blocksToLeafletBounds } from '../../../src/lib/farmBounds';
import L from '../../../src/lib/leaflet-setup';
import { blockPolygonPathStyle } from '../../../src/lib/mapBlockAnalytics';
import { getPinDivIcon } from '../../../src/lib/mapPinIcons';
import type { InfrastructurePin, OrchardBlock } from '../../../src/lib/mapStore';
import { asFeature } from '../../../src/lib/paddockExclusions';
import { OrchardMapBasemapLayers } from '../../../src/components/map/OrchardMapBasemapLayers';
import { PaddockNameLayer } from '../../../src/components/map/PaddockNameLayer';

function polygonStyle(isHighlighted: boolean) {
  return blockPolygonPathStyle({
    isHighlighted,
    showRiskHeat: false,
    analyticsView: 'risk',
  });
}

function PaddockShapes({
  blocks,
  selectedPaddockId,
  dropping,
  onSelectPaddock,
  onPlace,
}: {
  blocks: OrchardBlock[];
  selectedPaddockId: string | null;
  dropping: boolean;
  onSelectPaddock: (id: string | null) => void;
  onPlace: (lat: number, lng: number) => void;
}) {
  const map = useMap();

  useEffect(() => {
    const group = L.featureGroup().addTo(map);
    for (const block of blocks) {
      const feature = asFeature(block.geojson);
      if (!feature) continue;
      const layer = L.geoJSON(feature, {
        style: polygonStyle(block.id === selectedPaddockId),
        onEachFeature: (_feature, leafletLayer) => {
          leafletLayer.on('click', (event) => {
            L.DomEvent.stopPropagation(event);
            if (dropping) {
              onPlace(event.latlng.lat, event.latlng.lng);
              return;
            }
            onSelectPaddock(block.id === selectedPaddockId ? null : block.id);
          });
        },
      });
      layer.addTo(group);
    }
    return () => {
      map.removeLayer(group);
    };
  }, [map, blocks, selectedPaddockId, dropping, onSelectPaddock, onPlace]);

  return null;
}

function FrameWorkArea({
  blocks,
  selectedPaddockId,
}: {
  blocks: OrchardBlock[];
  selectedPaddockId: string | null;
}) {
  const map = useMap();

  useEffect(() => {
    const chosen = selectedPaddockId
      ? blocks.filter((block) => block.id === selectedPaddockId)
      : blocks;
    const bounds = blocksToLeafletBounds(chosen.length > 0 ? chosen : blocks);
    if (!bounds) return;
    map.invalidateSize();
    map.fitBounds(bounds, { padding: [56, 56], maxZoom: 16, animate: false });
  }, [map, blocks, selectedPaddockId]);

  return null;
}

function MapTaps({
  dropping,
  onPlace,
  onClearPin,
}: {
  dropping: boolean;
  onPlace: (lat: number, lng: number) => void;
  onClearPin: () => void;
}) {
  useMapEvents({
    click(event) {
      if (dropping) onPlace(event.latlng.lat, event.latlng.lng);
      else onClearPin();
    },
  });
  return null;
}

function KeepPinAboveSheet({ pin }: { pin: InfrastructurePin | null }) {
  const map = useMap();

  useEffect(() => {
    if (!pin) return;
    const point = map.latLngToContainerPoint([pin.lat, pin.lng]);
    const limit = map.getSize().y * 0.42;
    if (point.y > limit) map.panBy([0, point.y - limit], { animate: true });
  }, [map, pin]);

  return null;
}

/** Farm map for the field bins page. Drop a pin, or tap one. */
export function FieldBinMap({
  farmId,
  blocks,
  pins,
  selectedPaddockId,
  selectedPinId,
  dropping,
  onSelectPaddock,
  onSelectPin,
  onPlace,
  onClearPin,
}: {
  farmId?: string;
  blocks: OrchardBlock[];
  pins: InfrastructurePin[];
  selectedPaddockId: string | null;
  selectedPinId: string | null;
  dropping: boolean;
  onSelectPaddock: (id: string | null) => void;
  onSelectPin: (id: string) => void;
  onPlace: (lat: number, lng: number) => void;
  onClearPin: () => void;
}) {
  const [basemapPack, setBasemapPack] = useState<BasemapPack | null>(null);
  const [packReady, setPackReady] = useState(!farmId);
  const bins = pins.filter((pin) => pin.type === 'field_bin');
  const selected = bins.find((pin) => pin.id === selectedPinId) ?? null;
  const center = useMemo(() => {
    const bounds = blocksToLeafletBounds(blocks);
    if (!bounds) return [-33.9249, 115.075] as [number, number];
    return [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2] as [number, number];
  }, [blocks]);

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
    <MapContainer
      center={center}
      zoom={15}
      maxZoom={20}
      zoomControl={false}
      className={`h-full w-full ${dropping ? 'cursor-crosshair' : ''}`}
    >
      {packReady && (
        <OrchardMapBasemapLayers
          farmId={farmId || ''}
          mapLayer="satellite"
          basemapPack={basemapPack}
          isOnline={typeof navigator === 'undefined' ? true : navigator.onLine}
        />
      )}
      <ZoomControl position="bottomright" />
      <PaddockShapes
        blocks={blocks}
        selectedPaddockId={selectedPaddockId}
        dropping={dropping}
        onSelectPaddock={onSelectPaddock}
        onPlace={onPlace}
      />
      <PaddockNameLayer blocks={blocks} />
      <FrameWorkArea blocks={blocks} selectedPaddockId={selectedPaddockId} />
      <MapTaps dropping={dropping} onPlace={onPlace} onClearPin={onClearPin} />
      <KeepPinAboveSheet pin={selected} />
      {bins.map((pin) => (
        <Marker
          key={`${pin.id}-${pin.id === selectedPinId ? 'on' : 'off'}`}
          position={[pin.lat, pin.lng]}
          icon={getPinDivIcon(pin, pin.id === selectedPinId)}
          zIndexOffset={pin.id === selectedPinId ? 800 : 0}
          eventHandlers={{
            click: (event) => {
              L.DomEvent.stopPropagation(event.originalEvent);
              onSelectPin(pin.id);
            },
          }}
        />
      ))}
    </MapContainer>
  );
}

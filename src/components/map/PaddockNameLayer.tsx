/**
 * One paddock/block name watermark at polygon centroid (operate + edit).
 */
import { useEffect, useMemo } from 'react';
import { useMap } from 'react-leaflet';
import * as turf from '@turf/turf';
import L from '../../lib/leaflet-setup';
import type { OrchardBlock } from '../../lib/mapStore';

type Props = {
  blocks: OrchardBlock[];
};

function nameIcon(name: string): L.DivIcon {
  const safe = name.replace(/[<>&"]/g, '');
  return L.divIcon({
    className: 'pufom-paddock-name',
    html: `<div class="pufom-paddock-name__label">${safe}</div>`,
    iconSize: [160, 28],
    iconAnchor: [80, 14],
  });
}

export function PaddockNameLayer({ blocks }: Props) {
  const map = useMap();

  const centers = useMemo(() => {
    const out: { id: string; name: string; lat: number; lng: number }[] = [];
    const seen = new Set<string>();
    for (const block of blocks) {
      const name = (block.name || '').trim();
      if (!name || !block.geojson || seen.has(block.id)) continue;
      seen.add(block.id);
      try {
        const c = turf.centerOfMass(block.geojson as turf.AllGeoJSON);
        out.push({
          id: block.id,
          name,
          lat: c.geometry.coordinates[1],
          lng: c.geometry.coordinates[0],
        });
      } catch {
        try {
          const c = turf.centroid(block.geojson as turf.AllGeoJSON);
          out.push({
            id: block.id,
            name,
            lat: c.geometry.coordinates[1],
            lng: c.geometry.coordinates[0],
          });
        } catch {
          /* skip */
        }
      }
    }
    return out;
  }, [blocks]);

  useEffect(() => {
    const group = L.layerGroup().addTo(map);
    for (const c of centers) {
      L.marker([c.lat, c.lng], {
        icon: nameIcon(c.name),
        interactive: false,
        keyboard: false,
        zIndexOffset: 120,
      }).addTo(group);
    }
    return () => {
      map.removeLayer(group);
    };
  }, [map, centers]);

  return null;
}

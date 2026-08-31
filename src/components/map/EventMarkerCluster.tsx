import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
// `leaflet-setup` rather than `leaflet` + a bare `import 'leaflet.markercluster'`:
// the plugin reads a global `L` and never imports leaflet, so it needs
// `leaflet-window` to have run first, which only `leaflet-setup` guarantees.
import L from '../../lib/leaflet-setup';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { escapeHtml } from '../../lib/escapeHtml';

type ClusterEvent = {
  id: string;
  blockId?: string;
  type: 'spray' | 'irrigation';
  sprayType?: string;
  applicationMethod?: string;
  irrigationAmount?: number;
  notes?: string;
};

interface EventMarkerClusterProps {
  events: ClusterEvent[];
  blockCenters: Record<string, [number, number]>;
}

export function EventMarkerCluster({ events, blockCenters }: EventMarkerClusterProps) {
  const map = useMap();

  useEffect(() => {
    const cluster = (L as typeof L & { markerClusterGroup: () => L.MarkerClusterGroup }).markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
    });

    for (const event of events) {
      if (!event.blockId || !blockCenters[event.blockId]) continue;
      const center = blockCenters[event.blockId];
      const iconHtml =
        event.type === 'spray'
          ? `<div class="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white shadow-lg border-2 border-white text-xs font-bold">S</div>`
          : `<div class="w-8 h-8 bg-cyan-500 rounded-full flex items-center justify-center text-white shadow-lg border-2 border-white text-xs font-bold">I</div>`;

      const marker = L.marker(center, {
        icon: L.divIcon({
          html: iconHtml,
          className: 'bg-transparent',
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        }),
      });

      const lines = [
        `<strong>${event.type === 'spray' ? 'Spray' : 'Irrigation'}</strong>`,
        event.type === 'spray' && event.sprayType ? `Type: ${escapeHtml(event.sprayType)}` : '',
        event.type === 'irrigation' && event.irrigationAmount != null
          ? `Amount: ${escapeHtml(String(event.irrigationAmount))}mm`
          : '',
        event.notes ? `<em>${escapeHtml(event.notes)}</em>` : '',
      ].filter(Boolean);

      marker.bindTooltip(lines.join('<br/>'), { direction: 'top', offset: [0, -16] });
      cluster.addLayer(marker);
    }

    map.addLayer(cluster);
    return () => {
      map.removeLayer(cluster);
    };
  }, [map, events, blockCenters]);

  return null;
}

/**
 * Pulsing timed area highlights with author name watermark.
 * Tap opens a React inspect sheet (not a Leaflet popup) so it outlives the TTL.
 */
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import * as turf from '@turf/turf';
import L from '../../lib/leaflet-setup';
import {
  highlightColourForAuthor,
  type MapHighlightDoc,
} from '../../lib/mapHighlights';

type Props = {
  highlights: MapHighlightDoc[];
  onSelect: (h: MapHighlightDoc) => void;
};

function asFeature(geojson: GeoJSON.Feature | GeoJSON.Geometry): GeoJSON.Feature | null {
  if (!geojson) return null;
  if ((geojson as GeoJSON.Feature).type === 'Feature') {
    return geojson as GeoJSON.Feature;
  }
  return {
    type: 'Feature',
    properties: {},
    geometry: geojson as GeoJSON.Geometry,
  };
}

function watermarkIcon(name: string, colour: string): L.DivIcon {
  const safe = (name || 'Crew').replace(/[<>&"]/g, '');
  return L.divIcon({
    className: 'pufom-highlight-wm',
    html: `<div class="pufom-highlight-wm__label" style="--hl-colour:${colour}">${safe}</div>`,
    iconSize: [120, 24],
    iconAnchor: [60, 12],
  });
}

export function MapHighlightsLayer({ highlights, onSelect }: Props) {
  const map = useMap();

  useEffect(() => {
    const group = L.layerGroup().addTo(map);

    for (const h of highlights) {
      const feature = asFeature(h.geojson);
      if (!feature?.geometry) continue;
      const colour = highlightColourForAuthor(h.createdBy, h.colour);

      try {
        const layer = L.geoJSON(feature as GeoJSON.GeoJsonObject, {
          style: {
            color: colour,
            weight: 2,
            fillColor: colour,
            fillOpacity: 0.22,
            className: 'pufom-map-highlight-poly',
          },
        });

        layer.eachLayer((ly) => {
          if (ly instanceof L.Path) {
            ly.setStyle({
              color: colour,
              fillColor: colour,
              fillOpacity: 0.22,
              weight: 2,
              className: 'pufom-map-highlight-poly',
            });
          }
        });

        layer.on('click', (ev: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(ev);
          if (ev.originalEvent) {
            (ev.originalEvent as { _stopped?: boolean })._stopped = true;
          }
          onSelect(h);
        });

        layer.addTo(group);

        try {
          const c = turf.centerOfMass(feature as turf.AllGeoJSON);
          const [lng, lat] = c.geometry.coordinates;
          L.marker([lat, lng], {
            icon: watermarkIcon(h.displayName || 'Crew', colour),
            interactive: false,
            keyboard: false,
            zIndexOffset: 250,
          }).addTo(group);
        } catch {
          /* skip watermark */
        }
      } catch (err) {
        console.warn('[MapHighlightsLayer] skip highlight', h.id, err);
      }
    }

    return () => {
      map.removeLayer(group);
    };
  }, [map, highlights, onSelect]);

  return null;
}

/**
 * Pulsing timed area highlights with author name watermark.
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
  canDelete: (h: MapHighlightDoc) => boolean;
  onDelete: (id: string) => void;
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

export function MapHighlightsLayer({ highlights, canDelete, onDelete }: Props) {
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

        const note = h.note?.trim();
        const popup = L.popup({ maxWidth: 240 }).setContent(
          `<div style="font:12px/1.35 system-ui,sans-serif;color:#0f172a">
            <strong>${(h.displayName || 'Crew').replace(/[<>&]/g, '')}</strong>
            ${note ? `<p style="margin:4px 0 0;color:#475569">${note.replace(/[<>&]/g, '')}</p>` : ''}
            <p style="margin:6px 0 0;color:#94a3b8;font-size:10px">Expires ${new Date(h.expiresAt).toLocaleTimeString()}</p>
            ${
              canDelete(h)
                ? `<button type="button" data-hl-del="${h.id}" style="margin-top:8px;font:600 11px system-ui;padding:4px 8px;border-radius:6px;border:1px solid #fecaca;background:#fef2f2;color:#b91c1c;cursor:pointer">Remove</button>`
                : ''
            }
          </div>`
        );

        layer.bindPopup(popup);
        layer.on('popupopen', () => {
          const el = popup.getElement();
          const btn = el?.querySelector(`[data-hl-del="${h.id}"]`) as HTMLButtonElement | null;
          if (!btn) return;
          const handler = (ev: Event) => {
            ev.preventDefault();
            ev.stopPropagation();
            onDelete(h.id);
            map.closePopup();
          };
          btn.addEventListener('click', handler, { once: true });
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
  }, [map, highlights, canDelete, onDelete]);

  return null;
}

import { useEffect, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  ESRI_ATTRIBUTION,
  ESRI_IMAGERY_URL,
  getTileBlob,
  tileUrl,
} from '../../lib/basemapPack';

type Props = {
  farmId: string;
  /** When true, never hit the network for missing tiles. */
  offlineOnly?: boolean;
};

/**
 * Leaflet GridLayer that serves Esri imagery from IndexedDB first,
 * then falls back to network when online (unless offlineOnly).
 */
export function CachedTileLayer({ farmId, offlineOnly }: Props) {
  const map = useMap();
  const [isOnline, setIsOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const blockNetwork = offlineOnly ?? !isOnline;

  useEffect(() => {
    if (!farmId) return;

    const Layer = L.GridLayer.extend({
      createTile(coords: L.Coords, done: L.DoneCallback) {
        const tile = document.createElement('img');
        tile.alt = '';
        tile.setAttribute('role', 'presentation');
        tile.style.width = '100%';
        tile.style.height = '100%';
        tile.style.objectFit = 'cover';

        const z = coords.z;
        const x = coords.x;
        const y = coords.y;

        let objectUrl: string | null = null;

        const finish = (url: string) => {
          tile.onload = () => {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            done(undefined, tile);
          };
          tile.onerror = () => {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            done(new Error('Tile load failed'), tile);
          };
          tile.src = url;
        };

        (async () => {
          try {
            const blob = await getTileBlob(farmId, z, x, y);
            if (blob) {
              objectUrl = URL.createObjectURL(blob);
              finish(objectUrl);
              return;
            }

            if (!blockNetwork && (typeof navigator === 'undefined' || navigator.onLine)) {
              finish(tileUrl(z, x, y));
              return;
            }

            // Transparent / dark placeholder when offline and missing
            tile.style.background = '#1e293b';
            done(undefined, tile);
          } catch (err) {
            done(err as Error, tile);
          }
        })();

        return tile;
      },
    });

    const layer = new (Layer as unknown as new (opts?: L.GridLayerOptions) => L.GridLayer)({
      attribution: ESRI_ATTRIBUTION,
      maxZoom: 20,
      maxNativeZoom: 17,
      minZoom: 0,
    });

    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, farmId, blockNetwork]);

  return null;
}

/** Network-only Esri layer (used during setup preview before pack exists). */
export function EsriPreviewTileLayer() {
  const map = useMap();

  useEffect(() => {
    const layer = L.tileLayer(ESRI_IMAGERY_URL, {
      attribution: ESRI_ATTRIBUTION,
      maxZoom: 20,
      maxNativeZoom: 19,
    });
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map]);

  return null;
}

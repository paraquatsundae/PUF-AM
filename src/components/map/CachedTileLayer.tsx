import { useEffect, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from '../../lib/leaflet-setup';
import {
  IMAGERY_ATTRIBUTION,
  getTileBlob,
  tileUrl,
  tileUrlTemplate,
} from '../../lib/basemapPack';

type Props = {
  farmId: string;
  /** When true, never hit the network for missing tiles. */
  offlineOnly?: boolean;
};

type PufomTileImg = HTMLImageElement & { _pufomObjectUrl?: string };

/**
 * Leaflet GridLayer that serves satellite imagery from IndexedDB first,
 * then falls back to the `/api/tiles` proxy when online (unless offlineOnly).
 *
 * Note: do not revoke blob: URLs in img.onload — Android WebView often
 * blanks the tile after revoke. Revoke when Leaflet removes the tile.
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
    // Capacitor reports link state more reliably than navigator.onLine in WebView.
    let capHandle: { remove: () => Promise<void> } | undefined;
    void (async () => {
      try {
        const { Network } = await import('@capacitor/network');
        const status = await Network.getStatus();
        setIsOnline(Boolean(status.connected));
        capHandle = await Network.addListener('networkStatusChange', (s) => {
          setIsOnline(Boolean(s.connected));
        });
      } catch {
        /* browser / plugin missing */
      }
    })();
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      void capHandle?.remove();
    };
  }, []);

  const blockNetwork = offlineOnly ?? !isOnline;

  useEffect(() => {
    if (!farmId) return;

    const Layer = L.GridLayer.extend({
      createTile(coords: L.Coords, done: L.DoneCallback) {
        const tile = document.createElement('img') as PufomTileImg;
        tile.alt = '';
        tile.setAttribute('role', 'presentation');
        tile.style.width = '100%';
        tile.style.height = '100%';
        tile.style.objectFit = 'cover';

        const z = coords.z;
        const x = coords.x;
        const y = coords.y;

        const revoke = () => {
          if (tile._pufomObjectUrl) {
            URL.revokeObjectURL(tile._pufomObjectUrl);
            tile._pufomObjectUrl = undefined;
          }
        };

        const finish = (url: string, fromBlob: boolean) => {
          tile.onload = () => {
            done(undefined, tile);
          };
          tile.onerror = () => {
            // Blob decode glitch → try network once (unless offline-only).
            if (fromBlob && !blockNetwork) {
              revoke();
              finish(tileUrl(z, x, y), false);
              return;
            }
            revoke();
            tile.style.background = '#1e293b';
            done(new Error('Tile load failed'), tile);
          };
          tile.src = url;
        };

        (async () => {
          try {
            const blob = await getTileBlob(farmId, z, x, y);
            if (blob && blob.size > 0) {
              const objectUrl = URL.createObjectURL(blob);
              tile._pufomObjectUrl = objectUrl;
              finish(objectUrl, true);
              return;
            }

            // Prefer network when allowed. Do not trust navigator.onLine alone —
            // Android WebView often reports offline while Wi‑Fi still works.
            if (!blockNetwork) {
              finish(tileUrl(z, x, y), false);
              return;
            }

            tile.style.background = '#1e293b';
            done(undefined, tile);
          } catch (err) {
            done(err as Error, tile);
          }
        })();

        return tile;
      },

      _removeTile(key: string) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tile = (this as any)._tiles?.[key]?.el as PufomTileImg | undefined;
        if (tile?._pufomObjectUrl) {
          URL.revokeObjectURL(tile._pufomObjectUrl);
          tile._pufomObjectUrl = undefined;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (L.GridLayer.prototype as any)._removeTile.call(this, key);
      },
    });

    const layer = new (Layer as unknown as new (opts?: L.GridLayerOptions) => L.GridLayer)({
      attribution: IMAGERY_ATTRIBUTION,
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

/** Network-only imagery layer (used during setup preview before a pack exists). */
export function ImageryPreviewTileLayer() {
  const map = useMap();

  useEffect(() => {
    const layer = L.tileLayer(tileUrlTemplate(), {
      attribution: IMAGERY_ATTRIBUTION,
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

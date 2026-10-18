import { TileLayer } from 'react-leaflet';
import { CachedTileLayer } from './CachedTileLayer';
import { CARTO_ATTRIBUTION, cartoTileUrl } from '../../lib/cartoBasemap';
import { IMAGERY_ATTRIBUTION, tileUrlTemplate, type BasemapPack } from '../../lib/basemapPack';

/**
 * Satellite imagery comes from `/api/tiles`, never from a provider directly.
 *
 * There used to be three branches here — the offline pack, a Google Maps layer
 * behind a client-side key, and a hardcoded `server.arcgisonline.com` fallback.
 * The proxy makes the last two the same thing, and a keyless one, so what is
 * left is "the pack if there is one, the proxy if not".
 *
 * Street tiles and the place-name overlay are CARTO, requested by the browser.
 * `VITE_CARTO_BASEMAP_KEY` is what replaces the "API KEY REQUIRED" tiles.
 * Plans/API_KEY_SECURITY.md.
 */
export function OrchardMapBasemapLayers({
  farmId,
  mapLayer,
  basemapPack,
  isOnline,
}: {
  farmId: string;
  mapLayer: 'vector' | 'satellite';
  basemapPack: BasemapPack | null;
  isOnline: boolean;
}) {
  return (
    <>
      {mapLayer === 'satellite' && basemapPack ? (
        <CachedTileLayer farmId={farmId} offlineOnly={!isOnline} />
      ) : mapLayer === 'satellite' ? (
        <TileLayer
          url={tileUrlTemplate()}
          attribution={IMAGERY_ATTRIBUTION}
          maxZoom={20}
          maxNativeZoom={19}
        />
      ) : (
        <TileLayer
          url={cartoTileUrl('light_all')}
          attribution={CARTO_ATTRIBUTION}
        />
      )}
      {mapLayer === 'satellite' && !basemapPack && (
        <TileLayer
          url={cartoTileUrl('rastertiles/voyager_only_labels')}
          attribution={CARTO_ATTRIBUTION}
          zIndex={10}
        />
      )}
    </>
  );
}

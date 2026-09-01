import { TileLayer } from 'react-leaflet';
import { CachedTileLayer } from './CachedTileLayer';
import { IMAGERY_ATTRIBUTION, tileUrlTemplate, type BasemapPack } from '../../lib/basemapPack';

/**
 * Satellite imagery comes from `/api/tiles`, never from a provider directly.
 *
 * There used to be three branches here — the offline pack, a Google Maps layer
 * behind a client-side key, and a hardcoded `server.arcgisonline.com` fallback.
 * The proxy makes the last two the same thing, and a keyless one, so what is
 * left is "the pack if there is one, the proxy if not".
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
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution="&copy; <a href='https://carto.com/'>CARTO</a>"
        />
      )}
      {mapLayer === 'satellite' && !basemapPack && (
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png"
          attribution="&copy; <a href='https://carto.com/'>CARTO</a>"
          zIndex={10}
        />
      )}
    </>
  );
}

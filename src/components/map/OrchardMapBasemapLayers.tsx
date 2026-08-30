import { TileLayer } from 'react-leaflet';
import { CachedTileLayer } from './CachedTileLayer';
import { GoogleMapsLayer } from './GoogleMapsLayer';
import { ESRI_ATTRIBUTION, type BasemapPack } from '../../lib/basemapPack';

export function OrchardMapBasemapLayers({
  farmId,
  mapLayer,
  basemapPack,
  isOnline,
  useGoogleSatellite,
  googleMapsApiKey,
  onGoogleFail,
}: {
  farmId: string;
  mapLayer: 'vector' | 'satellite';
  basemapPack: BasemapPack | null;
  isOnline: boolean;
  useGoogleSatellite: boolean;
  googleMapsApiKey: string | undefined;
  onGoogleFail: () => void;
}) {
  return (
    <>
      {mapLayer === 'satellite' && basemapPack ? (
        <CachedTileLayer farmId={farmId} offlineOnly={!isOnline} />
      ) : useGoogleSatellite && googleMapsApiKey && mapLayer === 'satellite' ? (
        <GoogleMapsLayer
          type="hybrid"
          apiKey={googleMapsApiKey}
          onFail={onGoogleFail}
        />
      ) : mapLayer === 'satellite' ? (
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution={ESRI_ATTRIBUTION}
          maxZoom={20}
          maxNativeZoom={19}
        />
      ) : (
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution="&copy; <a href='https://carto.com/'>CARTO</a>"
        />
      )}
      {mapLayer === 'satellite' && !basemapPack && !(useGoogleSatellite && googleMapsApiKey) && (
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png"
          attribution="&copy; <a href='https://carto.com/'>CARTO</a>"
          zIndex={10}
        />
      )}
    </>
  );
}

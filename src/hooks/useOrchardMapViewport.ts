import { useCallback, useEffect, useRef } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import debounce from 'lodash/debounce';
import L from '../lib/leaflet-setup';
import { bboxCenter, type BasemapPack } from '../lib/basemapPack';
import { blocksToLeafletBounds } from '../lib/farmBounds';
import type { FarmTrack, MapViewport, OrchardBlock } from '../lib/mapStore';
import type { UserGeoFix } from '../components/map/UserLocationLayer';

const FALLBACK_CENTER = { lat: -33.9249, lng: 115.075, zoom: 15 };

export function useOrchardMapViewport({
  mapInstance,
  isLoaded,
  farmId,
  blocks,
  basemapPack,
  setViewport,
  setBounds,
  userFix,
  followUser,
  setFollowUser,
}: {
  mapInstance: LeafletMap | null;
  isLoaded: boolean;
  farmId: string | undefined;
  blocks: OrchardBlock[];
  basemapPack: BasemapPack | null;
  setViewport: (viewport: MapViewport) => void;
  setBounds: (bounds: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  } | null) => void;
  userFix: UserGeoFix | null;
  followUser: boolean;
  setFollowUser: (follow: boolean) => void;
}) {
  const fittedToBlocksFarmRef = useRef<string | null>(null);
  const fittedFallbackFarmRef = useRef<string | null>(null);

  useEffect(() => {
    fittedToBlocksFarmRef.current = null;
    fittedFallbackFarmRef.current = null;
  }, [farmId]);

  const fitFarmInView = useCallback(
    (opts?: { animate?: boolean }) => {
      if (!mapInstance) return false;
      const blockBounds = blocksToLeafletBounds(blocks);
      if (blockBounds) {
        mapInstance.fitBounds(blockBounds, {
          padding: [48, 48],
          maxZoom: 17,
          animate: opts?.animate ?? true,
        });
        const center = mapInstance.getCenter();
        setViewport({ lat: center.lat, lng: center.lng, zoom: mapInstance.getZoom() });
        return true;
      }
      if (basemapPack) {
        mapInstance.fitBounds(
          [
            [basemapPack.bbox.south, basemapPack.bbox.west],
            [basemapPack.bbox.north, basemapPack.bbox.east],
          ],
          { padding: [32, 32], maxZoom: 16, animate: opts?.animate ?? true }
        );
        const c = bboxCenter(basemapPack.bbox);
        setViewport({ lat: c.lat, lng: c.lng, zoom: mapInstance.getZoom() });
        return true;
      }
      return false;
    },
    [mapInstance, blocks, basemapPack, setViewport]
  );

  useEffect(() => {
    if (!mapInstance || !isLoaded || !farmId) return;

    if (blocks.length > 0) {
      if (fittedToBlocksFarmRef.current === farmId) return;
      if (fitFarmInView({ animate: false })) {
        fittedToBlocksFarmRef.current = farmId;
      }
      return;
    }

    if (basemapPack && fittedFallbackFarmRef.current !== farmId) {
      if (fitFarmInView({ animate: false })) {
        fittedFallbackFarmRef.current = farmId;
      }
    }
  }, [mapInstance, isLoaded, farmId, blocks, basemapPack, fitFarmInView]);

  const fitBlockInView = useCallback(
    (block: OrchardBlock, opts?: { animate?: boolean }) => {
      if (!mapInstance) return;
      const bounds = blocksToLeafletBounds([block]);
      if (!bounds) return;
      mapInstance.fitBounds(bounds, {
        padding: [56, 56],
        maxZoom: 18,
        animate: opts?.animate ?? true,
      });
    },
    [mapInstance]
  );

  useEffect(() => {
    if (!mapInstance) return;

    const handleMoveEnd = debounce(() => {
      const center = mapInstance.getCenter();
      const bounds = mapInstance.getBounds();

      setViewport({ lat: center.lat, lng: center.lng, zoom: mapInstance.getZoom() });

      setBounds({
        minLat: bounds.getSouth(),
        maxLat: bounds.getNorth(),
        minLng: bounds.getWest(),
        maxLng: bounds.getEast(),
      });
    }, 500);

    mapInstance.on('moveend', handleMoveEnd);
    mapInstance.on('zoomend', handleMoveEnd);

    return () => {
      mapInstance.off('moveend', handleMoveEnd);
      mapInstance.off('zoomend', handleMoveEnd);
    };
  }, [mapInstance, setViewport, setBounds]);

  const handleLocateMe = useCallback(() => {
    if (!mapInstance) return;
    if (userFix) {
      mapInstance.flyTo([userFix.lat, userFix.lng], Math.max(mapInstance.getZoom(), 17), {
        animate: true,
      });
      setFollowUser(true);
      return;
    }
    mapInstance.locate({ setView: true, maxZoom: 17 });
    setFollowUser(true);
  }, [mapInstance, userFix, setFollowUser]);

  useEffect(() => {
    if (!mapInstance || !followUser) return;
    const stopFollow = () => setFollowUser(false);
    mapInstance.on('dragstart', stopFollow);
    return () => {
      mapInstance.off('dragstart', stopFollow);
    };
  }, [mapInstance, followUser, setFollowUser]);

  const handleGoHome = useCallback(() => {
    if (!fitFarmInView({ animate: true }) && mapInstance) {
      mapInstance.flyTo([FALLBACK_CENTER.lat, FALLBACK_CENTER.lng], FALLBACK_CENTER.zoom);
    }
  }, [fitFarmInView, mapInstance]);

  const resetFarmFit = useCallback(() => {
    fittedToBlocksFarmRef.current = null;
    fittedFallbackFarmRef.current = null;
  }, []);

  const flyToTrack = useCallback(
    (track: FarmTrack) => {
      if (!mapInstance || !track.geojson) return;
      try {
        const layer = L.geoJSON(track.geojson as GeoJSON.GeoJsonObject);
        const bounds = layer.getBounds();
        if (bounds.isValid()) {
          mapInstance.flyToBounds(bounds.pad(0.2), { maxZoom: 18, animate: true });
        }
      } catch (err) {
        console.error('Failed to fly to track', err);
      }
    },
    [mapInstance]
  );

  return {
    fitFarmInView,
    resetFarmFit,
    fitBlockInView,
    handleLocateMe,
    handleGoHome,
    flyToTrack,
  };
}

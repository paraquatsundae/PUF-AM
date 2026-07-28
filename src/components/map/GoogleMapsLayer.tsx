import { useEffect, useState, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from '../../lib/leaflet-setup';

interface GoogleMapsLayerProps {
  type: 'roadmap' | 'satellite' | 'terrain' | 'hybrid';
  apiKey?: string;
  /** Called when the Maps JS API or Mutant fails — parent can fall back to Esri. */
  onFail?: (reason: string) => void;
}

export function GoogleMapsLayer({ type, apiKey, onFail }: GoogleMapsLayerProps) {
  const map = useMap();
  const [isLoaded, setIsLoaded] = useState(false);
  const [isGoogleReady, setIsGoogleReady] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const GoogleMutantClass = useRef<any>(null);
  const failedRef = useRef(false);

  const fail = (reason: string) => {
    if (failedRef.current) return;
    failedRef.current = true;
    console.error('[GoogleMapsLayer]', reason);
    onFail?.(reason);
  };

  useEffect(() => {
    if (!apiKey) return;
    failedRef.current = false;

    // Google calls this on invalid key / referrer — faster than the load timeout.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prevAuthFailure = (window as any).gm_authFailure;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).gm_authFailure = () => {
      fail('Google Maps auth failure (API key / HTTP referrer / billing).');
    };

    const existingScript = document.getElementById('google-maps-script');
    if (!existingScript) {
      const script = document.createElement('script');
      script.id = 'google-maps-script';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
      script.async = true;
      script.defer = true;
      script.onerror = () => fail('Maps JS script failed to load (network or blocked key).');
      document.head.appendChild(script);
    }

    const checkGoogle = setInterval(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = (window as any).google;
      if (g?.maps?.Map) {
        clearInterval(checkGoogle);
        setIsGoogleReady(true);
      }
    }, 100);

    const timeout = setTimeout(() => {
      clearInterval(checkGoogle);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!(window as any).google?.maps?.Map) {
        fail('Google Maps API failed to load after 10s — check API key referrers (LAN URL) and Maps JavaScript API.');
      }
    }, 10000);

    return () => {
      clearInterval(checkGoogle);
      clearTimeout(timeout);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).gm_authFailure = prevAuthFailure;
    };
  }, [apiKey]);

  useEffect(() => {
    if (!isGoogleReady) return;
    import('leaflet.gridlayer.googlemutant')
      .then((module) => {
        GoogleMutantClass.current = module.default;
        setIsLoaded(true);
      })
      .catch((err) => {
        fail(`Failed to load GoogleMutant plugin: ${err}`);
      });
  }, [isGoogleReady]);

  useEffect(() => {
    if (!apiKey || !isLoaded || !isGoogleReady || !GoogleMutantClass.current) return;

    if (!L) {
      fail('Leaflet (L) not found');
      return;
    }

    try {
      const googleLayer = new GoogleMutantClass.current({
        type: type,
        googleMapsApiKey: apiKey,
        maxZoom: 24,
        maxNativeZoom: 21,
      });

      googleLayer.addTo(map);

      return () => {
        map.removeLayer(googleLayer);
      };
    } catch (err) {
      fail(`Error initializing GoogleMapsLayer: ${err}`);
    }
  }, [map, type, apiKey, isLoaded, isGoogleReady]);

  return null;
}

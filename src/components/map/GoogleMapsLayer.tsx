import { useEffect, useState, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from '../../lib/leaflet-setup';

interface GoogleMapsLayerProps {
  type: 'roadmap' | 'satellite' | 'terrain' | 'hybrid';
  apiKey?: string;
}

export function GoogleMapsLayer({ type, apiKey }: GoogleMapsLayerProps) {
  const map = useMap();
  const [isLoaded, setIsLoaded] = useState(false);
  const [isGoogleReady, setIsGoogleReady] = useState(false);
  const GoogleMutantClass = useRef<any>(null);

  useEffect(() => {
    if (!apiKey) return;

    const existingScript = document.getElementById('google-maps-script');
    if (!existingScript) {
      const script = document.createElement('script');
      script.id = 'google-maps-script';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    // Poll for window.google to be ready before instantiating GoogleMutant
    const checkGoogle = setInterval(() => {
      if ((window as any).google && (window as any).google.maps && (window as any).google.maps.Map) {
        clearInterval(checkGoogle);
        setIsGoogleReady(true);
      }
    }, 100);

    // Timeout after 10 seconds to stop polling
    const timeout = setTimeout(() => {
      clearInterval(checkGoogle);
      if (!(window as any).google) {
        console.error('Google Maps API failed to load after 10 seconds. Check your API key and network connection.');
      }
    }, 10000);

    return () => {
      clearInterval(checkGoogle);
      clearTimeout(timeout);
    };
  }, [apiKey]);

  useEffect(() => {
    if (!isGoogleReady) return;
    // Dynamically import the plugin to ensure window.L is set first
    import('leaflet.gridlayer.googlemutant').then((module) => {
      GoogleMutantClass.current = module.default;
      setIsLoaded(true);
    }).catch(err => {
      console.error('Failed to load GoogleMutant plugin:', err);
    });
  }, [isGoogleReady]);

  useEffect(() => {
    if (!apiKey || !isLoaded || !isGoogleReady || !GoogleMutantClass.current) return;

    // L is pre-initialized in leaflet-setup.ts and imported here
    if (!L) {
      console.error('Leaflet (L) not found');
      return;
    }

    try {
      console.log('Initializing googleMutant layer with type:', type);
      
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
      console.error('Error initializing GoogleMapsLayer:', err);
    }
  }, [map, type, apiKey, isLoaded, isGoogleReady]);

  return null;
}

import { Capacitor } from '@capacitor/core';

/**
 * Resolve a usable Maps JS key. Placeholder / empty → treat as absent so Esri can load.
 */
export function resolveGoogleMapsApiKey(
  raw: string | undefined = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
): string | undefined {
  const key = (raw || '').trim();
  if (!key) return undefined;
  if (key === 'YOUR_GOOGLE_MAPS_API_KEY') return undefined;
  if (/^your[_-]?/i.test(key)) return undefined;
  return key;
}

/**
 * Google Mutant + referrer-restricted keys often blank out on Capacitor LAN
 * (http://192.168.x.x:3000). Prefer Esri World Imagery on native unless forced.
 */
export function preferEsriSatelliteBasemap(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

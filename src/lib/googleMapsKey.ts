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
 * Prefer Esri World Imagery for satellite.
 *
 * Google Mutant + referrer-restricted keys often blank out on:
 * - Capacitor LAN (http://192.168.x.x:3000)
 * - localhost / LAN Vite in desktop browsers (key restricted to prod domains)
 *
 * Opt back into Google with VITE_PREFER_GOOGLE_SATELLITE=1 (and a key that
 * allows the page origin). onFail still falls back to Esri if Google dies.
 */
export function preferEsriSatelliteBasemap(): boolean {
  const forceGoogle =
    String(import.meta.env.VITE_PREFER_GOOGLE_SATELLITE || '').trim() === '1';
  if (forceGoogle) return false;
  return true;
}

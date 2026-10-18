/**
 * CARTO raster basemaps for the street layer and the satellite place-name overlay.
 *
 * The browser has to request `basemaps.cartocdn.com` itself. The Basemap Terms
 * forbid proxying or caching these tiles on our server, so this key cannot
 * follow satellite imagery through `/api/tiles`. Without
 * `VITE_CARTO_BASEMAP_KEY` the tiles are the "API KEY REQUIRED" notice.
 *
 * The value stays in `.env` (gitignored). Vite inlines it into whichever build
 * loads that file — local dev, a desktop bake, a local APK. A GitHub Actions
 * APK has no `.env`, so it keeps the notice until that workflow is given the
 * key. Plans/API_KEY_SECURITY.md.
 */

export const CARTO_ATTRIBUTION =
  "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors, &copy; <a href='https://carto.com/attribution/'>CARTO</a>";

/** Style path under basemaps.cartocdn.com, with no leading slash. */
export function cartoTileUrl(stylePath: string, key = cartoBasemapKey()): string {
  const base = `https://{s}.basemaps.cartocdn.com/${stylePath}/{z}/{x}/{y}{r}.png`;
  const trimmed = key.trim();
  if (!trimmed) return base;
  return `${base}?key=${encodeURIComponent(trimmed)}`;
}

export function cartoBasemapKey(): string {
  return String(import.meta.env.VITE_CARTO_BASEMAP_KEY || '').trim();
}

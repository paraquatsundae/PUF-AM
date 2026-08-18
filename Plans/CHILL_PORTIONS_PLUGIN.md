# Chill portions crop pack

**Product:** PUF-AM  
**Status:** Active — first extract of hardcoded chill into a crop-pack plugin  
**Date:** 2026-08-16  
**Companion:** [`CROP_PACK_PLUGIN.md`](CROP_PACK_PLUGIN.md) · standalone binaries in `PUFworks-chill_calculator/`

## What changed

Chill was a core always-on feature (`shared/weather/chillPortions.ts`, `/weather-events` under the dashboard module). It is now the **`chill_portions`** crop pack under Settings → Plugins → Crop tools.

| Piece | Where |
|-------|--------|
| Catalog + defaults | `plugins/chill_portions/plugin.json`, `engine.json` |
| TS adapter | `shared/farm/chillPortionsPackage.ts` |
| Farm hourly path (DPIRD) | `shared/weather/chillPortions.ts` — constants/cultivars from the pack |
| Daily / CSV calculator | `shared/weather/chillCalculator.ts` — port of calculator `app.js` |
| UI | `src/packs/chill_portions/`, `src/pages/WeatherEvents.tsx` |
| Module | `chill` (not `dashboard`) |

The `PUFworks-chill_calculator` folder is **release binaries only** (AppImage / exe / APK). It is not a drop-in PUF-AM zip. Engine logic was recovered from the APK `assets/www/app.js`.

## Farm behaviour

- **Install / Activate / Deactivate / Delete** like walnut blight.
- Existing orchard / walnut farms are **migrated** (`migrateLegacyChillPack`) when an admin opens Dashboard or Plugins.
- Until that write, `useChillPack()` still uses the old eligibility helper so the home card does not vanish.
- Deactivate hides nav + dashboard card; settings doc is kept. Delete wipes `settings/chill_portions`.

## Engine notes

- **Farm live totals:** observed DPIRD hourly, Mar–Sep Perth window, Firestore `chill_cache`. Unchanged API: `GET /api/weather/chill-portions`.
- **Calculator panel:** daily Tmax/Tmin → solar hourly curve → same Dynamic Model constants. No API key.
- SILO / BOM fetch from the standalone app is **not** in this slice (needs a cloud proxy + email). Add later if wanted.
- Kelvin offset in `engine.json` is **273.0** (calculator). Farm hourly previously used 273.15.

## Not in this slice

- Utah model / chill hours
- Server-side pack gate on the chill API
- Hot-load of React from the zip

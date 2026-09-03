# Chill portions crop pack

On-disk package for Dynamic Model chill portions (`chill_portions.zip` when packed).

Engine is the standalone **Chill Portion Calculator** (Erez & Fishman / `chill_calc.py` port) plus PUF-AM farm hourly DPIRD.

| File | Owns |
|------|------|
| `plugin.json` | Catalog row (label, category, `chill` module, `/weather-events`) |
| `engine.json` | Dynamic Model constants, SH season defaults, cultivar CP targets |

| `src/` | React UI — Weather events page, calculator and science panels, `packUi` registration |

**Not in this folder:** the hourly farm path (`shared/weather/chillPortions.ts`) and the daily/CSV calculator (`shared/weather/chillCalculator.ts`). Both stay shared because `server/chillRoutes.ts` computes seasonal portions server-side and cannot import from a pack folder.

Everything here is compiled into the app build. v1 does not hot-load React from the zip.

```bash
npm run plugins:verify -- plugins/chill_portions
npm run plugins:pack -- plugins/chill_portions
```

Standalone binaries (workshop calculator): `PUFworks-chill_calculator/`.

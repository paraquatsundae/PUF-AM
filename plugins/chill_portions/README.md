# Chill portions crop pack

On-disk package for Dynamic Model chill portions (`chill_portions.zip` when packed).

Engine is the standalone **Chill Portion Calculator** (Erez & Fishman / `chill_calc.py` port) plus PUF-AM farm hourly DPIRD.

| File | Owns |
|------|------|
| `plugin.json` | Catalog row (label, category, `chill` module, `/weather-events`) |
| `engine.json` | Dynamic Model constants, SH season defaults, cultivar CP targets |

**Still in the app build:** React UI (`src/packs/chill_portions`, Weather events page), hourly farm path (`shared/weather/chillPortions.ts`), daily/CSV calculator (`shared/weather/chillCalculator.ts`). v1 does not hot-load those from the zip.

```bash
npm run plugins:verify -- plugins/chill_portions
npm run plugins:pack -- plugins/chill_portions
```

Standalone binaries (workshop calculator): `PUFworks-chill_calculator/`.

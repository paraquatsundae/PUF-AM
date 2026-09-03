# Walnut blight crop pack

This folder is the **on-disk package** for walnut blight (`walnut_blight.zip` when packed).

| File | Owns |
|------|------|
| `plugin.json` | Catalog row (label, category, modules, settings wipe list, `/blight`) |
| `engine.json` | Default blight model + sandbox session knobs |

| `src/` | React UI — Blight Risk page, panels, sandbox model (`blightModel.ts`), `packUi` registration |

**Not in this folder:** the Ji engine core (`shared/weather/jiBlightModel.ts`), which stays shared because the DPIRD client and Cloud Functions both use it.

Everything here is compiled into the app build. v1 does not hot-load React from the zip.

```bash
npm run plugins:verify -- plugins/walnut_blight
npm run plugins:pack -- plugins/walnut_blight   # → plugins/walnut_blight.zip (gitignored)
```

Farm-type eligibility (`canInstall` walnut hint) stays in `shared/farm/cropPacks.ts` — that is app logic, not engine data.

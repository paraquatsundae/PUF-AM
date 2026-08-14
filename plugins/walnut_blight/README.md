# Walnut blight crop pack

This folder is the **on-disk package** for walnut blight (`walnut_blight.zip` when packed).

| File | Owns |
|------|------|
| `plugin.json` | Catalog row (label, category, modules, settings wipe list, `/blight`) |
| `engine.json` | Default blight model + sandbox session knobs |

**Still in the app build:** React UI (`src/packs/walnut_blight`, Blight Risk page) and the Ji engine code (`src/lib/blightModel.ts`, `shared/weather/jiBlightModel.ts`). v1 does not hot-load those from the zip.

```bash
npm run plugins:verify -- plugins/walnut_blight
npm run plugins:pack -- plugins/walnut_blight   # → plugins/walnut_blight.zip (gitignored)
```

Farm-type eligibility (`canInstall` walnut hint) stays in `shared/farm/cropPacks.ts` — that is app logic, not engine data.

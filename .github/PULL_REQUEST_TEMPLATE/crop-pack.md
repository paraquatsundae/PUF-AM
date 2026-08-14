## Crop pack PR

Use this template when adding or changing a **crop pack** (not a Freenet host plugin).

**Contract:** [`Plans/CROP_PACK_PLUGIN.md`](../../Plans/CROP_PACK_PLUGIN.md)  
**Reference pack:** [`Plans/BLIGHT_ENGINE_PLUGIN.md`](../../Plans/BLIGHT_ENGINE_PLUGIN.md) · `src/packs/walnut_blight/`  
**Naming:** crop pack ≠ Freenet plugin — [`Plans/NAMING.md`](../../Plans/NAMING.md) §1

### Checklist

- [ ] `CropPackDef` registered in `shared/farm/cropPacks.ts` (id, label, blurb, **`category`** (`crop` \| `network` \| `generic`), modules, `settingsDocId` / owned keys, `canInstall`)
- [ ] Module ids + `MODULE_LABELS` / `MODULE_BLURBS` (and pack module list if new)
- [ ] `src/packs/<id>/index.ts` UI registration (routes, nav, surfaces)
- [ ] Entry appended to `PACK_UI_REGISTRY` in `src/packs/registry.ts`
- [ ] Production knobs on the pack surface (not Settings → Advanced)
- [ ] Honesty / science copy on the pack page; About = pointer only
- [ ] Firestore rules for pack settings fields
- [ ] Tests: catalog / lifecycle (activate adds modules, deactivate strips, delete cleans settings) + registry
- [ ] Plan slices under `Plans/` (or update existing pack plan)
- [ ] Manual on a test farm: Install → use → Deactivate → Activate → Delete

### Out of scope unless explicitly requested

- [ ] Hot-loading untrusted / marketplace pack code
- [ ] Freenet packaging of the pack
- [ ] Wiping diary or map data on Delete

### Notes

<!-- What pack, what lifecycle behaviour, any migration for existing farms -->

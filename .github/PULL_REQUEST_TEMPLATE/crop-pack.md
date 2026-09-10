## Crop pack PR

Use this template when adding or changing a **crop pack** (not a network pack — for `plugins/freenet_host/` see [`Plans/NETWORK_PACK_PLUGIN.md`](../../Plans/NETWORK_PACK_PLUGIN.md)).

**How-to:** [`Plans/PLUGIN_AUTHORING.md`](../../Plans/PLUGIN_AUTHORING.md)  
**Contract:** [`Plans/CROP_PACK_PLUGIN.md`](../../Plans/CROP_PACK_PLUGIN.md)  
**Template pack:** chill portions (`plugins/chill_portions/` — manifest and code in one folder) — not walnut blight  
**Naming:** crop pack ≠ Freenet plugin — [`Plans/NAMING.md`](../../Plans/NAMING.md) §1

### Checklist

- [ ] `CropPackDef` registered in `shared/farm/cropPacks.ts` (id, label, blurb, **`category`** (`crop` \| `network` \| `generic`), modules, `settingsDocId` / owned keys, `canInstall`)
- [ ] Module ids + `MODULE_LABELS` / `MODULE_BLURBS` (and pack module list if new)
- [ ] `plugins/<id>/src/index.ts` exports `packUi` (routes, nav, surfaces). The registry discovers it — do **not** edit `src/packs/registry.ts`; a diff that touches it needs a reason
- [ ] Pack code lives only under `plugins/<id>/src/`; nothing new added to `src/pages/`, `src/components/`, or `src/lib/`
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

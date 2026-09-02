# PUF-AM local plugin packages

**Adding a pack to the app:** [`Plans/PLUGIN_AUTHORING.md`](../Plans/PLUGIN_AUTHORING.md). A zip here is catalog + optional engine defaults. It does **not** register routes or appear under Settings → Plugins until `cropPacks.ts` lists the id.

**Under review:** [`Plans/PLUGIN_RUNTIME_MIGRATION.md`](../Plans/PLUGIN_RUNTIME_MIGRATION.md) proposes pack code moving here under `plugins/<id>/src/` and loading at runtime. Plan only — point 3 below still describes what ships.

Drop **`{packId}.zip`** files here. Each zip must contain a root **`plugin.json`** (or one top-level folder `{packId}/plugin.json`).

```bash
# Validate a zip or unpacked folder
npm run plugins:verify -- path/to/apple_scab.zip

# Unpack into plugins/<id>/  (overwrites that folder)
npm run plugins:unpack -- path/to/apple_scab.zip
```

## Layout inside the zip

```
plugin.json     # required — see shared/farm/plugin.manifest.v1.schema.json
engine.json     # optional engine defaults (walnut blight, chill portions)
README.md       # optional
LICENSE         # optional
assets/         # optional icons / static files
```

## Rules

1. **`category` is required** — `crop` | `network` | `generic` (use `generic` if unsure).
2. Manifest **`id`** must match the unpacked folder name and the zip basename (`walnut_blight.zip` → `plugins/walnut_blight/`).
3. v1: React UI still ships in the app (`src/packs/<id>/`). **Catalog + engine defaults** live here — copy [`water/`](water/) for a thin ops pack, [`chill_portions/`](chill_portions/) for an engine pack. [`walnut_blight/`](walnut_blight/) is the legacy shared-doc pack. Hot-load of React from a zip is out of scope.
4. Do **not** put Freenet host binaries here — that is `vendor/freenet/` / the Freenet system plugin.

```bash
npm run plugins:verify -- plugins/walnut_blight
npm run plugins:pack -- plugins/walnut_blight
```

Skeleton: [`_skeleton/`](_skeleton/) · Contract: [`Plans/CROP_PACK_PLUGIN.md`](../Plans/CROP_PACK_PLUGIN.md) § Packaging

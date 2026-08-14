# PUF-AM local plugin packages

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
engine.json     # optional engine defaults (walnut blight ships this)
README.md       # optional
LICENSE         # optional
assets/         # optional icons / static files
```

## Rules

1. **`category` is required** — `crop` | `network` | `generic` (use `generic` if unsure).
2. Manifest **`id`** must match the unpacked folder name and the zip basename (`walnut_blight.zip` → `plugins/walnut_blight/`).
3. v1: React UI still ships in the app (`src/packs/<id>/`). **Catalog + blight defaults** live here — see [`walnut_blight/`](walnut_blight/). Hot-load of React from a zip is out of scope.
4. Do **not** put Freenet host binaries here — that is `vendor/freenet/` / the Freenet system plugin.

```bash
npm run plugins:verify -- plugins/walnut_blight
npm run plugins:pack -- plugins/walnut_blight
```

Skeleton: [`_skeleton/`](_skeleton/) · Contract: [`Plans/CROP_PACK_PLUGIN.md`](../Plans/CROP_PACK_PLUGIN.md) § Packaging

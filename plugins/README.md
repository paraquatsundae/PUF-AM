# PUF-AM local plugin packages

**Adding a pack to the app:** [`Plans/PLUGIN_AUTHORING.md`](../Plans/PLUGIN_AUTHORING.md). A zip here is catalog + optional engine defaults. It does **not** register routes or appear under Settings → Plugins until `cropPacks.ts` lists the id.

**Layout change done (2026-09-03):** [`Plans/PLUGIN_PACK_LAYOUT.md`](../Plans/PLUGIN_PACK_LAYOUT.md). Each pack's React code now lives beside its manifest in `plugins/<id>/src/`, and `src/packs/registry.ts` discovers it at build time. Still statically compiled — hot-load stays out of scope.

This means a folder here and a zip here are no longer the same thing. The folder is the pack: manifest, engine defaults, **and** source. The zip is a distribution artifact, and unpacking one only refreshes files on disk — the app picks up any `src/` at the next build, not at runtime.

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
src/            # the pack's React code, if packing an in-tree pack
README.md       # optional
LICENSE         # optional
assets/         # optional icons / static files
```

`plugins:pack` zips the folder whole, so packing an in-tree pack includes `src/`. A third-party zip need not carry one; without `src/` it is catalog and engine defaults only, and the pack has no UI until someone contributes it through a PR.

## Rules

1. **`category` is required** — `crop` | `network` | `generic` (use `generic` if unsure).
2. Manifest **`id`** must match the unpacked folder name and the zip basename (`walnut_blight.zip` → `plugins/walnut_blight/`).
3. React UI lives in `plugins/<id>/src/`, with `index.ts` exporting `packUi` — that export name is what the registry globs for. Copy [`water/`](water/) for a thin ops pack, [`chill_portions/`](chill_portions/) for an engine pack. [`walnut_blight/`](walnut_blight/) is the legacy shared-doc pack; do not copy it. The UI is compiled into the app build, so hot-load of React from a zip stays out of scope.
4. Do **not** put Freenet host binaries here — that is `vendor/freenet/` / the Freenet system plugin.

```bash
npm run plugins:verify -- plugins/walnut_blight
npm run plugins:pack -- plugins/walnut_blight
```

Skeleton: [`_skeleton/`](_skeleton/) · Contract: [`Plans/CROP_PACK_PLUGIN.md`](../Plans/CROP_PACK_PLUGIN.md) § Packaging

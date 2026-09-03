# Example plugin package (skeleton)

This folder is **`plugin.json` only**. It does not wire catalog, modules, routes, or Firestore.

**To add a working pack:** [`Plans/PLUGIN_AUTHORING.md`](../../Plans/PLUGIN_AUTHORING.md) — copy `plugins/chill_portions/`, which holds the manifest and the pack's whole implementation in `src/`.

To check this skeleton as a package:

```bash
npm run plugins:verify -- plugins/_skeleton
```

`category` is required. Use `generic` when nothing more specific fits. Do not use `network` (Freenet).

# vendor/ — third-party build input

Nothing here is source. This directory holds pinned upstream binaries that get bundled into the
PUF-AM desktop installer, and everything except this file is **gitignored** — ~93 MB of Rust
binaries do not belong in the history.

What *is* committed is the pin: [`scripts/freenet-binaries.json`](../scripts/freenet-binaries.json)
carries the release tag, the SHA-256 of every archive, and the SHA-256 of every extracted binary.

## Populate it

```bash
npm run desktop:vendor          # host platform
npm run desktop:vendor:linux    # linux-x64
npm run desktop:vendor:win      # win-x64 (cross-fetch is fine; the files are just staged)
npm run desktop:vendor:verify   # no network — re-check what is already on disk
```

Result:

```
vendor/freenet/linux-x64/
  freenet          pinned Freenet core
  fdev             still required for PUT on 0.2.x
  LICENSE.md       upstream AGPL-3.0 text (ships beside the binaries)
  VENDOR.json      what landed, and when
```

Each download is checked twice — once on the archive, once on the extracted binary — because a
silent version drift would change the `pack-contract` code hash and therefore every mist URI ever
published. A mismatch aborts rather than warns.

Then prove it actually runs, without Electron:

```bash
npm run desktop:smoke:host      # spawns a node on a spare port, asserts managed, stops
npm run desktop:verify:pack     # pack-contract WASM still matches its pinned code hash
```

## CI and offline builds

Set `PUF_FREENET_ASSET_DIR` to a directory holding the release archives (and optionally
`LICENSE.md`) and nothing is fetched from GitHub; the checksum gates still apply. That is the path
for an air-gapped workshop build or a CI job with an artifact cache instead of network egress.

## Why the app can still find these

The host's binary resolution order is: explicit option → `PUF_FREENET_BIN` / `PUF_FDEV_BIN` →
Electron's bundled `resources/freenet/` → **this directory** → `PATH`. So a populated `vendor/`
beats a stray `~/.local/bin/freenet`, and `status().binary.source` reports `'vendor'` in dev or
`'bundled'` once installed. Details: [`units/puf-freenet-host/README.md`](../units/puf-freenet-host/README.md).

## Licensing

`freenet-core` is AGPL-3.0. Its `LICENSE.md` states that distributing the unmodified binary
alongside an application that talks to it over a network protocol does not make that application a
derivative work — which is exactly PUF-AM's relationship to it (loopback WebSocket, no linkage).
The license text is fetched into the vendor dir and ships next to the binaries.

Plan: [`Plans/DESKTOP_FREENET_PLUGIN.md`](../Plans/DESKTOP_FREENET_PLUGIN.md) §7.1, §8.4.

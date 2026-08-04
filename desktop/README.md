# PUF-AM desktop shell (Electron)

**Status:** Phase 3 (~2026-08-04) — the Fedora AppImage builds and launches with Freenet running from
bundled binaries, and has completed a **two-laptop A→B farm join over Freenet 0.2 Opennet with no
terminal on either machine** ([`Plans/MIST_TWO_FEDORA_FREENET.md`](../Plans/MIST_TWO_FEDORA_FREENET.md)
§ AppImage A→B). Windows installers need a Windows host.
**Plan (authoritative):** [`Plans/DESKTOP_FREENET_PLUGIN.md`](../Plans/DESKTOP_FREENET_PLUGIN.md)

## Running it

```bash
npm run desktop:vendor           # once: fetch the pinned freenet + fdev (~93 MB)
npm run desktop:dev              # vite build + bundle main/preload + launch
MIST_FREENET=1 npm run desktop:dev   # ...and start the Freenet host
```

`desktop:vendor` is a one-off per checkout — it populates `vendor/freenet/<os>-<arch>/`, which the
host prefers over anything on `PATH`, so the app exercises the *pinned* binary rather than whatever
the developer happens to have installed. Skip it and Freenet still resolves from `PATH`; status will
say `source: 'path'`, which is the tell. Details: [`vendor/README.md`](../vendor/README.md).

`desktop:dev` rebuilds everything. Once built, `npm run desktop:start` relaunches in seconds —
but rebuild (`npm run build`) if you last ran `build:android`, because the Capacitor build emits
relative asset paths that break on SPA sub-routes.

| Script | Does |
|--------|------|
| `desktop:vendor` | Fetch + checksum the pinned `freenet`/`fdev` for this platform |
| `desktop:vendor:linux` / `:win` | Same, for a named platform (cross-fetch is fine — files are only staged) |
| `desktop:vendor:verify` | Re-check `vendor/` against the pins, no network (`:linux` / `:win` for a named platform) |
| `desktop:verify:pack` | Bundled `pack-contract.wasm` still matches its pinned code hash |
| `desktop:verify:deps` | The packaged `node_modules` allowlist still matches what the bundle requires |
| `desktop:smoke:host` | Start a real node from the resolved binary on a spare port, assert `managed`, stop |
| `desktop:build` | esbuild `main.ts` + `preload.ts` → `desktop/build/*.cjs` |
| `desktop:start` | `electron .` — assumes `dist/` and `desktop/build/` are current |
| `desktop:dev` | `build` + `desktop:build` + `desktop:start` |
| `desktop:dist:*` | Packaged installers — see [Installers](#installers) |
| `lint:desktop` | `tsc -p desktop/tsconfig.json` (this dir is excluded from the root lint) |

`desktop:smoke:host` is the quick "is Freenet actually working" check, and it does **not** need
Electron or a display. It uses a spare port and throwaway dirs on purpose, so a workshop
`freenet network` on `:7509` is neither attached to nor killed — attaching would tell you nothing
about which binary got resolved.

Useful env (dev only — a packaged app never reads `.env`): `MIST_FREENET=1` starts the Freenet
host, `FREENET_WS_PORT` moves off `:7509`, `PUF_FREENET_BIN` pins a binary, `PUF_CLOUD_API_BASE`
overrides the cloud target.

**Operator data lives in `~/.config/PUF-AM/`** (`%APPDATA%\PUF-AM` on Windows) — Freenet config,
data, and logs plus the mist cache. That path comes from `productName` in `package.json`;
changing it strands existing farms.

## Installers

Config: [`electron-builder.yml`](../electron-builder.yml). Output: `release/` (gitignored).

```bash
npm run desktop:dist:linux:appimage   # Fedora: AppImage only — nothing extra to install
npm run desktop:dist:linux            # Fedora: AppImage + rpm (see prerequisites below)
npm run desktop:dist:win              # Windows: NSIS installer + portable — run this on Windows
npm run desktop:dist                  # host platform, whatever that is
```

Every one of those gates packaging on the vendored binaries for the *target* platform, the
pack-contract code hash (with `fdev` mandatory), a fresh web + main bundle, and the `node_modules`
allowlist. Do not call `electron-builder` directly — that is how a stale `vendor/` ships.

### Running the Fedora artifact

```bash
./release/PUF-AM-0.1.0.AppImage                    # Firebase / local-only
MIST_FREENET=1 ./release/PUF-AM-0.1.0.AppImage     # ...and start the bundled Freenet node
```

No install step, no root, no Node on the machine. Mark it executable if git or a browser dropped the
bit (`chmod +x`).

`MIST_FREENET=1` is now only a **workshop override**. The operator path is Settings → *Farm sync
between laptops* → **Start Freenet when PUF-AM opens**, which persists to
`<userData>/desktop-prefs.json` and is read by `main.ts` before any window exists. Turning it on
also starts the node in the current session, so nothing needs a relaunch. When the env var is set,
the checkbox says so and stays locked on for that launch.

If a workshop `freenet network` already holds `:7509`, the packaged app **attaches** to it and
reports `mode: attached` — correct behaviour, but it tells you nothing about the bundled binary. Add
`FREENET_WS_PORT=7609` to make it spawn its own and report `source: bundled`.

The `rpm` target needs two host packages Fedora 44 does not install by default:

```bash
sudo dnf install rpm-build libxcrypt-compat   # rpmbuild, plus the libcrypt.so.1 fpm's Ruby links
sudo dnf install ./release/puf-am-0.1.0.x86_64.rpm
```

### Windows

`npm run desktop:dist:win` on Fedora builds a complete `release/win-unpacked/` — asar, `freenet.exe`,
`fdev.exe`, pack WASM — and then fails at the NSIS step with `spawn wine ENOENT`. Cross-building the
installer is not supported here. On the Windows box:

```powershell
npm ci
npm run desktop:vendor:win     # once: fetch the pinned freenet.exe + fdev.exe
npm run desktop:dist:win       # → release\PUF-AM Setup 0.1.0.exe + PUF-AM 0.1.0.exe (portable)
```

`freenet.exe` has never been launched. Treat the first Windows run as new information, and flip
`win-x64` to `verified` in `scripts/freenet-binaries.json` once it spawns a node.

## Why Electron

Every Node-side piece PUF-AM desktop needs — the Freenet peer (`units/mist-freenet/src/node.ts`),
the Express API (`server/createApiApp.ts`), the mDNS LAN hub, `fdev` spawning — already exists in
TypeScript on Node. Electron makes that the main process for free. Tauri would need a Node
sidecar to reuse any of it, which is the sidecar shape this whole effort exists to remove.
Full comparison: plan §3.

## What the shell does

```
main process (Node)
  ├── FreenetHostPlugin ──spawn──► freenet (child, loopback WS :7509)
  ├── Express createApiApp() → 127.0.0.1:<ephemeral>, also serves dist/
  └── IPC: puf-freenet:status | start | stop
renderer
  └── loads http://127.0.0.1:<ephemeral>  ← same-origin, no CORS
```

The renderer being served from the same loopback origin as `/api/*` is what lets
`getApiBaseUrl()` return `''` with **no client changes**, and is why desktop never needs the
`am.pufworks.farm` → `localhost:3000` sidecar.

### Route split

| Routes | Target | Why |
|--------|--------|-----|
| `/api/mist/freenet/*`, `/api/sync/*`, `/api/presence/*`, `/api/highlights/*` | in-app loopback | Freenet node and LAN hub are on this machine |
| `/api/auth/*`, `/api/weather/*` | `https://am.pufworks.farm` | Need Firebase Admin credentials / `DPIRD_API_KEY` — server-only secrets that must never ship to an operator machine |

`secrets/` and `firebase-applet-config.json` must **not** be bundled.

## Files

| File | Role |
|------|------|
| `main.ts` | App lifecycle, single-instance lock, Freenet host ownership, window, IPC |
| `preload.ts` | `contextBridge` → `window.pufamDesktop` (config, mist preference, freenet status/start/stop) |
| `desktopConfig.ts` | Encode/decode for the main→preload config flag (shared, so the ends cannot drift) |
| `desktopPrefs.ts` | The mist opt-in on disk. Decided before a renderer exists, so it cannot be `localStorage` |
| `localApi.ts` | Loopback Express + static `dist/` on an ephemeral port |
| `tsconfig.json` | Typechecks this dir (`npm run lint:desktop`) |

Renderer-side counterpart: [`src/lib/desktopBridge.ts`](../src/lib/desktopBridge.ts).

Freenet lifecycle lives in [`units/puf-freenet-host/`](../units/puf-freenet-host/README.md); the
mist wire adapter is [`server/freenetHostWire.ts`](../server/freenetHostWire.ts). `desktop/` holds
no Freenet logic of its own — that is what keeps the PUF-FN fork cheap.

## Mist stays opt-in

The Freenet host only starts when mist is enabled — the saved preference, or `MIST_FREENET=1` as a
workshop override. A Firebase-only operator never spawns a Freenet node and sees no Freenet UI.

If a node is already listening on the WS port — a workshop `freenet network`, or another PUF unit
— the host **attaches** to it and will not kill it on quit. Only a node we spawned gets stopped.

## Build notes

`scripts/build-desktop.mjs` drives esbuild. Things that are load-bearing:

- **CJS output on purpose** — no ESM/`__dirname` friction in Electron main.
- `main.ts` imports `.ts` specifiers (repo convention). esbuild resolves them; Electron never sees TypeScript. That is the *only* reason this build step exists.
- **npm packages stay external.** Bundling them would flatten `firebase-admin`'s dynamic requires and grpc's native bindings for no gain. The cost is that the packaged asar has to carry the main process's runtime closure explicitly, which is what `desktop:verify:deps` keeps honest.
- `import.meta` is empty in CJS, and `units/mist-freenet` reads `import.meta.url` at module load. The build shims it from `__filename` so the bundle does not throw, and `main.ts` sets `FREENET_PACK_WASM` explicitly because the shim points at the bundle, not the asset.
- `desktop/build/` is gitignored.
- `better-sqlite3` is gone from the repo (unused, and it would have forced an Electron ABI rebuild). `firebase-admin` is cloud-only and never packaged, which is why `server/firebaseAdmin.ts` loads it on first use instead of importing it — a static import made the packaged main process die at boot.

### Typechecking this directory

`npm run lint:desktop`. `tsconfig.json` here mirrors the **root** compiler options rather than
strict mode, because typechecking follows imports into `server/` and `units/mist-freenet/`, which
are not strict-clean. (`units/puf-freenet-host/` *is* strict — it has no such imports.) It reports
the same pre-existing `server/` and `mist-freenet` errors the root `npm run lint` already shows,
and nothing from `desktop/` itself. `desktop/` stays excluded from the root lint.

## Not yet done

Windows `nsis`/`portable` artifacts and the first `freenet.exe` launch · a Fedora `rpm` (needs the
two host packages above) · loopback bearer token or IPC-only Freenet calls (Phase 4 item 7) · mDNS
LAN-hub advertising (`server.ts` starts it; the shell does not yet) · menus, tray, window state ·
code signing · auto-updater (out of scope by workspace policy).

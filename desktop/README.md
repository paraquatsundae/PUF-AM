# PUF-AM desktop shell (Electron)

**Status:** Phase 1 (~2026-08-03) — this runs. Freenet resolves from `PATH`; bundled binaries
and installers are Phase 2/3.
**Plan (authoritative):** [`Plans/DESKTOP_FREENET_PLUGIN.md`](../Plans/DESKTOP_FREENET_PLUGIN.md)

## Running it

```bash
npm run desktop:dev              # vite build + bundle main/preload + launch
MIST_FREENET=1 npm run desktop:dev   # ...and start the Freenet host
```

`desktop:dev` rebuilds everything. Once built, `npm run desktop:start` relaunches in seconds —
but rebuild (`npm run build`) if you last ran `build:android`, because the Capacitor build emits
relative asset paths that break on SPA sub-routes.

| Script | Does |
|--------|------|
| `desktop:build` | esbuild `main.ts` + `preload.ts` → `desktop/build/*.cjs` |
| `desktop:start` | `electron .` — assumes `dist/` and `desktop/build/` are current |
| `desktop:dev` | `build` + `desktop:build` + `desktop:start` |
| `lint:desktop` | `tsc -p desktop/tsconfig.json` (this dir is excluded from the root lint) |

Useful env (dev only — a packaged app never reads `.env`): `MIST_FREENET=1` starts the Freenet
host, `FREENET_WS_PORT` moves off `:7509`, `PUF_FREENET_BIN` pins a binary, `PUF_CLOUD_API_BASE`
overrides the cloud target.

**Operator data lives in `~/.config/PUF-AM/`** (`%APPDATA%\PUF-AM` on Windows) — Freenet config,
data, and logs plus the mist cache. That path comes from `productName` in `package.json`;
changing it strands existing farms.

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
| `preload.ts` | `contextBridge` → `window.pufamDesktop` (config + freenet status/start/stop) |
| `desktopConfig.ts` | Encode/decode for the main→preload config flag (shared, so the ends cannot drift) |
| `localApi.ts` | Loopback Express + static `dist/` on an ephemeral port |
| `tsconfig.json` | Typechecks this dir (`npm run lint:desktop`) |

Renderer-side counterpart: [`src/lib/desktopBridge.ts`](../src/lib/desktopBridge.ts).

Freenet lifecycle lives in [`units/puf-freenet-host/`](../units/puf-freenet-host/README.md); the
mist wire adapter is [`server/freenetHostWire.ts`](../server/freenetHostWire.ts). `desktop/` holds
no Freenet logic of its own — that is what keeps the PUF-FN fork cheap.

## Mist stays opt-in

The Freenet host only starts when mist is enabled (`MIST_FREENET=1` today; a persisted setting
later). A Firebase-only operator never spawns a Freenet node and sees no Freenet UI.

If a node is already listening on the WS port — a workshop `freenet network`, or another PUF unit
— the host **attaches** to it and will not kill it on quit. Only a node we spawned gets stopped.

## Build notes

`scripts/build-desktop.mjs` drives esbuild. Things that are load-bearing:

- **CJS output on purpose** — no ESM/`__dirname` friction in Electron main.
- `main.ts` imports `.ts` specifiers (repo convention). esbuild resolves them; Electron never sees TypeScript. That is the *only* reason this build step exists.
- **npm packages stay external.** Bundling them would flatten `firebase-admin`'s dynamic requires and grpc's native bindings for no gain.
- `import.meta` is empty in CJS, and `units/mist-freenet` reads `import.meta.url` at module load. The build shims it from `__filename` so the bundle does not throw, and `main.ts` sets `FREENET_PACK_WASM` explicitly because the shim points at the bundle, not the asset.
- `desktop/build/` is gitignored.
- `better-sqlite3` never appears in the bundle (it is unused, so no Electron ABI rebuild) and `firebase-admin` stays external and cloud-only.

### Typechecking this directory

`npm run lint:desktop`. `tsconfig.json` here mirrors the **root** compiler options rather than
strict mode, because typechecking follows imports into `server/` and `units/mist-freenet/`, which
are not strict-clean. (`units/puf-freenet-host/` *is* strict — it has no such imports.) It reports
the same pre-existing `server/` and `mist-freenet` errors the root `npm run lint` already shows,
and nothing from `desktop/` itself. `desktop/` stays excluded from the root lint.

## Not yet done

Bundled `freenet`/`fdev` binaries (Phase 2 — the host falls back to `PATH`) · installers
(Phase 3) · loopback bearer token or IPC-only Freenet calls (Phase 4) · mDNS LAN-hub advertising
(`server.ts` starts it; the shell does not yet) · a desktop-aware Mist workshop card · menus, tray,
window state, icons · code signing · auto-updater (out of scope by workspace policy).

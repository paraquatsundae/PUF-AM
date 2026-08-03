# PUF-AM desktop shell (Electron)

**Status:** Phase 0 stub (~2026-08-03). `electron` is **not installed yet**, so nothing here
runs and this directory is excluded from the root `npm run lint`.
**Plan (authoritative):** [`Plans/DESKTOP_FREENET_PLUGIN.md`](../Plans/DESKTOP_FREENET_PLUGIN.md)

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
| `localApi.ts` | Loopback Express + static `dist/` on an ephemeral port |
| `tsconfig.json` | Typechecks this dir once `electron` is installed |

Freenet lifecycle lives in [`units/puf-freenet-host/`](../units/puf-freenet-host/README.md); the
mist wire adapter is [`server/freenetHostWire.ts`](../server/freenetHostWire.ts). `desktop/` holds
no Freenet logic of its own — that is what keeps the PUF-FN fork cheap.

## Mist stays opt-in

The Freenet host only starts when mist is enabled (`MIST_FREENET=1` today; a persisted setting
in Phase 1). A Firebase-only operator never spawns a Freenet node and sees no Freenet UI.

## Phase 1 — making this run

```bash
npm i -D electron electron-builder esbuild
```

Then add scripts along these lines:

```jsonc
{
  "desktop:build": "esbuild desktop/main.ts --bundle --platform=node --format=cjs --outfile=desktop/build/main.cjs --external:electron && esbuild desktop/preload.ts --bundle --platform=node --format=cjs --outfile=desktop/build/preload.cjs --external:electron",
  "desktop:dev": "npm run build && npm run desktop:build && electron desktop/build/main.cjs",
  "desktop:dist": "npm run build && npm run desktop:build && electron-builder"
}
```

Notes for whoever picks this up:

- **CJS output on purpose.** `desktop/build/*.cjs` avoids ESM/`__dirname` friction in Electron main. Paths are derived from `app.getAppPath()` / `process.resourcesPath`, so neither `import.meta.url` nor `__dirname` is used.
- `main.ts` imports `.ts` specifiers (repo convention) — esbuild resolves them; Electron never sees TypeScript.
- Mark `electron` external; bundle `server/` and `units/` in.
- `desktop/build/` should be gitignored.
- Phase 1 also adds the `window.pufamDesktop` branch to `src/lib/apiBase.ts` (plan §6.2).
- Drop or exclude `better-sqlite3` (unused, and it would force an Electron ABI rebuild) and `firebase-admin` (cloud-only routes).

### Typechecking this directory

`tsconfig.json` here mirrors the **root** compiler options rather than strict mode, because
typechecking follows imports into `server/` and `units/mist-freenet/`, which are not strict-clean.
(`units/puf-freenet-host/` *is* strict — it has no such imports.) Before `electron` is installed,
`npx tsc -p desktop/tsconfig.json` reports `Cannot find module 'electron'` for `main.ts` and
`preload.ts` plus the same pre-existing `server/` and `mist-freenet` errors the root
`npm run lint` already shows. That is expected; `desktop/` is excluded from the root lint.

## Not yet done

Bundled `freenet`/`fdev` binaries (Phase 2 — the host currently falls back to `PATH`) · installers
(Phase 3) · loopback bearer token or IPC-only Freenet calls (Phase 4) · menus, tray, window state,
icons · code signing · auto-updater (out of scope by workspace policy).

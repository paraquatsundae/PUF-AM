# PUF-AM desktop shell (Electron)

**Status:** Phase 4 (~2026-08-04) — the Fedora AppImage builds and launches with Freenet running from
bundled binaries, and has completed a **two-laptop A→B farm join over Freenet 0.2 Opennet with no
terminal on either machine** ([`Plans/MIST_TWO_FEDORA_FREENET.md`](../Plans/MIST_TWO_FEDORA_FREENET.md)
§ AppImage A→B). The loopback API is now behind a per-launch token, and copyable **Windows portable +
zip** artifacts build here; only the NSIS `.exe` still wants a Windows host.
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
npm run desktop:dist:win:portable     # Windows: portable exe + zip — builds fine from Fedora
npm run desktop:dist:win              # Windows: + the NSIS installer — needs a Windows host
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

**From Fedora** — `npm run desktop:dist:win:portable` produces everything a test machine needs:

| `release/` artifact | Size | Use |
|---------------------|------|-----|
| `PUF-AM 0.1.0.exe` | ~103 MB | Portable. Copy the one file to the Windows PC and double-click. No install, no admin |
| `PUF-AM-0.1.0-win.zip` | ~163 MB | Same app, unzipped instead of self-extracting. Run `PUF-AM.exe` inside |
| `win-unpacked/` | ~440 MB | The tree both are built from |

`release/` is gitignored, so these are copied off the build box by hand (USB, share, `scp`).

Only the **NSIS installer** still needs a Windows host, and only because NSIS builds its uninstaller
by *running* a Windows stub executable. Everything else — the asar, `freenet.exe`, `fdev.exe`, the
pack WASM, `makensis` itself, and the no-op signing step — works natively on Linux. Don't bother with
electron-builder's `toolsets.wine: '1.0.1'` bundle: it downloads, but ships no `kernel32.dll` and
cannot boot a prefix. On the Windows box:

```powershell
npm ci
npm run desktop:vendor:win     # once: fetch the pinned freenet.exe + fdev.exe
npm run desktop:dist:win       # → release\PUF-AM Setup 0.1.0.exe (+ portable + zip)
```

### Installing on a Windows test machine

Artifacts are **unsigned** (code signing is out of scope), so SmartScreen shows *"Windows protected
your PC"* on first launch — **More info → Run anyway**.

1. Copy `PUF-AM 0.1.0.exe` across and run it. Operator data lands in `%APPDATA%\PUF-AM\` and persists
   between runs.
2. **Settings → Farm sync between laptops → Start Freenet when PUF-AM opens.** Saved to
   `%APPDATA%\PUF-AM\desktop-prefs.json`; the node starts in the same session. No `MIST_FREENET=1`,
   no terminal.
3. Wait for the readiness line to reach *connected*. A brand-new Opennet peer needs the documented
   5–15 min on run 1.
4. **A→B join:** publish on the machine that holds the farm and copy the join ticket; on the new one
   pick **Join a farm** and enter FarmCode, device PIN, ticket.

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
  │     └── loopback token guard on /api/* (except /api/health)
  ├── Express createApiApp() → 0.0.0.0:<stable>   ← tablet hub, off by default
  │     └── paired-device guard, allowlisted prefixes, no dist/
  ├── session.webRequest → injects the loopback token into renderer /api/* calls
  └── IPC: puf-freenet:status | start | stop · puf-desktop:lan-hub
renderer
  └── loads http://127.0.0.1:<ephemeral>  ← same-origin, no CORS
```

`createApiApp()` is instantiated twice, but the state behind it — the join-ticket shelf, the mDNS
registry, the Freenet peer host — is module-level and therefore shared. That is what lets a ticket
registered by the desktop UI over loopback resolve for a tablet over the LAN.

The renderer being served from the same loopback origin as `/api/*` is what lets
`getApiBaseUrl()` return `''` with **no client changes**, and is why desktop never needs the
`am.pufworks.farm` → `localhost:3000` sidecar.

### The loopback token

An ephemeral port is obscurity, not a boundary — anything running as the operator can find it. So
`main.ts` mints 256 random bits per launch and `localApi.ts` 401s any `/api/*` request without them.

The renderer never sees the token: `session.webRequest.onBeforeSendHeaders` adds
`x-puf-desktop-token` to requests whose URL starts with this launch's API origin, which authorises
every existing `fetch` in `src/` without touching a single call site, and keeps the header off
`am.pufworks.farm`. `/api/health` and the static bundle stay open.

Hitting the API from a terminal therefore needs the token, which is deliberately not printed. Use
`/api/health` for liveness; for anything else, use the app.

### Route split

| Routes | Target | Why |
|--------|--------|-----|
| `/api/mist/freenet/*`, `/api/sync/*`, `/api/presence/*`, `/api/highlights/*` | in-app loopback | Freenet node and LAN hub are on this machine |
| `/api/auth/*`, `/api/weather/*` | `https://am.pufworks.farm` | Need Firebase Admin credentials / `DPIRD_API_KEY` — server-only secrets that must never ship to an operator machine |

`secrets/` and `firebase-applet-config.json` must **not** be bundled.

## Tablet hub — using this app as the shed's LAN hub

A tablet in the shed usually has no signal. This app can be the thing it syncs against, over the
Wi-Fi, with no cloud and no terminal. That means a **second** listener on `0.0.0.0` — the loopback
one above stays exactly as it is, because the token it uses is per-launch and never leaves the
process, and publishing that on the Wi-Fi would have been the same secret with a much larger blast
radius.

Off until the operator turns it on: binding an address other machines can reach is a decision, not
something an install should do to somebody.

### What the operator does

On the **laptop**:

1. **Settings → Offline & sync → Tablet hub**, and turn it on.
2. Read off the two things it shows: the **LAN address** (`http://192.168.1.205:3001`) and the
   **pairing code** (`K7M2-9Q4X`). The code is eight characters from an alphabet with no `O`, `I`,
   `L` or `U`, so it survives being read across a shed or over a phone.

On the **tablet**, in the same screen:

3. Pick the hub if it was found by itself — the laptop advertises over mDNS
   (`_pufom-sync._tcp`), so it normally appears without typing. If the Wi-Fi blocks multicast, type
   the LAN address from step 2 instead.
4. Enter the pairing code once. The tablet swaps it for its own 256-bit device token and stores that;
   from then on the code is not what authorises it, so the code can be rotated without re-pairing.

The laptop's Tablet hub card then lists the tablet by name, with when it was last seen. **Forget**
revokes one tablet without touching the others; **Rotate code** changes what new devices must
present and leaves already-paired ones working.

### What it will and will not serve

| Reachable over the LAN | Why |
|---|---|
| `/api/health`, `/api/hub/info`, `/api/hub/pair` | **No credential** — discovery has to work before pairing can. A guarded health check would leave an unpaired tablet unable to tell a live hub from a wrong address |
| `/api/sync/*`, `/api/presence/*`, `/api/highlights/*`, `/api/mist/freenet/*` | Paired device token in `x-puf-hub-token` (a `Bearer` also works, for a `curl` from the workshop) |
| `/api/auth/*`, `/api/weather/*` | **404, on purpose.** A packaged desktop has no Firebase service account or `DPIRD_API_KEY` to answer them with. `/api/hub/info` names them so the tablet re-points them at the cloud instead of collecting 401s |
| `GET /`, the built UI | **404.** The LAN listener is an API. The tablet has its own bundle, and serving this one would put an unauthenticated copy of the farm UI on the shed Wi-Fi for nothing |

Bounded, not eliminated: LAN traffic is plain HTTP, so anyone already on that Wi-Fi can read a paired
tablet's sync traffic. TLS needs a certificate story a farmer can actually complete, which is its own
piece of work.

### Workshop overrides

Same family as `MIST_FREENET` — for a smoke test, never for an operator:

| Variable | Effect |
|---|---|
| `PUF_LAN_HUB=1` | Forces the hub on for one launch, whatever the saved preference says |
| `PUF_LAN_HUB_PORT=3001` | Preferred port. The listener walks upwards if it is taken, and reports the one it got |
| `PUF_LAN_HUB_CODE=K7M2-9Q4X` | Pins the pairing code for one launch so a script can pair without reading the operator's saved code. **Not persisted** — the saved code is untouched and returns at the next launch |

```bash
PUF_LAN_HUB=1 PUF_LAN_HUB_PORT=3001 PUF_LAN_HUB_CODE=K7M2-9Q4X ./release/PUF-AM-0.1.0.AppImage
```

Then, from another machine on the same Wi-Fi:

```bash
HUB=http://192.168.1.205:3001
curl -sS $HUB/api/health                      # {"status":"ok"} — no credential
curl -sS $HUB/api/hub/info                    # kind, pairingRequired, which prefixes are cloud
TOKEN=$(curl -sS -X POST -H 'Content-Type: application/json' \
  -d '{"code":"K7M2-9Q4X","deviceName":"Shed tablet"}' \
  $HUB/api/hub/pair | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -sS -H "x-puf-hub-token: $TOKEN" $HUB/api/sync/self
```

`avahi-browse -rtp _pufom-sync._tcp` is the check for the advertisement itself; it should show
`ip=`, `kind=desktop-lan` and `pair=1`.

## Files

| File | Role |
|------|------|
| `main.ts` | App lifecycle, single-instance lock, Freenet host ownership, window, IPC |
| `preload.ts` | `contextBridge` → `window.pufamDesktop` (config, mist preference, freenet status/start/stop) |
| `desktopConfig.ts` | Encode/decode for the main→preload config flag (shared, so the ends cannot drift) |
| `desktopPrefs.ts` | The mist opt-in, the tablet-hub toggle, the pairing code and the paired devices, on disk. All decided before a renderer exists, so none of it can be `localStorage` |
| `loopbackAuth.ts` | Per-launch token + the `/api/*` guard middleware. No `electron` or `express` imports, so it tests in plain Node |
| `localApi.ts` | Loopback Express + static `dist/` on an ephemeral port |
| `lanHubAuth.ts` | Pairing codes, per-device tokens, the LAN route allowlist, and the pairing throttle. Same no-`electron`/no-`express` rule as `loopbackAuth.ts` |
| `lanApi.ts` | The LAN Express app on `0.0.0.0` — `/api/hub/*` plus the allowlisted prefixes, and no static bundle |
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

Windows `nsis` installer and the first `freenet.exe` launch (both want a Windows machine) · a Fedora
`rpm` (needs the two host packages above) · **TLS on the LAN listener** — the tablet hub above is
plain HTTP, which is the one thing about it that is not yet where it should be · menus, tray, window
state · code signing · auto-updater (out of scope by workspace policy).

mDNS LAN-hub advertising is **done**, and was the item that had been deferred here: it needed a
listener that a LAN address could actually reach, plus an answer to what authorises a tablet against
it. Both landed with the tablet hub above.

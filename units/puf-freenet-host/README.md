# puf-freenet-host (PUF unit)

**PUF Freenet Host** — runs a Freenet node *inside* a PUF app. This unit owns the node's
lifecycle so the operator never installs, launches, or configures Freenet separately.

**Status:** Phase 0 scaffold (~2026-08-03) — interface frozen, Node implementation landed, not yet wired into a shell.
**Plan:** [`Plans/DESKTOP_FREENET_PLUGIN.md`](../../Plans/DESKTOP_FREENET_PLUGIN.md)
**Fork target:** this package becomes **PUF-FN** ([`Plans/NAMING.md`](../../Plans/NAMING.md) §1). Its public surface is the fork boundary — keep it narrow.

---

## What v1 actually is

Freenet 0.2 ships as a **Rust binary** with a loopback WebSocket API; there is no embeddable
library or WASM peer today. So "plugin" here means **ownership, not linkage**:

- PUF-AM spawns and supervises a bundled `freenet` child process
- config / data / log dirs live under the app's `userData`, not the operator's home
- the WS port binds loopback; nothing but PUF-AM talks to it
- no separate installer, window, tray icon, or service unit

The path to a genuinely embedded peer (drop `fdev`, then Rust/NAPI, then WASM) is behind this
same interface — see the plan §4.3.

## Boundaries

| Rule | Why |
|------|-----|
| **No import of `units/mist-freenet`** | Keeps the PUF-FN fork clean. The ciphertext wire client is *injected* |
| **Ciphertext only** | The host never sees plaintext and holds no farm keys. AEAD sealing stays in `mist-freenet` |
| **Node-only** | Uses `node:child_process` / `node:net` / `node:fs`. Never import from renderer code |
| **Never kills a node it did not start** | `attached` mode exists so PUF units and workshop nodes coexist on one machine |

## API

```ts
import { createFreenetHost } from '../units/puf-freenet-host/src/index.ts';

const host = createFreenetHost({
  configDir: `${userData}/freenet/config`,
  dataDir: `${userData}/freenet/data`,
  logDir: `${userData}/freenet/logs`,
  binarySearchPaths: [`${process.resourcesPath}/freenet`],  // Electron packaged
  wire: mistWireAdapter,                                     // wraps Freenet02WsTransport
});

host.on((event) => { if (event.type === 'state') console.log(event.status.mode); });

const status = await host.start();   // 'managed' | 'attached' | 'failed'
await host.stop();
```

| Member | Behaviour |
|--------|-----------|
| `start()` | Probe → attach if a node already answers, else resolve binary and spawn; waits for the WS port. Rejects on hard failure (binary missing, start timeout) while leaving `status().mode = 'failed'` so the UI can explain it |
| `stop()` | `managed`: SIGTERM → grace → SIGKILL. `attached`: detach only |
| `status()` | Re-probes reachability when running; otherwise a cheap snapshot |
| `putCiphertext` / `getCiphertext` | Delegate to the injected wire; throw `FreenetWireUnavailableError` when absent |
| `on(listener)` | `state` / `log` / `exit` / `update-required`; returns unsubscribe |

### Modes

| Mode | Meaning |
|------|---------|
| `stopped` | Not started, or stopped/detached |
| `starting` | Spawned (or restarting), WS port not open yet |
| `managed` | This host started the node and may stop it |
| `attached` | A node was already listening — used, never killed |
| `failed` | Binary missing, start timeout, repeated crashes, or exit 42 |

### Exit code 42

Freenet exits **42** to request an update; applying it needs a supervisor, which this host
deliberately is not. Bundled binaries are version-pinned alongside the `pack-contract` code
hash in `units/mist-freenet/src/freenet02-pack.ts` — updating in place would silently change
every published URI. The host sets `updateRequired`, emits `update-required`, and stops.

## Binary resolution

First hit wins; the winning `source` is reported in `status().binary` so the workshop knows
what it actually exercised.

| # | `source` | Where |
|---|----------|-------|
| 1 | `option` | explicit `binaryPath` |
| 2 | `env` | `PUF_FREENET_BIN` / `PUF_FDEV_BIN` |
| 3 | `bundled` | `binarySearchPaths` — Electron's `${process.resourcesPath}/freenet` |
| 4 | `vendor` | `<repoRoot>/vendor/freenet/<os>-<arch>/` (dev; gitignored) |
| 5 | `path` | `PATH` — today's `~/.local/bin/freenet` |

`<os>` uses electron-builder's `${os}` naming (`linux` / `win` / `mac`) so `vendor/` matches
the `extraResources` mapping.

## Env contract for mist

`freenetHostEnv(status, extras)` produces exactly what `units/mist-freenet` already reads —
`FREENET_TRANSPORT=ws02`, `FREENET_WS_URL`, `FREENET_WS_PORT`, plus optional `FDEV_BIN`,
`FREENET_PACK_WASM`, `MIST_FREENET_ROOT`. No change to `mist-freenet` is required.

`fdev` is still needed for **PUT** on 0.2.118 (the flatbuffers PUT path hangs); it is spawned
transiently per put by `mist-freenet`, not supervised here.

## Modules

| Module | Role |
|--------|------|
| `src/types.ts` | `FreenetHostPlugin`, status/options/event types, injectable `spawn`/`probe`/`readVersion` |
| `src/freenet-host.ts` | `createFreenetHost` — spawn/attach/stop, restart backoff, exit-42 handling, TCP probe |
| `src/resolve-binary.ts` | Binary discovery + `<os>-<arch>` vendor layout |
| `src/errors.ts` | `FreenetBinaryNotFoundError`, `FreenetHostStartTimeoutError`, `FreenetWireUnavailableError` |
| `src/index.ts` | Public exports |

## Tests

```bash
npm test -- units/puf-freenet-host      # from repo root
cd units/puf-freenet-host && npm run lint
```

Tests inject `spawn` / `probe` / `readVersion`, so **no Freenet node or network is required**.

## References

- [`Plans/DESKTOP_FREENET_PLUGIN.md`](../../Plans/DESKTOP_FREENET_PLUGIN.md) — shell choice, packaging, phases
- [`units/mist-freenet/README.md`](../mist-freenet/README.md) — mist storage, ws02 transport, pack-contract
- [`desktop/README.md`](../../desktop/README.md) — Electron shell that loads this plugin

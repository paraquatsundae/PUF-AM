# Freenet network pack

**Experimental — not production.** Firebase Auth + invite PIN remains the shipping path.

The app's own Freenet client as a **network pack** — enabled per farm like a crop pack, but it needs a *host capability* from the shell (a bundled node on Electron; Android in Phase 3; none on the hosted web). Contract: [`Plans/NETWORK_PACK_PLUGIN.md`](../../Plans/NETWORK_PACK_PLUGIN.md). Plan: [`Plans/FREENET_NETWORK_PACK.md`](../../Plans/FREENET_NETWORK_PACK.md).

| File | Owns |
|------|------|
| `plugin.json` | Catalog row (`kind: network`, label, blurb, category `network`). No modules, no settings doc |
| `src/index.ts` | `packUi` — public routes (start / recover), session gate, sync card, plugin tile, farm-session reconciler |
| `src/freenetHostEnable.ts` | Per-farm enabled flag (`pufam.networkPacks.v1.{farmId}`) — pure, no React |
| `src/freenetHostReconcile.ts` | Start / stop the device's node against the open farm — pure, testable |
| `src/useFreenetHostReconciler.ts` | The one hook: enabled + capability → reconcile |
| `src/FreenetPluginTile.tsx` | Settings → Plugins → Network & storage row: enable toggle or *not available on this device* |
| `src/MistFarmSyncCard.tsx`, `MistJoinTicketGate.tsx`, `MistWorkshopCard.tsx`, `FreenetHowItWorks.tsx`, `FreenetSendNudge.tsx`, `FreenetExplain.tsx`, `MistNewFarm.tsx`, `MistRecoverFarm.tsx` | Moved from `src/` on 2026-09-10 (slice A). File names unchanged |

**Not in this folder:** crypto, FarmCode and the slot contract (`units/mist-freenet`), the node lifecycle (`units/puf-freenet-host`), the mist client / store code under `src/mist/` (moves with slice B, the data path), and the host capability helper (`src/lib/freenetHostCapability.ts`, core — the shell knows what it is).

Everything here is compiled into the app build. Nothing is loaded at runtime.

```bash
npm run plugins:verify -- plugins/freenet_host
```

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
| `src/mistJoinWithTicket.ts` (+ `joinTicketDevicePin.test.ts`) | Join a farm from a short ticket — the one `src/mist/` helper only the two pack surfaces used; moved 2026-09-11 (slice B) |

**Not in this folder:** crypto, FarmCode and the slot contract (`units/mist-freenet`), the node lifecycle (`units/puf-freenet-host`), the host capability helper (`src/lib/freenetHostCapability.ts`, core — the shell knows what it is), and the rest of `src/mist/` — the client (`mistFreenetClient.ts`), the transport seam (`freenetPackTransport.ts` + host / relay implementations), join-ticket resolution and rehydrate. Those stay in core because `useAutoSync` (a core hook) publishes through `publishFarmToFreenet` and resolves tickets on the auto-sync ladder; a pack the core imported would break the `core ↛ plugins/*/src` rule. The pack reaches them by path, as it does the rest of `src/`.

Everything here is compiled into the app build. Nothing is loaded at runtime.

```bash
npm run plugins:verify -- plugins/freenet_host
```

# CodeRabbit slop-hunt findings

**Brief:** [`CODERABBIT_SLOP_HUNT.md`](CODERABBIT_SLOP_HUNT.md)  
**Not a Procedure A gate.** Prefer delete/stop over wrapping slop.

---

## Second-model verdict — 2026-08-30

Checked the take list against current `master` (`c91bd4e` + this note). CodeRabbit’s 207 nits stay dismissed unless listed here.

**Do next (first cleanup), in this order:**

1. **Delete** the seven unimported cards: `EnergyManager`, `LabourManager`, `MachineryManager`, `MarketingManager`, `ProductionManager`, `RDManager`, `BudgetManager`. No importer in `src/`. Do not apply CR’s timezone / `writeBatch` / z-index patches.
2. **Remove** the “Phase 3.3: Live Telemetry Mock” block in `EditInfraSidebar.tsx` (hardcoded 24.5°C / 32% VWC / 45 L/h). Do not label it “sample data”.
3. **Remove** the inert Farm management “Upgrade Plan” and “Export Data” buttons (and the Subscription / Data Governance rows if that is all they do). Export already lives on Diary and `FilesBackupCard`. There is no upgrade product. Do not add a third export path.
4. **Escape** user text in Leaflet HTML: `EventMarkerCluster.tsx` (`sprayType`, `notes`) and `mapPinTooltip.ts` (`name`, label, `status`). Reuse one helper; do not invent a second tooltip stack.
5. **`fieldStore`:** cloud `archiveIssue` / `deleteIssue` never update `localFieldIssues` or Zustand, so the 30s poll merges the row back. Drop the local row after a successful cloud write. Then stop or narrow the poll (client lng filter + full `getDocs` every 30s is the lazy-hot). No new `onSnapshot`.
6. **`useAdminDashboard`:** six collection snapshots on mount plus **one `onSnapshot` per user** on the usage tab. Cap or one-shot `getDoc` on that tab. Do not add more listeners.

**Later (real, not first cut):** `Layout.tsx` / `Admin.tsx` send `user.email` to ui-avatars.com; `weatherCacheRoutes` / `weatherScheduler` merge map fields; unauthenticated chill/DPIRD/cache routes — confirm before locking.

**Still dismiss:** empty-catalog “simplify”; `ai-studio-…` Firestore default; dryer sorted-index; `React.memo` / `strict` / `useOrchardMapPage`; AuthContext “missing role = admin” without a Mist migrate.

---

CLI cannot review an empty tree. Local graft: empty commit `aaa60e34654172a9da041ddefe548328ffd6e551` as parent of `db522df` (`git replace --graft`). Remove after the hunt: `git replace -d db522df727f26bbf8606d2a0d84dccecd9ca6c45`. Whole-tree (804 files) dropped the WebSocket; slices by `--dir`.

---

## `src/components` — 2026-08-30

**69 findings** (1 critical, 30 major, 38 minor). ~6.4 min. 140 files.

CodeRabbit **did not** say “delete unused `*Manager` clones.” It nitted timezone, z-index, `writeBatch`, and NaN on those dead cards (11 findings). Treat those as **dismiss — delete the files instead**.

### Hunt-relevant (verify)

| Verdict | Sev | File | Note |
|---------|-----|------|------|
| **Take** | major | `map/EditInfraSidebar.tsx` | Hardcoded “live” weather/soil/irrigation numbers. AI Studio mock in operator UI. **Remove the block**, do not label “sample data”. |
| **Take** | critical | `map/EventMarkerCluster.tsx` | Diary notes interpolated into Leaflet tooltip HTML. Escape or text-only. |
| **Take later** | major | `Layout.tsx` | Fallback avatar sends `user.email` to ui-avatars.com. |
| **Take later** | major | `map/BlockMetadataModal.tsx` | `parseFloat` → NaN on clear (spacing / height / width). |
| **Take later** | major | `map/FarmBasemapSetup.tsx` | Tile download not aborted on unmount. |
| **Take later** | major | `map/UserLocationLayer.tsx` | Watch can register after unmount. |
| **Take later** | major | `map/CachedTileLayer.tsx` | Network listener / object-URL leak on unmount. |
| **Dismiss** | — | `EnergyManager`, `LabourManager`, `MachineryManager`, `MarketingManager`, `ProductionManager`, `RDManager`, `BudgetManager` | Unimported. Do not polish. |
| **Dismiss** | many | a11y (`div` → `button`), glossary button, date-UTC nits, “Not open yet” | Not slop/lazy-hot. |
| **Dismiss** | major | `MachineryManager` increment / `RDManager` writeBatch | Fixes for dead clones. |

---

## `src/lib` — 2026-08-30

**50 findings** (3 critical, 23 major, 24 minor). 122 files.

CodeRabbit **did not** call out the 30s full-collection poll + client-side lng filter. It did hit a symptom: archive/delete leaves the issue in the local mirror so the poll puts it back.

| Verdict | Sev | File | Note |
|---------|-----|------|------|
| **Take (seed)** | — | `fieldStore.ts` | Lazy: poll all issues every 30s; lng filter in the client. Stop or narrow; do not add a second listener. |
| **Take** | critical | `fieldStore.ts` | Cloud archive/delete does not drop the local row; poll reinserts it. |
| **Take** | critical | `mapPinTooltip.ts` | Pin name/label/status in tooltip HTML — same class as EventMarkerCluster. |
| **Verify** | critical | `cropPackLifecycle.ts` | `writeCropPacks` single `updateDoc` — do not expand farmer PIN grants while fixing. |
| **Verify** | major | `authSessionListen.ts` | Revoked session must always clear. Already a known race-guard file. |
| **Later** | major | `localFarmRepo.ts` | One IDB transaction per mutation — real, not this hunt’s first cut. |
| **Dismiss if health** | minor | date/DST / CSV quotes | Parked nits; CSV quotes already on the later list. |

---

## `src/hooks` — 2026-08-30

**26 findings** (0 critical, 17 major, 9 minor). 36 files.

**Missed the hunt target:** `useAdminDashboard` opens six snapshots plus **one per user** on the usage tab. CodeRabbit only asked to coerce `whitelistEnabled` to boolean.

| Verdict | Sev | File | Note |
|---------|-----|------|------|
| **Take (seed)** | — | `useAdminDashboard.ts` | Lazy-hot: N listeners. One-shot or cap; do not add more snapshots. |
| **Verify** | major | `useCrewPresence.ts` | GPS effect may double-append trail vs the interval publisher. |
| **Dismiss** | major | `useDryerSessionActions.ts` sorted-index | Already remapped; same overstated finding as the first CR pass. |
| **Later** | minor | `useDryerSessionActions.ts` | Hardcoded DPIRD station `MA002`. |

---

## `src/pages` — 2026-08-30

**10 findings** (3 major, 7 minor). 20 files.

| Verdict | Sev | File | Note |
|---------|-----|------|------|
| **Take** | minor | `FarmManagement.tsx` | Inert “Upgrade Plan” / “Export Data” — AI Studio leftover. Wire export or remove. |
| **Take later** | major | `Admin.tsx` | Same ui-avatars + email leak as Layout. |
| **Later** | major | `Dashboard.tsx` | `getBlightAggregate` unhandled reject. |
| **Later** | major | `Harvest.tsx` | Auto-expand effect retriggers. |
| **Dismiss** | minor | Privacy back, Settings a11y | Not slop/lazy-hot. |

---

## `src/services` — 2026-08-30

**5 findings** (4 major, 1 minor).

| Verdict | Sev | File | Note |
|---------|-----|------|------|
| **Later** | major | `nutritionService.ts` | Email/tenant in error logs — same class as Layout avatars. |
| **Later** | major | `mapApi.ts` | `JSON.parse` geojson unguarded on blocks/tracks. |
| **Dismiss** | major | `metricsService.ts` | Nested userBreakdown shape — not slop. |

## `src/contexts` — 2026-08-30

**2 findings**, both AuthContext. **Verify, do not “simplify”:** missing `role` still means Mist admin; clearing `farmCropPacks` on Mist init must not wipe a live Firebase farm.

## `src/packs` — 2026-08-30

**0 findings.** 8 files.

## `server` — 2026-08-30

**27 findings** (1 critical, 14 major, 12 minor).

| Verdict | Sev | File | Note |
|---------|-----|------|------|
| **Take later** | critical | `weatherCacheRoutes.ts` | `ref.set` merges `weatherData` / `forecastData` maps — stale keys survive. Same class as functions scheduler. |
| **Take later** | major | `chillRoutes.ts` / `createApiApp.ts` / `weatherCacheRoutes.ts` | Chill `force`, DPIRD proxy, cache POST look unauthenticated. Confirm before locking. |
| **Taken 2026-08-30** | major | `accessPinAuth.ts` `x-forwarded-for` | Trusted-proxy decision made: `server/clientIp.ts` counts from the right, 1 hop on Cloud Run, 0 elsewhere. |
| **Freenet later** | major | `mistLanShelfRoutes.ts` / `freenetPeerHost.ts` | Out of the in-scope peel. |

## `shared` — 2026-08-30

**9 findings** (4 major, 5 minor).

| Verdict | Sev | File | Note |
|---------|-----|------|------|
| **Dismiss** | major | `cropPackCatalog.ts` empty `[]` → all modules | Health rule: do not “simplify” empty catalog. |
| **Later** | major | `infraTypes.ts` `constructor` key | Parked prototype-pollution nit. |

## `functions` — 2026-08-30

**9 findings**, all major. It also reviewed compiled `functions/lib/*.js` — treat those as duplicates of `functions/src`.

| Verdict | Sev | File | Note |
|---------|-----|------|------|
| **Take later** | major | `weatherScheduler.ts` | Same map-merge as server cache; fetch has no timeout (lazy-hot). |
| **Dismiss** | major | `functions/package.json` Node 20→22 | Deploy decision, not slop. |
| **Keep** | — | `functions/src/db.ts` `ai-studio-…` default | Needed for this project; do not switch to `(default)`. |

---

## Hunt complete (in-scope slices)

**207 findings** across components / lib / hooks / pages / services / contexts / packs / server / shared / functions.

Freenet cards / Desktop / APK / `src/mist` / `units` were not a dedicated slice (components already included the two Freenet cards).

**First cleanup after the second model agrees:** delete the seven dead `*Manager` files; remove `EditInfraSidebar` mock telemetry; inert Farm management buttons; tooltip HTML escape; `fieldStore` poll/reinsert; Admin N listeners (CR missed).

Remove the local graft when done reviewing: `git replace -d db522df727f26bbf8606d2a0d84dccecd9ca6c45`. Do not push replace refs.

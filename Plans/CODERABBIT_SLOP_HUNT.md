# CodeRabbit slop / AI Studio hunt

**Product:** PUF-AM — Ag Manager  
**Status:** Open — judgment pass, not a Procedure A gate  
**Limits / SoC:** [`CODEBASE_HEALTH.md`](CODEBASE_HEALTH.md)  
**Check log:** [`CODEBASE_HEALTH_CHECK.md`](CODEBASE_HEALTH_CHECK.md)

This pass is **not** another size peel. It is a whole-tree hunt for:

1. **AI slop** — comments, names, and structure that read like a prompt dump
2. **Lazy + hot** — the simplest code that burns tablet CPU, radio, or Firestore reads
3. **Poor practice** — clones, dead UI, swallowed errors, unbounded listeners
4. **Google AI Studio trademarks** — this app started there (see README). Generative “insights” were removed; the CRUD-card skeleton was not

A second model will review the same brief after CodeRabbit. Do **not** treat CodeRabbit as merge-blocking. Do **not** add it to the four-command gate.

---

## How to run CodeRabbit on the whole tree

The CLI only reviews a **git diff**. `coderabbit review` / `--uncommitted` only sees the last edit. `--base-commit` on the first commit **misses** files that have not changed since the AI Studio dump (the `*Manager.tsx` clones are in `db522df`).

Review current `HEAD` as “every file added”:

```
coderabbit auth login
coderabbit review --committed --base-commit 4b825dc642cb6eb9a060e54bf8d69288fbee4904 --agent --use-credits -c Plans/CODERABBIT_SLOP_HUNT.md
```

`4b825dc642cb6eb9a060e54bf8d69288fbee4904` is git’s empty tree. If the CLI rejects a non-ancestor, slice instead:

```
coderabbit review --committed --base-commit 4b825dc642cb6eb9a060e54bf8d69288fbee4904 --agent --use-credits --dir src/components -c Plans/CODERABBIT_SLOP_HUNT.md
```

Repeat `--dir` for `src/lib`, `src/hooks`, `src/pages`, `src/services`, `server`, `shared`, `functions`.

[`.coderabbit.yaml`](../.coderabbit.yaml) still path-filters Freenet / Desktop / APK / lockfile for health reviews. This hunt should **include** those trees unless a slice says otherwise. Do not review `node_modules`, `dist`, `release`, or baked `android/app/src/main/assets`.

---

## Dismiss (same as health)

Do not take these even if CodeRabbit offers them:

- Enable `strict` / `strictNullChecks`
- A `React.memo` / why-did-you-render campaign
- `useOrchardMapPage` or growing `orchardMapPaneTypes.ts` into a second page
- Remount `MapContainer`; rebuild GeoJSON on pan/zoom; turf-on-pan
- New `onSnapshot` on OrchardMap / FarmDiary
- “Simplify” empty `enabledModules` to mean no packs
- Silently expand farmer/viewer PIN grants
- A second global store or Map context “for performance”

Prefer **delete or stop the work** over wrapping slop in a hook.

---

## What to flag

### AI Studio trademarks

- Near-identical `*Manager.tsx` cards: lucide icon, `rounded-xl shadow-sm`, `window.confirm`, `uuid` ids, `useEffect` + unbounded `onSnapshot` + `setDoc`/`deleteDoc` in the same file
- Dead cards still in the bundle (imported nowhere)
- `ai-studio-*` Firestore database ids, `ai.studio/apps` / `MY_APP_URL` placeholders, `DISABLE_HMR` comments
- Gemini / “Predictive Insights” / `aiService` leftovers (should already be gone — flag if any remain)
- Operator UI that is mock, simulated, or demo-data when a farm is signed in
- Prompt-voice comments (“comprehensive solution”, “let’s implement”, emoji essays)

### Lazy / resource-hungry

- Full-collection `onSnapshot` / `getDocs` with no `limit` (especially Admin → one listener per user)
- Polling a whole collection to avoid a composite index (client-side filter after a wide query)
- `setInterval` without a stated period **and** teardown
- Putting tile blobs, full weather series, or cloned GeoJSON in React state
- Rebuilding Leaflet layers on pan/zoom (health already forbids this on the map)

### Poor practice

- `as any` / `(window as any)` except known map-lib / auth race guards already dismissed
- `console.log` on cab paths (keep `console.error` at a real boundary)
- Clone files instead of one parameterized list
- Fetch in a component that a hook already owns

---

## Seed inventory (verify; do not treat as the review)

Checked 2026-08-30 before CodeRabbit. Second model: confirm still true, then keep hunting.

| Kind | Where | Why it looks like slop / lazy |
|------|--------|-------------------------------|
| Dead AI Studio CRUD clones | `src/components/EnergyManager.tsx`, `LabourManager.tsx`, `MachineryManager.tsx`, `MarketingManager.tsx`, `ProductionManager.tsx`, `RDManager.tsx`, `BudgetManager.tsx` | In the first commit. **No importer** in `src/`. Same listener + uuid + confirm pattern. `BudgetManager` expects energy/R&D/marketing props from those clones. |
| N+ listeners | `src/hooks/useAdminDashboard.ts` | Six collection/doc snapshots on mount; **usage tab** opens `onSnapshot` per user in `users`. |
| Wide poll + client filter | `src/lib/fieldStore.ts` | Comment admits lng filter is client-side to skip an index. Issues refetch on a 30s interval. |
| Named AI Studio DB | `functions/src/db.ts` | Default `ai-studio-143a17d7-b431-4490-8302-3a5ff176bb96`. Needed for this Firebase project — do not “fix” by switching to `(default)` without a migrate. |
| AI Studio URL guard | `src/lib/appUrl.ts` | Still rejects `MY_APP_URL` and `ai.studio/apps`. Keep until env is clean; not a delete. |
| HMR leftover | `vite.config.ts` | `DISABLE_HMR` comment / env. Harmless; flag only if it still disables HMR in workshop. |
| Live listeners in live cards | `src/components/blight/BlightResearchModifiersPanel.tsx`, `BlightOrchardInoculumPanel.tsx` | Firestore `setDoc` in the component. In-scope for “fetch in the owner hook,” not a dead clone. |

Financials no longer mounts the `*Manager` cards. Deleting the seven files is the likely first cleanup **after** both reviews agree they are unused (including dynamic `import()` and Desktop/APK).

---

## After both reviews

1. Triage: take / dismiss / later. Do not paste the whole CodeRabbit dump into the size appendix.
2. Prepend a short note to [`CODEBASE_HEALTH_CHECK.md`](CODEBASE_HEALTH_CHECK.md).
3. Implement only agreed deletes/stops. Procedure A if the change touches packs, nav, modules, or grants.

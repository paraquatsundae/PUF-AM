# Settings → Sync, and the crew who join a farm

**Status:** §1–§2 shipped (Settings XOR + card split), §3 slices 3a and 3b shipped,
§9 auto-sync slice 1 shipped, §10 farm gateway slice 1 shipped. §4–§5 planned.
§6 deferred.
**Date:** 2026-08-10
**Goal:** A farm is created against exactly one off-device backend, so Settings shows
Wi‑Fi, *that* backend, and files — never both backends — and "who else is on this
farm" gets one honest answer per backend.

This is the freeze doc the sync components point at with `@see`. If a decision here
changes, change it here first.

Related: [`APK_FREENET_PLUGIN.md`](APK_FREENET_PLUGIN.md) ·
[`DESKTOP_FREENET_PLUGIN.md`](DESKTOP_FREENET_PLUGIN.md) ·
[`CREW_PRESENCE.md`](CREW_PRESENCE.md) ·
[`AUTH_INVITE_PIN.md`](AUTH_INVITE_PIN.md) ·
[`MIST_NETWORK_STORAGE.md`](MIST_NETWORK_STORAGE.md) § Mobile peer policy.

---

## §1 One farm, one pipe (XOR)

### The rule

| Pipe | Availability | Why |
|------|--------------|-----|
| **Wi‑Fi / LAN** | **Always** | `.pufom` shelf + hub discovery move a farm device-to-device whichever backend it was created against. Not part of the choice. |
| **Cloud sync (Firebase)** | Only on a cloud farm | Outbox flush, invite PINs, cloud presence. |
| **Freenet** | Only on a Freenet farm | Send a farm, join with a ticket. |
| **Files & backup** | **Always** | `.pufom` export/import, JSON/Excel, offline weather cache. |

The owner picks Cloud **or** Freenet on the login storage chooser, before a PIN is
asked for. Nothing in the app lets one farm hold both. Settings used to render both
sets of controls to everyone, so a Freenet operator was offered **Flush to cloud**
and a cloud operator was offered a Freenet join ticket — dead buttons in both
directions. Settings now renders the one that is real.

### Detection

`src/lib/farmPipes.ts` is the single answer.

```
activeFarmPipe() → 'freenet' | 'cloud'
  = isMistFarmSessionActive() ? 'freenet' : 'cloud'
  where isMistFarmSessionActive() = getFarmStoreBackend() === 'mist' && hasMistDeviceSession()
```

Read from the **live session**, not from a stored preference alone. Both halves are
load-bearing:

- `getFarmStoreBackend()` (`pufam.farmStoreBackend`, written by `Login.tsx` /
  `finishMistFarmSetup.ts`) says which store the app *would* use — including on a
  device that chose Freenet and never finished creating a farm.
- `hasMistDeviceSession()` says a Freenet farm is **actually open here**. On its own
  it is stale history: a device that once held a Freenet farm and later signed into
  Firebase still has the blob.

Together they are the same predicate `AuthContext` already uses to decide whether to
open Firestore listeners, so Settings gating cannot disagree with what the rest of the
app is doing. Deliberately *not* used: `auth.currentUser`. A Freenet device has no
Firebase user, but neither does a signed-out one, and "no cloud user" is a different
question from "this farm has no cloud".

Derived helpers — use these, do not re-derive:

| Helper | Use |
|--------|-----|
| `activeFarmPipe()` | Branch copy (`farmPipe === 'freenet' ? … : …`). |
| `isFreenetFarm()` / `isCloudFarm()` | Guard a single call site. |
| `activeFarmPipes()` | `{ lan: true, cloud, freenet, files: true }` for render lists. |
| `showFreenetFarmTools()` | The XOR rule plus its one bench exception (below). |
| `farmPipeLabel()` | Operator words for this farm's second pipe. |

**Rule:** no component may sniff `farmStoreBackend`, `VITE_MIST_EXPERIMENTAL`, or a
Freenet runtime probe to decide *whether to render a pipe*. Runtime probes
(`freenetRuntime.ts`, `freenetLocalNode.ts`) answer "can this device reach a node
right now" — a readiness question inside an already-rendered Freenet card, not a
visibility question.

### Fallback direction

`activeFarmPipe()` falls back to `cloud` when no Freenet session is open. That is the
safe default: Firebase remains the production backend, a cloud card on a farm
mid-unlock is wrong-but-inert, and hiding cloud from a cloud farm would strand the
outbox. Workshop mode (`VITE_WORKSHOP_MODE`) therefore reports `cloud`; its cloud
buttons fail exactly as they did before the split, which is no regression and not
worth a third pipe.

### The one exception: `showFreenetFarmTools()`

The XOR rule is about operators, and a bench is not an operator. A workshop or
`npm run dev` session signs in as a fake cloud user with no Freenet device session, so
`activeFarmPipe()` reports `cloud` — yet sending and joining a farm over Freenet is
precisely what that session exists to exercise, and the two-laptop pass drives it from
this card. Gating **Send or join a farm over Freenet** on `pipes.freenet` alone would
have taken the card away from the only session that tests it.

So that card alone renders on `isFreenetFarm() || isWorkshopDiagnosticsEnabled()`. It
is the only hole in the rule, it lives in `farmPipes.ts` beside the rule, and it does
**not** widen to the cloud card: a Freenet farm never sees **Flush to cloud**, on a
bench or anywhere else. The crew note stays on `pipes.freenet`, because it describes a
real farm's roster and would be a lie on a bench.

---

## §2 What Settings renders now

Three tabs. The old General tab carried seven cards, five of which were sync.

| Tab | Contents |
|-----|----------|
| **General** | Farm profile · Invite PINs (*admin **and** cloud farm*) **or** the Crew pointer (*Freenet farm*) · Personal unlock PIN · Privacy · Legal |
| **Sync** | The cards below |
| **Economics** | Market & Economics only (renamed from Advanced in BE-03). Blight research knobs → **Blight risk → Sandbox**; orchard inoculum → **Blight risk** ([`BLIGHT_ENGINE_PLUGIN.md`](BLIGHT_ENGINE_PLUGIN.md)) |

Sync, in the order the jobs happen:

| # | Card | Path | Shown when |
|---|------|------|------------|
| 0 | Header — "How this farm moves around" | `pages/Settings.tsx` | Always; copy branches on pipe |
| 0′ | **Keeping devices in step** (auto-sync — §9) | `components/sync/AutoSyncCard.tsx` | Always |
| 1 | **Tablet hub** | `components/TabletHubCard.tsx` | Desktop shell only (bridge exists) |
| 2 | **Wi‑Fi (LAN)** | `components/sync/LanSyncCard.tsx` | Always |
| 2′ | **Farm gateway** (§10) | `components/sync/FarmGatewayCard.tsx` | Devices that are a *client* of a hub — packaged APK |
| 3 | **Cloud sync** | `components/sync/CloudSyncCard.tsx` | `pipes.cloud` |
| 3′ | **Send or join a farm over Freenet** | `components/MistFarmSyncCard.tsx` | `showFreenetFarmTools()` |
| 3″ | Crew note | `components/sync/FarmSyncCards.tsx` | `pipes.freenet` |
| 4 | **Files & backup** (collapsed) | `components/sync/FilesBackupCard.tsx` | Always |
| 5 | **Workshop diagnostics** | `components/MistWorkshopCard.tsx` | `isWorkshopDiagnosticsEnabled()` |

`components/sync/FarmSyncCards.tsx` is the only place that decides 2–4;
`Settings.tsx` decides 0, 1 and 5.

### The split

The old single `OfflineSyncCard.tsx` (730 lines) mixed LAN push/pull, cloud flush
counters and `.pufom` export into one card, which is why it could not be shown or
hidden per pipe. It is gone. The behaviour moved unchanged into:

- `sync/useFarmSync.ts` — all state and actions in one hook: one hub, one busy flag,
  one set of counts, so three cards cannot disagree about whether a hub was found.
- `sync/LanSyncCard.tsx`, `sync/CloudSyncCard.tsx`, `sync/FilesBackupCard.tsx`.
- `sync/SyncNote.tsx` — the status line, zone-tagged so an answer appears in the card
  whose button was pressed.

Two placements were judgement calls, recorded because they will look arbitrary later:

- **The pending counters moved to the Cloud card.** All three (`outbox`, `geometry`,
  `photos`) flush to Firestore/Storage — they are the *cloud* outbox, not a general
  "unsynced" figure. On a Freenet farm they were three zeros implying something stuck.
- **The crew note sits under the Freenet card.** Hiding invite PINs on a Freenet farm
  left "who else is on this farm" unanswered on the one surface that used to answer
  it. `FreenetCrewNote` says what is true until §4: the roster is whoever holds a join
  ticket, and the app keeps no list.

### Workshop diagnostics

`MistWorkshopCard` is every knob, hash and status string for the Freenet/local-store
path. A packaged AppImage or APK is somebody's farm, so it is gated on
`isWorkshopDiagnosticsEnabled()` — `isWorkshopMode() || import.meta.env.DEV`.
Deliberately *not* `isWorkshopMode()` alone, which also swaps in a fake signed-in
user: the two-laptop bench pass runs `npm run dev`, and taking the raw publish/pull
buttons away from it would have broken the workflow that had just started working.

### Operator copy

"Mist" is an internal codename for the local-store path and no longer appears in
operator-facing copy: card titles, the no-host explanation in `freenetRuntime.ts`, the
unlock gate, and the two `Settings → Offline & sync` pointers in `TabletHubCard` (now
`Settings → Sync → Wi‑Fi (LAN)`). Operators see **Freenet**, **Cloud sync**,
**Wi‑Fi (LAN)**, **Files & backup**. The word survives in workshop diagnostics,
identifiers and file names (`mistFarmSession`, `pufom_farm_local`, `hot/current`) —
renaming those is churn with no operator benefit and is explicitly not planned.

---

## §3 Invites and roles

### Two vocabularies, one meaning

The two backends grew separate role vocabularies. Neither is wrong; they need a map,
not a merge.

**Cloud (Firebase) — `shared/auth/farmModules.ts`.** Rich, and already what the owner
sees on the invite-PIN screen: a `FarmRole` write ceiling (`admin` / `farmer` /
`viewer`) crossed with a `FarmModuleId[]` nav grant, packaged as `MODULE_PRESETS`.

**Freenet — `shared/sync/joinTicket.ts`.** `JOIN_ROLES = owner | admin | farmer |
viewer`, carried in `JoinManifestV2.role`, plus a deliberately open
`permissions?: Record<string, boolean | number | string>` bag reserved for exactly
this.

### The map (frozen)

| Preset (owner picks this) | `FarmRole` | Modules | `JoinRole` on a ticket |
|---------------------------|-----------|---------|------------------------|
| **Owner** *(Freenet only)* | `admin` | all | `owner` |
| **Admin** | `admin` | all | `admin` |
| **Full farmer** | `farmer` | `WORK_MODULES` — map, diary, blight, water, nutrition, harvest | `farmer` |
| **Field only** | `farmer` | `FIELD_ONLY_MODULES` — dashboard, map, diary | `farmer` |
| **Crop scout** | `farmer` | `CROP_SCOUT_MODULES` — dashboard, blight, water, nutrition | `farmer` |
| **Records** | `farmer` | `RECORDS_MODULES` — dashboard, harvest, financials | `farmer` |
| **Viewer** | `viewer` | `WORK_MODULES`, read-only | `viewer` |

`owner` sits above the Firebase vocab on purpose — it means *another of your own
devices*, and there is no cloud account to hold it. `farmRoleForMistRole()` folds it
to `admin` for the module system.

Every Freenet grant also gets `settings` on top of the modules above — see the
divergence note in §3b. Four presets collapse to `farmer` on the wire, which is why
the role alone was never enough to say "field only".

### Slice 3a — say it in operator words (shipped)

The share-role `<select>` in `MistFarmSyncCard` rendered the raw enum
(`owner` / `admin` / `farmer` / `viewer`). `JOIN_ROLE_LABELS` / `joinRoleLabel()` in
`shared/sync/joinTicket.ts` give each role the words the owner already reads on the
PIN screen. No wire change. The picker itself moved to presets in 3b; the role labels
still name a ticket that carries no preset.

### Slice 3b — carry the preset on the ticket (shipped)

No v3 wire format: `JoinManifestV2.permissions` already validated and round-tripped
through `parseJoinManifestV2`, the hub shelf and the Freenet slot, so the preset rides
in the bag that was reserved for it.

```json
{ "v": 2, "farmId": "…", "hotUri": "FN02@…", "bonesUri": "FN02@…",
  "role": "farmer", "ticket": "PUF-K7M2-9Q4X", "expires": "…",
  "permissions": { "preset": "field_only", "modules": "dashboard,map,diary" } }
```

`permissions` values may only be `boolean | number | string` (the sanitiser drops the
rest), so the module list travels as a comma-joined string and is re-`sanitizeModules()`d
on arrival. The `role` stays the write ceiling and is still what an old client reads.

`shared/sync/joinGrant.ts` owns both directions:

| Function | Job |
|----------|-----|
| `joinPresetsForFarm()` | The owner's choices — `MODULE_PRESETS` plus `owner`, filtered to what the farm offers (no Crop scout blight without the walnut pack). |
| `buildJoinPermissions()` | Preset → the `permissions` bag. |
| `readJoinGrant()` | Manifest → `{ preset?, role, modules, fromPermissions }`. |
| `modulesForJoinRole()` | The legacy fallback below. |

**Precedence on arrival:** an explicit module list wins, then the preset it names, then
the role's defaults. So a ticket minted before this existed carries only a role and
still resolves to a sensible grant.

**Where the grant is stored.** In `MistSessionMeta`, not the encrypted session blob.
The grant arrives *after* unlock, when no device PIN is in hand to re-seal the blob —
the same reason the join flags already live there. Nothing in it is sensitive: a preset
name and a list of nav entries.

**Two bugs this exposed, both fixed here:**

- `mistSessionToUserData()` read the role from the *sealed blob*, which on a joiner is
  the `farmer` guess FarmCode recovery wrote before it knew anything. The granted role
  lived in the meta and was never applied. It now prefers the grant.
- `AuthContext.applyMistSession()` hardcoded `setIsAdmin(true)`, so a viewer's ticket
  still opened the Admin nav and the model-parameter engine. It now derives from the
  session role.

**One deliberate divergence from the cloud presets:** `settings` is forced into every
Freenet grant (`JOIN_FLOOR_MODULES`). On a cloud farm a member locked out of Settings
still has an admin with a Firestore console; a Freenet farm has neither, and Settings
is where that device's unlock PIN, Wi‑Fi sync and re-join live. It grants nothing
either — the device already holds the FarmSeed, so anyone at its keyboard can re-share
the farm with or without a nav entry (see the honest limit above).

**The floor has to hold on replay, not just on arrival** (found on the Clare Downs
tablet, Aug 9). `readJoinGrant()` applied it; `getMistSessionGrant()`, which rebuilds
the grant from the stored meta on *every* launch, did not. A device that joined before
§3b holds `role: 'farmer'` and no module list, so it re-derived `WORK_MODULES` each
boot — no `settings`, no `farm_setup`, so its System tab held About and nothing else,
and the unlock PIN, Wi‑Fi sync and re-join behind Settings were unreachable with no
admin anywhere who could restore them. `withJoinFloor()` is now exported and applied on
both paths. Cloud presets are unchanged: the divergence above is still deliberate.

### Two-laptop check for 3b

Runs on top of [`MIST_TWO_LAPTOP_SMOKE.md`](MIST_TWO_LAPTOP_SMOKE.md); only the ticket
step differs.

1. **Laptop A** — Settings → Sync → *Send or join a farm over Freenet* → **Send this
   farm**, with **What this ticket grants** set to **Field only**. The blurb under the
   picker should read `Farm Map · Farm Diary`.
2. Read out the `PUF-XXXX-XXXX` ticket. The green panel should title it
   **Join ticket · Field only**, not `farmer`.
3. **Laptop B** — recover the FarmCode, then enter the ticket at the join gate. The
   confirmation should say **Joined as Field only**.
4. **Check the nav on B:** Dashboard, Farm Map, Farm Diary, Settings. **Not** Financials,
   Farm Management, Farm Setup, Harvest, Water, Nutrition, and no Admin entry.
5. **Repeat with Full farmer** — Harvest, Water and Nutrition come back, Financials and
   Farm Management stay away.
6. **Legacy check:** a ticket minted before this change (or any manifest with no
   `permissions`) must still join, landing on the role's defaults.

Covered by unit tests in `tests/joinGrant.test.ts` (wire round-trip, precedence, legacy
fallback, walnut-pack filtering) and `src/mist/mistJoinGrant.test.ts` (grant → session →
nav, and the recovery-guess override).

### The honest limit, stated once

**A role is bookkeeping, not enforcement.** Anyone holding the FarmCode can decrypt
this farm — `joinTicket.ts` says so already and it stays true. Roles decide what the
app puts in front of someone; they are not a crypto boundary, there is no server to
refuse a request, and a modified client ignores them. A cloud farm gets Firestore
rules; a Freenet farm gets the FarmCode and the device PIN. Do not write copy that
implies otherwise.

---

## §4 Personnel — source of truth

There is no crew roster on a Freenet farm today, and Settings says so rather than
showing an empty list (`FreenetCrewNote` in `sync/FarmSyncCards.tsx`).

| Backend | Source of truth today | Where it lives |
|---------|----------------------|----------------|
| Cloud | Firestore farm members + invite PINs | `farms/{farmId}/members`, `InvitePinManager` |
| Freenet | The set of **live join manifests** | `server/joinManifestStore.ts` → `~/.pufom/lan-sync/join-manifests.json` |

### Why the manifest shelf is the right seed

It already holds, per issued ticket: the canonical ticket, `farmId`, role, `expires`,
`registeredAt` and `registeredBy`. It prunes on expiry, is per-user rather than
per-working-directory (so the desktop app and `npm run dev` share one shelf), and is
throttled against lookup brute force. That is a personnel ledger missing only a name
and a redemption record.

Rejected alternatives: a `crew_member` record kind inside `hot/current` (rides the
existing publish, but makes the roster a thing every joiner rewrites and merges by
LWW — a roster is the owner's record, not shared farm data), and a new roster
contract (a second code hash to verify across the 0.2.119 / 0.2.123 gap, for a list of
names).

### Slice 4a — People (**shipped**)

What landed, against the sketch:

1. **Entry extended, manifest untouched.** `JoinManifestEntry` gained `id` (random,
   deliberately not derived from the ticket — a 40-bit ticket makes `sha256(ticket)`
   invertible in about a minute of GPU time), `label?` (owner's note, sanitised to one
   short line), and `redeemedAt?: string[]` (capped at 20 stamps). The preset is *not*
   stored twice: it already rides in `manifest.permissions` (§3b), and `readJoinGrant`
   reads it back tolerating every ticket ever minted. Entries written before 4a get an
   `id` minted on load, so old live tickets stay revokable.
2. **Redemption recorded.** Both resolve paths stamp: the peer-facing lookup (joiner
   on another device asks the owner's hub) and the self-shelf hit inside `resolve`
   (bench case, owner and joiner on one laptop). The People page says *last used*, not
   *joined* — a lookup proves the URIs were handed out, not that the FarmCode worked.
3. **`GET /api/sync/join-tickets?farmId=`** (not `/api/join-tickets` — it lives with
   its siblings under the LAN-scoped `/api/sync/*` guard). Returns
   `JoinTicketLedger` (`shared/sync/joinLedger.ts`): rows with label, role, preset,
   modules, issued, expires, last used, use count, plus `shelf` so the page can say
   *which hub answered*. Ticket bodies are never in the response.
4. **`DELETE /api/sync/join-tickets/:id`** — revoke **by row id**, not by ticket, so
   the People page never holds a bearer capability. `deleteJoinManifestById` walks the
   shelf.
5. **UI: Farm Setup → People** (`src/components/FarmPeopleCard.tsx`, rendered in
   `src/pages/FarmSetup.tsx`) rather than Farm Management — Farm Setup is the page a
   Freenet owner actually has. One card, `activeFarmPipe()` picks the body: cloud
   farms get a pointer to the members table, Freenet farms get the ledger with
   per-row revoke, the hub/shelf named in the footer, and both honest limits printed
   on the card.

Renderer client: `src/lib/joinLedger.ts` (same `mistLocalApiUrl` the register/resolve
calls use). Tests: `tests/api/joinTicketRoutes.test.ts` (ledger listing, redaction,
redemption stamps, farm scoping, revoke by id, pre-preset tickets) and
`tests/joinManifestStore.test.ts`.

### Known limits

- **The shelf lives on the hub that minted the ticket.** Two laptops that both publish
  have two ledgers. Federating them is a Freenet-contract problem
  ([`FREENET_CONTRIBUTE_AND_STORAGE.md`](FREENET_CONTRIBUTE_AND_STORAGE.md)), not a
  People-page problem — the page shows *this hub's* record and says so.
- **Revoking stops issuance, not access.** Deleting a manifest and rotating the slot
  means no *new* device can resolve that ticket. A device that already pulled the farm
  keeps what it has, per §3's honest limit. Copy must say "stop handing it out and
  rotate", never "remove their access".

---

## §5 GPS / crew presence over Freenet

### What exists

[`CREW_PRESENCE.md`](CREW_PRESENCE.md) P1 and P2 shipped:

- **P1 cloud** — `farms/{farmId}/presence/{uid}` docs, `src/lib/crewPresence.ts`,
  `CrewPresenceLayer` on the map, privacy switch `pufom_share_crew_location`.
- **P2 LAN** — `server/lanPresenceStore.ts` (in-memory, 45 s stale prune) +
  `src/lib/lanPresence.ts` polling; `useCrewPresence` unions cloud and LAN by freshest
  `updatedAt` per uid.

A Freenet farm therefore **already has live crew presence on the same Wi‑Fi**, via P2,
with no cloud account and no new code. What it does not have is presence between
devices that cannot see each other. That, and only that, is what Freenet is for here.

### Why this is not live tracking

A Freenet PUT takes seconds to minutes and still goes through `fdev`, a laptop-only
binary ([`APK_FREENET_PLUGIN.md`](APK_FREENET_PLUGIN.md) §2 blocker 4). Presence
upserts every ~8 s. Freenet cannot carry that cadence and is not going to. The
question it answers is *where was that ute last seen*, not *where is it now*.

### Sketch — P3f, presence over Freenet (planned, not scheduled)

| Decision | Call |
|----------|------|
| Transport | Reuse the `hot/current` pattern: one AEAD-sealed `presence/current` blob per farm, LWW per member. Not a per-member contract, not a new host capability. |
| Cadence | **≥ 5 min**, and only after ~100 m of movement; coalesced into a publish that was going to happen rather than triggering one. LAN presence stays ~5 s. |
| Precision | **Coarse** — geohash‑7 (~150 m) via the existing `shared/geo/geohash.ts`. Answers "which paddock", not "which tree". |
| Payload | Latest point only. No bread trail, no speed, no heading — a movement history that cannot be deleted is not a feature we are offering. |
| Freshness | Same 45 s `PRESENCE_STALE_MS` prune, so a Freenet marker mostly reads as stale. Show a "last seen" label, never a live dot. |
| Identity | `uid` is meaningless without a cloud account. Key on the **join-ticket entry id** (§4) — the only farm-scoped identity a Freenet farm has. |
| Privacy | Its own switch, **default off**, separate from `pufom_share_crew_location`. A sealed blob on a public network is a different consent question from a Firestore doc behind rules. |
| Publishing | A tablet cannot do it at all without a paired hub — same `fdev` limit. Its position reaches Freenet only through a laptop, which the copy must say rather than leave the operator to notice. |
| Storage policy | `contribute_storage = false` on mobile stays frozen ([`MIST_NETWORK_STORAGE.md`](MIST_NETWORK_STORAGE.md) § Mobile peer policy). None of this makes a phone a storage peer. |
| Ordering | Blocked on §4. Without a personnel record there is no name to put on the marker. |

**Do not** build a second geolocation stack. `UserLocationLayer` is the only GPS
source; presence backends publish what it already produces.

---

## §6 Deferred — Firebase own-billing

**Superseded by [`FIREBASE_BILLING.md`](FIREBASE_BILLING.md) (2026-08-09).** Read that
first; this section is now the one-paragraph summary and the pointer back to §1.

Letting an owner point PUF-AM at **their own** Firebase project (their keys, their
bill) is **still deferred, and still out of scope for this pass.** Left as-is: `.env` /
`firebase-applet-config.json`, one workshop project, `firestore.rules` deployed by
hand.

Deferred rather than dropped, because Freenet answers the same question for the farms
that were asking it — "I don't want my farm in someone else's cloud" — without an
owner administering a Firebase project. Interaction with §1 is unchanged and is the
reason the billing plan needs no new pipe: own-billing would still be *the cloud
pipe*, not a third one, so the **XOR holds** and billing only ever concerns cloud
farms. `activeFarmPipe()` returns `cloud` either way, and no component learns whose
Firebase project a farm sits in.

What the billing doc adds on top of this note:

| | |
|--|--|
| **Why it is no longer just "revisit if asked"** | The requirement changed from *data residency* to *George must incur zero cost from other people's farms*. That is a billing question, and it has a deadline the moment a second farm signs up. |
| **The posture until own-billing ships** | Cloud is **George's farms only** — enforced at `POST /api/auth/create-farm` (today unauthenticated, rate-limited only) and by a farm allowlist in `firestore.rules`. Everyone else gets Freenet or LAN. |
| **What a cloud farm actually costs** | ~$1/month quiet, ~$35 working, ~$200 in a harvest month with five devices. Dominated by `PRESENCE_UPSERT_MS = 500` and by `photoData` previews riding inside issue documents that `fieldStore` re-polls every 30 s. |
| **What blocks own-billing** | `src/firebase.ts` imports its config at *build* time, and invite PINs mint custom tokens, which needs Admin credentials in the **target** project — so §3's invite-PIN vocabulary is affected, not just the config path. |
| **Rejected honestly** | Quotas + budget alerts + a kill switch on George's project. Google has **no hard spend cap**; a budget is an alarm, and detaching billing takes the app down for everyone. It does not meet the requirement. |

---

## §7 Plugin seam — brief

Freenet reaches the app through three seams. Nothing above may bypass them, and
nothing above changes `FreenetHostPlugin` (`start` / `stop` / `status` /
`putCiphertext` / `getCiphertext` / `on`).

| Seam | Implementation | Answers |
|------|---------------|---------|
| **Desktop bridge** | `src/lib/desktopBridge.ts` ↔ `desktop/preload.ts` / `main.ts` | Node lifecycle (`freenet.start/stop/status/onState`), LAN hub. Absent → `getDesktopBridge()` is `null` and node controls do not render. |
| **Android / NSD plugin** | `android/.../PufomNsdPlugin.java`, `src/lib/nsdPeers.ts` | Hub discovery on a tablet. No Freenet node ships in the APK — a tablet either finds a hub or finds a separate node app on the device. |
| **Runtime probe** | `src/lib/freenetRuntime.ts`, `src/mist/freenetLocalNode.ts` | *Readiness*, never *visibility* (§1). `detectFreenetReadOnly` exists because a node on a tablet can fetch but not publish — PUT still needs laptop-only `fdev`. |

The two rules from [`APK_FREENET_PLUGIN.md`](APK_FREENET_PLUGIN.md) §5 survive:
**ciphertext only** (the host never sees a name or a coordinate) and **one-way
dependency** (`puf-freenet-host` imports nothing from `mist-freenet`). Keeping the
roster in the hub's own shelf (§4) and presence inside an already-sealed blob (§5) is
what lets both hold without a new contract.

**Seam rule:** a card renders from `farmPipes` (does this farm have this pipe), then
disables its own buttons from the runtime probe (can this device do it right now), and
says which of the two it is in the disabled title. A farm never loses a pipe because a
node is down.

---

## §8 Next slice

In order, smallest first, each landable on its own:

1. ~~**§4a — ticket ledger endpoint + People page**~~ — **shipped**, see §4a above.
2. **§5 — coarse position pings**, now unblocked by 4a; the join-ticket entry `id`
   is the farm-scoped identity a marker keys on.

Left open by 3b, deliberately: the preset is applied on the joining device, so the
grant is only as honest as that device. A tampered client can widen its own nav. That
is the §3 limit restated, not a new hole — and there is no server on a Freenet farm to
close it.

Not in this line of work: §6 own-billing · renaming `mist` identifiers · federating
manifest shelves between hubs · crew presence P3 mesh.

Landed since, out of that order because both were in the way of everything else:
**§9 auto-sync** and **§10 the farm gateway**.

---

## §9 Auto-sync — one ladder, Wi‑Fi first

**Status:** shipped 2026-08-09. Slice 1: the ladder, the Wi‑Fi rung for Freenet
farms, the status card, and the desktop hub on by default. Freenet stays a press.

### The problem, stated exactly

An operator does not want a pipe. They want today's diary on the other device.
Settings gave them three cards, each with two buttons, and no answer to "which of
these should I press right now" — which depends on whether a laptop is awake,
whether a Freenet node is up, and which device they are standing at.

Underneath that was a harder fault, found while building this: **a Freenet farm
could not use Wi‑Fi at all.** Every `/api/sync/lan/*` route calls
`verifyFarmMember`, which wants a Firebase ID token and a `users/{uid}` document.
A Freenet farm has no cloud account, so `pushLanBundle` threw *"Sign in to use LAN
sync"* before it reached the network. The pipe §1 calls **always available** was,
on the farms this whole line of work is for, never available. Freenet was left
carrying shed-to-ute traffic it is bad at: a PUT is minutes, through a laptop-only
`fdev`.

### The ladder (frozen)

`src/lib/autoSync.ts` — `planFarmSync(conditions) → SyncPlan`. Pure, so every rung
has a test in `tests/autoSyncLadder.test.ts`. Probing lives in
`components/sync/useAutoSync.ts`; the two never mix.

| # | Condition | Route | Auto? | What moves |
|---|-----------|-------|-------|------------|
| 0 | `!online` | `blocked` | — | Nothing. Work carries on locally. |
| 1 | Peer reachable · Freenet farm · unlocked | **`lan-sealed`** | **yes** | Sealed `.pufom` bundle both ways |
| 2 | Peer reachable · cloud farm · signed in | **`lan-pufom`** | **yes** | `.pufom` bundle both ways (unchanged) |
| 2′ | Peer reachable **at the farm gateway** (`reachable-remote`) | same two routes, `via: 'gateway'` | **yes** | The same shelf on the same hub, from outside the shed (§10) |
| 3 | No peer · Freenet farm · node can publish | `freenet-publish` | no | Hot + bones + a fresh join ticket |
| 4 | No peer · Freenet farm · read-only node | `freenet-pull` | no | Hot + bones down, from saved addresses |
| 5 | Anything else | `blocked` | — | Nothing, and it says which of the two would fix it |

**A peer beats Freenet even when both are up.** Seconds against minutes, and the
Wi‑Fi rung *merges* where the Freenet rung *replaces* (below). A node being
available is never a reason to take the long way.

**A gateway peer is the same rung, not a new one.** Rung 2′ runs the identical
route against the identical hub; it is a separate `SyncPeerState` only because the
operator is owed a different sentence and because the bytes may be leaving the
farm on mobile data. LAN is still tried first — §10.

**Rung 3/4 order is not a preference, it is a capability.** `fdev` is not on
Android and could not be exec'd there if it were (`APK_FREENET_PLUGIN.md` §2), so
a tablet with its own node gets rung 4 and a laptop gets rung 3. Same predicate
the send card already uses — `detectFreenetReadOnly()`.

**A hub found but not paired does not stop the ladder.** It falls through to
Freenet carrying the pairing code as the *detail*, because a tablet with a node of
its own does not have to wait for a code to be read out.

### Why only Wi‑Fi runs unattended

| | Wi‑Fi rungs | Freenet rungs |
|--|--|--|
| Merge | `applyPufomBundle` — LWW per entity, both sides keep their own work | `rehydrateLocalFarmFromHot` — **replaces** each kind wholesale |
| Cost | Seconds; a no-op when the digest matches | Minutes; a PUT through `fdev` |
| Side effects | None | Re-issues the join ticket the owner read out |

Any one of those three would be enough. A background task that can silently
delete a joiner's morning of diary entries is not something to ship because it
would be convenient. So: **automatic means Wi‑Fi; Freenet is one press**, and the
card says so in those words.

### The Wi‑Fi rung for a Freenet farm

New, and the reason the ladder is worth having:

- `server/mistLanShelfRoutes.ts` — `GET/POST /api/sync/mist/:farmId` (+ `/meta`).
  Stores an opaque blob, a plaintext digest and an `updatedAt`. **No per-farm
  authentication**, because there is no server-side secret a Freenet farm could be
  checked against and inventing one would be a second identity system beside the
  FarmCode.
- `src/mist/mistLanShelf.ts` — seals a `.pufom` bundle with
  `HKDF(FarmSeed, "lan-shelf-v1")` → AES-256-GCM before it leaves the device, and
  unseals on arrival into the ordinary `applyPufomBundle` merge.

**The hub only ever holds ciphertext**, which is §7's seam rule applied one hop
earlier: whoever can open the blob already holds the FarmCode, and whoever cannot
gains nothing by holding it. That is what lets the route skip a check the farm
cannot satisfy. On a packaged desktop hub it is also behind the paired-device
token, since `/api/sync/` is already in `LAN_SCOPE_PREFIXES`.

**Its own HKDF label**, not `freenet-hot`: same seed, different job, and a shelf
blob that happened to decrypt as a HotState would be a confusing failure rather
than a clean one.

**Deliberately untouched:** `hot/current`, bones, join tickets, join slots. Send
and join are exactly as they were.

### The hub is on by default now

`desktopPrefs.lanHubEnabled` was **opt-in, default off** — so out of the box a
PUF-AM laptop was invisible on the shed Wi‑Fi, the tablet found no peer, and the
farm went the long way or nowhere. Worse, the operator had no way to tell which
of the two machines they were supposed to have configured.

It is now **opt-out**: absent means on, an explicit `false` is honoured, and the
switch stays in Settings → Tablet hub. Serving is the cheap side — an idle
listener costs a socket; not serving costs the whole Wi‑Fi rung. It is not an open
door: pairing still needs a code read off that screen, and health, hub info and
pairing are the only routes reachable without one.

`mistEnabled` stays opt-in and is not part of this. Spawning a Freenet node is a
process an operator asked for; opening a gated LAN socket is not the same
decision.

### Every device a peer — what that means today

The requirement is mesh-shaped: **any device syncs with any peer on the Wi‑Fi**,
not "tablets orbit an owner laptop". Where that stands:

| Device | Serves a shelf | Uses a peer's shelf |
|--------|----------------|---------------------|
| Desktop (Electron), any farm | **Yes, by default** | Yes — including its own, which is how a tablet's push reaches it |
| Workshop `npm run dev` | Yes, always (and advertises) | Yes |
| Packaged APK | **No — see below** | Yes |

A laptop pushing to "itself" is not a trick: the loopback API and the LAN listener
are the same process and the same shelf, so writing locally is precisely what
publishes the farm to the shed. Two laptops on one network are already a two-node
mesh with no owner.

**The APK gap, honestly.** A Capacitor build hosts no Express and cannot: the
WebView serves bundled assets from `https://localhost`, and there is no Node in
the APK to listen on a port. So a tablet is a client of the mesh, not a member of
it — two tablets and no laptop cannot sync, and that is the shape of the hole.
Not faked, not stubbed. The candidates, unranked and unscheduled:

1. **A Capacitor HTTP-server plugin** — a native listener bound to the LAN,
   proxying to the same shelf logic. Closest to what exists; needs the shelf
   re-implemented in Java/Kotlin or a WebView-side responder.
2. **A second protocol instead of HTTP** — Wi‑Fi Direct / NSD socket, or Bluetooth
   for a blob this size. Sidesteps the server problem, adds a transport.
3. **Meshtastic / Reticulum** (below) — the honest long answer for devices with no
   shared Wi‑Fi at all.

Until one lands, the copy must keep saying *a laptop on this Wi‑Fi* — or, since
§10, *a laptop on this Wi‑Fi or at the farm gateway* — and never *another device*.
The gateway widens **which** hub a tablet can reach, not what a tablet can serve:
two tablets and no farm machine still cannot sync, and that hole is unchanged.

### Meshtastic / Reticulum — the roadmap hook

`MIST_NETWORK_STORAGE.md` already names **Reticulum** as the on-farm mesh plane
(LoRa RNodes, multi-hop, no Wi‑Fi infrastructure). The ladder is built so that
lands as **a rung, not a rewrite**: `SyncPeerState` describes *reachability*, not
HTTP, and `SyncRoute` is a closed union with one handler each. A LoRa peer becomes
a new state and a new route between rungs 2 and 3 — faster than Freenet, slower
than Wi‑Fi, and bandwidth-bound in a way neither is.

Two constraints it will inherit, written down now so they are not rediscovered:
a full `.pufom` bundle is far too big for LoRa (it needs the record-level delta
`MIST_NETWORK_STORAGE.md` sketches, not this blob), and the sealed-blob rule
holds — a mesh peer relays ciphertext or it does not relay.

### Intervals and failure

| Knob | Value | Why |
|------|-------|-----|
| `AUTO_SYNC_INTERVAL_MS` | 3 min | How stale the other device's map may be. The attempt is one `meta` request when nothing changed. |
| `AUTO_SYNC_MIN_GAP_MS` | 45 s | Floor under wake, tab-focus and `online` — all three fire together in the shed and must produce one sync. |
| Push skip | digest match | `stablePufomDigest` ignores `exportedAt` and the AEAD nonce, so an untouched farm uploads nothing. |
| Concurrency | one | A `runningRef` guard, not a queue. |

**Failure UX.** A *manual* failure is written to the status line with the error;
an *automatic* one is not. A tablet quietly failing to find a sleeping laptop
every three minutes is not news, and a card that shows a red line all night trains
operators to ignore it. The last *successful* sync stays on screen either way, so
the honest question — how old is what I am looking at — is always answered.

### What is still manual, on purpose

- **Sending a farm / issuing a join ticket** — `MistFarmSyncCard`, unchanged.
- **Joining with a ticket** — unchanged.
- **Cloud outbox flush** — `CloudSyncCard`, unchanged.
- **Both Freenet rungs** — one press, for the three reasons in the table above.

### Known limits

- **Deletions do not propagate.** Both merges are LWW over entities that exist;
  an entity deleted on one device returns from the other. Pre-existing, not
  introduced here, and it is the reason a tombstone kind is on the list.
- **One shelf per hub.** Two laptops that both serve hold two shelves and converge
  only through a device that talks to both. The same limit as the manifest shelf
  in §4, and the same fix.
- **The digest is content, not causality.** Two devices editing while apart both
  push; LWW picks per entity. There is no vector clock and this slice does not
  pretend otherwise.

---

## §10 Farm gateway — the hub, reachable from anywhere

**Status:** slice 1 shipped 2026-08-10. Design, security posture and phasing live in
[`APK_FREENET_PLUGIN.md`](APK_FREENET_PLUGIN.md) §8d; this section is the Settings
half — what an operator sees and what the copy may claim.

### Why it is a card and not a field

The tablet's job needs a machine that speaks Freenet for it, because it cannot host
a node (`APK_FREENET_PLUGIN.md` §2). The hub already did that job and could only be
found on the shed Wi‑Fi, which is what pushed tablets towards a sideloaded node app.
A gateway is **the same paired hub at a remembered second address** — no new
service, no new credential, nothing on the wire.

That is a different question from the one *Wi‑Fi (LAN)* answers, which is why it is
a separate card. *Which laptop is on this network* changes every time the tablet
moves; *where is the farm's hub* is set up once and never thought about again.
Inside the LAN card it read as one more troubleshooting step.

### The card

| Element | Copy rule |
|---|---|
| Title | **Farm gateway.** Never "remote hub", "WAN" or "tunnel" |
| Status chip | `Not set` · `In use now` · `Saved · VPN` / `Encrypted` / `Wi‑Fi only` |
| One address field | Placeholder is a Tailscale address, because that is the recommended shape |
| Refusal | Stated **before** it happens, and it names both ways out (a VPN address, or `https://`). An operator told only "no" will port-forward plain HTTP and think that is what we meant |
| Pairing prompt | Appears here, not in the Wi‑Fi card, when the unpaired hub is the gateway — one prompt, in the card whose address it is about |
| Data | Says the gateway may use mobile data. Wi‑Fi never does |

**"Works from anywhere" may only be claimed for an address that does.** A saved
RFC1918 address is accepted and the card says plainly that it answers on that
network only. `gatewayReachesAnywhere()` is what the copy branches on, so the claim
cannot drift from the rule.

### What the operator does, once

Read the VPN address and pairing code off the farm machine's *Settings → Tablet
hub*; type the address into *Farm gateway* on the tablet; press **Save**. If that
tablet has already paired with that machine on the shed Wi‑Fi, **it is finished** —
the pairing is reused (`adoptHubCredentialByHubId`), because one laptop reachable
two ways is one pairing. If it has never been on that Wi‑Fi, it asks for the code
once.

### Limits, so the copy stays honest

- **The farm still needs one machine that is awake.** The gateway removes the
  requirement that it be *on this Wi‑Fi*, not the requirement that it exist. Farms
  with no always-on machine are `APK_FREENET_PLUGIN.md` §8d Phase 3, and the
  sideloaded node (§3b) remains the only path needing no other machine at all.
- **Plain HTTP is refused off a private network.** Not warned — refused. The rule
  is re-applied when a saved gateway is *read*, so tightening it later reaches
  tablets already in the field.
- **`hubId` is not authentication.** It stops a token minted for one laptop reaching
  a different PUF-AM by accident; it cannot stop an impostor. Do not write copy
  implying the tablet has verified who answered.
- **This does not make a tablet a peer.** §9's APK gap is untouched.

# Farm messaging (farm feed + directed ping)

**Status:** Active plan — **Phase 0 + Phase 1 farm chat shipped 2026-09-15** (`plugins/farm_feed/`). Phase 2 DMs / pair keys still deferred. Hosted `farm_chat/log` + issue `directedAt*` writes need `npm run deploy:rules` (not done in this pass).  
**Date:** 2026-09-15  
**Product:** PUF-AM  
**Scope:** A **whole-farm feed** plus a **For you** ping when Directed at names this device’s person. **Farm pack** `farm_feed` (not core, not a crop pack, not `freenet_host`). George stages Cloud Run / rules deploy after review. **DM threads / pair-key private chat are deferred** (Phase 2).  
**Experimental Freenet / mist — not production.** Firebase Auth + invite PIN remains the shipping path. Freenet stays behind the workshop bake. Hosted web (`am.pufworks.farm`) cannot run a node.

Index: [`README.md`](README.md). Authoring (chill portions **shape**, not walnut blight): [`PLUGIN_AUTHORING.md`](PLUGIN_AUTHORING.md). Freenet network-pack contract (not this pack): [`NETWORK_PACK_PLUGIN.md`](NETWORK_PACK_PLUGIN.md). Day-run tick: [`DAY_RUN_2026_09_15.md`](DAY_RUN_2026_09_15.md) §5. Operator dated line: [`FREENET_OPERATOR_FLOW.md`](FREENET_OPERATOR_FLOW.md) header + §9.2. People / tickets: [`SETTINGS_SYNC_AND_CREW.md`](SETTINGS_SYNC_AND_CREW.md) §3, §4, §4a, §5, §9 (**do not renumber**). Crypto / HotKey: [`reference/MIST_NETWORK_STORAGE.md`](reference/MIST_NETWORK_STORAGE.md) § Invitation → key derivation → contract keys, § Hot → Archive seal lifecycle, § Mobile peer policy, § Pre-Freenet workshop decisions (**do not renumber those `§` headings**). Billing: [`FIREBASE_BILLING.md`](FIREBASE_BILLING.md) §1. Auth: [`AUTH_INVITE_PIN.md`](AUTH_INVITE_PIN.md). Photos stay parked: [`FREENET_ISSUE_PHOTOS.md`](FREENET_ISSUE_PHOTOS.md).

---

## Decision — 2026-09-15 (locked)

George: **just a whole farm feed** this sprint. Issues **ping the tagged user directly.** We already specify who to tag on the issue, so the directed ping is that field — not a second mention system and **not** a pair-key DM.

| Locked | Meaning |
|--------|---------|
| **Whole farm feed** | One farm-visible stream of issues / highlights / diary that already have Directed at (or Everyone when it is empty). Not a second inbox. Not pair-key private chat. |
| **Directed ping** | When the watch / snapshot delivers that record, **if Directed at matches this device’s person**, show **For you** / a badge / (later) an OS banner. |
| **Farm-visible, not private** | Everyone with farm access can still **read** the issue. Directed at is who to ping, not an envelope. |
| **Empty Directed at = Everyone** | Farm-wide ping / feed item. This is his fallback (“system-wide ping”) and it matches “whole farm feed.” |
| **Reuse the picker** | Same **Directed at** / `directedAtName` / `directedAtUid` (and diary `assignedTo` / `assignedToName`). Do not invent @mentions or a second assignee list. |
| **Pair keys are not required** | See below. Phase 2 (DMs / pair keys) is **deferred**. |
| **Freenet latency** | Still the **20 s** Hot watch, not instant. Both apps + a node (or hub) must be up. |
| **Hosted Phase 0** | Badge / For you on **existing** issues / highlights / diary. |
| **Hosted Phase 1 chat** | One rolling doc `farms/{farmId}/farm_chat/log` (last 80). Single-doc snapshot while Farm feed is open. No `messages` collection. No FCM. |
| **In-app only this sprint** | Phase 0–1. OS banners are Phase 3 (app up). FCM is Q4, still open. |

**Why pair keys are not needed.** Pair keys would seal a blob so only two devices can decrypt it. That is a **private DM**. A directed ping is the opposite: the issue (and Directed at) is already **farm-visible** — Hot on Freenet (HotKey is farm-wide), Firestore on hosted (`mapHighlights` / issues / diary; highlight `audience` is `'all'` today). The receiving device already gets the same record the rest of the crew get. “Ping the tagged user” is a **local UI filter** on that shared record (`directedAtUid` / name match), not a second ciphertext. If Directed at is empty, every device treats it as **Everyone**. His fallback (“if a direct ping needs pair keys, every new issue is a system-wide ping”) is therefore unused for Phase 0–1: the directed case never needed pair keys, and the empty case already *is* the system-wide ping.

---

## Pack — Decision — 2026-09-15

George: **Can we make this (farm feed + For you / Directed at pings) a plugin so we don't bloat the main system?**

**Yes.** Farm feed + For you is a **farm pack** (plugin *kind*, not a `.pufom` export), not core PUF-AM. Messaging is **not a crop** — do not call this a crop pack. It is **not** a Freenet plugin and must **not** live inside `plugins/freenet_host/` (that pack is already `KNOWN_OVERSIZE` — [`CODEBASE_HEALTH.md`](CODEBASE_HEALTH.md)). Core stays thin: pages compose, hooks one job, `lib/` no new React, `AuthContext` never imports pack hooks.

**UI copy:** Settings tile / nav say **Farm feed**. Never “Install farm pack” — Files & backup already uses **farm pack** for a `.pufom` ([`NAMING.md`](NAMING.md) §1).

| Locked | Meaning |
|--------|---------|
| **Kind** | **Farm pack.** `src/packs/registry.ts` discovers every `plugins/<id>/src/index.ts`. Catalogs: crop (`CROP_PACKS`), farm (`FARM_PACKS`, `kind: farm`), Freenet (`SYSTEM_PLUGINS`, manifest `kind: network`). A **network pack** ([`NETWORK_PACK_PLUGIN.md`](NETWORK_PACK_PLUGIN.md) §1) is a *storage or transport plane*: no page, no farm module, **host capability**. Farm feed is the opposite — UI that **reads** records both pipes already sync; hosted web has no node. Do **not** add a fourth Settings category ([`PLUGIN_AUTHORING.md`](PLUGIN_AUTHORING.md) lean follow-ups). `category`: **`generic`** (Settings → Plugins → General). |
| **Id** | **`farm_feed`**. Snake_case; [`NAMING.md`](NAMING.md) §1; manifest pattern `^[a-z][a-z0-9_]*$`. Not a crop name. Not `freenet_*`. Prefer this over `farm_messaging` (that name sounds like DMs; Phase 2 is deferred). No collision with `walnut_blight`, `chill_portions`, `water`, `nutrition`, `harvest`, `drying`, `freenet_host`. Folder when built: `plugins/farm_feed/`. |
| **Shape** | Copy [`plugins/chill_portions/`](../plugins/chill_portions/) — [`PLUGIN_AUTHORING.md`](PLUGIN_AUTHORING.md) § Template pack — `plugin.json` + `src/index.ts` exporting `packUi`. **Not** walnut blight. Adapter + module id + catalog row in `shared/` still hand-added. Discovery is the existing glob; do not list the pack in `src/` by name. |
| **Enablement** | Kind `farm` is **on unless admin writes inactive**. Missing `cropPacks.farm_feed` = on for every member (no admin Install, no farm-doc write, no PIN grant). New hosted farms still mark `farm_feed` active on create. Admin Deactivate / Delete writes an inactive tombstone so uninstall stays off. Never `ALWAYS_ON_MODULES` — crew grant is `FARM_KIND_MEMBER_MODULES`. Do **not** `migrateLegacy` existing crops. |
| **Pipes** | Same pack on **hosted and Freenet**. No FarmSeed. No FarmCode on the wire. Phase 1 hosted store is **one** `farm_chat/log` doc (not a collection of messages). |
| **Staging** | Phase 0 is in tree. George still stages Cloud Run / rules. Do not dump pages in `src/pages/`. |

### Core vs pack

| Stays in **core** (do not move) | Pack **owns** |
|---------------------------------|--------------|
| Directed at on issues / highlights / diary (`directedAtName`, `directedAtUid`; diary `assignedTo` / `assignedToName`) | Farm feed screen (`/farm-feed`) |
| Highlight compose **Directed at** picker | **For you** filter |
| Inspect **For {name}** line (core may keep the words; pack emphasises **For you** when it matches this session) | Badge chrome (unread / local last-seen watermark) |
| Existing Hot / Firestore / LAN sync of those records | Later OS banners (Phase 3) — pack chrome, not a core notification service |
| Auth, People, tickets, roles; map / diary / issues pages | Settings → Plugins tile / Deactivate |

The pack **reads** Directed at (empty = Everyone) and **renders** feed / For you / badge. It does **not** invent a second mention system. Phase 0 `settingsDocId` is **`null`** — last-seen is local (`pufam.farmFeed.lastSeen.v1.{farmId}`), not a settings doc and not a new collection.

### Why not a crop pack, a network pack, or `freenet_host`

- Messaging is not a crop. Settings must not list this under Crop tools.
- Freenet is the **network pack** ([`NAMING.md`](NAMING.md) §1). Farm feed is not a transport plane and must work when there is no node.
- `plugins/freenet_host/` is already oversized. Do not grow it with feed UI.

---

## Problem / operator story

Two paddock jobs, one farm (this sprint):

1. **Paddock / issue ping** — Sam paints “check this” or files an issue and directs it at Dave. Dave should **know he was pinged** (For you / badge), not only see a teal pulse if he happens to have the map open. The rest of the crew can still read it.
2. **Shed / farm feed** — “sprayer is down, use the ute” or any issue with Directed at empty (**Everyone**). Same stream, not a selected name.

**Deferred (Phase 2):** crew DM — two people talking without the shed seeing the thread. That would need pair keys (or an honest “crew can read this” thread). Not this sprint.

Today job 1 is half-built: compose already has **Directed at** (Everyone / a person / a typed name); the inspect card already says **For {name}**; a note or name writes a diary `work` plan (`assignedTo` / `assignedToName`). There is **no** farm-feed home, **no** For you filter, **no** badge, **no** OS notification, and Freenet delivery is a **20 s** Hot watch, not a push ([`FREENET_OPERATOR_FLOW.md`](FREENET_OPERATOR_FLOW.md) §9.2 Decision — 2026-09-12; [`SETTINGS_SYNC_AND_CREW.md`](SETTINGS_SYNC_AND_CREW.md) §9 Decision — 2026-09-12).

---

## What is already true (do not invent a second mention system)

| Piece | Where | Meaning |
|-------|--------|---------|
| **Directed at** picker | `HighlightComposeSheet` — Everyone / ledger+presence names / Other | Writes `directedAtName` + optional `directedAtUid` |
| **For {name}** | `HighlightInspectSheet` | The on-map “you were sent this” line (copy today is **For**, not “Sent to”) |
| Diary work plan | `highlightDiary.ts` — one save with the highlight | `assignedTo` ← `directedAtUid`, `assignedToName` ← `directedAtName`; Dashboard already lists the name |
| Highlight `audience` | `mapHighlights.ts` | Visibility. Compose always writes `'all'` today — directed-at is **who it is for**, not a private envelope |
| Cloud path | `farms/{farmId}/mapHighlights/{id}` ([`NAMING.md`](NAMING.md) §8) + diary `events` + existing issues | Existing `onSnapshot` / outbox. **Phase 0 reuses these.** |
| Freenet path | Hot snapshot + HotKey watch slot | PUT on save; other terminals poll every **20 s**. Crew decrypt with HotKey. **Not instant.** |
| Assignees | `useHighlightAssignees` / `highlightAssignees.ts` | Session, presence, **this hub’s** join-ticket ledger. Typed name always allowed. Cloud Firestore members are **not** loaded here today (Farm Management is the member table) |
| Photos | inherit `directedAt*` only when the diary/highlight already has an assignee | [`NAMING.md`](NAMING.md) §8. Freenet photo transfer **parked** |

A field issue that should ping someone **uses this same directed-at**. Copy `directedAtName` / `directedAtUid` onto the issue if the record does not already carry them. Not a new mention type.

---

## Surfaces (when built)

| Surface | Job | Phase |
|---------|-----|--------|
| **For you** on Dashboard / existing issues list | Rows where this session is the directed-at / assignee. Badge = unread count (local last-seen watermark). Tap → map inspect or `/diary?event=` | **0** (in-app only) |
| Farm-wide rows in the same list | Empty Directed at = **Everyone** — same feed, not a private channel | **0** |
| Existing inspect / diary | Keep **For {name}** / **Assigned:** — emphasise **For you** when it matches this session | **0** |
| **Farm feed** (one screen) | First-class all-farm stream with a **For you** filter. Not a second inbox. Field nav **Farm feed**, not Messages | **0** (shipped with Phase 0 — George asked for the pack page) |
| **Farm chat** (composer + log) | Whole-farm text log on the Farm feed screen. Not a DM. Not per-user Directed at | **1** (shipped 2026-09-15) |
| **Thread** (DM) / pair keys | Two people; ciphertext the rest of the farm cannot read | **2 — deferred** |
| OS banner | Android / Electron while the app is up (not focused). **Not** SMS. **Not** email ([`ROADMAP.md`](ROADMAP.md) “Coming Soon”) | **3 — later** |

**Farm pack `farm_feed`** (see Pack above) — not a crop pack, not core pages. Phase 0 shipped the **Farm feed** screen (pack route `/farm-feed`, Field nav — not a Messages item) plus a Dashboard card badge. Phase 1 added the whole-farm chat composer + log on that screen. Do not dump a page in `src/pages/` ([`CODEBASE_HEALTH.md`](CODEBASE_HEALTH.md): do not grow `AuthContext` with pack hooks). Not a DM inbox.

---

## Identity — what “a user” is

[`SETTINGS_SYNC_AND_CREW.md`](SETTINGS_SYNC_AND_CREW.md) §3 (roles), §4 / §4a (People). [`AUTH_INVITE_PIN.md`](AUTH_INVITE_PIN.md) (cloud UID). [`FREENET_OPERATOR_FLOW.md`](FREENET_OPERATOR_FLOW.md) holes **3** (People per hub) and **4** (revoke ≠ kick).

| Pipe | A person is | People list | `directedAtUid` today |
|------|-------------|-------------|------------------------|
| **Hosted / BYO Firebase** | Firebase Auth UID. Same **name + invite PIN** → same UID ([`AUTH_INVITE_PIN.md`](AUTH_INVITE_PIN.md)) | Farm Management members + invite PINs. Farm Setup → People points there | Auth `uid` when the picker had one |
| **Freenet-native** | Display name + device session. **No** Firebase UID | Farm Setup → People = **this hub’s** live join tickets (`GET /api/sync/join-tickets`). Ticket bodies never leave the shelf | Ticket-row `id`, session id, or `name:…` if they only typed a name |
| **Hybrid mirror joiner** | Not a Firebase member. Read-only sealed copy | No cloud People row | Not a hosted feed peer. To compose / be tagged on the cloud farm they join with an **invite PIN** |

**Roles** (`owner` / `admin` / `farmer` / `viewer` + module presets, §3): who may **compose** a ping (today: admin/farmer on the highlight sheet). Viewers still **receive** (For you / Everyone). On Freenet, roles are **UI bookkeeping** — anyone with HotKey reads Hot ([`SETTINGS_SYNC_AND_CREW.md`](SETTINGS_SYNC_AND_CREW.md) §3 honest limit; [`reference/MIST_NETWORK_STORAGE.md`](reference/MIST_NETWORK_STORAGE.md) § Invitation → key derivation → contract keys: `HotKey = HKDF(FarmSeed, "freenet-hot")`).

**FarmSeed stays paper-only on owner devices.** Crew type a `PUF-` InviteToken; unwrap is Hot/Bones, never FarmSeed ([`FREENET_OPERATOR_FLOW.md`](FREENET_OPERATOR_FLOW.md) Decision — 2026-09-12). Feed items must not carry FarmCode, FarmSeed, or a FarmCode-shaped string.

**Hole 3:** directing at a name that only exists on the other laptop’s ticket shelf can miss. Phase 0 fail-soft: typed name still pings by **name match** on the receiving device. Do not pretend there is a central Freenet roster until a bones ledger exists (hole 3 still open).

**Hole 4:** revoke / Remove access does not un-send a ping already pulled. Cloud **Remove access** signs the member out ([`AUTH_INVITE_PIN.md`](AUTH_INVITE_PIN.md)); Freenet revoke stops new ticket resolves only.

---

## Transport options

### Hosted (Firebase) — shipping path

| Option | How | Cost ([`FIREBASE_BILLING.md`](FIREBASE_BILLING.md) §1) | Verdict |
|--------|-----|------------------------------------------------------|---------|
| **A — Derive feed / For you from records we already sync** | Badge + For you + Everyone from `mapHighlights` + diary `assignedTo` + existing issues (`directedAt*` if present or copied). No new collection | **No new reads** if we reuse listeners/polls already running | **Phase 0. Do this first.** |
| **B — Capped `farms/{farmId}/farm_chat/log`** | Text-only, last **80**, ≤400 chars, no photos. **One** rolling document. `onSnapshot` of that doc while Farm feed is open; transactional read+write on Send | 1 read on attach + 1 read per listener per Send + 1 write per Send. Not a growing collection | **Phase 1 shipped.** Same cap on BYO. Rules deploy still required for Clare Downs |
| **C — Cloud Functions fan-out / FCM** | Function writes per-uid inbox docs or pushes FCM | Invocations + writes + (FCM) a new Google surface on George’s project | **No** on `pufworks-am`. Repeat of the cost-tracker anti-pattern (§1.1). FCM remains Q4 |
| **D — SMS / email** | Carrier or SMTP | Not in the product; email is already “Coming Soon” | **No** |

Do **not** poll a messages collection every 30 s the way `fieldStore` polls issues. Do **not** put message bodies on the farm doc (egress on every farm listener). BYO farms: their project, their bill — still cap last-N if a store is ever approved.

### Freenet (experimental)

| Option | How | Latency | Privacy | Verdict |
|--------|-----|---------|---------|---------|
| **Hot + existing 20 s watch** | Feed items and directed-at ride Hot like highlights / diary / issues already do | **20 s poll**, plus Opennet minutes on first peer. 0.2.135 host plugin has **no subscribe** ([`SETTINGS_SYNC_AND_CREW.md`](SETTINGS_SYNC_AND_CREW.md) §9) | **Crew-readable.** HotKey is farm-wide. That is correct for a farm feed | **Phase 0–1 on Freenet.** Say “within about 20 s while both apps are open and the node is up” |
| **Dedicated watch slot for chat** | Second slot, still HotKey, still poll | Same 20 s unless Freenet grows subscribe | Same crew-readable | Not worth it until Hot is too large ([`reference/MIST_NETWORK_STORAGE.md`](reference/MIST_NETWORK_STORAGE.md) § Hot → Archive seal lifecycle — chatter must not bloat the 90-day Hot window) |
| **Per-pair sealed blobs** | New HKDF labels, not FarmSeed on the wire | Still not instant without subscribe | Real DM privacy among crew | **Phase 2 — deferred.** Not required to ping the tagged user |
| **LAN hub only** | Same-Wi‑Fi Express | Near-instant on shed Wi‑Fi | Hub sees ciphertext only if we seal; today LAN highlights are farm-local | Fine as a **fast path** when both devices are on the hub; not a second mention system |

Web cannot publish or fetch Freenet feed items. Tablet without a node still goes through a paired hub ([`FREENET_OPERATOR_FLOW.md`](FREENET_OPERATOR_FLOW.md) §9.6). Both apps + a node (or hub) must be up — same honest residual as highlights.

### Hybrid (cloud farm + Freenet mirror)

Firestore stays the **authority** ([`FREENET_OPERATOR_FLOW.md`](FREENET_OPERATOR_FLOW.md) §4a). The mirror is a sealed read copy of the farm export, not a second inbox. Do not dual-write a chat store onto Freenet on every ping (zero-read Send rule still applies to the mirror envelope). A mirror-only joiner does not compose on the cloud farm until they redeem an invite PIN.

---

## Recommendation (transport + UI)

1. **Phase 0 on every pipe:** no new store. **For you** + farm-wide **Everyone** rows are a **local derivation** of issues / highlights / diary we already sync, rendered by pack **`farm_feed`**. Hosted reuses listeners already on the wire. Freenet reuses Hot + the **20 s** watch — **not instant**; copy must say so. Home: **Dashboard / existing issues list** via pack surfaces, not a Messages nav, not `src/pages/`.
2. **Phase 1 (shipped):** Farm feed screen **in the pack** plus a **whole-farm chat** composer and log. Hosted: capped `farm_chat/log`. Freenet: HotKey on `hot/current` + 20 s watch. Still no pair keys.
3. **Phase 2 — deferred:** DM threads / pair keys. Do not start. Do not tell the operator a Hot note is a private DM.
4. **Phase 3 — later:** OS banners while the app is up. FCM only if George answers Q4.
5. **Hybrid / web:** hosted members see the same Firestore records (Phase 0) or an approved feed store later. Hosted web has **no** Freenet node.

---

## Notifications

| Channel | Honest status | When |
|---------|---------------|------|
| **In-app badge + For you** | Works whenever the farm session is open and the pipe has delivered the record | Phase 0 |
| **Android OS banner** | No Capacitor Local Notifications in tree today. Foreground / briefly-backgrounded is doable. **Killed APK + no node = no Freenet ping.** Do not promise a paddock banner while the phone is in a pocket overnight | Phase 3 (app up) |
| **Electron OS banner** | Window Notification API when unfocused; node must still be up for Freenet | Phase 3 (app up) |
| **FCM / Play push** | Needs Google project config; lands on whoever pays for that Firebase | **Q4 open.** Not on `pufworks-am` without an explicit George yes |
| **SMS** | Out of product | No |

---

## Privacy

- **No FarmSeed, FarmCode, or InviteToken** in feed text, indexes, or OS notification text.
- **Broadcast + directed-at on Hot / Firestore:** every device that can read the farm can read them. Directed-at is a **ping target**, not encryption. Highlight `audience` is still `'all'` today — do not silently flip it to a private list and call that a DM.
- **Phase 2 DMs (deferred):** if they ever ship, hosted rules would be farm members only; Freenet would need pair keys before UI may say “only they can read this.” Until then, do not ship a Thread UI.
- Presence GPS stays its own switch ([`SETTINGS_SYNC_AND_CREW.md`](SETTINGS_SYNC_AND_CREW.md) §5) — the feed does not turn presence on.

---

## Staging (approve in this order)

George said **build Phase 0** on 2026-09-15. The pack is **`plugins/farm_feed/`**, not pages in `src/pages/`.

| Phase | What George is approving | Pipes |
|-------|--------------------------|-------|
| **0 — For you + farm feed (in-app)** | **Shipped 2026-09-15.** `plugins/farm_feed/` (chill portions shape; `kind: farm`, `category: generic`). Derive For you / Everyone from **existing** issues / highlights / diary directed-at (empty = Everyone). Dashboard card badge + Farm feed screen in the pack. **For you** on highlight inspect. Same Directed at picker (stays in core; also on issue compose). No new mention fields. No new Firestore collection. No Messages nav. No OS push | Hosted: existing issue/diary loads + local highlight IDB. Freenet: 20 s watch, copy honest |
| **1 — Farm chat log** | **Shipped 2026-09-15.** Composer + scrolling log on Farm feed. Whole-farm only. Hosted: `farms/{farmId}/farm_chat/log` last 80. Freenet: same lines in Hot (HotKey). Hybrid: Firestore only | Freenet still 20 s Hot watch. Hosted nearer-real-time via the single-doc snapshot |
| **2 — DM threads / pair keys** | **Deferred.** Do not start | — |
| **3 — OS notifications** | Android / Electron local banners for Phase 0–1 events **while the shell is alive**. Never SMS. FCM only if George opens Q4 | Freenet: node must be up |

Do not start Phase 2. Do not start Phase 3 before Phase 0 is field-usable on Clare Downs / a hosted bench farm.

---

## Out of scope

- **DM threads / pair-key private chat** this sprint (Phase 2 deferred)
- Freenet issue / diary **photos** ([`FREENET_ISSUE_PHOTOS.md`](FREENET_ISSUE_PHOTOS.md) stays planned; do not start parts PUTs in a messaging sprint)
- Chill portions (done 2026-09-15; not this product)
- App Check (deferred 2026-09-07)
- Email notifications (roadmap leftover)
- SMS, WhatsApp, Telegram, or a public internet identity
- Freenet splitfiles, raising `FREENET02_MAX_BLOB_BYTES`, or `freenet.service`
- Printing or storing FarmSeed; wrapping FarmSeed in a `PUF-` ticket
- Kick-that-works (hole 4); shared bones People ledger (hole 3) — cite them, do not fake them
- Remounting the map on inbound ping (`refreshFarmUiAfterRecovery` / `isLoaded: false`)
- Renumbering [`SETTINGS_SYNC_AND_CREW.md`](SETTINGS_SYNC_AND_CREW.md) or any `Plans/reference/*` `§`
- Adding a growing `messages` collection or an unbounded chat `onSnapshot`
- Calling this a **crop pack**, stuffing it into `plugins/freenet_host/`, or starting Phase 0 as pages in `src/pages/`

---

## Open questions for George

1. **~~May `pufworks-am` store a feed / chat collection at all?~~ Answered 2026-09-15.** Yes — **one** rolling `farms/{farmId}/farm_chat/log` (last 80). Not a growing `messages` collection. Freenet-native stays on Hot. BYO uses the same cap on the owner’s project.
2. **~~Freenet DM crew-readable vs wait for pair keys?~~ Answered 2026-09-15.** This sprint is the **farm feed + Directed at**, not DMs. Directed ping is farm-visible by design; pair keys are not required. Empty Directed at = Everyone. Phase 2 (DMs / pair keys) deferred.
3. **~~For you home: Dashboard vs Messages nav?~~ Answered 2026-09-15.** Phase 0: **For you on Dashboard / the existing issues list** via pack **`farm_feed` surfaces**, not a Messages nav, not `src/pages/`. Phase 1: if the stream needs a home, one screen **in the pack** — **Farm feed** (all-farm stream + For you filter) — not a second inbox.
4. **Phase 3:** local banners only, or is FCM on the table later (whose Firebase)? **Still open.**
5. **Cloud Directed at picker:** load Farm Management members into the existing assignee hook (same ping, better names), or leave Phase 0 on presence + typed name?

---

## What not to do

- **Do not** grow Phase 0 as pages in `src/pages/` or add pack hooks to `AuthContext`. Code lives in `plugins/farm_feed/`.
- **Do not** call this a crop pack, or put feed UI in `plugins/freenet_host/`.
- **Do not** add a second @mention / “Sent to” system beside `directedAt*` / `assignedTo*`.
- **Do not** treat directed-at as a private DM or invent pair keys for Phase 0–1.
- **Do not** add a Messages nav in Phase 0.
- **Do not** put unbounded `onSnapshot` chat or Cloud Function fan-out on George’s bill.
- **Do not** call the 20 s watch instant.
- **Do not** put FarmSeed on a message, slot, or notification.
- **Do not** enable App Check, start Freenet photos, or deploy from this plan.
- **Do not** renumber cited `§` headings.

---

## Decision log

**2026-09-15 (first write).** Park Freenet issue photos. Next product plan is in-farm messaging that reuses directed-at. Phase 0 in-app For you / badge. Freenet 20 s watch. Hosted chat storage not approved until billing Q1.

**2026-09-15 (this lock).** Whole farm feed only. Issues ping the tagged user via existing Directed at (For you when it matches this person). Empty = Everyone. Pair keys **not** required (record is already farm-visible). DMs / pair keys = Phase 2 deferred. Phase 0 = in-app For you + feed from existing records. Phase 3 = OS banners while app up. Q2 and Q3 answered; Q1 and Q4 still open.

**2026-09-15 (pack).** Yes — farm feed + For you is plugin kind **farm**, id **`farm_feed`**, not core, not a crop pack, not `freenet_host`. Settings copy is **Farm feed** (not “farm pack” — that is the `.pufom`). Core keeps Directed at fields; the pack reads them and owns feed / For you / badge / later OS banners. Default **on** for new farms (no Phase 0 billing hit). Both pipes; no FarmSeed; no new collection in Phase 0.

**2026-09-15 (Phase 0 shipped).** `plugins/farm_feed/` + `kind: farm` catalog. Feed derives from issues / highlights / diary already on device. Dashboard card + `/farm-feed` (not Messages). Zero new Firestore paths. Hosted issue Directed at fields are in `firestore.rules` — George still deploys rules. Freenet photos, FCM, DMs, chat-photo upload not in.

**2026-09-15 (Phase 1 farm chat).** Whole-farm composer + scrolling log on Farm feed. Hosted: `farms/{farmId}/farm_chat/log` last 80, single-doc snapshot while the page is open. Freenet: same lines in `hot/current` (HotKey; watch hash+URI together). No DMs, no chat photos, no FCM. George still deploys rules for Clare Downs.

**2026-09-15 (crew default-on).** Existing farms (Clare Downs crew) stayed off because Phase 0 only wrote `cropPacks.farm_feed` on **new** farm create, and Settings → Plugins → Install is admin-only. Crew cannot write the farm-doc map. Kind `farm` is now offered unless the admin tombstones it inactive. Every member gets `farm_feed` via `FARM_KIND_MEMBER_MODULES` when the catalog still offers it — old PINs do not need a grant edit. Not `ALWAYS_ON_MODULES`. Not `migrateLegacy`.

**2026-09-15 (farm chat watch recheck).** First Freenet chat hop worked (tablet on another Wi‑Fi, both On Opennet); later lines stayed local. Same class as Bones: watchers that only look at `bonesHash` / `photoIndexHash` miss a chat-only Hot update if the Hot URI is reused, and a failed second PUT had no pending retry. Watch now treats a new `farmChatHash` **or** Hot URI as a ping; a new chat hash is never advertised with a stale Hot URI; the 20 s tick retries a pending chat PUT. Local pack still must not wipe the last Hot URI pair. Linux Freenet-native session stays mist (adopt leftover seed — no hybrid Firestore skip).

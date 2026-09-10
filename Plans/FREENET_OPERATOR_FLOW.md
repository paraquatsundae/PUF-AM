# Freenet operator flow (today)

**Experimental — not production.** Firebase Auth + invite PIN remains the shipping cloud path.

Exact operator path as the code stands. Cloud XOR Freenet is locked at login — *until [`FREENET_NETWORK_PACK.md`](FREENET_NETWORK_PACK.md) decision 7 (hybrid: a cloud farm may enable the Freenet pack) lands in its Phase 1.* This file is the Freenet side only: create, recover, send, join, People ledger.

**Known holes:** §8 below (merged from `archive/FREENET_HOLES.md`, 2026-09-10)  
**What is on Freenet, sealed, or never on Freenet:** §9 below (merged from `archive/FREENET_CONTRIBUTE_AND_STORAGE.md`, 2026-09-10)  
**In-app copy:** [`src/components/FreenetHowItWorks.tsx`](../src/components/FreenetHowItWorks.tsx) (login + Settings → Sync + Farm setup → People + join gate)

The rest of the Freenet instruction set (do not duplicate here):

| Doc | What it owns |
|-----|----------------|
| [`reference/MIST_NETWORK_STORAGE.md`](reference/MIST_NETWORK_STORAGE.md) | Crypto, FarmCode, Hot/Archive, pre-Freenet decisions |
| [`reference/DESKTOP_FREENET_PLUGIN.md`](reference/DESKTOP_FREENET_PLUGIN.md) | Electron shell, bundled node, installer phases |
| [`reference/APK_FREENET_PLUGIN.md`](reference/APK_FREENET_PLUGIN.md) | Why the tablet cannot host; hub / farm-gateway |
| [`FREENET_NETWORK_PACK.md`](FREENET_NETWORK_PACK.md) | Umbrella plan (2026-09-10): per-farm network pack on desktop + Android, native PUT everywhere, hybrid for cloud farms, two-terminal goal. Decisions 1–8 |
| [`APK_FREENET_HOST.md`](APK_FREENET_HOST.md) | Network pack inside the APK (E-08) — the answer to hole 5; Phase 3 of the umbrella |
| [`LOCAL_DATA_STORAGE.md`](LOCAL_DATA_STORAGE.md) | Every local store, including the Freenet-related subset |
| [`SETTINGS_SYNC_AND_CREW.md`](SETTINGS_SYNC_AND_CREW.md) | Sync tab layout, People card, crew |
| [`reference/MIST_TWO_FEDORA_FREENET.md`](reference/MIST_TWO_FEDORA_FREENET.md) | Two-laptop AppImage join that actually passed |
| [`DEVELOPER_NOTES.md`](../DEVELOPER_NOTES.md) § Mist | Phase 11a–11l log |

---

## Facts that do not change

| | |
|--|--|
| One farm, one pipe | Cloud XOR Freenet, chosen at login |
| Cost | $0 — no Google account, no enrollment code, no subscription |
| Join ticket | `PUF-XXXX-XXXX` — not a Firebase invite PIN |
| Who can Send | A PUF-AM **laptop** only |

**Two secrets, not one.** The FarmCode is the farm’s identity (paper, shown once). The short join ticket is a time-limited handoff the owner mints after **Send this farm**. A cloud invite PIN opens neither.

---

## 1. Login ladder

Welcome → How this works → Start or Join.

| Screen | Route / state | Operator sees |
|--------|---------------|---------------|
| Welcome | `/login` · choose | **Freenet network · Free** — your devices, your paper FarmCode. No account and no bill. |
| How this works | `/login` · `freenet-explain` | Farm lives on this device. Sealed copies over Freenet / Wi‑Fi. Start / Join. |
| Then fork | | Start → `/login/mist-new-farm`. Join → `/login/mist-recover`. |

Desktop with mist off greys the buttons. Workshop hub (`npm run dev`) shows Freenet. **Production web is meant to hide Freenet, and does not yet** — `scripts/deploy-cloudrun.mjs` bakes `VITE_MIST_EXPERIMENTAL=true`, so the chooser shows the option and Cloud Run answers `/api/mist/freenet/*` with 404 (routes never registered on the `cloud` surface). Target after [`FREENET_NETWORK_PACK.md`](FREENET_NETWORK_PACK.md) Phase 1 (decision 5): the option keys off a host capability and is hidden on web.

---

## 2. Start a new farm (owner)

`finishMistFarmSetup(role: owner)` → `/farm-setup`. Desktop may flip `desktop-prefs.json` so Freenet auto-starts next launch.

| Step | Screen | Operator does | App writes |
|------|--------|---------------|------------|
| A | New mist farm | Farm name + your name (min 2). Continue. | Mints FarmCode (`mist-fc-2`). Nothing published yet. |
| B | Write this down — shown once | Copy to paper. Tick “I have written this FarmCode down…”. | FarmCode is not stored after this screen. |
| C | Optional device PIN | Skip (workshop default) or set 4 digits. Enter farm setup. | `localStorage` session + mist IndexedDB. Backend = mist. |
| D | `/farm-setup` | Owner wizard (geometry, assets). | App data in `pufom_farm_local`. Still not on Freenet. |
| E | Settings → Sync → Send | **Required before anyone else can join.** | Hot + bones URIs + join ticket on hub shelf / Freenet slot. |

Nothing is on Freenet until Settings → Sync → **Send**.

---

## 3. Add a person (owner Send)

Settings → Sync → **Send this farm**. Default once this device has already published. Each send mints a new short ticket.

On the owner laptop:

1. Connect Freenet if the node is down.
2. Who is this for? — local label only (`Dave — spray ute`). Not sent.
3. What this ticket grants — preset dropdown.
4. Device PIN if this tab sealed the farm.
5. Send this farm to Freenet → `PUF-XXXX-XXXX` (default 7-day expiry).

Keep this computer on and on the same Wi‑Fi while they join — the ticket is looked up here first.

Read out to the joiner:

| | What |
|--|------|
| Required | Paper FarmCode (from create, already in their pocket) |
| Required | Short ticket `PUF-XXXX-XXXX` |
| If lookup fails | Owner LAN address from the Send card |
| Advanced | Raw `FN02` JSON — works off Wi‑Fi, whole blob |

Farm setup → People lists tickets minted on **this hub only**. Revoke stops new handouts, not a device that already pulled.

---

## 4. Join a farm (second device)

| Step | Screen | Joiner does |
|------|--------|-------------|
| 1 | Freenet explain | Join a farm I already have. |
| 2 | `/login/mist-recover` | Type FarmCode + your name. Validate. Optional device PIN. Continue to join ticket. |
| 3 | Enter join ticket (full-screen gate) | Type `PUF-XXXX-XXXX`. Same Wi‑Fi as owner preferred. Join this farm. |
| 4 | App | Nav follows the ticket grant. Confirmation: joined as {preset} — N diary, M blocks. |

**Look around first.** The gate can be deferred. The farm stays empty; Settings → Sync stays in Join mode. Offline maps can still download. This is how a tablet can exist before the owner reads out a ticket.

### Ticket lookup vs farm bytes

| Where the ticket is found | Where the farm travels |
|---------------------------|------------------------|
| 1. LAN — `GET /api/sync/join-ticket/:ticket` on the owner hub | Always Freenet Opennet — Hot + bones URIs from the manifest |
| 2. Freenet slot — if the laptop is away | Ciphertext only. Other nodes cannot read it |
| Expired manifests are refused (default 7 days) | LAN `.pufom` sync is a separate same-Wi‑Fi shelf, both pipes |

---

## 5. What a ticket grants

Wire roles: `owner` \| `admin` \| `farmer` \| `viewer`. Presets ride in manifest `permissions`. Every Freenet grant also gets settings (re-join / Wi‑Fi).

**Roles are UI bookkeeping** — anyone with the FarmCode can decrypt the farm. FarmCode is the crypto boundary.

| Preset (Send dropdown) | Wire role | Modules |
|------------------------|-----------|---------|
| Owner (another of your own devices) | owner | All |
| Admin | admin | All |
| Full farmer | farmer | Work modules |
| Field only | farmer | dashboard, map, diary |
| Crop scout | farmer | dashboard, blight, water, nutrition |
| Records | farmer | dashboard, harvest, financials |
| Viewer | viewer | Work modules, read-only |

---

## 6. Desktop vs tablet

| | PUF-AM Desktop | Tablet APK |
|--|----------------|------------|
| Hold a Freenet farm | Yes | Yes |
| Start / recover with FarmCode | Yes (mist on) | Yes if mist baked |
| Host Freenet node | Yes — bundled | No node in the APK |
| Send / publish | Yes | No — needs a paired laptop hub |
| Join / fetch | Yes | Yes via hub or farm gateway |
| People ledger | This hub’s shelf | Paired hub only — empty if tickets live elsewhere |
| Two devices, no laptop | Two desktops can Send/Join | Two tablets cannot sync |

---

## 7. What Freenet does not do

| Cloud has | Freenet today |
|-----------|---------------|
| Firebase invite PINs + Auth | Join tickets only |
| Flush to cloud / Firestore outbox | Hidden — dead if shown |
| Cloud crew presence | LAN presence on same Wi‑Fi only. Cross-network GPS not shipped |
| Firestore rules as enforcement | No server. FarmCode is the crypto boundary |
| Central member roster | Hub-local ticket list |
| Revoke = kick a device | Revoke stops new resolves. Joiner keeps their copy |

---

## 8. Known holes — how we address them

Merged from `archive/FREENET_HOLES.md` on 2026-09-10 (plan written 2026-08-14). These seven holes are in the code or the plans, not guesses. Do **not** pretend a copy tweak is a crypto change. Roles stay UI bookkeeping; FarmCode stays the decrypt boundary. Roadmap tracker: [`ROADMAP.md`](ROADMAP.md) E-07.

| # | Hole | Class | When | Status |
|---|------|-------|------|--------|
| 6 | Send card “device PIN for that FarmCode” | Copy | **Now** | **Done** 2026-08-14 — optional PIN, owner Send PIN kept separate |
| 7 | Privacy / Crew leftovers still say Invite PIN | Copy | **Now** | **Done** 2026-08-14 — `activeFarmPipe()` branches |
| 2 | FarmCode + ticket is a two-piece handoff | Copy + UX | **Now** | **Done** 2026-08-14 — Send checklist + join-gate second-piece copy |
| 1 | Send is after farm-setup, not at create | UX | **Soon** | **Done** 2026-08-14 — FarmCode/PIN screens + dismissible Farm setup nudge (`src/components/FreenetSendNudge.tsx`). No auto-publish |
| 3 | People list is per hub | Product | **Soon** | **Copy done** 2026-08-14 — empty-state names the hub first. Shared bones ledger still later |
| 4 | Revoke is not kick | Crypto / product | **Later** | Open — do not fake |
| 5 | Two tablets, no laptop | Product / APK | **Later** | Open — tracked as E-08 [`APK_FREENET_HOST.md`](APK_FREENET_HOST.md), now Phase 3 of [`FREENET_NETWORK_PACK.md`](FREENET_NETWORK_PACK.md). Needs native PUT + isolated host |

**Decisions — 2026-09-10** ([`FREENET_NETWORK_PACK.md`](FREENET_NETWORK_PACK.md) §2; recorded here because they change how holes 4 and 5 are read):

1. Native bincode PUT from the app's own WS client on every shell; `fdev` leaves the desktop bundle.
2. `FreenetHostPlugin` (`units/puf-freenet-host`) is the data path, not just the supervisor; Express `/api/mist/freenet/*` stays only as the LAN relay for paired tablets without a node.
3. Android runs the node in an isolated `:freenet` process inside the PUF-AM APK — this supersedes `reference/APK_FREENET_PLUGIN.md` §3a's rejection. Hole 5's "Do: keep pointing at a laptop hub" holds until Phase 3 lands; "Do not ship a half-node" still holds — the node is whole or absent.
4. One node version for all shells, pinned to the latest release at the start of Phase 2 and re-verified for native PUT then. Last verified 0.2.125.
5. Production web hides Freenet (see § Login above).
6. The pack is enabled **per farm**, like a crop pack; the node is per device and starts when any open farm has it enabled.
7. **Hybrid:** a cloud-hosted farm may enable the pack. Firestore stays authoritative; Freenet holds a sealed mirror and the join/recovery plane. **Hole 4 applies to the mirror unchanged:** the FarmCode, not the Firestore role, decides who can read it, and revoking a ticket does not take the mirror back from a device that already pulled. The enable screen says so.
8. Vocabulary stays "network pack"; `kind: 'system'`, id `freenet_host`.

**Rules that survive the done items** (each was the fix for a hole and must not regress):

- Hole 6 — the Send card lists three things: paper FarmCode (always), this join ticket (always, latest one), device PIN **only if the joiner set one**. Owner-side PIN (this tab sealed the farm) stays a separate field.
- Hole 7 — Invite PINs are a Firebase mechanism. Copy on a Freenet farm branches on `activeFarmPipe()`: FarmCode + join ticket (and personal unlock PIN as a local lock). Cloud copy unchanged.
- Hole 2 — do **not** invent a ticket-only join, embed the FarmCode in the ticket, or print the FarmCode again after the write-it-down screen. That would break the “shown once” rule.
- Hole 1 — do **not** auto-publish on create. Send is deliberate — it puts ciphertext on Freenet and mints a ticket. The nudge is dismissible.
- Hole 3 — do **not** imply a central roster. The real fix is a farm-bones join ledger that travels with Hot/bones (sealed, versioned, with conflict rules for two hubs minting at once). Spec it before coding.

### Hole 4 — Revoke is not kick (open)

**Today:** Revoke stops the next resolve of that ticket. A device that already pulled holds a FarmSeed copy. Taking the farm back means a **new FarmCode** (and republish).

**Do not:** add a “kick” that only hides a row, or a remote wipe we cannot enforce.

**If we ever kick for real:** a sealed farm epoch (or a new FarmCode) that old seeds cannot open, plus a re-hand to devices that should stay. That is a crypto/product project, not a Settings toggle. Until then the UI keeps saying “revoke stops new joins; a device that already pulled keeps its copy.”

### Hole 5 — Two tablets, no laptop (open)

**Today:** Only a desktop hosts Freenet and can Send. Two tablets with no laptop cannot hand a farm to each other ([`reference/APK_FREENET_PLUGIN.md`](reference/APK_FREENET_PLUGIN.md)).

**Do:** keep pointing at a laptop hub. How this works already says this. **Do not:** fake a tablet Send, or ship a half-node in the APK. **When:** [`FREENET_NETWORK_PACK.md`](FREENET_NETWORK_PACK.md) Phase 3, detailed in [`APK_FREENET_HOST.md`](APK_FREENET_HOST.md) — not this workstream. Decided 2026-09-10 (decision 3 above): the answer is a whole node in an isolated process, after desktop has moved to native PUT (Phase 2).

---

## 9. What is on Freenet, what is sealed, what is not

Merged from `archive/FREENET_CONTRIBUTE_AND_STORAGE.md` on 2026-09-10 (description of what is built as of ~2026-08-05; field-validated on two Fedora laptops over Opennet ~2026-08-04). Sequence diagrams and the local-state inventory were dropped here — the code is the diagram, and [`LOCAL_DATA_STORAGE.md`](LOCAL_DATA_STORAGE.md) §1, §5, §6 own the store list.

### 9.1 Contribute versus communicate

Two different opt-ins, routinely mistaken for one another. **PUF-AM communicates today; it does not meaningfully contribute.**

| | **Communicate** | **Contribute** |
|--|-----------------|----------------|
| What it is | Publishing *this farm's* sealed records and fetching them back on another device | Hosting and replicating other peers' encrypted contracts for network durability |
| Flag | none — it is what the mist path does | `contribute_storage` |
| Default | on, when the operator opts into mist | **`false` everywhere in this repo** |
| Where set | — | `FreenetPeer` / `MistStore` constructor option, persisted per store |
| Effect in code | `put` / `get` through the transport | Insert priority and redundancy only |

What `contribute = true` actually does today: `FcpFreenetTransport.putBlob` raises insert effort (`MaxRetries` 3 → 10, `PriorityClass` 6 → 2, `ExtraInsertsSingleBlock` 0 → 2); `DiskMistStore` / `IndexedDbMistStore` persist the flag and bound it with `maxBytes` (default 512 MiB). **Foreign replication is not implemented** — `disk-mist-store.ts` says so in its header. So the flag means *“try harder to make my own inserts stick”*, not *“host other farms' data”*. Every call site passes `contribute: false`. Real durability comes from the Freenet node itself.

Who should contribute once it means something — frozen in [`reference/MIST_NETWORK_STORAGE.md`](reference/MIST_NETWORK_STORAGE.md) § Mobile peer policy: phone / tablet **`false`** (and `allow_mobile_contribute` must be set by an admin first — moot while tablets have no node); desktop / shed pin / always-on hub **`true`** recommended.

### 9.2 What PUF-AM publishes

Three payload kinds reach Freenet. All three are **AEAD-sealed before insert** (§9.3), and all three are KiB-class single-block CHK — no splitfiles (frozen, MIST § Pre-Freenet workshop decisions #2).

| Payload | MistStore key | Contents | Published when |
|---------|---------------|----------|----------------|
| **Hot** | `mist/v1/farm/{farmId}/hot/current` | Rolling window of diary events, field issues, archived issues — farm-export-shaped, mirrored from `pufom_farm_local` by [`src/mist/mistHotBridge.ts`](../src/mist/mistHotBridge.ts) | Operator presses **Send this farm**; auto-mirrored locally on each save while a mist session is unlocked |
| **Bones** | `mist/v1/farm/{farmId}/bones/{assetId}` | Farm structure: block boundaries, pins, tracks, saved viewport — [`src/mist/bonesGeometry.ts`](../src/mist/bonesGeometry.ts) | Same publish action |
| **Join manifest** | not a mist key — a LAN shelf entry, or the Freenet join slot | `{ v: 2, farmId, hotUri, bonesUri, role, permissions?, expires?, ticket }` — resolves a short `PUF-XXXX-XXXX` ticket to the two FN02 URIs | When a short join ticket is minted |

As of 2026-08-05 the join manifest lived only on the owner's LAN hub (`tmp/lan-sync/join-manifests.json`, `/api/sync/join-ticket`) because pack-contract URIs are immutable. The mutable Freenet **join slot** that lifts the same-Wi-Fi restriction landed ~2026-08-09 — [`reference/MIST_TWO_FEDORA_FREENET.md`](reference/MIST_TWO_FEDORA_FREENET.md) § Freenet slot contract; §4 above shows the lookup order.

**Not yet published:** Archive contracts and the Manifest. `sealHotPeriod()` exists and the shapes are designed ([`reference/MIST_NETWORK_STORAGE.md`](reference/MIST_NETWORK_STORAGE.md) § Hot → Archive seal lifecycle), but nothing triggers a seal-and-publish. Everything currently rides in Hot.

### 9.3 What is encrypted before upload

**Everything.** Freenet's CHK is content-addressing and transport; it is not farm confidentiality. Sealing happens in `mist-freenet` before the transport is ever handed bytes.

| Step | Where |
|------|-------|
| `FarmSeed = HKDF(FarmCode_bytes, salt "pufam-mist-v1", info "farm-seed")` | `farm-seed.ts` |
| `HotKey = HKDF(FarmSeed, "freenet-hot")`, `BonesKey = HKDF(FarmSeed, "freenet-bones")` | `freenet-keys.ts` |
| AEAD seal of the payload under the contract key | `hot-crypto.ts`, `bones-crypto.ts` |
| **Guard:** `assertCiphertextForFreenet()` refuses a plaintext-looking buffer in `FreenetMistStore.put()` | `ciphertext-guard.ts` |
| Host contract: `putCiphertext` / `getCiphertext` only — the host never holds farm keys | `units/puf-freenet-host/src/types.ts` |

The guard is the load-bearing part: as a throw inside `put()` it is a rule that fails the test suite. Tests may bypass it only through the explicit `allowPlaintextForTests` option. An observer of the network sees that a KiB-class block exists at some CHK — not the farm, not the owner, not the record count. A hub relaying for a tablet sees the same sealed bytes ([`reference/APK_FREENET_PLUGIN.md`](reference/APK_FREENET_PLUGIN.md) §4).

### 9.4 What is NOT on Freenet

| Not published | Why | Where it lives instead |
|---------------|-----|------------------------|
| **Everything in a Firebase farm** | Different backend entirely. Mist is opt-in per device (`pufam.farmStoreBackend`) | Firestore |
| **Issue photos** | Blobs, not KiB-class; no splitfile path in v1 | `pufom_photo_outbox` IDB → Firebase Storage |
| **Basemap / Esri tile packs** | Tens of MB; bones design names them as a later splitfile case | `sentinut_basemap` IDB, device transfer |
| **Weather cache** | Derived from DPIRD; re-fetchable, farm-independent | `pufom_weather_cache` IDB |
| **Crew presence / live GPS** | Ephemeral by design — never Freenet (coarse “last seen” over Freenet is a frozen later design, `SETTINGS_SYNC_AND_CREW.md` §5) | Firestore `presence/`, LAN presence routes |
| **Archive contracts and the Manifest** | Designed, sealer exists, no publish trigger yet | Local only; all records still ride in Hot |
| **Invite index** | Admin-device ledger; mist mirror is explicitly optional and deferred | Local encrypted store |
| **FarmCode, FarmSeed, device keys** | Recovery root and key material. Publishing them would end the design | Paper wallet; `pufam.mist.*` session keys on device |
| **`.pufom` LAN sync bundles** | A different transport for the same data | LAN / USB |
| **Reticulum traffic** | Separate plane; telemetry is never mirrored to Freenet | Mesh only (unit not built) |

### 9.5 Authoritative versus cache

| Data | Authoritative | Freenet's role |
|------|---------------|----------------|
| Diary, issues, geometry on a mist farm | **The local device** (`pufom_farm_local`, `sentinut_farm_geometry`) | Durable copy + transfer between machines |
| Farm bones | **Local cache**, for UI and offline | Durable home; pulled on join or `map_version` change |
| FarmCode | **Paper** | Never published |
| FN02 URIs | `pufam.mist.hotPublish.v1.*` + `freenet-index.json` — both per device | The URIs *are* the addresses; losing them locally means needing a join ticket |

**Freenet is not the source of truth for a running farm.** It is durability plus a transfer mechanism between peers; the operator's laptop is what the paddock actually runs on. Multi-year survival is local caches + offline backups + at least one always-on pin — not the mist network by itself.

---

## File / function map

| Surface | File |
|---------|------|
| Login chooser + Freenet explain | `src/pages/Login.tsx`, `src/components/login/FreenetExplain.tsx` |
| Shared How this works body + in-app button | `src/components/FreenetHowItWorks.tsx` |
| Start farm | `src/pages/MistNewFarm.tsx` |
| Recover FarmCode | `src/pages/MistRecoverFarm.tsx` |
| Send / Join card | `src/components/MistFarmSyncCard.tsx` |
| Enter join ticket | `src/components/MistJoinTicketGate.tsx` |
| People ledger | `src/components/FarmPeopleCard.tsx` |
| Ticket mint / parse | `shared/sync/joinTicket.ts`, `shared/sync/joinGrant.ts` |
| Hub shelf | `server/joinManifestStore.ts`, `server/joinTicketRoutes.ts` |
| Freenet slot | `units/mist-freenet/contracts/slot-contract`, `src/mist/mistJoinWithTicket.ts` |

Workshop exception: `showFreenetFarmTools()` still shows the Freenet card on a fake cloud bench session so Send/Join can be tested without a real mist login.

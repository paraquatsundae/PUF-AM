# Freenet operator flow (today)

**Experimental — not production.** Firebase Auth + invite PIN remains the shipping cloud path.

Exact operator path as the code stands. Cloud XOR Freenet is locked at login. This file is the Freenet side only: create, recover, send, join, People ledger.

**Known holes:** [`FREENET_HOLES.md`](FREENET_HOLES.md)  
**In-app copy:** [`src/components/FreenetHowItWorks.tsx`](../src/components/FreenetHowItWorks.tsx) (login + Settings → Sync + Farm setup → People + join gate)

The rest of the Freenet instruction set (do not duplicate here):

| Doc | What it owns |
|-----|----------------|
| [`MIST_NETWORK_STORAGE.md`](MIST_NETWORK_STORAGE.md) | Crypto, FarmCode, Hot/Archive, pre-Freenet decisions |
| [`DESKTOP_FREENET_PLUGIN.md`](DESKTOP_FREENET_PLUGIN.md) | Electron shell, bundled node, installer phases |
| [`APK_FREENET_PLUGIN.md`](APK_FREENET_PLUGIN.md) | Why the tablet cannot host; hub / farm-gateway |
| [`FREENET_CONTRIBUTE_AND_STORAGE.md`](FREENET_CONTRIBUTE_AND_STORAGE.md) | What is published, sealed, or never on Freenet |
| [`SETTINGS_SYNC_AND_CREW.md`](SETTINGS_SYNC_AND_CREW.md) | Sync tab layout, People card, crew |
| [`MIST_TWO_FEDORA_FREENET.md`](MIST_TWO_FEDORA_FREENET.md) | Two-laptop AppImage join that actually passed |
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

Production web hides Freenet. Desktop with mist off greys the buttons. Workshop hub (`npm run dev`) shows Freenet.

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

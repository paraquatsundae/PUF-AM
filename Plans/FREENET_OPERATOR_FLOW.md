# Freenet operator flow (today)

**Experimental — not production.** Firebase Auth + invite PIN remains the shipping cloud path.

Exact operator path as the code stands. Login still picks the backend a farm is *created* on — cloud or Freenet — but since 2026-09-11 a cloud farm can switch its Freenet mirror on afterwards from its plugin settings ([`FREENET_NETWORK_PACK.md`](FREENET_NETWORK_PACK.md) decision 7, §3.5; § Hybrid below). This file is the Freenet side only: create, recover, send, join, People ledger, and the hybrid mirror.

**Known holes:** §8 below (merged from `archive/FREENET_HOLES.md`, 2026-09-10)  
**What is on Freenet, sealed, or never on Freenet:** §9 below (merged from `archive/FREENET_CONTRIBUTE_AND_STORAGE.md`, 2026-09-10)  
**Milestone — 2026-09-14:** three-device Bones paddock sync — §8 below. Bake that records it: **0.0.2**.  
**Next (2026-09-15):** [`DAY_RUN_2026_09_15.md`](DAY_RUN_2026_09_15.md) — **closed-enough**; handed to 16 Sep.  
**Next (2026-09-16):** [`DAY_RUN_2026_09_16.md`](DAY_RUN_2026_09_16.md) — `audit:codebase` + structure/function (layering, pack vs core, `farm_feed` size, leftover `harvest_drying`). **Not** Freenet photos, **not** 4G WakeLock, **not** chat stability unless health is green and George asks.  
**Parked / next (2026-09-15):** issue photos stay planned (not this sprint). In-farm messaging — **whole-farm feed + directed-at For you ping + farm chat**; DM threads / pair keys deferred — [`FARM_MESSAGING.md`](FARM_MESSAGING.md). **Phase 0 + Phase 1 chat shipped 2026-09-15** (and §9.2).  
**Residual — 2026-09-15 (Linux ↔ APK farm chat):** function pass after health (same evening). Incoming Hot no longer replaces the day buffer; watch polls while unfocused. **Field-retest** AppImage ↔ tablet — do not add Freenet features until that hop holds.  
**In-app copy:** [`plugins/freenet_host/src/FreenetHowItWorks.tsx`](../plugins/freenet_host/src/FreenetHowItWorks.tsx) (login + Settings → Sync + Farm setup → People + join gate). All Freenet UI lives in the `freenet_host` network pack since 2026-09-10 ([`NETWORK_PACK_PLUGIN.md`](NETWORK_PACK_PLUGIN.md))

The rest of the Freenet instruction set (do not duplicate here):

| Doc | What it owns |
|-----|----------------|
| [`reference/MIST_NETWORK_STORAGE.md`](reference/MIST_NETWORK_STORAGE.md) | Crypto, FarmCode, Hot/Archive, pre-Freenet decisions |
| [`reference/DESKTOP_FREENET_PLUGIN.md`](reference/DESKTOP_FREENET_PLUGIN.md) | Electron shell, bundled node, installer phases |
| [`reference/APK_FREENET_PLUGIN.md`](reference/APK_FREENET_PLUGIN.md) | Why the tablet cannot host; hub / farm-gateway |
| [`FREENET_NETWORK_PACK.md`](FREENET_NETWORK_PACK.md) | Umbrella plan (2026-09-10): per-farm network pack on desktop + Android, native PUT everywhere, hybrid for cloud farms, two-terminal goal. Decisions 1–8. **Decision — 2026-09-12:** FarmSeed owner-only; crew invite unwraps Hot/Bones |
| [`LOGIN_JOIN_SINGLE_BOX.md`](LOGIN_JOIN_SINGLE_BOX.md) | Single join box; **Decision — 2026-09-12** (crew invite, not FarmCode) |
| [`APK_FREENET_HOST.md`](APK_FREENET_HOST.md) | Network pack inside the APK (E-08) — the answer to hole 5; Phase 3 of the umbrella |
| [`LOCAL_DATA_STORAGE.md`](LOCAL_DATA_STORAGE.md) | Every local store, including the Freenet-related subset |
| [`SETTINGS_SYNC_AND_CREW.md`](SETTINGS_SYNC_AND_CREW.md) | Sync tab layout, People card, crew |
| [`reference/MIST_TWO_FEDORA_FREENET.md`](reference/MIST_TWO_FEDORA_FREENET.md) | Two-laptop AppImage join that actually passed |
| [`DEVELOPER_NOTES.md`](../DEVELOPER_NOTES.md) § Mist | Phase 11a–11l log |

---

## Facts that do not change

| | |
|--|--|
| One farm, one authority | Cloud or Freenet, chosen at login. A cloud farm may add a Freenet **mirror** (hybrid, 2026-09-11) — Firestore stays the authority, the mirror is a sealed read copy |
| Cost | $0 — no Google account, no enrollment code, no subscription |
| Join ticket | `PUF-XXXX-XXXX` — not a Firebase invite PIN |
| Who can Send | A PUF-AM **laptop** only |

**Two secrets, not one.** The FarmCode is the farm’s identity (paper, shown once). The short join ticket is a time-limited handoff the owner mints after **Send this farm**. A cloud invite PIN opens neither.

---

## 1. Login ladder

Join box → FarmCode step → ticket gate. Create is a secondary path (WelcomeChooser is Create's screen 2). **FarmCode-first** since 2026-09-11 (`LOGIN_JOIN_SINGLE_BOX.md`): a ticket typed in the box is held, never merged with the FarmCode.

| Screen | Route / state | Operator sees |
|--------|---------------|---------------|
| Join a farm | `/login` · `join` | One box. PIN, paper FarmCode, or `PUF-` ticket. |
| Your name | `join` · cloud-name | Invite PIN path. Name + Join farm. |
| Freenet farm | `join` · `loginJoin` | Crew invite: name + Join (waits up to 120 s for On Opennet — Listening, not a red error). FarmCode: owner recover (local). |
| Web refusal | `join` · freenet-unavailable | Hosted web: install desktop or the PUF-AM app. No mist path. |
| How this works | `/login` · `freenet-explain` | **Create** only. Start → `/login/mist-new-farm`. |
| Then ticket | gate | `PUF-XXXX-XXXX`. Prefills a ticket held from the join box. |

Desktop with mist off no longer dead-ends Join — typing a FarmCode is the opt-in. Workshop hub (`npm run dev`) treats Freenet as a host. **Production web hides Freenet (since 2026-09-10) and refuses a FarmCode/ticket in the join box (decision 5).** `freenetOptionState` still keys the *create* chooser off the shell's host capability (`src/lib/freenetHostCapability.ts`): Electron has one, a browser never does. `scripts/deploy-cloudrun.mjs` stopped baking `VITE_MIST_EXPERIMENTAL=true` and stopped setting `MIST_FREENET_DISABLED=1` (Cloud Run's `cloud` surface never registered `/api/mist/freenet/*` anyway). A tablet APK that is handed a FarmCode opens the reader path and reads through a paired hub ([`reference/APK_FREENET_PLUGIN.md`](reference/APK_FREENET_PLUGIN.md) §7) until the Android host lands. [`FREENET_NETWORK_PACK.md`](FREENET_NETWORK_PACK.md) decision 5, slice A.

---

## 2. Start a new farm (owner)

`finishMistFarmSetup(role: owner)` → `/farm-setup`. Desktop may flip `desktop-prefs.json` so Freenet auto-starts next launch.

**Decision — 2026-09-14 (start on farm open / Settings card).** The bundled node starts (or attaches to a verified Freenet 0.2 listener on `:7509`) when a Freenet farm session opens **or** when Settings → Sync shows the Freenet status card. Send still publishes farm bytes; it is not the start trigger. A leftover AppImage on `:7509` is attached, not killed — quit that AppImage first if this bake should exec its own binary.

**Decision — 2026-09-14 (managed stays managed; honest attach copy).** If this bake spawned the node (same uid and our `resources/freenet/freenet`, or `mode=managed` with our child), status stays **managed** — a later `start()` / Settings poll must not flip to attached just because `:7509` answers. **Attached** only when the listener is Freenet 0.2 and we did not start it (different binary, or the port was taken before our start). Copy: another PUF-AM mount → “older PUF-AM AppImage…”. A login leftover (`freenet.service`, `~/.local/bin/freenet`, `~/.local/share/freenet`) or unknown third-party → “Freenet was already running on this computer (not this AppImage).” Never kill a third-party node.

**Decision — 2026-09-14 (ask before cutting Freenet).** Closing PUF-AM asks whether to cut the Freenet connection — it does not always stop. **Keep running** (default): leave this bake’s managed node on `:7509` so the next PUF-AM attaches. **Stop Freenet**: stop only a node we spawned; `:7509` is then free for a fresh start. An **attached** node (third-party / Freenet Android Node / leftover we did not start) is never killed from *quit* — copy: “This is another Freenet. Leave it running.” Android swipe-away cannot show that dialog; the same ask is on Sign out / Leave farm. The Settings kill switch below is a different button. Quit the AppImage via the window chrome so the prompt appears — do not `kill -9` the AppImage if you want the question.

**Decision — 2026-09-14 (kill switch).** Settings → Sync **Stop Freenet on this device** stops PUF-AM’s node on this device and keeps it off until the next farm open or **Start Freenet** — it is not the quit Keep/Stop ask. It SIGTERMs / `stopSelf`s our managed child and a `:7509` listener that is ours (same uid, our `libfreenet.so` / AppImage `resources/freenet/freenet`). A leftover `freenet.service` / `~/.local/bin/freenet` is stopped with `systemctl --user stop freenet.service` only after a second confirm. Freenet Android Node (`org.freenet.androidnode`) cannot be force-stopped from this uid — copy says so and offers **Open that app**. Do not say “Freenet hub” for a node or an attach; the LAN hub is a different thing. A second `start()` must not ATTACH+`stopSelf` our own leftover (that stacked start attempts on the device).

**Decision — 2026-09-14 (Stop then Start leftover; device not tablet).** After Stop, wait briefly (≤4 s, 250 ms polls) for `:7509` to go free before Start execs one node. Same-uid leftover of our `libfreenet.so` (including when hidepid hides `/proc/.../exe`) is **reused as managed** — no “already open” / already-listening error. Freenet Android Node / other uid stays an honest leftover (“we cannot force-stop that app”), not a PUF-AM failure. Operator Freenet/join/Settings copy says **device**, not tablet (phone and tablet both run the APK).

**Decision — 2026-09-14 (0.2.135 peer count from our logs, not JSON).** Freenet 0.2.135 has no JSON peer API (`GET /status` 404; `GET /v1/version` is version only). Do **not** scrape the HTML dashboard. Settings → Sync reads the latest `ring_connections=` / `connection_count=` from this bake’s `--log-dir` (`~/.config/PUF-AM/freenet/logs/` on desktop; app-files `freenet/logs/` plus a one-line `pufam-ring.last` on Android). N≥1 → **On Opennet** and N count-only ring dots (no invented locations). N=0 or no line yet → **Listening** + “joining / no ring peers in the log yet.” Do not re-enable `freenet.service`.

**Decision — 2026-09-14 (Send waits for On Opennet; native PUT settle).** Linux Send hung at 45s because 0.2.135’s native `PutResponse` is the Opennet insert, not a local ack. This node’s log later wrote `Client not found in response channels` after we closed the WS. Send is blocked until Settings → Sync says **On Opennet** (N≥1). Once peered, one PUT/slot waits up to **120 s** and native PUTs are serialized. A second Send while one is running is refused. Hang copy tells the operator to wait for On Opennet and not stack Send; Settings **Stop Freenet on this device** is the kill switch. Do not re-enable `freenet.service`. Rebuild the AppImage to pick this up.

**Decision — 2026-09-14 (Join waits for On Opennet).** Login Join (crew InviteToken) and the join-ticket gate must not flash a red “connect to Freenet” at tap. They keep starting the host (`ensureFreenetHostListening`) and show **Listening** / waiting for peers until N≥1 (**On Opennet**), then unwrap. Wait is **120 s** (same window as a peered PUT). Timeout is honest — still Listening, leftover node, or Settings → Sync → Stop Freenet then Start; Freenet Android Node cannot be force-stopped. Hold-off or offline is named, not a spinner. Owner FarmCode recover stays local (paper FarmSeed) and does not block on Opennet; the same Listening line is on that screen. Experimental; shipping path remains Firebase Auth + PIN. Rebuild the APK/AppImage to pick this up.

**Decision — 2026-09-14 (Settings Freenet traffic).** Quiet ring until this node sends or fetches a contract. Pulse **this node ↔ network** (not peer-to-peer hops). **Send a highlight** → brief “Sent Hot” (then “Sent watch” when the 20 s ping is published). **20 s watch** → “Fetched watch”; if the ping changed, “Fetched Hot” / “Fetched Bones” / “Fetched photo” as those GETs run. Log backup is `process_client_request` in the same `--log-dir` (generic “Fetched contract” when the slot kind is unknown). Relay and neighbor-hosting lines are ignored.

**Decision — 2026-09-14 (AppImage Freenet Sync visible).** Settings → Sync Freenet Send/Join follows the farm pipe (`SETTINGS_SYNC_AND_CREW.md` §1), not a second `VITE_MIST_EXPERIMENTAL` sniff on the card. A leftover Freenet-native seed on the AppImage or APK (backend still `firebase`, no hybrid `cloudFarmId`) is adopted as the login so the card and the 20 s Hot/Bones watch run — same as the phone. Hosted web never adopts. Desktop dist forces the mist bake unless `--no-mist` (experimental, not workshop). Rebuild the AppImage to pick this up. Experimental; shipping path remains Firebase Auth + PIN.

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

1. Wait until Settings → Sync says **On Opennet** (not only Listening). Connect Freenet if the node is down.
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
| 3 | Enter join ticket (full-screen gate) | Type the 26-symbol `PUF-` crew invite. Join this farm. The app waits up to **120 s** for **On Opennet** (Listening + peers) before unwrap — not a red error at tap. |
| 4 | App | Nav follows the ticket grant. Confirmation: joined as {preset} — N diary, M blocks. |

**Look around first.** The gate can be deferred. The farm stays empty; Settings → Sync stays in Join mode. Offline maps can still download. This is how a device can exist before the owner reads out a ticket.

**Joining a cloud farm's mirror (hybrid, 2026-09-11).** Same four steps. The manifest carries the cloud farm id, so the gate says *joined the mirror of a cloud farm — read-only* and offers **Open the mirror**; the app lands as a `viewer` with a banner: *This is a mirror of a cloud farm. To edit, join with an invite PIN.* No Firebase member is created — a PIN from the owner is the way in, and it is unrelated to the ticket. Settings → Sync on that device shows the Freenet card in fetch-only mode plus **Import into a new farm — save as farm pack** (the mirror as a `.pufom`, for a rebuild). `plugins/freenet_host/src/joinOutcome.ts`, `src/components/CloudMirrorBanner.tsx`, `FreenetHybridNote.tsx`.

---

## 4a. Hybrid — a cloud farm with a Freenet mirror (2026-09-11)

Owner is signed in to a cloud farm on a desktop. Settings → Plugins → Freenet tile.

| Step | Screen | Operator does | App writes |
|------|--------|---------------|------------|
| A | Tile: *Off for this farm* | Read the warning — anyone with the FarmCode reads the whole mirror whatever their cloud role; revoking a ticket takes nothing back. **Enable the Freenet mirror**. | Nothing yet. |
| B | Write this down — shown once | Copy to paper. Tick. | FarmCode never shown again. |
| C | Optional device PIN | Skip or 4 digits. | Seed sealed in `pufam.mist.session.v1` with `cloudFarmId`; backend stays `firebase`. |
| D | Farm doc | — | `farms/{id}.networkPacks.freenet_host = { enabled: true, mistFarmId, changedAt, changedBy }`. One write. |
| E | Settings → Sync → Freenet → **Send** | Deliberate, as for a mist farm. | Envelope from the local cache, sealed under the mist id, `hot/current` + bones + a ticket. Zero Firestore reads. |

Other members on capable desktops see *Freenet mirror is on for this farm — enter the FarmCode to take part*; typing it seals the seed on their device too and their node joins in. Members without a node see the tile as *Not available on this device*. **Disable** flips `enabled: false`, keeps `mistFarmId` (re-enable with the same FarmCode lands at the same address), and every member node stops on the next reconcile. Auto-sync on a member device follows the cloud rungs only — the mirror never moves by itself in Phase 1.

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
| Host Freenet node | Yes — bundled; starts when a Freenet farm is open | Yes — in-APK `android-arm64` when present; else attach to a third-party node on `:7509` |
| Send / publish | Yes | No — needs a paired laptop hub |
| Join / fetch | Yes | Yes via hub or farm gateway |
| People ledger | This hub’s shelf | Paired hub only — empty if tickets live elsewhere |
| Two devices, no laptop | Two desktops can Send/Join | **Advanced 2026-09-14:** tablet + phone Bones on Opennet (PUF-AM APK); laptop not required for that path. Hole 5 still open until two Android devices exchange with **no** Freenet Android Node. Hosted web cannot |

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
| 1 | Send is after farm-setup, not at create | UX | **Soon** | **Done** 2026-08-14 — FarmCode/PIN screens + dismissible Farm setup nudge (`plugins/freenet_host/src/FreenetSendNudge.tsx`). No auto-publish |
| 3 | People list is per hub | Product | **Soon** | **Copy done** 2026-08-14 — empty-state names the hub first. Shared bones ledger still later |
| 4 | Revoke is not kick | Crypto / product | **Later** | Open — do not fake |
| 5 | Two tablets, no laptop | Product / APK | **Later** | **Advanced 2026-09-14** — three-device Bones paddock sync live on Opennet (tablet SM-T545 write → phone SM-S911B + Linux AppImage watch), including hours-old paddocks once Linux was on the Freenet farm session. In-APK `:freenet` + AppImage bundled 0.2.135. Run was **0.0.1**; bake that records it is **0.0.2**. Official asset still missing; `scripts/build-freenet-android.mjs` is the build chain. Hole stays open until two Android devices exchange with **no** Freenet Android Node. |

**Decisions — 2026-09-10** ([`FREENET_NETWORK_PACK.md`](FREENET_NETWORK_PACK.md) §2; recorded here because they change how holes 4 and 5 are read):

1. Native bincode PUT from the app's own WS client on every shell; `fdev` leaves the desktop bundle. *Built 2026-09-11* (`FREENET_NETWORK_PACK.md` Phase 2; live check pending).
2. `FreenetHostPlugin` (`units/puf-freenet-host`) is the data path, not just the supervisor; Express `/api/mist/freenet/*` stays only as the LAN relay for paired tablets without a node.
3. Android runs the node in an isolated `:freenet` process inside the PUF-AM APK — this supersedes `reference/APK_FREENET_PLUGIN.md` §3a's rejection. Hole 5's "Do: keep pointing at a laptop hub" holds until Phase 3 lands; "Do not ship a half-node" still holds — the node is whole or absent.
4. One node version for all shells, pinned to the latest release at the start of Phase 2 and re-verified for native PUT then. Last verified 0.2.125; pinned 0.2.135 on 2026-09-11, live check pending (`npm run mist:smoke:native`).
5. Production web hides Freenet (see § Login above).
6. The pack is enabled **per farm**, like a crop pack; the node is per device and starts when any open farm has it enabled.
7. **Hybrid** (built 2026-09-11, § 4a): a cloud-hosted farm may enable the pack. Firestore stays authoritative; Freenet holds a sealed mirror and the join/recovery plane. **Hole 4 applies to the mirror unchanged:** the FarmCode, not the Firestore role, decides who can read it, and revoking a ticket does not take the mirror back from a device that already pulled. The enable screen says so (`FreenetHybridEnable.tsx` `RISK_COPY`). A mirror device is read-only and never becomes a Firebase member by joining.
8. Vocabulary stays "network pack"; `kind: 'system'`, id `freenet_host`.

**Decision — 2026-09-12.** **FarmSeed stays only on owner devices.** Crew type only an invite (`PUF-` / grant), never a FarmCode. Owner recover is not a join. The invite unwraps HotKey / BonesKey (or equivalent), not FarmSeed — FarmSeed must never ride on a short 40-bit `PUF-` ticket. **Implemented 2026-09-12:** Send no longer tells anyone to read out the paper FarmCode; crew join uses a 26-symbol InviteToken. Hole 4 stays open and honest — revoke ≠ kick for data already fetched; do not fake kick. Hosted web still cannot run a Freenet node (decision 5). Homes: [`LOGIN_JOIN_SINGLE_BOX.md`](LOGIN_JOIN_SINGLE_BOX.md) (join UX / hole 2) and [`FREENET_NETWORK_PACK.md`](FREENET_NETWORK_PACK.md) (grant / slot). Do not renumber [`SETTINGS_SYNC_AND_CREW.md`](SETTINGS_SYNC_AND_CREW.md) or `Plans/reference/*`.

**Rules that survive the done items** (each was the fix for a hole and must not regress):

- Hole 6 — **Decision — 2026-09-12, implemented 2026-09-12:** Send reads out the crew invite only. The paper FarmCode stays on owner devices. Owner-side PIN (this tab sealed the farm) stays a separate field. Device PIN on the joiner is only if they set one.
- Hole 7 — Invite PINs are a Firebase mechanism. Copy on a Freenet farm branches on `activeFarmPipe()`: FarmCode + join ticket (and personal unlock PIN as a local lock). Cloud copy unchanged.
- Hole 2 — do **not** embed the FarmCode in the ticket, or print the FarmCode again after the write-it-down screen. That would break the “shown once” rule. **Decision — 2026-09-12** *is* crew-invite-only (no FarmCode on the joiner) — that is not this hole; wrapping FarmSeed in the ticket remains forbidden.
- Hole 1 — do **not** auto-publish on create. Send is deliberate — it puts ciphertext on Freenet and mints a ticket. The nudge is dismissible.
- Hole 3 — do **not** imply a central roster. The real fix is a farm-bones join ledger that travels with Hot/bones (sealed, versioned, with conflict rules for two hubs minting at once). Spec it before coding.

### Hole 4 — Revoke is not kick (open)

**Today:** Revoke stops the next resolve of that ticket. A device that already pulled holds a FarmSeed copy. Taking the farm back means a **new FarmCode** (and republish).

**Do not:** add a “kick” that only hides a row, or a remote wipe we cannot enforce.

**If we ever kick for real:** a sealed farm epoch (or a new FarmCode) that old seeds cannot open, plus a re-hand to devices that should stay. That is a crypto/product project, not a Settings toggle. Until then the UI keeps saying “revoke stops new joins; a device that already pulled keeps its copy.”

### Hole 5 — Two tablets, no laptop (open)

**Today (2026-09-14):** Desktop hosts Freenet inside the AppImage when a Freenet farm is open — join/Send/Sync start the bundled linux-x64 0.2.135 node (`resources/freenet/freenet`); `MIST_FREENET=1` is a workshop override only. The debug APK packs a workshop-built 0.2.135 `libfreenet.so` and the isolated `:freenet` service spawns it when `:7509` is free. Attach only if the listener is Freenet 0.2 (`GET /v1/version` or WS hello) — TCP-only is not enough, and a leftover dashboard is not attached. Do not kill a verified Freenet Android Node. USB/adb does not take 7509. Hole stays open until two Android devices exchange with **no** second Freenet app.

**Do:** start the in-app node (AppImage `resources/freenet/freenet` / APK `libfreenet.so`). A laptop hub is an optional LAN fast path. **Do not:** tell a Freenet farm it must pair a hub, or require Freenet Android Node. **When:** [`FREENET_NETWORK_PACK.md`](FREENET_NETWORK_PACK.md) Phase 3, detailed in [`APK_FREENET_HOST.md`](APK_FREENET_HOST.md). Decided 2026-09-10 (decision 3 above): the answer is a whole node in an isolated process.

### Milestone — 2026-09-14 — three-device Bones paddock sync

**Field-validated on Clare Downs** (do not delete this farm; FarmSeed stays paper-only — do not print it). The live run was **0.0.1** (tablet/phone APK; Linux AppImage 21:35 with leftover Freenet-native seed adopted so Settings → Sync was visible). The bake that records this milestone is **0.0.2**. Experimental mist; public **v 0.1** remains a future `0.1.0`.

| Device | Role | Result |
|--------|------|--------|
| Tablet SM-T545 | Wrote a new paddock (Bones PUT after the first Send/join) | Published on Freenet 0.2 Opennet |
| Phone SM-S911B | 20 s Hot/Bones watch | New paddock appeared almost instantly |
| Linux AppImage 0.0.1 (21:35) | Adopted the Freenet farm session + watch | Caught up **all** paddocks, including ones made many hours earlier |

This advances Hole 5 past a two-Android live pair: three PUF-AM shells (two APK + AppImage) exchanged Bones on Opennet. It does **not** close Hole 5 — two Android devices still need to exchange with **no** Freenet Android Node (official `libfreenet.so` still missing from GitHub; FAN cannot be force-stopped from this uid).

**Honest residual:** first Opennet can take minutes; Freenet Android Node cannot be force-stopped; hosted web still cannot run a node; FarmSeed paper-only; phone wireless adb port changes; version still experimental `0.0.#` mist.

**Next (2026-09-15):** [`DAY_RUN_2026_09_15.md`](DAY_RUN_2026_09_15.md). Photos planned, not shipped. **Parked / next:** in-farm messaging — whole-farm feed + directed-at For you (DMs deferred) — [`FARM_MESSAGING.md`](FARM_MESSAGING.md).

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

Four payload kinds reach Freenet. All are **AEAD-sealed before insert** (§9.3). Hot, bones and the join manifest are KiB-class single-block CHK — no splitfiles (frozen, MIST § Pre-Freenet workshop decisions #2). The Hot watch is a signed slot, same contract as the join slot.

| Payload | MistStore key | Contents | Published when |
|---------|---------------|----------|----------------|
| **Hot** | `mist/v1/farm/{farmId}/hot/current` | Rolling window of diary events, field issues, archived issues, **timed map highlights**, and a **farm chat** record (`farm_chat` — last **5** live lines + today's buffer; HotKey, not FarmSeed). Sealed days sit at `hot/chat-archive/{date}`. Mirrored by [`src/mist/mistHotBridge.ts`](../src/mist/mistHotBridge.ts). | Highlight / diary / farm-chat save PUTs Hot and bumps the watch slot; **Send this farm** still publishes Hot + bones + a ticket |
| **Hot watch** | slot from `HKDF(HotKey, "freenet-hot-watch-slot")` | `{ v:1, kind:"hot-watch", farmId, generation, hotUri, hotContentHash }` — sealed with HotKey. Cheap yes/no for other terminals. | Same moment as a Hot PUT |
| **Bones** | `mist/v1/farm/{farmId}/bones/{assetId}` | Farm structure: block boundaries, pins, tracks, saved viewport — [`src/mist/bonesGeometry.ts`](../src/mist/bonesGeometry.ts) | Paddock / pin / track save (after the first Send/join) PUTs Bones and bumps the watch; **Send this farm** still publishes Hot + bones + a ticket |
| **Join manifest** | not a mist key — a LAN shelf entry, or the Freenet join slot | `{ v: 2, farmId, hotUri, bonesUri, role, permissions?, expires?, ticket }` — resolves a short `PUF-XXXX-XXXX` ticket to the two FN02 URIs | When a short join ticket is minted |

**Decision — 2026-09-12 (map highlights).** “Check this” areas did not Freenet-sync because they lived only in Firestore / LAN (`/api/highlights`) and were never packed into Hot. They now persist locally and ride the same Hot snapshot as diary. `directedAtName` / `directedAtUid` name who the area is for. No kick/revoke.

**Decision — 2026-09-12 (auto watch).** Manual Send/Pull was the wrong product and did not work: a highlight save only wrote local IndexedDB; each Freenet Hot PUT minted a **new** FN02 URI; the tablet kept the join-ticket URI and hash and never learned the new one; Send is owner-only (FarmSeed); Freenet rungs were `auto: false`; a 30s default expired in transit. Fix: publishing device PUTs Hot on save and updates the HotKey watch slot; other terminals poll that slot every **20 s** (no subscribe API on the 0.2.135 host plugin) and fetch Hot only on a hash/generation change. Crew decrypt with Hot/Bones. Default Freenet highlight duration is **300 s**. Both apps must be open with a node up. Hole 4 unchanged.

**Decision — 2026-09-14 (Bones auto-publish + watch URI).** A paddock / pin / track save on a Freenet farm marks Bones **pending** and PUTs Bones (BonesKey) without a second **Send this farm**. The 20 s watch poll retries if the PUT failed (Listening / not On Opennet / Send in flight). Local pack must not wipe the last Hot/Bones FN02 URI or advertise a new hash with an old URI. Watchers fetch when `bonesHash` **or** `bonesUri` changes. Apply merges (union by id); empty Bones does not wipe tablet-local paddocks; map `isLoaded` stays put. Rebuild the APK/AppImage to pick this up. Experimental; shipping path remains Firebase Auth + PIN.

**Milestone — 2026-09-14 (Bones field-validated).** Three-device paddock sync on Opennet — see §8. Hours-old paddocks arrived on Linux once it was on the Freenet farm session. Next was [`DAY_RUN_2026_09_15.md`](DAY_RUN_2026_09_15.md) (closed-enough). **Next (2026-09-16):** [`DAY_RUN_2026_09_16.md`](DAY_RUN_2026_09_16.md). Photos are not shipped. **Parked / next (2026-09-15):** [`FARM_MESSAGING.md`](FARM_MESSAGING.md).

**Decision — 2026-09-15 (issue photos: parts + index, not shipped).** A 600 KB JPEG cannot be one pack PUT: `FREENET02_MAX_BLOB_BYTES` is **64 KiB** (`units/mist-freenet/src/freenet02-pack-id.ts`; native PUT → `assertBlobSize`). Desktop IPC 8 MiB is a runaway guard. Planned approach: HotKey-sealed **content-addressed parts** plus the existing photo index; watch still only carries `photoIndexHash`. Product compressor stays 1600 px / 0.72→0.40 / **600 KB**. Not Freenet splitfiles ([`reference/MIST_NETWORK_STORAGE.md`](reference/MIST_NETWORK_STORAGE.md) § Pre-Freenet workshop decisions #2). Not FarmSeed. Not BonesKey. Do not remount the map. **Implementation not started.** Home: [`FREENET_ISSUE_PHOTOS.md`](FREENET_ISSUE_PHOTOS.md). **Parked 2026-09-15** — not this sprint; next product plan is messaging.

**Decision — 2026-09-15 (farm messaging: whole-farm feed + directed ping, not shipped).** In-farm feed reuses `directedAtName` / `directedAtUid` and diary `assignedTo*` — do not invent a second mention system. **Pair keys are not required** to ping the tagged user: the issue is already farm-visible (Hot / Firestore); For you is a local match on Directed at. Empty Directed at = Everyone (farm-wide feed item). Everyone with farm access can still read it — not a private DM. **Phase 0:** in-app For you + farm feed from existing issues / highlights / diary (Dashboard / issues list; no Messages nav; no new Firestore collection). **Phase 1:** Farm feed as a first-class UI (all-farm stream + For you filter). **Phase 2 deferred:** DM threads / pair keys. **Phase 3 later:** OS banners while the app is up. Freenet delivery stays the **20 s** Hot watch (not instant; both apps + node up). Hosted `messages` / feed storage is not approved until billing Q1 is answered. FarmSeed never on a message. Hosted web still cannot run a node. **Implementation not started.** Home: [`FARM_MESSAGING.md`](FARM_MESSAGING.md).

**Decision — 2026-09-15 (farm chat log shipped).** Whole-farm text chat (no DMs, no JPEGs) rides the existing Hot snapshot as one `farm_chat` record, sealed with **HotKey** only. Watch still uses the Hot hash+URI pair — never a new hash with an old URI. Hosted / hybrid use `farms/{farmId}/farm_chat/log` (last 5 + sealed today), not Hot. Latency remains the **20 s** watch (or faster if a path already exists). Hosted web still cannot run a node. Home: [`FARM_MESSAGING.md`](FARM_MESSAGING.md).

**Decision — 2026-09-15 (farm chat daily archive).** Yesterday’s lines are gzipped and HotKey-sealed at `mist/v1/farm/{farmId}/hot/chat-archive/{yyyy-mm-dd}` (one 64 KiB pack per day). The live `farm_chat` record keeps last 5 + today’s buffer + an archive index so `farmChatHash` moves with the Hot URI. Calendar day is Australia/Perth.

**Residual — 2026-09-15 (Linux ↔ APK farm chat function).** Last-writer Hot was wiping the other device’s same-day lines; unfocused AppImage skipped the 20 s poll. Merge-by-id + republish leftovers + poll when hidden. Field-retest before more Freenet features. [`FARM_MESSAGING.md`](FARM_MESSAGING.md).

**Decision — 2026-09-12 (highlight diary + no remount).** Incremental Hot apply must **merge** into live diary/issues/highlights and must **not** call `refreshFarmUiAfterRecovery` (that flips map `isLoaded` and remounts Leaflet). A note or directed-at name on “Check this” writes a diary `work` plan in the same save (sender, assignee, instructions, `linkedHighlightId` / `linkedDiaryEventId`) so one ping delivers both. The map inspect card stays until dismiss and opens `/diary?event=`.

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
| **Everything in a Firebase farm** — unless the farm turned its mirror on | Different backend entirely. A hybrid farm (§ 4a, 2026-09-11) publishes its sealed export envelope on Send, and only then; roles, PINs, membership, presence stay in Firestore | Firestore |
| **The FarmSeed of a hybrid farm** | Only the public mist FarmId and the enabled flag go on the farm doc | Paper; `pufam.mist.session.v1` per device |
| **Issue photos (splitfile)** | Multi-block Freenet splitfile is deferred. **2026-09-15 planned (not shipped), parked same day:** app-level HotKey-sealed parts + index — [`FREENET_ISSUE_PHOTOS.md`](FREENET_ISSUE_PHOTOS.md). Pack PUT stays 64 KiB. | Compressed JPEG ≤ 600 KB (2026-09-14): HotKey-sealed at `hot/photo/{issueId}/{photoId}` (legacy first photo `hot/photo/{issueId}`) + one photo index; diary/events at `hot/photo/event/{eventId}/{photoId}`; hosted `pufom_photo_outbox` → `photo.jpg` kept as first + `{photoId}.jpg` (max 5). Same index hash still drives the 20 s watch. Helpers exist; Opennet transfer is **not** field-validated |
| **DM threads** | Pair-key private chat is Phase 2 deferred. Directed-at and farm chat stay farm-visible. [`FARM_MESSAGING.md`](FARM_MESSAGING.md). 20 s watch is not instant. | Farm chat (broadcast) now rides Hot as `farm_chat`; hosted is `farm_chat/log` |
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

### 9.6 Who moves the bytes (2026-09-11, `FREENET_NETWORK_PACK.md` Phase 1 slice B)

The page seals, signs and hashes on every shell. What differs is the hop between the page and a node:

| Shell | Publish (Hot, bones, join slot) | Read (pull, join ticket) | Path |
|-------|--------------------------------|--------------------------|------|
| Electron desktop | Host over IPC — `puf-freenet:put` / `puf-freenet:slot-put` → `FreenetHostPlugin` → node WS on this machine | Local node first (`freenetLocalNode.ts`), then `puf-freenet:get` / `puf-freenet:slot-get` through the same host | `src/mist/freenetHostTransport.ts`; Express is not on the path |
| Tablet (APK) | Paired hub's LAN relay — `POST /api/mist/freenet/{hot,bones}/publish/:farmId`, `slot/publish` | Local node app's GET first when one is reachable, then the hub's relay `GET …/slot/:id`, `pull-by-uri` | `src/mist/freenetRelayTransport.ts`; `server/mistFreenetRoutes.ts` on the hub |
| Hosted web (`am.pufworks.farm`) | Nothing — no node, routes 404 | Nothing | Login option hidden ([`NETWORK_PACK_PLUGIN.md`](NETWORK_PACK_PLUGIN.md) §6) |
| `npm run dev` workshop hub | Same as the tablet, talking to its own loopback Express | Same | The dev server *is* the hub |

The relay keeps its outbox and `freenet-index.json` for tablets whose hub node is down; the host path has neither — a put fails while the node is down, and the URI memory is the page's `pufam.mist.hotPublish.v1.*`. Ciphertext is checked before either hop: `assertCiphertextForFreenet` runs in `FreenetMistStore.put` on the relay and in the host's wire (`server/freenetHostWire.ts`) on Electron. Since Phase 2 (2026-09-11) both hops publish natively over the node's WebSocket (`BrowserFreenetPutClient` / `BrowserFreenetSlotClient`); nothing shells out.

---

## File / function map

| Surface | File |
|---------|------|
| Login chooser + Freenet explain | `src/pages/Login.tsx` (core, `loginExplain` surface), `plugins/freenet_host/src/FreenetExplain.tsx` |
| Shared How this works body + in-app button | `plugins/freenet_host/src/FreenetHowItWorks.tsx` |
| Start farm | `plugins/freenet_host/src/MistNewFarm.tsx` |
| Recover FarmCode | `plugins/freenet_host/src/MistRecoverFarm.tsx` |
| Send / Join card | `plugins/freenet_host/src/MistFarmSyncCard.tsx` |
| Enter join ticket | `plugins/freenet_host/src/MistJoinTicketGate.tsx` |
| People ledger | `src/components/FarmPeopleCard.tsx` |
| Ticket mint / parse | `shared/sync/joinTicket.ts`, `shared/sync/joinGrant.ts` |
| Hub shelf | `server/joinManifestStore.ts`, `server/joinTicketRoutes.ts` |
| Freenet slot | `units/mist-freenet/contracts/slot-contract`, `src/mist/joinSlotFreenet.ts`, `plugins/freenet_host/src/mistJoinWithTicket.ts` |
| Transport (host vs relay) | `src/mist/freenetPackTransport.ts`, `freenetHostTransport.ts`, `freenetRelayTransport.ts`, `freenetTransportSelect.ts`; `server/freenetHostWire.ts`, `server/freenetSlotOps.ts` |
| Freenet status + ring (Settings → Sync) | `src/components/FreenetStatusCard.tsx`, `src/components/FreenetPeerRing.tsx`, `src/hooks/useFreenetRingStatus.ts`, `units/puf-freenet-host/src/log-peer-count.ts` — **Decision — 2026-09-14** (peer count from logs) |
| Join waits for On Opennet | `src/lib/freenetJoinWait.ts`, `src/hooks/useFreenetJoinWait.ts`, `plugins/freenet_host/src/FreenetJoinWaitPanel.tsx` — **Decision — 2026-09-14** (Join waits for On Opennet) |
| Ask before cutting Freenet | `units/puf-freenet-host/src/quit-ask.ts`, `desktop/freenetQuitDialog.ts`, `desktop/main.ts` (`before-quit` / last window), Sign out / Leave farm (`useFreenetLeaveAsk.ts`) |
| Kill switch (Stop Freenet on this device) | `units/puf-freenet-host/src/kill-switch.ts`, `src/lib/stopFreenetOnDevice.ts`, `src/lib/freenetHostHoldOff.ts` — **Decision — 2026-09-14** (kill switch) |

Workshop exception: `showFreenetFarmTools()` still shows the Freenet card on a fake cloud bench session so Send/Join can be tested without a real mist login.

# Login — single-box join

**Status:** Design accepted 2026-09-11 — **FarmCode-first**. Building.
**Experimental — not production** where it touches Freenet; the cloud invite-PIN path is the shipping path and is simplified, not changed in meaning.
**Product:** PUF-AM · **Scope:** one "Join a farm" entry point at `/login` that classifies whatever code the user was handed (cloud invite PIN, FarmCode, `PUF-` join ticket), asks for the second Freenet piece only when needed, and lets the network pack start the node — without weakening hole 2 (FarmCode and ticket stay separate) or decision 5 (hosted web hides Freenet).

Related: [`AUTH_INVITE_PIN.md`](AUTH_INVITE_PIN.md) · [`FREENET_OPERATOR_FLOW.md`](FREENET_OPERATOR_FLOW.md) §1, §4, §8 · [`FREENET_NETWORK_PACK.md`](FREENET_NETWORK_PACK.md) §2 decisions 5–7 · [`NETWORK_PACK_PLUGIN.md`](NETWORK_PACK_PLUGIN.md) · [`NAMING.md`](NAMING.md) §5, §7

Requested by George, 2026-09-11: "the join farm should be a single button, then an entry of an invite code (freenet or cloud hosted) should be able to be entered into a single box. the system should then be able to determine if its a freenet farm or a cloud farm, logging in and starting the dependencies required."

**Decision — 2026-09-11.** **FarmCode-first.** A ticket typed first is held in memory and, across the reload into the join-ticket gate, in `sessionStorage` key `pufam.mist.joinTicketDraft.v1` as the ticket only — never persisted with the FarmCode, and never by embedding the FarmCode in the ticket (hole 2). Ticket-first was rejected: after a ticket alone the app can only do a LAN-only manifest lookup of ciphertext it cannot open.

**Decision — 2026-09-11 (A).** An APK with the mist gate shut still **opens the reader path** when a FarmCode is typed (`setFarmStoreBackend('mist')`). That is the documented tablet reader path, not a decision-5 breach (decision 5 is hosted web).

**Decision — 2026-09-11 (B).** Hub pairing **stays out of the join box**. If it is ever offered at login, mint the new format as `HUB-XXXX-XXXX`; do not disambiguate today's unprefixed `XXXX-XXXX` pairing codes.

---


Read: `AGENTS.md`, `Plans/AUTH_INVITE_PIN.md`, `Plans/FREENET_OPERATOR_FLOW.md` (§1, §4, §4a, §8), `Plans/FREENET_NETWORK_PACK.md` (§2 decisions 5–7, §3), `Plans/NETWORK_PACK_PLUGIN.md`, `Plans/SETTINGS_SYNC_AND_CREW.md` §3 (join tickets / grants — §9 is the auto-sync ladder), `Plans/NAMING.md` §1/§7, plus every login file named below. `units/mist-freenet/src/freenet02-*` and `desktop/main.ts` were read only for the browser-client question and are not depended on.

---

## Part 1 — the login as it stands

### 1.1 The surface

| Piece | File | What it decides |
|---|---|---|
| Composer | `src/pages/Login.tsx` (128 lines) | `step` → one of 9 screens; L34–48 `choose`, L50–72 `cloud-options`, L74–118 BYO/subscribe, L120–125 `freenet-explain` via `PackSurfaces surface="loginExplain"`, L127 default `LoginCloudForm` |
| State | `src/hooks/useLoginFlow.ts` (265) | L65–70 `freenetOption = freenetOptionState({capability, mistEnabled, workshopHub: import.meta.env.DEV, nativeReader})`; L71–78 `initialLoginStep`; L110–114 auto-loads nearby farms (GPS) as soon as `step==='firebase' && mode==='join'`; L116–130 Google; L132–152 PIN redeem; L154–181 create |
| Pure routing | `src/lib/loginStorageChoice.ts` (85) | `LoginStep` union L33–42; `freenetOptionState` L44–67; `initialLoginStep` L74–85 (`byoConfigured → 'firebase'`, `welcomeBack ∧ firebase → 'firebase'`, `hidden → 'cloud-options'`, else `'choose'`) |
| Screen 1 (desktop/workshop/APK-gated) | `src/components/login/WelcomeChooser.tsx` | "How should this farm be stored?" — Cloud sync / Freenet network. Footnote L67–69: *"A farm is one or the other — never both"* (stale since hybrid, decision 7) |
| Screen 1 (web) / screen 2 (others) | `CloudSyncOptions.tsx` | Three cards: PUFworks cloud (Invite only) / Your own Firebase / PUFworks subscription (not open). Back link only when Freenet is not hidden (L90) |
| Cloud form | `LoginCloudForm.tsx` L61–88 Join/Create tabs; `LoginJoinForm.tsx` (nearby list L67–124, name L129–146, "Farm PIN" L148–171, Google link L181–196); `LoginCreateFarmForm.tsx` (Freenet card L24–47, enrollment code L84–103) | |
| Recovery PIN shown once | `LoginRecoveryScreen.tsx` | after cloud create |
| Pack explainer | `plugins/freenet_host/src/FreenetExplain.tsx` | How-this-works body + Start / Join; both greyed when `needs-setting` (L51–56 tells the user to open Settings, which is behind login) |
| Pack public routes | `MistNewFarm.tsx` (273), `MistRecoverFarm.tsx` (286) at `/login/mist-new-farm`, `/login/mist-recover` (`App.tsx` L110–114) | recover: FarmCode + farm name + your name → validate (L41–58) → optional device PIN → `finishMistFarmSetup({role: DEFAULT_JOIN_ROLE, joinTicketPending: true})` (L60–82) → `window.location.href='/'` (`finishMistFarmSetup.ts` L83) |
| Gate | `MistJoinTicketGate.tsx` (352), the pack's `sessionGate`, inside `App.tsx` L88–96 | asks for `PUF-XXXX-XXXX`; L108–111 renders children unless `pending ∧ isMistExperimentalEnabled() ∧ isMistFarmSessionActive() ∧ farmId`; "Look around first" defers (L329–339) |
| Cloud identity | `src/contexts/AuthContext.tsx` L149–178 `signInWithInvitePin` → `redeemInvitePin` (`src/lib/invitePinAuth.ts` L153–185, `POST /api/auth/redeem-pin`) → `signInWithCustomToken`; L296–300 `signInWithGoogle` (popup, no email/password path exists) | the PIN *creates* the Firebase identity: `uidForPinRedeem(pin, displayName)` → `ap_<sha256[0:20]>`, `syntheticEmail(uid)` = `<uid>@sentinut.local` (`server/accessPinCrypto.ts` L61–69) |
| Hybrid "enter the FarmCode to take part" (b7be4cd) | `plugins/freenet_host/src/FreenetHybridEnable.tsx` `Flow='enter-code'` L48; entry buttons L394–400 and L433–439; `parseTyped` L198–216; `finish('typed')` L160–196 | lives in Settings → Plugins → Freenet tile, **not** at login |
| Tablet hub pairing | `src/components/TabletHubCard.tsx` (desktop side, Settings), `src/lib/hubPairing.ts` `pairWithHub` L82–158 called from `src/components/sync/useFarmSync.ts` L235–237 (Settings → Sync) | **not at login** on any shell |

### 1.2 What a brand-new user sees, per shell

Notation: **[tap]** = button/card/tab press; **{field}** = something typed; **(dialog)** = OS prompt.

**A. Hosted web `am.pufworks.farm`** — `capability=null` → `freenetOption='hidden'` → `initialLoginStep → 'cloud-options'`

```
1. /login  CloudSyncOptions — "Three ways to put the farm on the internet. Read who pays before you continue."
   cards: PUFworks cloud (Invite only) | Your own Firebase | PUFworks subscription (not open)
2. [PUFworks cloud] → LoginCloudForm, tab Join a farm (default)
   (GPS permission dialog fires immediately — useLoginFlow L110–114)
   "Nearby farms" list · {Your name} · {Farm PIN} · [Sign in to farm]
   footer link: "Sign into PUFworks Firebase" (Google) with a caveat paragraph
2'. [Create a farm] tab → {Farm name} {Your name} {Enrollment code} ☐ show nearby → [Create farm]
3'. LoginRecoveryScreen (owner recovery PIN, shown once) → [Continue to farm]
```
(a) create cloud: 3 taps + 3 fields + 1 tap (Continue) = **4 taps, 3 fields, 1 dialog**.
(b) join cloud by PIN: **2 taps, 2 fields, 1 dialog** (card, then submit) — plus reading a paragraph that explains the same box is also the owner recovery PIN.
(c) join Freenet: **impossible** (correct per decision 5, but nothing tells a worker holding a FarmCode why).

**B. Electron desktop** — `capability='electron'` → `'available'` (mist pref on) or `'needs-setting'` (pref off) → `'choose'`

```
1. /login  WelcomeChooser — "How should this farm be stored?"  Cloud sync | Freenet network · Free
2a. [Cloud sync] → CloudSyncOptions (3 cards + "Back — including the free Freenet path")
3a. [PUFworks cloud] → LoginCloudForm as web (GPS dialog) → {name}{PIN} [Sign in]
2b. [Freenet network] → FreenetExplain: How-this-works body, [Start a new farm] [Join a farm I already have]
    if needs-setting: both greyed; "turn on Settings → Farm sync between laptops" — Settings is behind login → dead end
3b. [Join a farm I already have] → /login/mist-recover: {FarmCode 17 symbols} {Farm name (optional)} {Your name} [Validate & continue]
4b. Optional device PIN screen → [Continue to join ticket]
5b. full page reload → MistJoinTicketGate: {PUF-XXXX-XXXX} [Join this farm]   (or "Look around first")
```
(a) create cloud: **5 taps, 3 fields, 1 dialog**. (a') create Freenet: Freenet, Start, {farm}{name} Continue, ☑ written down, Continue, PIN screen Enter = **6 taps, 2 fields**.
(b) join cloud: **3 taps, 2 fields, 1 dialog**.
(c) join Freenet: **5 taps, 3 fields** (FarmCode, name, ticket) across 4 screens and a reload; 0 if the mist preference is off (dead end).

**C. Android APK** — `capability=null`, `nativeReader=true`; `mistEnabled` is true only if `VITE_MIST_EXPERIMENTAL` was baked or `pufam.farmStoreBackend==='mist'` already
- Gate shut (normal APK): identical to **A** (web). A FarmCode holder is stranded.
- Gate open: identical to **B** except the node is never local; step 5b's gate shows `FREENET_NO_HOST_LABEL` (`freenetRuntime.ts` L153–158) unless a hub is paired (Settings → Sync, post-login) or a sideloaded node answers on `127.0.0.1:7509`.

**D. Workshop `npm run dev`** — `workshopHub=true` → `'available'` → identical to **B** with the loopback Express as relay; cloud create needs `secrets/` + enrollment codes.

### 1.3 Where it is confusing (plainly)

1. **The first question is the owner's question.** "How should this farm be stored?" / "Read who pays" is asked of a worker who has been handed a code by somebody who already made that decision. A joiner cannot answer it and should not have to.
2. **Three cloud cards before a PIN box.** Web users must pick "PUFworks cloud" before they can type the PIN they were given; the other two cards are for people setting up a farm, not joining one.
3. **GPS prompt on arrival.** The nearby-farm loader fires the moment the join tab mounts, before the user has typed anything.
4. **One box, three meanings.** "Farm PIN" accepts a staff invite PIN and the owner recovery PIN, and the helper text explains both plus the nearby list plus BYO.
5. **Seven code-shaped things.** invite PIN, owner recovery PIN, enrollment code, FarmCode, join ticket, device PIN, unlock PIN (and hub pairing code, BYO farm ID). Nothing at login tells the user which box theirs belongs in.
6. **Freenet join is four screens and a reload away**, behind a "How this works" essay, and the storage chooser's footnote ("never both") is now wrong.
7. **`needs-setting` is a dead end** on a fresh desktop: the fix is a Settings toggle the user cannot reach before login.
8. **"Sign into PUFworks Firebase" (Google)** sits under the PIN form with a paragraph saying it is *not* the recovery PIN — a returning owner reads it as the way in.

### 1.4 Every code a user can be handed

| Code | Minted | Grammar (canonical) | Alphabet | Normalised by | Validated where |
|---|---|---|---|---|---|
| Cloud invite PIN / owner recovery PIN | `generatePinCode(8)` — `server/accessPinCrypto.ts` L48–55; `server/accessPinFarmRoutes.ts` L79; `server/accessPinMemberRoutes.ts` L326; `scripts/createAccessPin.ts` L49 | `XXXXXXXX` — 8 symbols, no separators, no prefix (~40 bits) | `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (32; **no I O 0 1**; has L U) | `normalizePin` strips `[\s-]`, uppercases (L40–42) | `POST /api/auth/redeem-pin` L70–72 accepts anything `≥6` after strip; lookup is by SHA-256 |
| BYO invite / recovery PIN | `shared/auth/byoPin.ts` L31–39 | same as above | same alphabet (L13) | L17–19 same | `src/lib/byoFirebaseAuth.ts` `redeemByoInvitePin`, Firestore `farms/{id}/join_tickets/{hash}` |
| Enrollment code (create only) | operator-defined in `PUF_ENROLLMENT_CODES` / `secrets/enrollment-codes.json` | free-form, `≥6` after strip | **any** | `normalizeEnrollmentCode` (`server/enrollmentCodes.ts` L33–35) | `reserveEnrollmentCode` L98–131 |
| FarmCode `mist-fc-2` | `mintFarmCode()` `units/mist-freenet/src/farm-code.ts` L294–304 | `mist-fc-2  XXXXX-XXXXX-XXXXX-XX` — 16 payload + 1 check = **17** body symbols (80 bits); two spaces after prefix | Crockford `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (**no I L O U**); check symbol may be `*~$=U` on legacy paper, never on new mints | `normalizeFarmCodeInput` L152–191: strips `FarmCode:` labels, hyphen spacing, optional `mist-fc-N` prefix, folds `O→0 I/L→1 U→V` in payload, snaps check | `decodeFarmCodeBytes` L255–282 (length + check); `parseFarmCode` derives FarmSeed/FarmId |
| FarmCode `mist-fc-1` (legacy, decode-only) | never | `mist-fc-1  ` + **27** body symbols (128 bits) | same | same; version inferred from body length (L85–88) | same |
| Short join ticket | `mintJoinTicket()` `shared/sync/joinTicket.ts` L179–195 | `PUF-XXXX-XXXX` — literal prefix + 8 Crockford symbols (40 bits) | Crockford (no I L O U) | `normalizeJoinTicket` L149–172: uppercases, strips non-alnum, **strips `PUF` only when total is 11**, folds; **accepts a bare 8-symbol body** | LAN `GET /api/sync/join-ticket/:ticket` or Freenet slot (`joinSlotFreenet.ts`) → `parseJoinManifestV2` |
| Hub pairing code | `mintPairingCode()` `desktop/lanHubAuth.ts` L127–133, persisted in `desktop-prefs.json` | `XXXX-XXXX` — 8 Crockford symbols, **no prefix** | Crockford (L107) | `normalizePairingCode` L139–149 folds `IL→1 O→0 U→V` | `POST /api/hub/pair` with throttle |
| BYO farm ID | `newFarmId()` `byoPin.ts` L41–45 / `accessPinCrypto.ts` L36–38 | `farm_` + 16 hex | hex | trimmed | typed beside a BYO PIN (`LoginJoinForm.tsx` L47–65) |
| Raw FN02 ticket (Advanced) | Send card | JSON `{hotUri, bonesUri}` / `FN02@…` | — | — | `MistFarmSyncCard` advanced field only |
| Device PIN (mist) / unlock PIN | user-chosen | 4 digits / 4–8 digits | digits | — | local only; never a join code |

**Are the grammars disjoint by shape?**

- FarmCode (17 or 27 body symbols) vs everything else (8 symbols): **disjoint by length.**
- `PUF-XXXX-XXXX` with its prefix (11 symbols once stripped) vs an 8-symbol PIN: **disjoint** — *if the prefix is present*. Note an 8-char PIN can itself begin with `PUF` (`PUFK7M29`); `normalizeJoinTicket` today would accept that PIN as a ticket body because it only strips the prefix at length 11. The classifier must not call `normalizeJoinTicket` on a bare 8.
- Bare ticket body (prefix dropped) vs PIN vs hub pairing code: **all three are 8 symbols from alphabets that overlap in 30 of 32 symbols** (`23456789ABCDEFGHJKMNPQRSTVWXYZ`). PIN-only symbols: `L U`. Crockford-only: `0 1` (and `I O` fold into them). A random PIN lands in the ambiguous intersection with probability (30/32)⁸ ≈ **0.60**. So a bare 8-symbol string can only be classified as "certainly not a PIN" when it contains `0`, `1`, `I` or `O`; otherwise it is PIN-by-default.
- Enrollment code (free-form ≥6) overlaps everything, but it is a *create* credential and does not belong in the join box.
- Hub pairing code is not a farm invite and is not entered at login today; it stays out of the box (see 2.3).

**Failure cases the box will see:** spaces inside groups (`K7M2 9Q4X`), lowercase, en-dashes from a phone keyboard, `PUF` typed without the hyphen (`PUFK7M29Q4X`), the FarmCode label pasted (`FarmCode: mist-fc-2 …`), `mist - fc - 2` spaced prefix, a FarmCode with the prefix dropped (17 bare symbols — accepted today by length), `O` for `0` in a ticket, `0` typed in a PIN (impossible — the PIN alphabet has no 0, so this is a transcription error or a ticket), a 27-symbol legacy code, a 7-symbol PIN (one dropped), a whole `FN02@…` line.

---

## Part 2 — the single-box join

### 2.1 Principle

One **entry point**, not one secret. The box classifies the *first* thing typed and asks for the second piece only when the first was a Freenet piece. The FarmCode remains the crypto boundary and is never embedded in, derived from, or printed with a ticket (hole 2). The recover/create FarmCode screens and hole 6/7 copy rules are untouched.

### 2.2 Which order for the two Freenet pieces

| | FarmCode first (current `MistRecoverFarm` → gate) | Ticket first |
|---|---|---|
| What the app can do after piece 1 | Derive FarmSeed/FarmId offline; open the local store; **start the node**; know which Freenet slot to watch — the slot address is derived from the FarmCode (gate copy L256–260) | Resolve the manifest **only on the LAN** (`/api/sync/join-ticket/:ticket`). Off Wi‑Fi the slot cannot be found without the seed. Even resolved, the URIs point at ciphertext it cannot open |
| Failure mode | Wrong code → local check-symbol error, no network | Wrong ticket → network round trip, ambiguous ("not found" could be Wi‑Fi) |
| Hole 2 | Natural: code is typed once, ticket is a separate later box | Tempts a "ticket-only join" and a manifest that carries the code — forbidden |
| Already built | Yes: `MistRecoverFarm` → `MistJoinTicketGate` | No |

**Pick: FarmCode first.** The single box still *accepts* a ticket typed first: it is held in component state only (never persisted, never shown again), the user is told "That is the join ticket — the paper FarmCode comes first", and the held ticket pre-fills the gate after recovery. That gives "type whatever you were handed" without inventing a ticket-only path.

### 2.3 The classifier

Location: `src/lib/joinCodeClassifier.ts` (pure, no React, no network; imports `normalizeFarmCodeInput`/`isValidFarmCode`/`FarmCodeError` from `units/mist-freenet/src/farm-code.ts`, `normalizeJoinTicket`/`JOIN_TICKET_PREFIX`/`JOIN_TICKET_SYMBOLS` from `shared/sync/joinTicket.ts`, `normalizePin` from `shared/auth/byoPin.ts`, `CROCKFORD_ALPHABET` from `units/mist-freenet/src/crockford.ts`. `shared/sync/joinTicket.ts` already imports `units/mist-freenet/src/crockford.ts`, so this layering has precedent.)

```ts
export type JoinCodeKind = 'invite-pin' | 'farm-code' | 'join-ticket' | 'hub-pairing' | 'unknown';

export type JoinCodeClassification = {
  kind: JoinCodeKind;
  /** Canonical form for the consumer: PIN as 8 stripped uppercase symbols; FarmCode as the `mist-fc-N  …` line; ticket as `PUF-XXXX-XXXX`; else the cleaned input. */
  normalized: string;
  /** One farmer-facing sentence when the shape was recognised but is off, or when 'unknown'. */
  hint?: string;
};

export function classifyJoinCode(input: string): JoinCodeClassification;
```

**Normalisation (in order):**
1. `trim`; map `‐ ‑ – — −` (U+2010/2011/2013/2014/2212) to `-`; collapse runs of whitespace to one space; empty → `{ kind: 'unknown', normalized: '', hint: 'Type the code you were given.' }`.
2. Strip a leading label: `/^(farm\s*code|recovery\s*(code|key|pin)|invite\s*pin|pin|ticket|join\s*ticket|code)\s*:?\s*/i`.
3. **Raw-ticket / ID short-circuits** (before any alphabet work):
   - starts with `{` or contains `FN02@` → `unknown`, hint *"That is the raw Freenet ticket — it goes in Settings → Sync → Advanced after you have joined."*
   - `/^farm_[0-9a-f]{16}$/i` → `unknown`, hint *"That is a farm ID, not a code. On a bring-your-own device it goes beside the PIN."*
4. **Prefix rules** (case-insensitive, separators `[\s-]*` tolerated inside the prefix):
   - `/^mist[\s-]*fc[\s-]*\d+/` → `farm-code`. `normalized = normalizeFarmCodeInput(s)`; if it throws `FarmCodeError`, keep `kind: 'farm-code'` and put the error text in `hint` (the shape is certain, the content is off).
   - `/^PUF[\s-]*/` followed by exactly 8 cleaned symbols (cleaned total 11) → `join-ticket`, `normalized = normalizeJoinTicket(s)`; if `null` → `join-ticket` with hint *"A join ticket is PUF- and eight letters or numbers — check for a missed one."*
   - `/^HUB[\s-]*/` + 8 → `hub-pairing` (reserved; nothing mints this today — see below).
5. `cleaned = s.toUpperCase().replace(/[^0-9A-Z*~$=]/g, '')`.
6. `cleaned.length ∈ {17, 27}` → `farm-code` via `normalizeFarmCodeInput(cleaned)` (version from length; hint on failure as in 4). Body-only paste is the tablet norm (`farm-code.ts` L172–181).
7. `cleaned.length === 8`:
   - contains any of `0 1 I O` → cannot be a PIN (alphabet excludes them) → `join-ticket`, `normalized = normalizeJoinTicket(cleaned)` (prefix added), hint *"Read as a join ticket without its PUF- — check that is what you meant."*
   - every symbol in the PIN alphabet (`[A-HJ-NP-Z2-9]`, which includes `L U`) → `invite-pin`, `normalized = normalizePin(cleaned)`. No hint. (If a ticket with its prefix dropped lands here, the redeem fails and the *consumer* appends: *"If this was a Freenet join ticket, it starts with PUF-."*)
   - anything else (e.g. `*`) → `unknown`.
8. `cleaned.length ∈ {6, 7}` and all PIN-alphabet → `invite-pin`, hint *"Invite PINs are 8 characters — one may be missing."* (server accepts ≥6, so submit is allowed).
9. `/^\d{4,8}$/` and not already matched → `unknown`, hint *"A 4–8 digit number is a device unlock PIN, not a way into a farm."* (An 8-digit string of `2–9` matched rule 7 as a PIN first — that is a legal minted PIN.)
10. Otherwise `unknown`, hint *"Not a PIN, FarmCode or join ticket. PINs are 8 letters/numbers; FarmCodes are 17 in groups of five; tickets start with PUF-."*

**Overlap statement and the smallest fix.** The only real overlap is the 8-symbol class: bare ticket body vs invite PIN vs hub pairing code. Nothing minted today can change (the PIN has no prefix on purpose, tickets already carry `PUF-`, pairing codes are persisted). The classifier resolves it by (a) requiring the `PUF-` prefix to call something a ticket unless it contains a non-PIN symbol, (b) defaulting bare-8 to PIN, and (c) never returning `hub-pairing` for an unprefixed string. **If hub pairing is ever offered at login, mint the *new* pairing format as `HUB-XXXX-XXXX`** (`mintPairingCode` gains the prefix; `normalizePairingCode` already strips non-alphanumerics so old codes keep working on `/api/hub/pair`). That is the only new-format change proposed and it is optional.

**Test matrix (`tests/joinCodeClassifier.test.ts`):**

| # | Input | kind | normalized | hint? |
|---|---|---|---|---|
| 1 | `K7M2N9QX` | invite-pin | `K7M2N9QX` | — |
| 2 | `k7m2 n9qx` | invite-pin | `K7M2N9QX` | — |
| 3 | `K7M2-N9QX` | invite-pin | `K7M2N9QX` | — (hyphenated PIN, not a pairing code) |
| 4 | `PUFK7M29` | invite-pin | `PUFK7M29` | — (8 chars; `PUF`-leading PIN must not be read as a ticket) |
| 5 | `PUF-K7M2-9Q4X` | join-ticket | `PUF-K7M2-9Q4X` | — |
| 6 | `puf k7m2 9q4x` | join-ticket | `PUF-K7M2-9Q4X` | — |
| 7 | `PUFK7M29Q4X` | join-ticket | `PUF-K7M2-9Q4X` | — |
| 8 | `PUF-K7M2-9Q4` | join-ticket | `` | hint: eight symbols |
| 9 | `K7M2-9Q4X` (prefix dropped, contains `0`? no — contains `9Q4X`, all PIN-legal) | invite-pin | `K7M29Q4X` | — → redeem fails → consumer adds the PUF- hint |
| 10 | `K7M2-9Q0X` (contains `0`) | join-ticket | `PUF-K7M2-9Q0X` | hint: read as a ticket |
| 11 | `K7M2-9QOX` (letter O) | join-ticket | `PUF-K7M2-9Q0X` | hint |
| 12 | `mist-fc-2  ABCDE-FGHJK-MNPQR-ST` (valid check) | farm-code | canonical line | — |
| 13 | `FarmCode: mist - fc - 2 abcde fghjk mnpqr st` | farm-code | canonical | — |
| 14 | `ABCDEFGHJKMNPQRST` (17 bare, valid check) | farm-code | canonical `mist-fc-2  …` | — |
| 15 | 17 bare symbols, wrong check | farm-code | `` | hint: `FarmCode check character mismatch` |
| 16 | 27 bare symbols valid (`mist-fc-1`) | farm-code | `mist-fc-1  …` | — |
| 17 | `mist-fc-3 …` | farm-code | `` | hint: unsupported version |
| 18 | 16 bare symbols | unknown | cleaned | hint rule 10 |
| 19 | `K7M2N9Q` (7) | invite-pin | `K7M2N9Q` | hint: 8 characters |
| 20 | `1234` | unknown | `1234` | hint: unlock PIN |
| 21 | `23456789` | invite-pin | `23456789` | — |
| 22 | `farm_0123456789abcdef` | unknown | as typed | hint: farm ID |
| 23 | `{"hotUri":"FN02@…"}` | unknown | — | hint: raw ticket |
| 24 | `HUB-K7M2-9Q4X` | hub-pairing | `K7M2-9Q4X` | — (future format; today's `K7M2-9Q4X` is #9) |
| 25 | `` / `   ` | unknown | `` | hint: type the code |
| 26 | `PUF–K7M2–9Q4X` (en-dashes) | join-ticket | canonical | — |

### 2.4 Screen sequences and copy

Common screen 0 for every shell — **Join** is the landing step for a fresh device (`initialLoginStep` returns `'join'` unless `byoConfigured` or `welcomeBack ∧ firebase`, which keep their current landings).

**Screen J1 — "Join a farm"** (`src/components/login/JoinCodeEntry.tsx`)
- Title: **Join a farm**
- Sub: *Type the code you were given. A PIN from the farm manager, or the paper FarmCode from the owner.*
- One box, `inputMode="text"`, `autoCapitalize="characters"`, `autoComplete="off"`, `spellCheck=false`, monospace, live-formatted per detected kind (PIN: none; ticket: `formatJoinTicketInput`; FarmCode: `formatFarmCodeInput` once 9+ symbols and no `PUF`). A small grey line under the box updates live: *"Looks like an invite PIN"* / *"Looks like a FarmCode — 12/17"* / *"Looks like a join ticket"* / the classifier `hint`.
- Primary: **Continue**. Disabled until `kind !== 'unknown'`.
- Secondary (small, below): **Create a farm** · **Other ways to sign in** (Google for a returning PUFworks owner; bring-your-own Firebase; welcome-back).
- Footer, one line, only where a Freenet shell is possible: *"Experimental Freenet farms use a FarmCode and a join ticket. Cloud farms use a PIN."*

**Branch: `invite-pin` (all shells)**

**J2-cloud — "Your name"**
- *Joining with an invite PIN. Type your name exactly as you will next time — the same name and PIN reopen your account.* (uid derives from both: `uidForPinRedeem`.)
- {Your name} (prefilled from `getLastDisplayName()`), PIN shown masked as `K7••••QX` with **Change**.
- Collapsed: **Check it's the right farm (nearby)** → loads `fetchNearbyFarms` on tap, not on mount. Picking one sets `expectedFarmId`.
- Primary **Join farm** → `signInWithInvitePin(pin, name, expectedFarmId?)` → `/`.
- On `Invite PIN not found`: append *"If this was a Freenet join ticket, it starts with PUF-. If it is the owner recovery PIN, the same box works — check the name is the one used at create."*
- After sign-in, decision 7 hand-off (see 2.6): if `farmNetworkPacks.freenet_host.enabled` and this device has no seed for that cloud farm and the shell has a host capability, a dismissible prompt offers the FarmCode step.

**Branch: `farm-code` or `join-ticket` — shell-dependent**

*Desktop (`capability='electron'`, mist pref on or off) and workshop hub:*

**J2-fn — "Freenet farm"** (pack surface `loginJoin`, `plugins/freenet_host/src/FreenetLoginJoin.tsx`)
- If a ticket was typed first: banner *"That is the join ticket — kept for the next step. The paper FarmCode comes first."* and the same FarmCode field. The ticket string is component state; it is not written anywhere and not shown again.
- FarmCode accepted → **do not echo the code**. Show *"FarmCode accepted · farm id `<farmId>`"* (as `MistRecoverFarm` L88–96 does), {Your name}, {Farm name (optional, display only)}, ☐ *Set a 4-digit PIN for this device* (expands to the existing device-PIN fields), **Continue to join ticket**.
- On mount, the pack pre-warms: `bridge.mist.setPreference(true)` if off (what `finishMistFarmSetup.rememberMistOnThisDesktop` L23–33 does at finish today, moved earlier), then `createFreenetHostReconciler(...).reconcile(true)` — so the node is connecting while the name is typed. This is the same code path the `farmSession` reconciler uses; it is invoked earlier, from the pack, with core knowing nothing about nodes.
- Continue → `finishMistFarmSetup({ role: DEFAULT_JOIN_ROLE, joinTicketPending: true })` unchanged → reload → **MistJoinTicketGate** unchanged, except it reads a held ticket from `sessionStorage` key `pufam.mist.joinTicketDraft.v1` (written by J2-fn only when a ticket was typed first; cleared on read; ticket only, never the FarmCode) and pre-fills the box. Copy already says *"You already typed the paper FarmCode. This ticket is the second piece"* — keep.
- `needs-setting` no longer greys anything on the join path; typing a FarmCode *is* the opt-in.

*Android APK (`capability=null`, `isNativePlatform()`):*

Same J2-fn (reader path). The gate then does what it does today: LAN hub first, sideloaded node second, else `FREENET_NO_HOST_LABEL`. Add one button to the gate's no-host block: **Find the laptop hub** → `deferMistJoinTicket()` + navigate to Settings → Sync (where `useFarmSync.pair` lives). Note this opens the mist gate on an APK that had it shut (`setFarmStoreBackend('mist')` makes `isMistExperimentalEnabled()` true, `farmStoreBackend.ts` L38–42). That is the documented tablet reader path (`FREENET_OPERATOR_FLOW.md` §1, `NETWORK_PACK_PLUGIN.md` §4) and not a decision-5 breach (decision 5 is about hosted web), but it is a product call — flagged in risks.

*Hosted web (`capability=null`, not native, not `import.meta.env.DEV`):*

**J2-web — "This is a Freenet farm"** (`src/components/login/JoinFreenetUnavailable.tsx`, core, no pack import)
- *A FarmCode / join ticket opens a farm that lives on Freenet. The web app cannot run Freenet — a browser has no node.*
- *What you can do:* **Install PUF-AM Desktop** (Windows / Linux; macOS later) *and type the same code there.* · *On a tablet: install the PUF-AM app and pair it with the owner's laptop on the shed Wi‑Fi.*
- *If the owner also runs this farm in the cloud, ask them for an invite PIN — that works here.*
- **Back**.
- No hub option on web: an `https://am.pufworks.farm` page cannot call an `http://192.168.x.x:3000` hub (mixed content) and the hub refuses non-`/api` paths anyway (`lanHubAuth.ts` L293–295). Nothing is typed into any Freenet code path; the FarmCode string is discarded when the screen unmounts.

**Create (secondary, all shells)** — **Create a farm** from J1 →
- Desktop/workshop/APK-gated: `WelcomeChooser` re-titled **"Start a new farm — where will it live?"** Cloud sync / Freenet network (copy as today; footnote L67–69 becomes *"A cloud farm can add a Freenet mirror later under Settings → Plugins."*). Cloud → `CloudSyncOptions` → `LoginCloudForm` opened on the Create tab. Freenet → `FreenetExplain` → `MistNewFarm` unchanged.
- Web: straight to `CloudSyncOptions`.

**Other ways to sign in** from J1 → `LoginCloudForm` Join tab as today (Google link, BYO farm-ID box, welcome-back) — the existing screen, one level down.

Tap counts after: (a) create cloud — Create, Cloud, PUFworks, Create tab, {3 fields}, Create, Continue = 6 taps (one more than today, deliberately: create is secondary). (b) join cloud — Continue, Join farm = **2 taps, 2 fields, 0 dialogs**. (c) join Freenet on desktop — Continue, Continue to join ticket, Join this farm = **3 taps, 3 fields** (down from 5 taps / 4 screens), no "How this works" required, no dead end when the preference is off.

### 2.5 Component / file plan

**Core — new**

| File | ~Lines | Job |
|---|---|---|
| `src/lib/joinCodeClassifier.ts` | 150 | `classifyJoinCode`, alphabets, hints (pure) |
| `src/lib/joinCodeFlow.ts` | 120 | Pure reducer: `JoinStage = 'code' \| 'cloud-name' \| 'freenet' \| 'freenet-unavailable'`; `joinCodeReducer(state, action)`, actions `TYPE`, `CONTINUE`, `BACK`, `CHANGE_CODE`; `freenetJoinAvailability({ capability, native, workshopHub }): 'host' \| 'reader' \| 'none'` (web → `'none'` by construction — decision 5) |
| `src/hooks/useJoinCode.ts` | 80 | `useReducer(joinCodeReducer)` + live formatting; returns `{ input, setInput, classification, stage, continue, back, heldTicket }` |
| `src/components/login/JoinCodeEntry.tsx` | 120 | J1 |
| `src/components/login/JoinCloudNameStep.tsx` | 110 | J2-cloud; lifts name/PIN/nearby from `LoginJoinForm.tsx` L67–171 |
| `src/components/login/JoinFreenetUnavailable.tsx` | 60 | J2-web |

**Core — changed**

| File | Change |
|---|---|
| `src/lib/loginStorageChoice.ts` | L33–42 `LoginStep`: add `'join'`, rename `'choose'` → `'create-choose'`. L74–85 `initialLoginStep`: drop `if (input.freenet === 'hidden') return 'cloud-options'` and the final `'choose'`; return `'join'`. `freenetOptionState` (L44–67) unchanged — it still drives the *create* chooser and `FreenetExplain` |
| `src/hooks/useLoginFlow.ts` | L71–78 initial step unchanged call; **remove** L110–114 (nearby auto-load) — `loadNearby` becomes on-demand; add `const join = useJoinCode({ availability: freenetJoinAvailability(...) })` and spread `join` into the return (L218–263). New return keys: `join`, `freenetJoinAvailability`. Everything else returned stays so `LoginCloudForm`/`LoginCreateFarmForm`/`LoginRecoveryScreen` compile unchanged |
| `src/pages/Login.tsx` | Add `step === 'join'` branch that switches on `flow.join.stage`: `code` → `<JoinCodeEntry>`; `cloud-name` → `<JoinCloudNameStep>`; `freenet` → `<PackSurfaces surface="loginJoin" code={…} heldTicket={…} onBack={…} />`; `freenet-unavailable` → `<JoinFreenetUnavailable>`. Rename `'choose'` branch (L34–48) to `'create-choose'`; `onBack` from `cloud-options` (L66–69) goes to `'join'` on web and `'create-choose'` otherwise. Stays a composer, ~150 lines |
| `src/components/login/WelcomeChooser.tsx` | L19 subtitle; L67–69 footnote; add `onBack` to Join |
| `src/components/login/CloudSyncOptions.tsx` | L90 back label → *"Back to Join a farm"*; `canGoWelcome` prop becomes `onBack` always available |
| `src/components/login/LoginJoinForm.tsx` | Loses the nearby list + PIN field (moved); keeps welcome-back, BYO farm ID, Google link → ~110 lines, reached from *Other ways to sign in* |
| `src/components/login/LoginCloudForm.tsx` | L96–108 footer link *"Other cloud options"* → also *"Back to Join a farm"* |
| `src/packs/types.ts` | After L93 `loginExplain`: add `loginJoin?: PackSurface` — *"Login join step for the pack's own code kinds. Gets `{ code: string; kind: 'farm-code' \| 'join-ticket'; heldTicket?: string; availability: 'host' \| 'reader'; onBack(): void }`. Must not render `code` back to the operator."* After L103 `pluginTile`: add `postSignInPrompt?: PackSurface` — *"Dismissible card mounted by `Layout` once a farm is open (e.g. 'this cloud farm keeps a Freenet mirror — enter the FarmCode'). Gates itself; renders null when it does not apply."* |
| `src/components/Layout.tsx` | One render site: `<PackSurfaces surface="postSignInPrompt" />` beside `CloudMirrorBanner` |
| `plugins/freenet_host/src/MistJoinTicketGate.tsx` | L57 initial `ticket` from `sessionStorage['pufam.mist.joinTicketDraft.v1']` (then remove); L296–326 no-host block gains **Find the laptop hub** |

**Pack — new / changed** (`plugins/freenet_host/src/`)

| File | ~Lines | Job |
|---|---|---|
| `FarmCodeField.tsx` (new) | 90 | The prefix-badge input + counter from `MistRecoverFarm.tsx` L196–236 and `FreenetHybridEnable.tsx` enter-code form; used by both and by `FreenetLoginJoin` |
| `FreenetLoginJoin.tsx` (new, `loginJoin` surface) | 160 | J2-fn: accept classified code (`parseFarmCode`), name, optional device PIN, pre-warm node, `finishMistFarmSetup(...)`, write ticket draft. Reuses `DevicePinFields` (extract from `FreenetHybridEnable.tsx` L64–99 into `DevicePinFields.tsx`, ~45 lines) |
| `freenetLoginPrewarm.ts` (new) | 50 | `prewarmFreenetHost(): Promise<void>` — flips `bridge.mist.setPreference(true)` when off, then `createFreenetHostReconciler({host: bridge.freenet, peer: transport…}).reconcile(true)`; no-op when `getFreenetHostCapability() !== 'electron'`. Pure enough to test with a fake bridge |
| `FreenetEnterFarmCode.tsx` (new) | 150 | The `enter-code` + `device-pin` flows lifted out of `FreenetHybridEnable.tsx` (L160–216 + the two form renders) so the tile and the post-sign-in prompt share one implementation. Brings `FreenetHybridEnable.tsx` from 481 to ~330 |
| `FreenetHybridJoinPrompt.tsx` (new, `postSignInPrompt` surface) | 80 | Renders when `farmFreenetHostState(farmNetworkPacks)?.enabled && mirroredCloudFarmId() !== farmId && getFreenetHostCapability() === 'electron' && !dismissed(farmId)`. Copy below. **Later** writes `pufam.freenetHost.farmCodePromptDismissed.v1` |
| `MistRecoverFarm.tsx` | Uses `FarmCodeField`; otherwise unchanged (still the public route the explain's *Join a farm I already have* uses) |
| `index.ts` | Register `loginJoin: FreenetLoginJoinStep` (lazy) and `postSignInPrompt: FreenetHybridJoinPrompt` (lazy) |

All new files sit under the 400-line soft limit; `FreenetHybridEnable.tsx` shrinks. No core file imports `plugins/*`; `AuthContext` is untouched.

### 2.6 Decision 7 hand-off (PIN lands in a hybrid farm)

Trigger: `AuthContext` already fills `farmNetworkPacks` from the farm-doc `onSnapshot` (`AuthContext.tsx` L213–240). The pack's `postSignInPrompt` surface reads it via `useAuth()` (allowed direction) and `mirroredCloudFarmId()`. Copy:

> **This farm keeps a Freenet mirror.** To take part from this computer, enter the paper FarmCode the owner holds. You can do it now or later under Settings → Plugins → Freenet. **Enter the FarmCode** · **Later**

**Enter the FarmCode** opens `FreenetEnterFarmCode` inline (same `parseFarmCode` → mismatch check against `state.mistFarmId` → `sealHybridSeedOnThisDevice` → no doc write for a member, as `finish('typed')` L160–196 does today). The reconciler's `want` flips to true via `subscribeFreenetHybridDevice` (`useFreenetHostReconciler.ts` L54) — no new trigger needed. On web the prompt renders null (capability `null`) and the tile keeps saying *Not available on this device*.

### 2.7 Auth identity and "one button for an unauthenticated user"

`/login` is only reachable unauthenticated (`useLoginFlow.ts` L83–87 redirects a restored session to `/`). For the cloud branch the PIN **is** the identity: `redeem-pin` derives the uid from PIN + name and returns a custom token; `signInWithCustomToken` follows (`AuthContext.tsx` L163–164). So the user is asked for exactly one credential and one name — never Google *and* a PIN. Google (`signInWithGoogle`, L296–300) is only for a returning owner whose Google account is a member of the project; there is no email/password path in this repo. It moves to *Other ways to sign in*. Consequence for a hybrid farm: the FarmCode step is always *after* sign-in (2.6), so the order "identity, then FarmCode" is enforced by structure.

### 2.8 Starting dependencies without importing pack code into core

Core never mentions a node. It renders `<PackSurfaces surface="loginJoin" …/>` when the classifier says `farm-code`/`join-ticket` and `freenetJoinAvailability !== 'none'`. The pack's `FreenetLoginJoin` mounts and calls `prewarmFreenetHost()` (`freenetLoginPrewarm.ts`), which uses the existing `createFreenetHostReconciler` (`freenetHostReconcile.ts`) with `bridge.freenet` and `getFreenetPackTransport().peerStart` — the identical pair `useFreenetHostReconciler.ts` L33–45 builds. After the reload, the `farmSession` reconciler takes over (`computeFreenetHostWant` → `pipe==='freenet' ∧ localEnabled(default true) ∧ capability==='electron'`, `freenetHostWant.ts` L39–48) and the "only stop a node it started" rule holds because the pre-warm marks the node as pack-started through the same reconciler. On APK and workshop `prewarmFreenetHost` is a no-op; the gate's existing hub/local-node logic runs. No new pack surface beyond `loginJoin` is needed for the trigger; `postSignInPrompt` is for decision 7.

### 2.9 Removed or demoted

| Today | After |
|---|---|
| `WelcomeChooser` as screen 1 ("How should this farm be stored?") | Screen 2 of **Create a farm**, re-titled; footnote rewritten for hybrid |
| `CloudSyncOptions` as the web landing | Reached from Create or Other ways in |
| `initialLoginStep` rule `hidden → 'cloud-options'` (L83) and `'choose'` default (L84) | `'join'` |
| `LoginStep 'choose'` | `'create-choose'` |
| Nearby-farms GPS on mount (`useLoginFlow.ts` L110–114) | On-demand expander in J2-cloud |
| "Farm PIN" three-purpose paragraph (`LoginJoinForm.tsx` L166–170) | One line on J1 + a targeted error hint |
| Google link under the PIN form (L181–196) | *Other ways to sign in* |
| `FreenetExplain` L51–56 `needs-setting` pointer to Settings as the *join* path's only answer | Join path never sees `needs-setting`; the create path keeps it |
| `FreenetOptionState` | Kept for create; join uses `freenetJoinAvailability` |
| Nothing else: `MistNewFarm`, `MistRecoverFarm`, `MistJoinTicketGate` copy, hole 6/7 branches, Send checklist — untouched |

### 2.10 Test plan

New:
- `tests/joinCodeClassifier.test.ts` — the 26-row matrix above plus property checks: every `mintJoinTicket()` classifies `join-ticket`; every `generatePinCode(8)` classifies `invite-pin`; every `mintFarmCode()` (needs `crypto`) classifies `farm-code` with `normalized === normalizeFarmCodeInput(code)`; no `mintPairingCode()` output classifies `hub-pairing`; classifier never returns the FarmCode in `hint`.
- `tests/joinCodeFlow.test.ts` — reducer: PIN → `cloud-name`; FarmCode on `'host'` → `freenet`; on `'reader'` → `freenet`; on `'none'` → `freenet-unavailable`; ticket-first holds `heldTicket` and stays on `code` with the "FarmCode first" hint; `BACK` clears `heldTicket`; `freenetJoinAvailability({capability:null,native:false,workshopHub:false}) === 'none'` (decision 5), `{capability:null,native:true}` → `'reader'`, `{capability:'electron'}` → `'host'`, `{workshopHub:true}` → `'host'`.
- `plugins/freenet_host/src/freenetLoginPrewarm.test.ts` — fake bridge: flips pref when off, does not when on; calls `reconcile(true)` once; no-op on `null` capability.
- `plugins/freenet_host/src/FreenetHybridJoinPrompt` logic as a pure `shouldOfferFarmCodePrompt()` test (enabled ∧ no seed ∧ electron ∧ not dismissed).

Existing that break and how they change:
- `tests/loginStorageChoice.test.ts` L45–49 expects `'cloud-options'` for hidden → `'join'`; L51–65 expects `'choose'` → `'join'`; L73–77 (mist backend welcome-back) → `'join'`; L67–71 and L79–88 unchanged. `freenetOptionState` block L10–42 unchanged.
- `tests/packRegistry.test.ts` L42–51: add `expect(packSurfaces('loginJoin').map(s=>s.packId)).toEqual(['freenet_host'])` and the same for `postSignInPrompt`; public routes list unchanged.
- `tests/mistExperimentalGate.test.ts` — **does not break** (it tests `farmStoreBackend.ts`, which is untouched).
- `tests/codebaseHealth.test.ts` / `scripts/audit-codebase.mjs` — new files must stay under 600; the surface-key list, if asserted, gains two keys.
- `plugins/freenet_host/src/joinTicketDevicePin.test.ts` unchanged.

### 2.11 Risks

- **Hole 2.** A ticket typed first is held in memory and in `sessionStorage` (ticket only) across the reload. Acceptable: the ticket is a capability, not a secret (`joinTicket.ts` L11–15). The FarmCode must never be written anywhere by the login flow — J1 has no draft persistence, J2-fn shows only `farmId`, and the classifier `hint` must never contain the normalised code (asserted in tests). Review point: `formatFarmCodeInput` echoes what is being typed, exactly as `MistRecoverFarm` does today — same exposure, no new one.
- **Hole 4.** Unchanged; the hybrid prompt reuses `RISK_COPY` before sealing a seed.
- **Decision 5.** Preserved by `freenetJoinAvailability` returning `'none'` for `capability=null ∧ !native ∧ !DEV`; J2-web touches no mist code and discards the input. The risk is copy drift: if someone later adds a "try a local node" link on web it reopens the sidecar path decision 5 closed.
- **APK with the gate shut.** Typing a FarmCode on a plain APK sets `pufam.farmStoreBackend='mist'` and opens the mist experimental UI for that device. It is the documented reader path but it is also an unflagged experiment on a shipping APK. Alternatives: (A) allow, as designed; (B) require `VITE_MIST_EXPERIMENTAL` and otherwise show J2-web's copy with the tablet line first. Recommend A; George's call.
- **APK with a sideloaded node but no host capability.** `getFreenetHostCapability()` is `null`, so no pre-warm and no reconciler; the gate's `detectFreenetRuntime()` → `android-local-node` reader path still works (`freenetLocalNode.ts` L45–53 makes the probe native-only). `freenetIsReadOnlyHere` stays true, Send stays impossible — the gate says so. Nothing regresses, nothing improves until Phase 3.
- **Ambiguous bare 8.** ~60% of PINs share a shape with a prefix-less ticket body; default-to-PIN means a dropped `PUF-` costs one failed redeem (rate-limited 30/15 min per client, `accessPinMemberRoutes.ts` L62) before the hint. Acceptable; the ticket's own box at the gate auto-adds the prefix.
- **Accessibility.** One box whose meaning changes needs `aria-describedby` on the live classification line, `aria-live="polite"` on it, and a stable label ("Code"). The second step must move focus to its first field and announce the kind ("Invite PIN — your name"). Do not swap the input's `inputMode` mid-typing.
- **Welcome-back.** Devices with `canShowWelcomeBack()` still land on `'firebase'`; a worker who now holds a FarmCode on such a device must use *Other ways in → Not you?* then Join. Consider a *Join a different farm* link on the welcome-back card pointing to `'join'`.
- **Concurrent Phase 2 work.** Nothing here touches `freenet02-*` or `desktop/main.ts`; the pre-warm uses `bridge.freenet.start/status` and the transport's `peerStart`, both stable slice-B seams.

### 2.12 Docs to update

- `Plans/FREENET_OPERATOR_FLOW.md` §1 "Login ladder" table (Welcome → How this works → Start or Join becomes Join box → FarmCode step → ticket gate; create demoted), §4 steps 1–2, § File / function map (add `FreenetLoginJoin.tsx`, `FarmCodeField.tsx`, `joinCodeClassifier.ts`), §8 hole 2 row: add "single box classifies; ticket-first is held, never merged".
- `Plans/AUTH_INVITE_PIN.md` § Worker flow steps 1–2 (single box; nearby is optional and on-demand; "same name + PIN → same UID" stays).
- `Plans/NETWORK_PACK_PLUGIN.md` §3 Surfaces table: `loginJoin`, `postSignInPrompt`; §5 add the pre-warm sentence; §8 Checks: new tests.
- `Plans/NAMING.md` §5 `pufam.*`: `pufam.mist.joinTicketDraft.v1` (sessionStorage, ticket only) and `pufam.freenetHost.farmCodePromptDismissed.v1`; §7 add a "Classifier" line stating the 8-symbol overlap and the default-to-PIN rule; if `HUB-` pairing is adopted, §7/§5 note it as a new format.
- `Plans/FREENET_NETWORK_PACK.md` §3.5: one row for the post-sign-in prompt; decision 5 row unchanged.
- `DEVELOPER_NOTES.md` § Mist: dated line.

---

## Can a Freenet client run in the browser?

No node can. `units/mist-freenet/src/freenet02-browser-get.ts` is a **WebSocket client**: it imports `FreenetWsApi`/`GetRequest` from `@freenetorg/freenet-stdlib` and connects to `DEFAULT_LOCAL_FREENET_WS_URL = 'ws://127.0.0.1:7509/v1/contract/command'` (`freenet02-browser-get-url.ts`) — the API a separately running Freenet 0.2 node binds on the same machine. Its header says so: *"The node is a separate application talking a network protocol over loopback — PUF-AM links nothing of Freenet's into its own process"*, and it is GET-only by design ("there is deliberately no `putBlob` here"). `src/lib/freenetRuntime.ts` L5–8 records the underlying fact — Freenet 0.2 is a native Rust binary and "there is no WASM peer to link in" — and `freenetLocalNode.ts` L45–53 only probes that loopback from the APK or with `VITE_LOCAL_FREENET_WS` set, never from a browser page. So the hosted web shell can be a client of *someone else's* node only: a laptop hub's Express relay (`/api/mist/freenet/*`) or a loopback node the user installed themselves. Both are ruled out for `am.pufworks.farm` in practice — an HTTPS page cannot call an `http://192.168.x.x` hub (mixed content) and the hub's LAN listener refuses everything but `/api` to paired devices; a self-installed node on the user's PC is the sidecar design decision 5 explicitly closed (`FREENET_NETWORK_PACK.md` §8, superseding `MIST_TWO_FEDORA_FREENET.md` § Production UI). The honest web offer for a Freenet code is therefore the J2-web screen: install the desktop app (or pair a tablet with a hub), and for hybrid farms use the invite PIN, which the web can redeem in full.
